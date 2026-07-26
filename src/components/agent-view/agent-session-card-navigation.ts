import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCardProducerNavigation } from '@/routes/chat/-session-route-state'
import { resolveSessionCardProducerNavigation } from '@/routes/chat/-session-route-state'

export type AgentSessionRouteIdentity = {
  key?: string | null
  sessionKey?: string | null
  friendlyId?: string | null
}

/** Resolve gateway agent/session identities through the authoritative Card list. */
export function resolveAgentSessionCardNavigation(
  response: SessionCardListWire | undefined,
  identity: AgentSessionRouteIdentity,
): SessionCardProducerNavigation | undefined {
  return resolveSessionCardProducerNavigation(response, [
    identity.sessionKey,
    identity.key,
    identity.friendlyId,
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
