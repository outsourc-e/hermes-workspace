import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchSessionHistory,
  sendToSession,
  type SessionHistoryMessage,
} from '@/lib/gateway-api'

export type OperationsChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

function extractMessageText(message: SessionHistoryMessage): string {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => !part.type || part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n')
  }
  return ''
}

function normalizeMessage(
  message: SessionHistoryMessage,
  index: number,
): OperationsChatMessage | null {
  const content = extractMessageText(message).trim()
  if (!content) return null

  const role =
    message.role === 'assistant'
      ? 'assistant'
      : message.role === 'user'
        ? 'user'
        : 'system'

  return {
    id: `${role}-${message.timestamp ?? index}-${index}`,
    role,
    content,
    timestamp: message.timestamp,
  }
}

export function useAgentChat(sessionKey: string) {
  const queryClient = useQueryClient()

  const historyQuery = useQuery({
    queryKey: ['operations', 'chat', sessionKey],
    queryFn: async () => {
      try {
        // Try the ClawSuite history endpoint first (uses sessionKey param)
        const res = await fetch(`/api/history?sessionKey=${encodeURIComponent(sessionKey)}&limit=50`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.messages)) return data.messages as SessionHistoryMessage[]
        }
      } catch {
        // fall through
      }
      // Fallback to gateway-api
      const response = await fetchSessionHistory(sessionKey, { limit: 50 })
      if (response.ok === false) return []
      return Array.isArray(response.messages) ? response.messages : []
    },
    refetchInterval: 5_000,
    enabled: Boolean(sessionKey),
  })

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      await sendToSession(sessionKey, message)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['operations', 'chat', sessionKey],
      })
      await queryClient.invalidateQueries({
        queryKey: ['operations', 'sessions'],
      })
    },
  })

  const messages = useMemo(
    () =>
      (historyQuery.data ?? [])
        .map(normalizeMessage)
        .filter((message): message is OperationsChatMessage => Boolean(message)),
    [historyQuery.data],
  )

  return {
    messages,
    sendMessage: sendMutation.mutateAsync,
    isLoading: historyQuery.isPending,
    isRefreshing: historyQuery.isFetching,
    isSending: sendMutation.isPending,
    error:
      (historyQuery.error instanceof Error && historyQuery.error.message) ||
      (sendMutation.error instanceof Error && sendMutation.error.message) ||
      null,
    refresh: historyQuery.refetch,
  }
}
