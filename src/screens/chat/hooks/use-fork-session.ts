import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAuthoritativeSessionKey,
  getForkedSessionRouteKey,
  isSessionForkEligible,
} from '../session-fork'
import { chatQueryKeys } from '../chat-queries'
import type { SessionMeta } from '../types'
import { toast } from '@/components/ui/toast'

const GATEWAY_STATUS_QUERY_KEY = ['gateway-status'] as const
const FORK_FAILURE_TOAST = 'Could not branch conversation. Please try again.'

type GatewayStatusPayload = {
  capabilities?: Record<string, boolean>
  [key: string]: unknown
}

class SessionForkRequestError extends Error {
  constructor(readonly status: number) {
    super('Session fork request failed')
  }
}

async function markSessionForkUnavailable(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await queryClient.cancelQueries({
    queryKey: GATEWAY_STATUS_QUERY_KEY,
    exact: true,
  })
  queryClient.setQueryData<GatewayStatusPayload>(
    GATEWAY_STATUS_QUERY_KEY,
    (current) => ({
      ...(current ?? {}),
      capabilities: {
        ...(current?.capabilities ?? {}),
        sessionFork: false,
      },
    }),
  )
}

export type ForkSessionResult = {
  forkSession: (session: SessionMeta) => Promise<void>
  forkingSessionKey: string | null
}

export function useForkSession(
  sessionForkAvailable: boolean,
): ForkSessionResult {
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const queryClient = useQueryClient()
  const pendingSessionKey = useRef<string | null>(null)
  const routeIdentity = useRef({ pathname, generation: 0 })
  const mounted = useRef(true)
  const [forkingSessionKey, setForkingSessionKey] = useState<string | null>(
    null,
  )

  if (routeIdentity.current.pathname !== pathname) {
    routeIdentity.current = {
      pathname,
      generation: routeIdentity.current.generation + 1,
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const mutation = useMutation({
    mutationFn: async (sessionKey: string): Promise<unknown> => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionKey)}/fork`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      )
      if (!response.ok) throw new SessionForkRequestError(response.status)
      return response.json()
    },
  })

  const forkSession = useCallback(
    async (session: SessionMeta) => {
      if (!sessionForkAvailable || !isSessionForkEligible(session)) return

      const sessionKey = getAuthoritativeSessionKey(session)
      if (pendingSessionKey.current !== null) return
      pendingSessionKey.current = sessionKey
      const routeGeneration = routeIdentity.current.generation
      const requestedPathname = routeIdentity.current.pathname
      const isCurrentRoute = () =>
        mounted.current &&
        routeIdentity.current.generation === routeGeneration &&
        router.state.location.pathname === requestedPathname
      setForkingSessionKey(sessionKey)

      try {
        const response = await mutation.mutateAsync(sessionKey)
        const routeKey = getForkedSessionRouteKey(response, sessionKey)
        if (!routeKey) throw new SessionForkRequestError(502)
        if (!isCurrentRoute()) return

        await queryClient.invalidateQueries({
          queryKey: chatQueryKeys.sessions,
        })
        if (!isCurrentRoute()) return

        await navigate({
          to: '/chat/$sessionKey',
          params: { sessionKey: routeKey },
        })
        try {
          localStorage.setItem('claude-last-session', routeKey)
        } catch {}
      } catch (error) {
        if (error instanceof SessionForkRequestError && error.status === 503) {
          await markSessionForkUnavailable(queryClient)
        }
        toast(FORK_FAILURE_TOAST, { type: 'error' })
      } finally {
        if (pendingSessionKey.current === sessionKey) {
          pendingSessionKey.current = null
        }
        if (mounted.current) {
          setForkingSessionKey((current) =>
            current === sessionKey ? null : current,
          )
        }
      }
    },
    [mutation, navigate, queryClient, router, sessionForkAvailable],
  )

  return { forkSession, forkingSessionKey }
}

export { FORK_FAILURE_TOAST }
