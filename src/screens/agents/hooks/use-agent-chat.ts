import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OperationsChatTarget } from './use-operations'
import type { ChatMessage } from '@/screens/chat/types'
import {
  fetchCompleteSessionCardHistory,
  isAuthoritativeCompleteSessionCardHistory,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import { textFromMessage } from '@/screens/chat/utils'

export type OperationsChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

function normalizeMessage(
  message: ChatMessage,
  index: number,
): OperationsChatMessage | null {
  const content = textFromMessage(message).trim()
  if (!content) return null
  const role =
    message.role === 'assistant'
      ? 'assistant'
      : message.role === 'user'
        ? 'user'
        : 'system'
  return {
    id:
      (typeof message.id === 'string' && message.id) ||
      `${role}-${message.timestamp ?? index}-${index}`,
    role,
    content,
    ...(typeof message.timestamp === 'number'
      ? { timestamp: message.timestamp }
      : {}),
  }
}

function childForTarget(target: OperationsChatTarget) {
  if (!target.inspectedChildCardId) return undefined
  return target.card.childNodes.find(
    (child) => child.cardId === target.inspectedChildCardId,
  )
}

/** Card-only history and send transport for mounted Operations agent chats. */
export function useAgentChat(target: OperationsChatTarget | undefined) {
  const queryClient = useQueryClient()
  const child = target ? childForTarget(target) : undefined
  const cardId = child?.cardId ?? target?.card.cardId ?? ''
  const canonicalSegmentKey =
    child?.sessionKey ?? target?.card.canonicalSegmentKey ?? ''
  const historyQueryKey =
    child && target
      ? sessionCardQueryKeys.childHistory(
          target.card.cardId,
          child.cardId,
          child.sessionKey,
        )
      : sessionCardQueryKeys.history(cardId, canonicalSegmentKey)

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: ({ signal }) => {
      if (!target || !cardId || !canonicalSegmentKey) {
        throw new Error('Operations chat Card is unavailable')
      }
      return fetchCompleteSessionCardHistory({
        ...(child ? { parentCardId: target.card.cardId } : {}),
        cardId,
        canonicalSegmentKey,
        signal,
      })
    },
    enabled: Boolean(target && cardId && canonicalSegmentKey),
    refetchInterval: 5_000,
  })

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!target || child) {
        throw new Error(
          child
            ? 'Child Session Card transcripts are read-only'
            : 'Operations chat Card is unavailable',
        )
      }
      const response = await fetch('/api/send-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: target.card.cardId,
          sessionKey: target.card.canonicalSegmentKey,
          friendlyId: target.card.cardId,
          message,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      if (!response.ok) {
        throw new Error((await response.text()) || 'Failed to send message')
      }
      // Keep the mutation pending for the stream lifetime. The authoritative
      // Card history refetch below supplies the rendered transcript.
      await response.text()
    },
    onSuccess: async () => {
      if (!target) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.list(false),
        }),
      ])
    },
  })

  const completeHistory = isAuthoritativeCompleteSessionCardHistory(
    historyQuery.data,
  )
    ? historyQuery.data
    : undefined
  const historyUnavailable = Boolean(
    target && historyQuery.data && !completeHistory,
  )
  const messages = useMemo(
    () =>
      (completeHistory?.messages ?? [])
        .map(normalizeMessage)
        .filter((message): message is OperationsChatMessage =>
          Boolean(message),
        ),
    [completeHistory?.messages],
  )
  const error = !target
    ? 'Chat unavailable: no complete Session Card was resolved.'
    : historyUnavailable
      ? 'Chat history unavailable until a complete transcript is available.'
      : child
        ? 'Direct child transcript · read-only'
        : (historyQuery.error instanceof Error && historyQuery.error.message) ||
          (sendMutation.error instanceof Error && sendMutation.error.message) ||
          null

  return {
    messages,
    sendMessage: sendMutation.mutateAsync,
    canSend: Boolean(target && !child),
    isLoading: historyQuery.isPending,
    isRefreshing: historyQuery.isFetching,
    isSending: sendMutation.isPending,
    error,
    canRetryHistory: Boolean(
      target && (historyUnavailable || historyQuery.error),
    ),
    refresh: historyQuery.refetch,
  }
}
