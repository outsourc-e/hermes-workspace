import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SessionCardHistoryResponse,
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'
import type { ChatMessage, SessionCardChild } from '@/screens/chat/types'
import {
  fetchCompleteSessionCardHistory,
  fetchSessionCards,
  hasExactCompleteSessionCardProjection,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import { textFromMessage } from '@/screens/chat/utils'

export type SwarmChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error'
  content: string
  timestamp: number | null
  pending?: boolean
}

type DirectChatResponse = {
  ok: boolean
  workerId: string
  delivered: boolean
  delivery?: 'tmux'
  error?: string | null
  fetchedAt: number
}

export type SwarmSessionCardTarget = {
  cardId: string
  parentCardId?: string
  canonicalSegmentKey: string
  title: string
  relationship: 'root' | 'child'
  route: {
    to: '/chat/$sessionKey'
    params: { sessionKey: string }
    search: { inspect?: string }
  }
}

const POLL_INTERVAL_MS = 5_000
const DEFAULT_LIMIT = 30

function sourceQualifiedCardId(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? ''
  if (
    (normalized.startsWith('local:') && normalized.length > 'local:'.length) ||
    (normalized.startsWith('remote:') && normalized.length > 'remote:'.length)
  ) {
    return normalized
  }
  return null
}

/**
 * Resolve only an exact stable Card ID supplied by an authoritative producer.
 * Worker IDs, titles, canonical segment keys, and continuation aliases are not
 * sufficient to identify a mounted transcript.
 */
export function resolveSwarmSessionCardTarget(
  response: SessionCardListWire | undefined,
  activityCardId: string | null | undefined,
): SwarmSessionCardTarget | undefined {
  const cardId = sourceQualifiedCardId(activityCardId)
  if (!response || !cardId) return undefined

  const matches: Array<{
    parent: SessionCardWire
    child?: SessionCardChild
  }> = []
  for (const parent of response.cards) {
    if (parent.cardId === cardId) matches.push({ parent })
    for (const child of parent.childNodes) {
      if (child.cardId === cardId) matches.push({ parent, child })
    }
  }
  if (matches.length !== 1) return undefined

  const { parent, child } = matches[0]!
  if (!hasExactCompleteSessionCardProjection(response, parent.cardId)) {
    return undefined
  }
  if (child) {
    if (!sourceQualifiedCardId(child.cardId)) return undefined
    return {
      cardId: child.cardId,
      parentCardId: parent.cardId,
      canonicalSegmentKey: child.sessionKey,
      title: child.title,
      relationship: 'child',
      route: {
        to: '/chat/$sessionKey',
        params: { sessionKey: parent.cardId },
        search: { inspect: child.cardId },
      },
    }
  }

  return {
    cardId: parent.cardId,
    canonicalSegmentKey: parent.canonicalSegmentKey,
    title: parent.title,
    relationship: 'root',
    route: {
      to: '/chat/$sessionKey',
      params: { sessionKey: parent.cardId },
      search: {},
    },
  }
}

async function sendDirectChat(
  workerId: string,
  prompt: string,
  limit: number,
): Promise<DirectChatResponse> {
  const res = await fetch('/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, prompt, limit, timeoutMs: 120_000 }),
  })
  const data = (await res.json().catch(() => null)) as
    | DirectChatResponse
    | { error?: string }
    | null
  if (!res.ok) {
    throw new Error(
      (data && 'error' in data && data.error) ||
        `swarm-direct-chat HTTP ${res.status}`,
    )
  }
  if (!data || !('delivered' in data) || !data.delivered) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        'Direct chat did not reach worker',
    )
  }
  return data
}

function normalizeCardMessage(
  message: ChatMessage,
  index: number,
  cardId: string,
): SwarmChatMessage | null {
  const content = textFromMessage(message).trim()
  if (!content) return null
  const role: SwarmChatMessage['role'] =
    message.role === 'assistant'
      ? 'assistant'
      : message.role === 'user'
        ? 'user'
        : message.role === 'tool'
          ? 'tool'
          : 'system'
  return {
    // Never reuse or expose an upstream raw message ID in the mounted viewer.
    id: `card-message-${cardId}-${index}`,
    role,
    content,
    timestamp: typeof message.timestamp === 'number' ? message.timestamp : null,
  }
}

export type UseSwarmChatOptions = {
  workerId: string
  /** Exact source-qualified Card ID from an authoritative worker projection. */
  activityCardId?: string | null
  limit?: number
  enabled?: boolean
}

export function useSwarmChat({
  workerId,
  activityCardId,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UseSwarmChatOptions) {
  const queryClient = useQueryClient()
  const listQuery = useQuery({
    queryKey: sessionCardQueryKeys.list(false),
    queryFn: () => fetchSessionCards(),
    enabled: Boolean(workerId) && enabled,
    refetchInterval: 15_000,
  })
  const target = useMemo(
    () => resolveSwarmSessionCardTarget(listQuery.data, activityCardId),
    [listQuery.data, activityCardId],
  )
  const historyQueryKey = target?.parentCardId
    ? sessionCardQueryKeys.childHistory(
        target.parentCardId,
        target.cardId,
        target.canonicalSegmentKey,
      )
    : sessionCardQueryKeys.history(
        target?.cardId ?? '',
        target?.canonicalSegmentKey ?? '',
      )
  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: ({ signal }) => {
      if (!target) throw new Error('Worker Session Card is unavailable')
      return fetchCompleteSessionCardHistory({
        ...(target.parentCardId ? { parentCardId: target.parentCardId } : {}),
        cardId: target.cardId,
        canonicalSegmentKey: target.canonicalSegmentKey,
        signal,
      })
    },
    enabled: Boolean(target) && enabled,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const dispatch = useMutation({
    mutationFn: async (prompt: string) => {
      return await sendDirectChat(workerId, prompt, limit)
    },
    onSuccess: async () => {
      const invalidations = [
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.list(false),
        }),
      ]
      if (target) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        )
      }
      await Promise.all(invalidations)
    },
  })

  const completeHistory: SessionCardHistoryResponse | undefined =
    historyQuery.data?.completeness === 'complete' &&
    historyQuery.data.retryable === false
      ? historyQuery.data
      : undefined
  const messages = useMemo(
    () =>
      (completeHistory?.messages ?? [])
        .map((message, index) =>
          normalizeCardMessage(message, index, target?.cardId ?? 'unresolved'),
        )
        .filter((message): message is SwarmChatMessage => Boolean(message)),
    [completeHistory?.messages, target?.cardId],
  )

  const historyIncomplete =
    Boolean(target && historyQuery.data) && !completeHistory
  const queryError =
    (listQuery.error instanceof Error ? listQuery.error.message : null) ??
    (historyQuery.error instanceof Error ? historyQuery.error.message : null)

  return {
    workerId,
    target,
    sessionTitle: target?.title ?? null,
    source:
      target && completeHistory
        ? ('session-card' as const)
        : ('unavailable' as const),
    transcriptStatus: !target
      ? ('unmapped' as const)
      : historyIncomplete
        ? ('incomplete' as const)
        : completeHistory
          ? ('ready' as const)
          : ('loading' as const),
    error: queryError,
    messages,
    isLoading:
      listQuery.isPending || (Boolean(target) && historyQuery.isPending),
    isFetching: listQuery.isFetching || historyQuery.isFetching,
    refetch: async () => {
      await listQuery.refetch()
      if (target) await historyQuery.refetch()
    },
    sendMessage: dispatch.mutateAsync,
    isSending: dispatch.isPending,
    sendError: dispatch.error instanceof Error ? dispatch.error.message : null,
  }
}
