import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'
import type { ChatMessage, SessionCardChild } from '@/screens/chat/types'
import {
  fetchCompleteSessionCardHistory,
  fetchSessionCards,
  hasExactCompleteSessionCardProjection,
  isAuthoritativeCompleteSessionCardHistory,
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

/**
 * Browser-visible ownership for embedded worker Chat. The discriminant and
 * explicit null parent keep raw session/worker strings out of identity APIs.
 */
export type SwarmSessionCardOwner = Readonly<{
  kind: 'session-card-owner'
  cardId: string
  parentCardId: string | null
}>

export type SwarmSessionCardTarget = {
  cardId: string
  parentCardId: string | null
  title: string
  relationship: 'root' | 'child'
  route: {
    to: '/chat/$sessionKey'
    params: { sessionKey: string }
    search: { inspect?: string }
  }
}

type ResolvedSwarmSessionCardMapping = {
  target: SwarmSessionCardTarget
  canonicalSegmentKey: string
  continuationSegmentKeys: ReadonlyArray<string>
}

type SwarmTranscriptStatus =
  | 'ready'
  | 'loading'
  | 'unmapped'
  | 'incomplete'
  | 'unavailable'

type SwarmCardTranscript = {
  target: SwarmSessionCardTarget | null
  status: Exclude<SwarmTranscriptStatus, 'loading'>
  messages: Array<SwarmChatMessage>
  error: string | null
}

type MappingState = {
  status: 'loading' | 'unmapped' | 'ready' | 'unavailable'
  target?: SwarmSessionCardTarget
}

const POLL_INTERVAL_MS = 5_000
const DEFAULT_LIMIT = 30
const UNMAPPED_HISTORY_QUERY_KEY = ['swarm', 'card-chat', 'unmapped'] as const
const SAFE_TRANSCRIPT_ERROR = 'Session Card transcript is unavailable'
const SAFE_SEND_ERROR = 'Unable to deliver the worker message'

function exactSourceQualifiedIdentity(
  value: unknown,
): { identity: string; source: 'local' | 'remote' } | null {
  if (typeof value !== 'string' || value.trim() !== value) return null
  if (value.startsWith('local:') && value.length > 'local:'.length) {
    return { identity: value, source: 'local' }
  }
  if (value.startsWith('remote:') && value.length > 'remote:'.length) {
    return { identity: value, source: 'remote' }
  }
  return null
}

function hasExactContinuationProjection(
  owner: {
    cardId: string
    canonicalSegmentKey: string
    continuationSegmentKeys: ReadonlyArray<string>
    continuationCount: number
  },
  source: 'local' | 'remote',
): boolean {
  const cardId = exactSourceQualifiedIdentity(owner.cardId)
  const canonicalSegment = exactSourceQualifiedIdentity(
    owner.canonicalSegmentKey,
  )
  const continuations = owner.continuationSegmentKeys.map(
    exactSourceQualifiedIdentity,
  )
  return Boolean(
    cardId &&
    canonicalSegment &&
    cardId.source === source &&
    canonicalSegment.source === source &&
    continuations.length > 0 &&
    continuations.length === owner.continuationCount &&
    continuations.every((identity) => identity?.source === source) &&
    new Set(owner.continuationSegmentKeys).size === continuations.length &&
    owner.continuationSegmentKeys[0] === owner.cardId &&
    owner.continuationSegmentKeys.at(-1) === owner.canonicalSegmentKey,
  )
}

function isExactRootProjection(
  response: SessionCardListWire,
  card: SessionCardWire,
): card is SessionCardWire & { canonicalSource: 'local' | 'remote' } {
  const source = card.canonicalSource
  return (
    (source === 'local' || source === 'remote') &&
    card.parentCardId === undefined &&
    (card.relationshipKind === 'root' || card.relationshipKind === 'orphan') &&
    hasExactCompleteSessionCardProjection(response, card.cardId) &&
    hasExactContinuationProjection(card, source)
  )
}

function isExactChildProjection(
  child: SessionCardChild,
  source: 'local' | 'remote',
): boolean {
  return hasExactContinuationProjection(
    {
      cardId: child.cardId,
      canonicalSegmentKey: child.sessionKey,
      continuationSegmentKeys: child.continuationSegmentKeys,
      continuationCount: child.continuationCount,
    },
    source,
  )
}

function isRuntimeCardOwner(value: unknown): value is SwarmSessionCardOwner {
  if (!value || typeof value !== 'object') return false
  const owner = value as Partial<SwarmSessionCardOwner>
  if (owner.kind !== 'session-card-owner') return false
  const cardId = exactSourceQualifiedIdentity(owner.cardId)
  if (!cardId) return false
  if (owner.parentCardId === null) return true
  const parentCardId = exactSourceQualifiedIdentity(owner.parentCardId)
  return Boolean(
    parentCardId &&
    parentCardId.source === cardId.source &&
    parentCardId.identity !== cardId.identity,
  )
}

function matchingChildProjections(
  children: ReadonlyArray<SessionCardChild>,
  cardId: string,
): Array<SessionCardChild> {
  return children.flatMap((child) => [
    ...(child.cardId === cardId ? [child] : []),
    ...matchingChildProjections(child.childNodes ?? [], cardId),
  ])
}

/**
 * Resolve an asserted Card owner only through the complete server projection.
 * Canonical segments are retained solely in this transient mapping and never
 * returned to mounted UI or React Query state.
 */
function resolveSwarmSessionCardMapping(
  response: SessionCardListWire | undefined,
  owner: SwarmSessionCardOwner | null | undefined,
): ResolvedSwarmSessionCardMapping | undefined {
  if (!response || !isRuntimeCardOwner(owner)) return undefined

  const allParentMatches = response.cards.filter(
    (parent) => parent.cardId === owner.cardId,
  )
  const allChildMatches = response.cards.flatMap((parent) =>
    matchingChildProjections(parent.childNodes, owner.cardId).map((child) => ({
      parent,
      child,
    })),
  )

  if (owner.parentCardId === null) {
    if (allParentMatches.length !== 1 || allChildMatches.length !== 0) {
      return undefined
    }
    const parent = allParentMatches[0]!
    if (!isExactRootProjection(response, parent)) return undefined
    return {
      target: {
        cardId: parent.cardId,
        parentCardId: null,
        title: parent.title,
        relationship: 'root',
        route: {
          to: '/chat/$sessionKey',
          params: { sessionKey: parent.cardId },
          search: {},
        },
      },
      canonicalSegmentKey: parent.canonicalSegmentKey,
      continuationSegmentKeys: parent.continuationSegmentKeys,
    }
  }

  if (allParentMatches.length !== 0 || allChildMatches.length !== 1) {
    return undefined
  }
  const { parent, child } = allChildMatches[0]!
  if (
    parent.cardId !== owner.parentCardId ||
    !isExactRootProjection(response, parent) ||
    !isExactChildProjection(child, parent.canonicalSource)
  ) {
    return undefined
  }
  return {
    target: {
      cardId: child.cardId,
      parentCardId: parent.cardId,
      title: child.title,
      relationship: 'child',
      route: {
        to: '/chat/$sessionKey',
        params: { sessionKey: parent.cardId },
        search: { inspect: child.cardId },
      },
    },
    canonicalSegmentKey: child.sessionKey,
    continuationSegmentKeys: child.continuationSegmentKeys,
  }
}

export function resolveSwarmSessionCardTarget(
  response: SessionCardListWire | undefined,
  owner: SwarmSessionCardOwner | null | undefined,
): SwarmSessionCardTarget | undefined {
  return resolveSwarmSessionCardMapping(response, owner)?.target
}

async function sendDirectChat(
  workerId: string,
  prompt: string,
  limit: number,
): Promise<void> {
  const res = await fetch('/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, prompt, limit, timeoutMs: 120_000 }),
  })
  const data = (await res.json().catch(() => null)) as
    | DirectChatResponse
    | { error?: string }
    | null
  if (!res.ok || !data || !('delivered' in data) || !data.delivered) {
    throw new Error(SAFE_SEND_ERROR)
  }
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
    id: `card-message-${cardId}-${index}`,
    role,
    content,
    timestamp: typeof message.timestamp === 'number' ? message.timestamp : null,
  }
}

