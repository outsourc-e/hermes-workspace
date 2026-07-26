import {
  moveHistoryMessages,
  reconcileSessionDraft,
} from '../../screens/chat/chat-queries'
import { handoffPendingSend } from '../../screens/chat/pending-send'
import type { SessionCardListWire } from '../../screens/chat/chat-queries'
import type { SessionCard } from '../../screens/chat/types'
import type { QueryClient } from '@tanstack/react-query'

export type SessionRouteResolutionPayload =
  | {
      friendlyId: string
      sessionKey: string
      reason: 'canonical'
    }
  | {
      fromSessionKey: string
      friendlyId: string
      sessionKey: string
      reason: 'bootstrap' | 'stream-handoff'
    }

export function buildSessionReplaceNavigation(friendlyId: string) {
  return {
    to: '/chat/$sessionKey' as const,
    params: { sessionKey: friendlyId },
    search: true as const,
    hash: true as const,
    state: true as const,
    replace: true as const,
  }
}

export type SessionCardRouteResolution =
  | {
      status: 'selected'
      card: SessionCard
      navigation?: ReturnType<typeof buildSessionReplaceNavigation>
    }
  | { status: 'rejected'; reason: 'child' | 'missing' }
  | { status: 'legacy-fallback' }

/** Resolve route identity exclusively from the strictly validated Card list. */
export function resolveSessionCardRoute({
  routeKey,
  response,
}: {
  routeKey: string
  response: SessionCardListWire
}): SessionCardRouteResolution {
  const normalizedRouteKey = routeKey.trim()
  if (
    !normalizedRouteKey ||
    normalizedRouteKey === 'new' ||
    normalizedRouteKey === 'main'
  ) {
    return { status: 'legacy-fallback' }
  }

  const isChildRoute = response.cards.some((card) =>
    card.childNodes.some(
      (child) =>
        child.cardId === normalizedRouteKey ||
        child.sessionKey === normalizedRouteKey,
    ),
  )
  if (isChildRoute) return { status: 'rejected', reason: 'child' }

  const card =
    response.cards.find(
      (candidate) => candidate.cardId === normalizedRouteKey,
    ) ??
    response.cards.find((candidate) =>
      candidate.continuationSegmentKeys.includes(normalizedRouteKey),
    )
  if (card) {
    return {
      status: 'selected',
      card,
      ...(normalizedRouteKey === card.cardId
        ? {}
        : { navigation: buildSessionReplaceNavigation(card.cardId) }),
    }
  }

  // A valid but incomplete list cannot prove that an unknown legacy key is
  // unrelated. Preserve the legacy path until a complete response can decide.
  return response.completeness === 'complete'
    ? { status: 'rejected', reason: 'missing' }
    : { status: 'legacy-fallback' }
}

export function applySessionRouteResolution({
  queryClient,
  activeFriendlyId,
  fallbackSessionKey,
  payload,
}: {
  queryClient: QueryClient
  activeFriendlyId: string
  fallbackSessionKey: string
  payload: SessionRouteResolutionPayload
}) {
  const sourceSessionKey =
    payload.reason === 'canonical'
      ? fallbackSessionKey
      : payload.fromSessionKey.trim()

  if (payload.reason !== 'canonical') {
    moveHistoryMessages(
      queryClient,
      activeFriendlyId,
      sourceSessionKey,
      payload.friendlyId,
      payload.sessionKey,
    )
    handoffPendingSend(sourceSessionKey, payload.sessionKey, payload.friendlyId)
  }

  if (
    payload.reason === 'bootstrap' ||
    activeFriendlyId === 'new' ||
    activeFriendlyId === 'main'
  ) {
    reconcileSessionDraft(
      queryClient,
      activeFriendlyId,
      sourceSessionKey,
      payload.friendlyId,
      payload.sessionKey,
    )
  }

  return {
    sourceSessionKey,
    resolvedRoute: {
      friendlyId: payload.friendlyId,
      sessionKey: payload.sessionKey,
    },
    navigation: buildSessionReplaceNavigation(payload.friendlyId),
  }
}
