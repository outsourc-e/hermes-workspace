import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applySessionRouteResolution,
  buildSessionReplaceNavigation,
  resolveSessionCardRouteState,
  validatedInspectedChildCardId,
} from './-session-route-state'
import { syncLastSessionCardPersistence } from './-last-session-card'
import type { SessionRouteResolutionPayload } from './-session-route-state'
import { ErrorBoundary } from '@/components/error-boundary'
import {
  fetchSessionCards,
  retainCompleteSessionCardProjections,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'

const ChatScreen = lazy(async () => {
  const module = await import('../../screens/chat/chat-screen')
  return { default: module.ChatScreen }
})

export function ChatRoute() {
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
  const params = useParams({ from: '/chat/$sessionKey' })
  const search = useSearch({ from: '/chat/$sessionKey' })
  const activeFriendlyId =
    typeof params.sessionKey === 'string' ? params.sessionKey : 'main'
  const isNewChat = activeFriendlyId === 'new'
  const shouldResolveCard = !isNewChat
  const sessionCardsQuery = useQuery({
    queryKey: sessionCardQueryKeys.list(false),
    queryFn: () => fetchSessionCards(),
    enabled: shouldResolveCard,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  })
  const cardRouteResolution = resolveSessionCardRouteState({
    routeKey: activeFriendlyId,
    queryStatus: sessionCardsQuery.status,
    response: sessionCardsQuery.data,
  })
  const selectedCard =
    cardRouteResolution?.status === 'selected'
      ? cardRouteResolution.card
      : undefined
  const selectedCardId = selectedCard?.cardId
  const completeSessionCardList = retainCompleteSessionCardProjections(
    sessionCardsQuery.data,
  )
  const inspectedChildCardId = validatedInspectedChildCardId(
    selectedCard,
    search.inspect,
  )
  const forcedSessionKey =
    forcedSession?.friendlyId === activeFriendlyId
      ? forcedSession.sessionKey
      : undefined
  const latestResolvedRouteRef = useRef({
    friendlyId: activeFriendlyId,
    sessionKey: forcedSessionKey ?? activeFriendlyId,
  })
  const canonicalizedCardAliasRef = useRef('')

  useEffect(() => {
    latestResolvedRouteRef.current = {
      friendlyId: activeFriendlyId,
      sessionKey: forcedSessionKey ?? activeFriendlyId,
    }
  }, [activeFriendlyId, forcedSessionKey])

  useEffect(() => {
    if (!selectedCardId || selectedCardId === activeFriendlyId) return
    const transitionKey = `${activeFriendlyId}\u0000${selectedCardId}`
    if (canonicalizedCardAliasRef.current === transitionKey) return
    canonicalizedCardAliasRef.current = transitionKey
    void navigate(buildSessionReplaceNavigation(selectedCardId))
  }, [activeFriendlyId, navigate, selectedCardId])

  useEffect(() => {
    const persistenceAction = syncLastSessionCardPersistence({
      activeFriendlyId,
      selectedCardId,
      cardRouteResolution,
    })
    if (persistenceAction === 'bootstrap-new') {
      void navigate(buildSessionReplaceNavigation('new'))
    }
  }, [activeFriendlyId, cardRouteResolution, navigate, selectedCardId])

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

  if (
    cardRouteResolution.status === 'rejected' ||
    cardRouteResolution.status === 'unavailable'
  ) {
    const unavailableMessage =
      cardRouteResolution.status === 'unavailable'
        ? cardRouteResolution.reason === 'query'
          ? 'The validated Session Card list could not be loaded.'
          : 'The validated Session Card projection is incomplete.'
        : cardRouteResolution.reason === 'child'
          ? 'Child and branch activity cannot replace the parent conversation.'
          : cardRouteResolution.reason === 'continuation'
            ? 'Continuation segments cannot be opened directly. Select the parent Session Card.'
            : 'This conversation is not present in the validated Session Card list.'

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-primary-700">
        <h2 className="text-lg font-semibold">Conversation unavailable</h2>
        <p className="max-w-md text-sm text-primary-500">
          {unavailableMessage}
        </p>
        <button
          type="button"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm text-white"
          onClick={() => void sessionCardsQuery.refetch()}
        >
          Retry
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
          sessionCardList={completeSessionCardList}
          isNewChat={isNewChat}
          forcedSessionKey={selectedCard ? undefined : forcedSessionKey}
          onSessionResolved={handleSessionResolved}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
