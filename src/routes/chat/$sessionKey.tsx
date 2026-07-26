import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applySessionRouteResolution,
  buildSessionReplaceNavigation,
  resolveSessionCardRoute,
} from './-session-route-state'
import type { SessionRouteResolutionPayload } from './-session-route-state'
import { ErrorBoundary } from '@/components/error-boundary'
import {
  fetchSessionCards,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import { isRecentSession } from '@/screens/chat/pending-send'

const ChatScreen = lazy(async () => {
  const module = await import('../../screens/chat/chat-screen')
  return { default: module.ChatScreen }
})

export const Route = createFileRoute('/chat/$sessionKey')({
  validateSearch: (search: Record<string, unknown>): { inspect?: string } => {
    const inspect =
      typeof search.inspect === 'string' ? search.inspect.trim() : ''
    return inspect ? { inspect } : {}
  },
  component: ChatRoute,
  // Disable SSR to prevent hydration mismatches from async data
  ssr: false,
  errorComponent: function ChatError({ error, reset }) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-primary-50">
        <div className="max-w-md">
          <div className="mb-4 text-5xl">💬</div>
          <h2 className="text-xl font-semibold text-primary-900 mb-3">
            Chat Error
          </h2>
          <p className="text-sm text-primary-600 mb-6">
            {error instanceof Error
              ? error.message
              : 'Failed to load chat session'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                if (typeof window !== 'undefined')
                  window.location.href = '/chat'
              }}
              className="px-4 py-2 border border-primary-300 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
            >
              Return to Main
            </button>
          </div>
        </div>
      </div>
    )
  },
})

function ChatRoute() {
  // Client-only rendering to prevent hydration mismatches
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [forcedSession, setForcedSession] = useState<{
    friendlyId: string
    sessionKey: string
  } | null>(null)
  const params = Route.useParams()
  const search = Route.useSearch()
  const activeFriendlyId =
    typeof params.sessionKey === 'string' ? params.sessionKey : 'main'
  const isNewChat = activeFriendlyId === 'new'
  const shouldResolveCard = !isNewChat && activeFriendlyId !== 'main'
  const sessionCardsQuery = useQuery({
    queryKey: sessionCardQueryKeys.list(false),
    queryFn: () => fetchSessionCards(),
    enabled: shouldResolveCard,
    retry: 1,
    refetchInterval: 5000,
  })
  const resolvedCardRoute = shouldResolveCard
    ? sessionCardsQuery.isSuccess
      ? resolveSessionCardRoute({
          routeKey: activeFriendlyId,
          response: sessionCardsQuery.data,
        })
      : sessionCardsQuery.isError
        ? ({ status: 'legacy-fallback' } as const)
        : null
    : ({ status: 'legacy-fallback' } as const)
  const cardRouteResolution =
    resolvedCardRoute?.status === 'rejected' &&
    resolvedCardRoute.reason === 'missing' &&
    isRecentSession(activeFriendlyId)
      ? ({ status: 'legacy-fallback' } as const)
      : resolvedCardRoute
  const selectedCard =
    cardRouteResolution?.status === 'selected'
      ? cardRouteResolution.card
      : undefined
  const selectedCardId = selectedCard?.cardId
  const inspectedChildCardId = selectedCard?.childNodes.some(
    (child) => child.cardId === search.inspect,
  )
    ? search.inspect
    : undefined
  const forcedSessionKey =
    forcedSession?.friendlyId === activeFriendlyId
      ? forcedSession.sessionKey
      : undefined
  const latestResolvedRouteRef = useRef({
    friendlyId: activeFriendlyId,
    sessionKey: forcedSessionKey ?? activeFriendlyId,
  })

  useEffect(() => {
    latestResolvedRouteRef.current = {
      friendlyId: activeFriendlyId,
      sessionKey: forcedSessionKey ?? activeFriendlyId,
    }
  }, [activeFriendlyId, forcedSessionKey])

  useEffect(() => {
    if (!selectedCardId) return
    try {
      localStorage.setItem('hermes-last-session-card', selectedCardId)
    } catch {}
    if (activeFriendlyId !== selectedCardId) {
      void navigate(buildSessionReplaceNavigation(selectedCardId))
    }
  }, [activeFriendlyId, navigate, selectedCardId])

  // Clear history cache when navigating to new chat
  useEffect(() => {
    if (isNewChat) {
      queryClient.removeQueries({ queryKey: ['chat', 'history', 'new', 'new'] })
    }
  }, [isNewChat, queryClient])

  const handleSessionResolved = useCallback(
    function handleSessionResolved(payload: SessionRouteResolutionPayload) {
      const currentRoute = latestResolvedRouteRef.current
      const transition = applySessionRouteResolution({
        queryClient,
        activeFriendlyId: currentRoute.friendlyId,
        fallbackSessionKey: currentRoute.sessionKey,
        payload,
      })
      latestResolvedRouteRef.current = transition.resolvedRoute
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] })
      setForcedSession({
        friendlyId: payload.friendlyId,
        sessionKey: payload.sessionKey,
      })
      // Persist last session for refresh recovery
      try {
        localStorage.setItem('claude-last-session', payload.friendlyId)
      } catch {}
      navigate(transition.navigation)
    },
    [navigate, queryClient],
  )

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-primary-400">
        Loading chat…
      </div>
    )
  }

  if (cardRouteResolution === null) {
    return (
      <div className="flex h-full items-center justify-center text-primary-400">
        Resolving conversation…
      </div>
    )
  }

  if (cardRouteResolution.status === 'rejected') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-primary-700">
        <h2 className="text-lg font-semibold">Conversation unavailable</h2>
        <p className="max-w-md text-sm text-primary-500">
          {cardRouteResolution.reason === 'child'
            ? 'Child and branch activity cannot replace the parent conversation.'
            : 'This conversation is not present in the validated Session Card list.'}
        </p>
        <button
          type="button"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm text-white"
          onClick={() =>
            void navigate({
              to: '/chat/$sessionKey',
              params: { sessionKey: 'new' },
              replace: true,
            })
          }
        >
          Start a new conversation
        </button>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-primary-400">
            Loading chat…
          </div>
        }
      >
        <ChatScreen
          activeFriendlyId={selectedCardId ?? activeFriendlyId}
          activeCard={selectedCard}
          inspectedChildCardId={inspectedChildCardId}
          sessionCards={sessionCardsQuery.data?.cards}
          isNewChat={isNewChat}
          forcedSessionKey={selectedCard ? undefined : forcedSessionKey}
          onSessionResolved={handleSessionResolved}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
