import {
  moveHistoryMessages,
  reconcileSessionDraft,
} from '../../screens/chat/chat-queries'
import { handoffPendingSend } from '../../screens/chat/pending-send'
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
