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
  | { status: 'selected'; card: SessionCard }
  | { status: 'bootstrap' }
  | {
      status: 'rejected'
      reason: 'child' | 'continuation' | 'missing'
    }
  | { status: 'unavailable'; reason: 'query' | 'projection' }

/** Child transcript inspection is valid only inside its selected parent Card. */
export function validatedInspectedChildCardId(
  selectedCard: SessionCard | undefined,
  requestedChildCardId: string | undefined,
): string | undefined {
  if (!selectedCard || !requestedChildCardId) return undefined
  return selectedCard.childNodes.find(
    (child) => child.cardId === requestedChildCardId,
  )?.cardId
}

export type SessionCardProducerNavigation = {
  cardId: string
  inspectedChildCardId?: string
}

/**
 * Translate legacy producer identities through a validated, source-complete
 * Card projection. Missing or partial owning projections produce no route.
 */
export function resolveSessionCardProducerNavigation(
  response: SessionCardListWire | undefined,
  requestedIdentities: ReadonlyArray<string | null | undefined>,
): SessionCardProducerNavigation | undefined {
  if (!response) return undefined
  const identities = requestedIdentities
    .map((identity) => identity?.trim() ?? '')
    .filter(
      (identity, index, values) =>
        Boolean(identity) && values.indexOf(identity) === index,
    )
  if (identities.length === 0) return undefined

  // Preserve producer precedence (for example, sessionKey before a display
  // friendlyId) rather than allowing Card list ordering to pick a route.
  for (const identity of identities) {
    for (const card of response.cards) {
      if (
        identity === card.cardId ||
        identity === card.canonicalSegmentKey ||
        card.continuationSegmentKeys.includes(identity)
      ) {
        return isCardProjectionComplete(response, card.cardId)
          ? { cardId: card.cardId }
          : undefined
      }
      const child = card.childNodes.find(
        (candidate) =>
          identity === candidate.cardId ||
          identity === candidate.sessionKey ||
          candidate.continuationSegmentKeys?.includes(identity) === true,
      )
      if (child) {
        return isCardProjectionComplete(response, card.cardId)
          ? {
              cardId: card.cardId,
              inspectedChildCardId: child.cardId,
            }
          : undefined
      }
    }
  }
  return undefined
}

function isBootstrapRoute(routeKey: string): boolean {
  return routeKey === 'new'
}

function isCardProjectionComplete(
  response: SessionCardListWire,
  cardId: string,
): boolean {
  if (response.cardResolutions === undefined) {
    return response.completeness === 'complete'
  }
  const card = response.cards.find((candidate) => candidate.cardId === cardId)
  if (card?.canonicalSource !== 'local' && card?.canonicalSource !== 'remote') {
    return false
  }
  const matches = response.cardResolutions.filter(
    (resolution) => resolution.cardId === cardId,
  )
  return (
    matches.length === 1 &&
    matches[0]!.completeness === 'complete' &&
    matches[0]!.retryable === false
  )
}

/** Resolve route identity exclusively from the strictly validated Card list. */
export function resolveSessionCardRoute({
  routeKey,
  response,
}: {
  routeKey: string
  response: SessionCardListWire
}): SessionCardRouteResolution {
  if (isBootstrapRoute(routeKey)) return { status: 'bootstrap' }

  const isChildRoute = response.cards.some((card) =>
    card.childNodes.some(
      (child) =>
        child.cardId === routeKey ||
        child.sessionKey === routeKey ||
        child.continuationSegmentKeys?.includes(routeKey) === true,
    ),
  )
  if (isChildRoute) return { status: 'rejected', reason: 'child' }

  const cards = response.cards.filter(
    (candidate) => candidate.cardId === routeKey,
  )
  if (cards.length === 1) {
    return isCardProjectionComplete(response, cards[0]!.cardId)
      ? { status: 'selected', card: cards[0]! }
      : { status: 'unavailable', reason: 'projection' }
  }
  if (cards.length > 1) {
    return { status: 'unavailable', reason: 'projection' }
  }

  // `main` is a former raw-session route, not a permanent bootstrap route.
  // It may converge only through an identity that the complete Card projection
  // itself owns; the browser never guesses a source or backend session.
  if (routeKey === 'main') {
    const target = resolveSessionCardProducerNavigation(response, [routeKey])
    if (target && !target.inspectedChildCardId) {
      const aliasedCard = response.cards.find(
        (candidate) => candidate.cardId === target.cardId,
      )
      if (aliasedCard) return { status: 'selected', card: aliasedCard }
    }
    return response.completeness === 'complete'
      ? { status: 'rejected', reason: 'missing' }
      : { status: 'unavailable', reason: 'projection' }
  }

  const isContinuationRoute = response.cards.some((candidate) =>
    candidate.continuationSegmentKeys.includes(routeKey),
  )
  if (isContinuationRoute) {
    return { status: 'rejected', reason: 'continuation' }
  }

  return response.completeness === 'complete'
    ? { status: 'rejected', reason: 'missing' }
    : { status: 'unavailable', reason: 'projection' }
}

/**
 * Convert query lifecycle state into a route state without ever falling back to
 * a raw backend session. `new` is the only explicit bootstrap exception.
 */
export function resolveSessionCardRouteState({
  routeKey,
  queryStatus,
  response,
}: {
  routeKey: string
  queryStatus: 'pending' | 'error' | 'success'
  response?: SessionCardListWire
}): SessionCardRouteResolution | null {
  if (isBootstrapRoute(routeKey)) return { status: 'bootstrap' }
  if (queryStatus === 'pending') return null
  if (queryStatus === 'error' || !response) {
    return { status: 'unavailable', reason: 'query' }
  }
  return resolveSessionCardRoute({ routeKey, response })
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
