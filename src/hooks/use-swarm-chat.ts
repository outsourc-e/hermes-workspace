import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'
import type {
  ChatAttachment,
  ChatMessage,
  SessionCardChild,
} from '@/screens/chat/types'
import type { SwarmDirectChatUserAcknowledgement } from '@/lib/swarm-direct-chat-delivery'
import {
  fetchCompleteSessionCardHistory,
  fetchSessionCards,
  hasExactCompleteSessionCardProjection,
  isAuthoritativeCompleteSessionCardHistory,
  reconcileSessionCardHistoryResponse,
  reconcileSessionCardHistoryResponseDurably,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import { textFromMessage } from '@/screens/chat/utils'
import { createOptimisticMessage } from '@/screens/chat/chat-screen-utils'
import {
  acknowledgeDeliveredCardTranscriptRecoveryMessage,
  appendCardTranscriptRecoveryMessage,
  isCardTranscriptRecoveryMessagePortable,
  removeRejectedCardTranscriptRecoveryMessage,
} from '@/screens/chat/card-transcript-recovery'
import { parsePortableAttachmentDataUrl } from '@/screens/chat/attachment-envelope'
import {
  parseSwarmDirectChatUserAcknowledgement,
  swarmDirectChatAttachmentContentDigest,
} from '@/lib/swarm-direct-chat-delivery'

export type SwarmChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error'
  content: string
  timestamp: number | null
  attachments?: Array<ChatAttachment>
  pending?: boolean
}

type DirectChatResponse = {
  ok: boolean
  cardOwner: SwarmSessionCardOwner
  delivered: boolean
  delivery?: 'tmux'
  userAcknowledgement?: unknown
  error?: string | null
  fetchedAt: number
}

type SwarmDirectChatBinding = SwarmSessionCardOwner & {
  canonicalSource: 'local'
  canonicalSegmentKey: string
  canonicalTransport: 'tmux'
}

type SwarmDirectChatOutcome = {
  cardOwner: SwarmSessionCardOwner
}

type SwarmDirectChatTransportOutcome = SwarmDirectChatOutcome & {
  userAcknowledgement: SwarmDirectChatUserAcknowledgement | null
}

type SwarmDirectChatInput = {
  prompt: string
  attachments: Array<ChatAttachment>
  cardOwner: SwarmSessionCardOwner
  clientId: string
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
const SAFE_RECOVERY_ERROR =
  'Unable to save this worker message for Session Card recovery'

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
): card is SessionCardWire & { canonicalSource: 'local' } {
  const source = card.canonicalSource
  return (
    source === 'local' &&
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
  if (!cardId || cardId.source !== 'local') return false
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
  clientId: string,
  prompt: string,
  attachments: Array<ChatAttachment>,
  limit: number,
  cardBinding: SwarmDirectChatBinding,
): Promise<SwarmDirectChatTransportOutcome> {
  const res = await fetch('/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workerId,
      clientId,
      prompt,
      attachments,
      cardBinding,
      limit,
      timeoutMs: 120_000,
    }),
  })
  const data = (await res.json().catch(() => null)) as
    | DirectChatResponse
    | { error?: string }
    | null
  if (
    !res.ok ||
    !data ||
    !('delivered' in data) ||
    !data.delivered ||
    !('cardOwner' in data) ||
    !isRuntimeCardOwner(data.cardOwner) ||
    data.cardOwner.cardId !== cardBinding.cardId ||
    data.cardOwner.parentCardId !== cardBinding.parentCardId
  ) {
    throw new Error(SAFE_SEND_ERROR)
  }
  return {
    cardOwner: data.cardOwner,
    userAcknowledgement: parseSwarmDirectChatUserAcknowledgement(
      data.userAcknowledgement,
      clientId,
    ),
  }
}

function directChatBindingForMapping(
  mapping: ResolvedSwarmSessionCardMapping | undefined,
  workerId: string,
): SwarmDirectChatBinding | undefined {
  if (!mapping || mapping.canonicalSegmentKey !== `local:${workerId}`) {
    return undefined
  }
  return {
    kind: 'session-card-owner',
    cardId: mapping.target.cardId,
    parentCardId: mapping.target.parentCardId,
    canonicalSource: 'local',
    canonicalSegmentKey: mapping.canonicalSegmentKey,
    canonicalTransport: 'tmux',
  }
}

