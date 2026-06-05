import { appendHistoryMessage, chatQueryKeys } from '../chat-queries'
import { textFromMessage } from '../utils'
import type { QueryClient } from '@tanstack/react-query'
import type { ChatMessage } from '../types'

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Snapshot optimistic user messages from the history cache before a refetch,
 * then re-inject them after the refetch completes.
 *
 * The refetch replaces the query cache with server data which won't include
 * the optimistic message yet — without re-injection the user's message
 * disappears until the server echoes it.
 *
 * Matches messages that are:
 *   - Still optimistic (__optimisticId starts with "opt-")
 *   - In sending/queued state
 *   - Already confirmed by SSE (status "sent") but have no server id yet
 *     (only clientId) — these can still be lost during refetch.
 *
 * After refetch, the returned closure checks if the server already echoed
 * the user message (by clientId or text match) and skips re-injection to
 * avoid duplicates.
 *
 * Usage:
 *   const reInject = snapshotOptimisticUserMessages(queryClient, friendlyId, sessionKey)
 *   await queryClient.invalidateQueries(...)
 *   reInject()
 */
export function snapshotOptimisticUserMessages(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
): () => void {
  const key = chatQueryKeys.history(friendlyId, sessionKey)
  const prevData = queryClient.getQueryData<Record<string, unknown>>(key)
  const pending = ((prevData?.messages as Array<unknown> | undefined) ?? []).filter(
    (msg: unknown) => {
      const raw = msg as Record<string, unknown>
      if (raw.role !== 'user') return false
      if (String(raw.__optimisticId ?? '').startsWith('opt-')) return true
      if (String(raw.status) === 'sending' || String(raw.status) === 'queued') return true
      if (String(raw.status) === 'sent') {
        // Re-inject only if the message has a clientId (local) but no server id
        const hasClientId = normalize(raw.clientId).length > 0 || normalize(raw.client_id).length > 0
        const hasServerId = normalize(raw.id).length > 0 || normalize(raw.messageId).length > 0
        return hasClientId && !hasServerId
      }
      return false
    },
  ) as unknown as Array<ChatMessage>

  return () => {
    const currentData = queryClient.getQueryData<Record<string, unknown>>(key)
    const currentMessages = (currentData?.messages as Array<unknown> | undefined) ?? []

    for (const msg of pending) {
      const raw = msg as unknown as Record<string, unknown>
      const msgClientId = normalize(raw.clientId) || normalize(raw.client_id)
      const msgText = textFromMessage(msg)

      const alreadyPresent = currentMessages.some((m: unknown) => {
        const mRaw = m as Record<string, unknown>
        if (mRaw.role !== 'user') return false
        if (msgClientId) {
          const mClientId = normalize(mRaw.clientId) || normalize(mRaw.client_id)
          if (mClientId && mClientId === msgClientId) return true
        }
        if (msgText.length > 0) {
          const mText = textFromMessage(m as ChatMessage)
          if (mText === msgText) {
            const msgTs = (raw.timestamp as number) || 0
            const mTs = (mRaw.timestamp as number) || 0
            if (msgTs && mTs && Math.abs(msgTs - mTs) < 10_000) return true
          }
        }
        return false
      })

      if (!alreadyPresent) {
        appendHistoryMessage(queryClient, friendlyId, sessionKey, msg)
      }
    }
  }
}