function targetMatchesOwner(
  target: SwarmSessionCardTarget | undefined,
  owner: SwarmSessionCardOwner | null | undefined,
): boolean {
  return Boolean(
    target &&
    owner &&
    target.cardId === owner.cardId &&
    target.parentCardId === owner.parentCardId,
  )
}

function cardHistoryQueryKey(target: SwarmSessionCardTarget | undefined) {
  if (!target) return UNMAPPED_HISTORY_QUERY_KEY
  return target.parentCardId
    ? sessionCardQueryKeys.childHistory(target.parentCardId, target.cardId)
    : sessionCardQueryKeys.history(target.cardId)
}

async function fetchSanitizedSwarmCardTranscript(
  owner: SwarmSessionCardOwner,
  signal?: AbortSignal,
): Promise<SwarmCardTranscript> {
  let mapping: ResolvedSwarmSessionCardMapping | undefined
  try {
    mapping = resolveSwarmSessionCardMapping(await fetchSessionCards(), owner)
  } catch {
    return {
      target: null,
      status: 'unavailable',
      messages: [],
      error: SAFE_TRANSCRIPT_ERROR,
    }
  }
  if (!mapping) {
    return { target: null, status: 'unmapped', messages: [], error: null }
  }

  try {
    const history = await fetchCompleteSessionCardHistory({
      ...(mapping.target.parentCardId
        ? { parentCardId: mapping.target.parentCardId }
        : {}),
      cardId: mapping.target.cardId,
      canonicalSegmentKey: mapping.canonicalSegmentKey,
      continuationSegmentKeys: mapping.continuationSegmentKeys,
      signal,
    })
    if (
      history.cardId !== mapping.target.cardId ||
      history.canonicalSegmentKey !== mapping.canonicalSegmentKey
    ) {
      return {
        target: null,
        status: 'unavailable',
        messages: [],
        error: SAFE_TRANSCRIPT_ERROR,
      }
    }
    if (!isAuthoritativeCompleteSessionCardHistory(history)) {
      return {
        target: mapping.target,
        status: 'incomplete',
        messages: [],
        error: null,
      }
    }
    return {
      target: mapping.target,
      status: 'ready',
      messages: history.messages
        .map((message, index) =>
          normalizeCardMessage(message, index, mapping.target.cardId),
        )
        .filter((message): message is SwarmChatMessage => Boolean(message)),
      error: null,
    }
  } catch {
    return {
      target: mapping.target,
      status: 'unavailable',
      messages: [],
      error: SAFE_TRANSCRIPT_ERROR,
    }
  }
}

