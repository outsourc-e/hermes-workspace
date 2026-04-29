import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type SwarmChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error'
  content: string
  timestamp: number | null
  durationMs?: number
  origin?: 'state.db' | 'optimistic'
  pending?: boolean
}

type SwarmChatResponse = {
  workerId: string
  sessionId: string | null
  sessionTitle: string | null
  messages: Array<{
    id: string
    role: SwarmChatMessage['role']
    content: string
    timestamp: number | null
  }>
  source: 'state.db' | 'unavailable'
  fetchedAt: number
  error?: string
}

type DirectChatResponse = SwarmChatResponse & {
  ok: boolean
  delivered: boolean
  delivery?: 'tmux'
}

const POLL_INTERVAL_MS = 5_000
const DEFAULT_LIMIT = 30

async function fetchSwarmChat(
  workerId: string,
  limit: number,
): Promise<SwarmChatResponse> {
  const res = await fetch(
    `/api/swarm-chat?workerId=${encodeURIComponent(workerId)}&limit=${limit}`,
  )
  if (!res.ok) throw new Error(`swarm-chat HTTP ${res.status}`)
  return (await res.json()) as SwarmChatResponse
}

async function sendDirectChat(
  workerId: string,
  prompt: string,
  limit: number,
): Promise<DirectChatResponse> {
  const res = await fetch('/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, prompt, limit, timeoutMs: 120_000 }),
  })
  const data = (await res.json().catch(() => null)) as DirectChatResponse | { error?: string } | null
  if (!res.ok) {
    throw new Error((data && 'error' in data && data.error) || `swarm-direct-chat HTTP ${res.status}`)
  }
  if (!data || !('delivered' in data) || !data.delivered) {
    throw new Error((data as { error?: string } | null)?.error || 'Direct chat did not reach worker')
  }
  return data as DirectChatResponse
}

export type UseSwarmChatOptions = {
  workerId: string
  limit?: number
  enabled?: boolean
}

export function useSwarmChat({
  workerId,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UseSwarmChatOptions) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['swarm', 'chat', workerId, limit] as const,
    [workerId, limit],
  )

  const query = useQuery({
    queryKey,
    queryFn: () => fetchSwarmChat(workerId, limit),
    enabled: Boolean(workerId) && enabled,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: 2_000,
  })

  const dispatch = useMutation({
    mutationFn: async (prompt: string) => {
      return await sendDirectChat(workerId, prompt, limit)
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKey, data)
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const messages: Array<SwarmChatMessage> = useMemo(() => {
    return (query.data?.messages ?? []).map((m) => ({
      ...m,
      origin: 'state.db' as const,
    }))
  }, [query.data])

  return {
    workerId,
    sessionId: query.data?.sessionId ?? null,
    sessionTitle: query.data?.sessionTitle ?? null,
    source: query.data?.source ?? 'unavailable',
    error:
      (query.error instanceof Error ? query.error.message : null) ??
      query.data?.error ??
      null,
    messages,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    refetch: query.refetch,
    sendMessage: dispatch.mutateAsync,
    isSending: dispatch.isPending,
    sendError:
      dispatch.error instanceof Error ? dispatch.error.message : null,
  }
}
