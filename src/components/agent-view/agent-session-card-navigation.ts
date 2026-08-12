import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCardChild } from '@/screens/chat/types'
import type { SessionCardProducerNavigation } from '@/routes/chat/-session-route-state'
import type { GatewayAgentCardBinding } from '@/lib/gateway-api'
import { resolveSessionCardProducerNavigation } from '@/routes/chat/-session-route-state'
import { hasExactCompleteSessionCardProjection } from '@/screens/chat/chat-queries'

export type AgentSessionRouteIdentity = {
  key?: string | null
  sessionKey?: string | null
  friendlyId?: string | null
}

function sourceQualifiedIdentity(value: string | null | undefined) {
  const identity = value?.trim() ?? ''
  if (
    (identity.startsWith('local:') && identity.length > 'local:'.length) ||
    (identity.startsWith('remote:') && identity.length > 'remote:'.length)
  ) {
    return identity
  }
  return undefined
}

/** Resolve only source-qualified agent/session identities through the Card list. */
export function resolveAgentSessionCardNavigation(
  response: SessionCardListWire | undefined,
  identity: AgentSessionRouteIdentity,
): SessionCardProducerNavigation | undefined {
  return resolveSessionCardProducerNavigation(response, [
    sourceQualifiedIdentity(identity.sessionKey),
    sourceQualifiedIdentity(identity.key),
    sourceQualifiedIdentity(identity.friendlyId),
  ])
}

/** Build a parent-Card route while keeping child selection in query state. */
export function buildAgentSessionCardRoute(
  target: SessionCardProducerNavigation,
) {
  return {
    to: '/chat/$sessionKey' as const,
    params: { sessionKey: target.cardId },
    search: target.inspectedChildCardId
      ? { inspect: target.inspectedChildCardId }
      : {},
  }
}

function findChildBinding(
  children: ReadonlyArray<SessionCardChild>,
  targetCardId: string,
  parentCardId: string,
): GatewayAgentCardBinding | undefined {
  for (const child of children) {
    if (child.cardId === targetCardId) {
      if (
        !child.cardId.startsWith('remote:') ||
        !child.sessionKey.startsWith('remote:') ||
        child.continuationSegmentKeys.length !== child.continuationCount ||
        child.continuationSegmentKeys[0] !== child.cardId ||
        child.continuationSegmentKeys.at(-1) !== child.sessionKey ||
        new Set(child.continuationSegmentKeys).size !==
          child.continuationSegmentKeys.length
      ) {
        return undefined
      }
      return {
        kind: 'session-card-owner',
        cardId: child.cardId,
        parentCardId,
        canonicalSource: 'remote',
        canonicalSegmentKey: child.sessionKey,
        canonicalTransport: 'gateway',
      }
    }
    const descendant = findChildBinding(
      child.childNodes ?? [],
      targetCardId,
      child.cardId,
    )
    if (descendant) return descendant
  }
  return undefined
}

/** Build an exact source-qualified mutation capability from a complete Card projection. */
export function resolveAgentSessionCardOperationBinding(
  response: SessionCardListWire | undefined,
  target: SessionCardProducerNavigation | undefined,
): GatewayAgentCardBinding | undefined {
  if (!response || !target) return undefined
  const parentMatches = response.cards.filter(
    (card) =>
      card.cardId === target.cardId &&
      hasExactCompleteSessionCardProjection(response, card.cardId),
  )
  if (parentMatches.length !== 1) return undefined
  const parent = parentMatches[0]!
  if (
    parent.canonicalSource !== 'remote' ||
    parent.canonicalTransport !== 'gateway'
  ) {
    return undefined
  }
  if (target.inspectedChildCardId) {
    return findChildBinding(
      parent.childNodes,
      target.inspectedChildCardId,
      parent.cardId,
    )
  }
  if (
    !parent.cardId.startsWith('remote:') ||
    !parent.canonicalSegmentKey.startsWith('remote:') ||
    parent.continuationSegmentKeys.length !== parent.continuationCount ||
    parent.continuationSegmentKeys[0] !== parent.cardId ||
    parent.continuationSegmentKeys.at(-1) !== parent.canonicalSegmentKey ||
    new Set(parent.continuationSegmentKeys).size !==
      parent.continuationSegmentKeys.length
  ) {
    return undefined
  }
  return {
    kind: 'session-card-owner',
    cardId: parent.cardId,
    parentCardId: null,
    canonicalSource: 'remote',
    canonicalSegmentKey: parent.canonicalSegmentKey,
    canonicalTransport: 'gateway',
  }
}
