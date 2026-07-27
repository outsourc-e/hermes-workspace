import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCardProducerNavigation } from '@/routes/chat/-session-route-state'
import { resolveSessionCardProducerNavigation } from '@/routes/chat/-session-route-state'

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