export type UseSwarmChatOptions = {
  workerId: string
  cardOwner?: SwarmSessionCardOwner | null
  limit?: number
  enabled?: boolean
}

export function useSwarmChat({
  workerId,
  cardOwner,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UseSwarmChatOptions) {
  const queryClient = useQueryClient()
  const [mappingState, setMappingState] = useState<MappingState>(() => ({
    status: cardOwner ? 'loading' : 'unmapped',
  }))
  const [mappingEpoch, setMappingEpoch] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!enabled || !workerId || !isRuntimeCardOwner(cardOwner)) {
      setMappingState({ status: 'unmapped' })
      return () => {
        cancelled = true
      }
    }

    setMappingState({ status: 'loading' })
    void fetchSessionCards()
      .then((response) => {
        if (cancelled) return
        const mapping = resolveSwarmSessionCardMapping(response, cardOwner)
        setMappingState(
          mapping
            ? { status: 'ready', target: mapping.target }
            : { status: 'unmapped' },
        )
      })
      .catch(() => {
        if (!cancelled) setMappingState({ status: 'unavailable' })
      })

    return () => {
      cancelled = true
    }
  }, [
    cardOwner?.kind,
    cardOwner?.cardId,
    cardOwner?.parentCardId,
    enabled,
    mappingEpoch,
    workerId,
  ])

  const verifiedTarget = targetMatchesOwner(mappingState.target, cardOwner)
    ? mappingState.target
    : undefined
  const verifiedOwner: SwarmSessionCardOwner | undefined = verifiedTarget
    ? {
        kind: 'session-card-owner',
        cardId: verifiedTarget.cardId,
        parentCardId: verifiedTarget.parentCardId,
      }
    : undefined
  const historyQueryKey = cardHistoryQueryKey(verifiedTarget)
  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: ({ signal }) =>
      verifiedOwner
        ? fetchSanitizedSwarmCardTranscript(verifiedOwner, signal)
        : Promise.resolve<SwarmCardTranscript>({
            target: null,
            status: 'unmapped',
            messages: [],
            error: null,
          }),
    enabled: Boolean(verifiedOwner) && enabled,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const transcript = historyQuery.data
  const transcriptStatus: SwarmTranscriptStatus = !verifiedTarget
    ? mappingState.status === 'loading'
      ? 'loading'
      : mappingState.status === 'unavailable'
        ? 'unavailable'
        : 'unmapped'
    : historyQuery.isPending
      ? 'loading'
      : (transcript?.status ?? 'loading')
  const target = transcript ? (transcript.target ?? undefined) : verifiedTarget
  const activeOwner: SwarmSessionCardOwner | undefined = target
    ? {
        kind: 'session-card-owner',
        cardId: target.cardId,
        parentCardId: target.parentCardId,
      }
    : undefined
  const messages =
    transcriptStatus === 'ready' ? (transcript?.messages ?? []) : []
  const safeError =
    mappingState.status === 'unavailable'
      ? SAFE_TRANSCRIPT_ERROR
      : (transcript?.error ?? null)

  const dispatch = useMutation({
    mutationFn: async (prompt: string) => {
      if (!activeOwner) throw new Error(SAFE_SEND_ERROR)
      try {
        return await sendDirectChat(workerId, prompt, limit)
      } catch {
        throw new Error(SAFE_SEND_ERROR)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.list(false),
        }),
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
      ])
    },
  })

  return {
    workerId,
    target,
    sessionTitle: target?.title ?? null,
    source:
      target && transcriptStatus === 'ready'
        ? ('session-card' as const)
        : ('unavailable' as const),
    transcriptStatus,
    error: safeError,
    messages,
    isLoading: transcriptStatus === 'loading',
    isFetching: mappingState.status === 'loading' || historyQuery.isFetching,
    refetch: async () => {
      if (verifiedOwner) {
        await historyQuery.refetch()
      } else {
        setMappingEpoch((current) => current + 1)
      }
    },
    sendMessage: dispatch.mutateAsync,
    isSending: dispatch.isPending,
    sendError: dispatch.error instanceof Error ? SAFE_SEND_ERROR : null,
  }
}