function normalizeCardMessage(
  message: ChatMessage,
  index: number,
  cardId: string,
): SwarmChatMessage | null {
  const content = textFromMessage(message).trim()
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => ({ ...attachment }))
    : []
  if (!content && attachments.length === 0) return null
  const role: SwarmChatMessage['role'] =
    message.role === 'assistant'
      ? 'assistant'
      : message.role === 'user'
        ? 'user'
        : message.role === 'tool'
          ? 'tool'
          : 'system'
  const optimisticIdentity =
    typeof message.__optimisticId === 'string' && message.__optimisticId.trim()
      ? message.__optimisticId
      : String(index)
  return {
    id: `card-message-${cardId}-${optimisticIdentity}`,
    role,
    content,
    timestamp: typeof message.timestamp === 'number' ? message.timestamp : null,
    ...(attachments.length > 0 ? { attachments } : {}),
    pending: message.status === 'sending',
  }
}

async function portableOutgoingAttachments(
  attachments: ReadonlyArray<ChatAttachment>,
): Promise<Array<ChatAttachment> | null> {
  const portable: Array<ChatAttachment> = []
  for (const attachment of attachments) {
    const parsed = parsePortableAttachmentDataUrl(
      attachment.dataUrl,
      attachment.contentType,
    )
    if (!parsed) return null
    const id =
      typeof attachment.id === 'string' && attachment.id.trim()
        ? attachment.id.trim()
        : crypto.randomUUID()
    const name =
      typeof attachment.name === 'string' ? attachment.name.trim() : ''
    const size = attachment.size
    const padding = parsed.base64.endsWith('==')
      ? 2
      : parsed.base64.endsWith('=')
        ? 1
        : 0
    const decodedSize = Math.floor((parsed.base64.length * 3) / 4) - padding
    const contentDigest = await swarmDirectChatAttachmentContentDigest(
      parsed.base64,
    )
    if (
      !name ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size !== decodedSize ||
      !contentDigest
    ) {
      return null
    }
    portable.push({
      id,
      name,
      contentType: parsed.contentType,
      size,
      dataUrl: `data:${parsed.contentType};base64,${parsed.base64}`,
      contentDigest,
    })
  }
  return portable
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

function cardOwnerHistoryQueryKey(owner: SwarmSessionCardOwner) {
  return owner.parentCardId
    ? sessionCardQueryKeys.childHistory(owner.parentCardId, owner.cardId)
    : sessionCardQueryKeys.history(owner.cardId)
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
    const reconciled = await reconcileSessionCardHistoryResponseDurably(
      history,
      {
        continuationSegmentKeys: mapping.continuationSegmentKeys,
      },
    )
    const complete = isAuthoritativeCompleteSessionCardHistory(history)
    return {
      target: mapping.target,
      status: complete ? 'ready' : 'incomplete',
      messages: reconciled.messages
        .map((message, index) =>
          normalizeCardMessage(message, index, mapping.target.cardId),
        )
        .filter((message): message is SwarmChatMessage => Boolean(message)),
      error:
        complete && reconciled.completeSnapshotDurability === 'failed'
          ? SAFE_RECOVERY_ERROR
          : null,
    }
  } catch {
    const recovered = reconcileSessionCardHistoryResponse(
      {
        sessionKey: mapping.canonicalSegmentKey,
        cardId: mapping.target.cardId,
        canonicalSegmentKey: mapping.canonicalSegmentKey,
        messages: [],
        persistedMessages: [],
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: mapping.canonicalSegmentKey,
            retryable: true,
            error: SAFE_TRANSCRIPT_ERROR,
          },
        ],
      },
      { continuationSegmentKeys: mapping.continuationSegmentKeys },
    )
    return {
      target: mapping.target,
      status: 'unavailable',
      messages: recovered.messages
        .map((message, index) =>
          normalizeCardMessage(message, index, mapping.target.cardId),
        )
        .filter((message): message is SwarmChatMessage => Boolean(message)),
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
  const transcriptTarget = targetMatchesOwner(
    transcript?.target ?? undefined,
    cardOwner,
  )
    ? (transcript?.target ?? undefined)
    : undefined
  const target = transcript ? transcriptTarget : verifiedTarget
  const activeOwner: SwarmSessionCardOwner | undefined = target
    ? {
        kind: 'session-card-owner',
        cardId: target.cardId,
        parentCardId: target.parentCardId,
      }
    : undefined
  const messages = target ? (transcript?.messages ?? []) : []
  const safeError =
    mappingState.status === 'unavailable'
      ? SAFE_TRANSCRIPT_ERROR
      : (transcript?.error ?? null)

  const dispatch = useMutation({
    mutationFn: async (input: SwarmDirectChatInput) => {
      try {
        const mapping = resolveSwarmSessionCardMapping(
          await fetchSessionCards(),
          input.cardOwner,
        )
        const cardBinding = directChatBindingForMapping(mapping, workerId)
        if (!cardBinding) throw new Error(SAFE_SEND_ERROR)
        const outcome = await sendDirectChat(
          workerId,
          input.clientId,
          input.prompt || 'Please review the attached content.',
          input.attachments,
          limit,
          cardBinding,
        )
        if (outcome.userAcknowledgement) {
          acknowledgeDeliveredCardTranscriptRecoveryMessage(
            { cardId: input.cardOwner.cardId },
            input.clientId,
            outcome.userAcknowledgement,
          )
        }
        return { cardOwner: outcome.cardOwner }
      } catch {
        throw new Error(SAFE_SEND_ERROR)
      }
    },
    onSuccess: async (outcome) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.list(false),
        }),
        queryClient.invalidateQueries({
          queryKey: cardOwnerHistoryQueryKey(outcome.cardOwner),
        }),
      ])
    },
  })

  async function sendMessage(
    prompt: string,
    attachments: ReadonlyArray<ChatAttachment> = [],
  ): Promise<SwarmDirectChatOutcome> {
    const body = prompt.trim()
    if (!activeOwner || !target || (!body && attachments.length === 0)) {
      throw new Error(SAFE_SEND_ERROR)
    }
    const portableAttachments = await portableOutgoingAttachments(attachments)
    if (!portableAttachments) throw new Error(SAFE_RECOVERY_ERROR)

    const optimistic = createOptimisticMessage(body, portableAttachments)
    if (
      !isCardTranscriptRecoveryMessagePortable(optimistic.optimisticMessage)
    ) {
      throw new Error(SAFE_RECOVERY_ERROR)
    }
    const recoveryOwner = { cardId: activeOwner.cardId }
    const persisted = appendCardTranscriptRecoveryMessage(
      recoveryOwner,
      optimistic.optimisticMessage,
    )
    if (!persisted) {
      removeRejectedCardTranscriptRecoveryMessage(
        recoveryOwner,
        optimistic.clientId,
      )
      throw new Error(SAFE_RECOVERY_ERROR)
    }

    const optimisticRow = normalizeCardMessage(
      optimistic.optimisticMessage,
      Date.now(),
      activeOwner.cardId,
    )
    if (!optimisticRow) {
      removeRejectedCardTranscriptRecoveryMessage(
        recoveryOwner,
        optimistic.clientId,
      )
      throw new Error(SAFE_RECOVERY_ERROR)
    }
    queryClient.setQueryData<SwarmCardTranscript>(
      cardOwnerHistoryQueryKey(activeOwner),
      (current) => ({
        target,
        status: current?.status === 'unavailable' ? 'unavailable' : 'ready',
        messages: [...(current?.messages ?? []), optimisticRow],
        error: current?.error ?? null,
      }),
    )

    return dispatch.mutateAsync({
      prompt: body,
      attachments: portableAttachments,
      cardOwner: activeOwner,
      clientId: optimistic.clientId,
    })
  }

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
    sendMessage,
    isSending: dispatch.isPending,
    sendError: dispatch.error instanceof Error ? SAFE_SEND_ERROR : null,
  }
}
