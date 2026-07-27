import { normalizeSessions, readError } from './utils'
import type { QueryClient } from '@tanstack/react-query'
import type {
  ChatMessage,
  HistoryResponse,
  SessionCard,
  SessionCardChild,
  SessionListResponse,
  SessionMeta,
} from './types'

type StatusResponse = {
  ok: boolean
  error?: string
  status?: number
}

function normalizeId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function getMessageClientId(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const candidates = [raw.clientId, raw.client_id]
  for (const candidate of candidates) {
    const normalized = normalizeId(candidate)
    if (normalized) return normalized
  }
  return ''
}

function getMessageOptimisticId(message: ChatMessage): string {
  return normalizeId(message.__optimisticId)
}

function isMatchingClientMessage(
  message: ChatMessage,
  clientId: string,
  optimisticId: string,
): boolean {
  const messageClientId = getMessageClientId(message)
  if (messageClientId === clientId) return true

  const messageOptimisticId = getMessageOptimisticId(message)
  if (!messageOptimisticId) return false
  if (messageOptimisticId === clientId) return true
  if (messageOptimisticId === optimisticId) return true
  return false
}

export const chatQueryKeys = {
  sessions: ['chat', 'sessions'] as const,
  latestDescendant: function latestDescendant(sessionKey: string) {
    return ['chat', 'latest-descendant', sessionKey] as const
  },
  history: function history(friendlyId: string, sessionKey: string) {
    return ['chat', 'history', friendlyId, sessionKey] as const
  },
} as const

export const sessionCardQueryKeys = {
  list: function list(includeArchived = false) {
    return ['chat', 'session-cards', 'list', includeArchived] as const
  },
  history: function history(
    cardId: string,
    canonicalSegmentKey: string,
    cursor?: string,
  ) {
    return [
      'chat',
      'session-cards',
      'history',
      cardId,
      canonicalSegmentKey,
      cursor ?? '',
    ] as const
  },
  childHistory: function childHistory(
    parentCardId: string,
    childCardId: string,
    canonicalSegmentKey: string,
    cursor?: string,
  ) {
    return [
      'chat',
      'session-cards',
      'child-history',
      parentCardId,
      childCardId,
      canonicalSegmentKey,
      cursor ?? '',
    ] as const
  },
  metadata: function metadata(cardId: string) {
    return ['chat', 'session-cards', 'metadata', cardId] as const
  },
  archive: function archive(cardId: string) {
    return ['chat', 'session-cards', 'archive', cardId] as const
  },
  branch: function branch(cardId: string) {
    return ['chat', 'session-cards', 'branch', cardId] as const
  },
} as const

export type SessionCardSourceStatusWire = {
  source: string
  status: 'complete' | 'incomplete' | 'unavailable'
  fetched: number
  retryable: boolean
  reason?:
    | 'safe-cap'
    | 'unsupported-pagination'
    | 'stalled-pagination'
    | 'unstable-pagination'
  error?: string
}

export type SessionCardChildWire = SessionCardChild

export type SessionCardWire = Omit<SessionCard, 'childNodes'> & {
  childNodes: Array<SessionCardChildWire>
}

export type SessionCardListWire = {
  cards: Array<SessionCardWire>
  cardResolutions: Array<{
    cardId: string
    completeness: 'complete' | 'incomplete'
    retryable: boolean
  }>
  completeness: 'complete' | 'incomplete'
  retryable: boolean
  sources: Array<SessionCardSourceStatusWire>
}

export type SessionCardHistoryWire = {
  cardId: string
  canonicalSegmentKey: string
  messages: Array<{ segmentKey: string; message: Record<string, unknown> }>
  completeness: 'complete' | 'partial'
  retryable: boolean
  missingSegments: Array<{
    segmentKey: string
    source?: string
    retryable: true
    error: string
  }>
  nextCursor?: string
}

export type SessionCardArchiveWire = {
  ok: true
  cardId: string
  archived: true
}

export type SessionCardBranchWire = {
  ok: true
  cardId: string
  canonicalSegmentKey: string
  childSessionKey: string
  supported: true
}

function isWireRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonblankWireString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function sourceQualifiedWireIdentity(
  value: unknown,
): { identity: string; source: 'local' | 'remote' } | null {
  const identity = nonblankWireString(value)
  if (!identity) return null
  if (identity.startsWith('local:') && identity.length > 'local:'.length) {
    return { identity, source: 'local' }
  }
  if (identity.startsWith('remote:') && identity.length > 'remote:'.length) {
    return { identity, source: 'remote' }
  }
  return null
}

function wireEnum<const T extends string>(
  value: unknown,
  allowedValues: ReadonlyArray<T>,
): T | null {
  if (typeof value !== 'string') return null
  return allowedValues.includes(value as T) ? (value as T) : null
}

function invalidSessionCardResponse(): never {
  throw new Error('Invalid Session Card response')
}

function parseSessionCardChild(value: unknown): SessionCardChildWire {
  if (!isWireRecord(value)) return invalidSessionCardResponse()
  const cardIdentity = sourceQualifiedWireIdentity(value.cardId)
  const sessionIdentity = sourceQualifiedWireIdentity(value.sessionKey)
  const title = nonblankWireString(value.title)
  const continuationSegmentIdentities = Array.isArray(
    value.continuationSegmentKeys,
  )
    ? value.continuationSegmentKeys.map(sourceQualifiedWireIdentity)
    : []
  const relationshipKind = wireEnum(value.relationshipKind, ['branch', 'child'])
  const status = wireEnum(value.status, [
    'idle',
    'running',
    'complete',
    'error',
  ])
  if (
    !cardIdentity ||
    !sessionIdentity ||
    !title ||
    !relationshipKind ||
    !status ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    !Array.isArray(value.continuationSegmentKeys) ||
    continuationSegmentIdentities.some((identity) => identity === null) ||
    continuationSegmentIdentities.length === 0 ||
    new Set(continuationSegmentIdentities.map((identity) => identity?.identity))
      .size !== continuationSegmentIdentities.length ||
    !Number.isSafeInteger(value.continuationCount) ||
    Number(value.continuationCount) !== continuationSegmentIdentities.length ||
    continuationSegmentIdentities[0]?.identity !== cardIdentity.identity ||
    continuationSegmentIdentities.at(-1)?.identity !==
      sessionIdentity.identity ||
    continuationSegmentIdentities.some(
      (identity) => identity?.source !== cardIdentity.source,
    ) ||
    sessionIdentity.source !== cardIdentity.source
  ) {
    return invalidSessionCardResponse()
  }
  const continuationSegmentKeys = continuationSegmentIdentities.map(
    (identity) => identity?.identity ?? invalidSessionCardResponse(),
  )
  return {
    cardId: cardIdentity.identity,
    sessionKey: sessionIdentity.identity,
    continuationSegmentKeys,
    relationshipKind,
    title,
    status,
    updatedAt: value.updatedAt,
    continuationCount: Number(value.continuationCount),
  }
}

function parseSessionCard(value: unknown): SessionCardWire {
  if (!isWireRecord(value)) return invalidSessionCardResponse()
  const cardIdentity = sourceQualifiedWireIdentity(value.cardId)
  const canonicalSource = wireEnum(value.canonicalSource, ['local', 'remote'])
  const canonicalTransport =
    value.canonicalTransport === undefined
      ? undefined
      : wireEnum(value.canonicalTransport, ['dashboard', 'gateway'])
  const title = nonblankWireString(value.title)
  const canonicalSegmentIdentity = sourceQualifiedWireIdentity(
    value.canonicalSegmentKey,
  )
  const continuationSegmentIdentities = Array.isArray(
    value.continuationSegmentKeys,
  )
    ? value.continuationSegmentKeys.map(sourceQualifiedWireIdentity)
    : []
  const titleSource = wireEnum(value.titleSource, ['default', 'auto', 'manual'])
  const relationshipKind = wireEnum(value.relationshipKind, [
    'root',
    'branch',
    'child',
    'orphan',
  ])
  if (
    !cardIdentity ||
    !canonicalSource ||
    canonicalTransport === null ||
    (canonicalTransport !== undefined && canonicalSource !== 'remote') ||
    cardIdentity.source !== canonicalSource ||
    !title ||
    !canonicalSegmentIdentity ||
    canonicalSegmentIdentity.source !== canonicalSource ||
    !titleSource ||
    !Array.isArray(value.continuationSegmentKeys) ||
    continuationSegmentIdentities.some((identity) => identity === null) ||
    continuationSegmentIdentities.some(
      (identity) => identity?.source !== canonicalSource,
    ) ||
    continuationSegmentIdentities.length === 0 ||
    new Set(continuationSegmentIdentities.map((identity) => identity?.identity))
      .size !== continuationSegmentIdentities.length ||
    !Number.isSafeInteger(value.continuationCount) ||
    Number(value.continuationCount) !== continuationSegmentIdentities.length ||
    continuationSegmentIdentities[0]?.identity !== cardIdentity.identity ||
    canonicalSegmentIdentity.identity !==
      continuationSegmentIdentities.at(-1)?.identity ||
    !relationshipKind ||
    !Array.isArray(value.childNodes) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    typeof value.archived !== 'boolean' ||
    typeof value.pinned !== 'boolean' ||
    (value.archived && value.pinned)
  ) {
    return invalidSessionCardResponse()
  }
  const parentIdentity =
    value.parentCardId === undefined
      ? undefined
      : sourceQualifiedWireIdentity(value.parentCardId)
  if (
    parentIdentity === null ||
    parentIdentity?.identity === cardIdentity.identity ||
    (parentIdentity !== undefined && parentIdentity.source !== canonicalSource)
  ) {
    return invalidSessionCardResponse()
  }
  const childNodes = value.childNodes.map(parseSessionCardChild)
  if (
    childNodes.some(
      (child) =>
        child.cardId === cardIdentity.identity ||
        child.sessionKey === canonicalSegmentIdentity.identity,
    ) ||
    new Set(childNodes.map((child) => child.cardId)).size !==
      childNodes.length ||
    new Set(childNodes.map((child) => child.sessionKey)).size !==
      childNodes.length
  ) {
    return invalidSessionCardResponse()
  }
  const continuationSegmentKeys = continuationSegmentIdentities.map(
    (identity) => identity?.identity ?? invalidSessionCardResponse(),
  )
  return {
    cardId: cardIdentity.identity,
    canonicalSource,
    ...(canonicalTransport === undefined ? {} : { canonicalTransport }),
    title,
    titleSource,
    canonicalSegmentKey: canonicalSegmentIdentity.identity,
    continuationSegmentKeys,
    continuationCount: Number(value.continuationCount),
    relationshipKind,
    ...(parentIdentity === undefined
      ? {}
      : { parentCardId: parentIdentity.identity }),
    childNodes,
    updatedAt: value.updatedAt,
    archived: value.archived,
    pinned: value.pinned,
  }
}

function hasRootCardRelationshipSemantics(card: SessionCard): boolean {
  return card.relationshipKind === 'root' && card.parentCardId === undefined
}

function hasTopLevelCardRelationshipSemantics(card: SessionCard): boolean {
  return (
    hasRootCardRelationshipSemantics(card) ||
    (card.relationshipKind === 'orphan' && card.parentCardId === undefined)
  )
}

function hasUniqueSessionCardOwnership(cards: Array<SessionCardWire>): boolean {
  const ownerByIdentity = new Map<string, object>()
  const claimIdentity = (identity: string, owner: object): boolean => {
    const existingOwner = ownerByIdentity.get(identity)
    if (existingOwner !== undefined && existingOwner !== owner) return false
    ownerByIdentity.set(identity, owner)
    return true
  }

  for (const card of cards) {
    const owner = {}
    const ownAliases = [
      card.cardId,
      card.canonicalSegmentKey,
      ...card.continuationSegmentKeys,
    ]
    if (ownAliases.some((alias) => !claimIdentity(alias, owner))) return false
  }

  for (const card of cards) {
    for (const child of card.childNodes) {
      const owner = {}
      const childAliases = [
        child.cardId,
        child.sessionKey,
        ...child.continuationSegmentKeys,
      ]
      if (childAliases.some((alias) => !claimIdentity(alias, owner))) {
        return false
      }
    }
  }

  return true
}

function parseSourceStatus(value: unknown): SessionCardSourceStatusWire {
  if (!isWireRecord(value)) return invalidSessionCardResponse()
  const source = nonblankWireString(value.source)
  const status = wireEnum(value.status, [
    'complete',
    'incomplete',
    'unavailable',
  ])
  if (
    !source ||
    !status ||
    !Number.isSafeInteger(value.fetched) ||
    Number(value.fetched) < 0 ||
    typeof value.retryable !== 'boolean'
  ) {
    return invalidSessionCardResponse()
  }
  const reason =
    value.reason === undefined
      ? undefined
      : wireEnum(value.reason, [
          'safe-cap',
          'unsupported-pagination',
          'stalled-pagination',
          'unstable-pagination',
        ])
  if (reason === null) {
    return invalidSessionCardResponse()
  }
  const error =
    value.error === undefined ? undefined : nonblankWireString(value.error)
  if (
    error === null ||
    (error !== undefined && error.length > 256) ||
    (status === 'complete' &&
      (value.retryable || value.reason !== undefined || error !== undefined)) ||
    (status !== 'complete' && !value.retryable)
  ) {
    return invalidSessionCardResponse()
  }
  return {
    source,
    status,
    fetched: Number(value.fetched),
    retryable: value.retryable,
    ...(reason === undefined ? {} : { reason }),
    ...(error === undefined ? {} : { error }),
  }
}

function parseCardResolution(
  value: unknown,
): SessionCardListWire['cardResolutions'][number] {
  if (!isWireRecord(value)) return invalidSessionCardResponse()
  const cardId = nonblankWireString(value.cardId)
  const completeness = wireEnum(value.completeness, ['complete', 'incomplete'])
  if (
    !cardId ||
    !completeness ||
    typeof value.retryable !== 'boolean' ||
    (completeness === 'complete' && value.retryable) ||
    (completeness === 'incomplete' && !value.retryable)
  ) {
    return invalidSessionCardResponse()
  }
  return { cardId, completeness, retryable: value.retryable }
}

function parseSessionCardList(value: unknown): SessionCardListWire {
  if (
    !isWireRecord(value) ||
    !Array.isArray(value.cards) ||
    (value.completeness !== 'complete' &&
      value.completeness !== 'incomplete') ||
    typeof value.retryable !== 'boolean' ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.cardResolutions)
  ) {
    return invalidSessionCardResponse()
  }
  const cards = value.cards.map(parseSessionCard)
  const sources = value.sources.map(parseSourceStatus)
  const cardResolutions = value.cardResolutions.map(parseCardResolution)
  const hasIncompleteSource = sources.some(
    (source) => source.status !== 'complete',
  )
  const sourceRetryable = sources.some((source) => source.retryable)
  if (
    cards.some((card) => !hasTopLevelCardRelationshipSemantics(card)) ||
    new Set(cards.map((card) => card.cardId)).size !== cards.length ||
    !hasUniqueSessionCardOwnership(cards) ||
    cardResolutions.length !== cards.length ||
    new Set(cardResolutions.map(({ cardId }) => cardId)).size !==
      cardResolutions.length ||
    cardResolutions.some(
      ({ cardId }) => !cards.some((card) => card.cardId === cardId),
    ) ||
    (value.completeness === 'complete' &&
      (value.retryable || hasIncompleteSource)) ||
    (value.completeness === 'incomplete' && !hasIncompleteSource) ||
    value.retryable !== sourceRetryable
  ) {
    return invalidSessionCardResponse()
  }
  return {
    cards,
    cardResolutions,
    completeness: value.completeness,
    retryable: value.retryable,
    sources,
  }
}

export async function fetchSessions(): Promise<Array<SessionMeta>> {
  const res = await fetch('/api/sessions')
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as SessionListResponse
  return normalizeSessions(data.sessions)
}

export async function fetchHistory(payload: {
  sessionKey: string
  friendlyId: string
  signal?: AbortSignal
}): Promise<HistoryResponse> {
  const query = new URLSearchParams({ limit: '1000' })
  if (payload.sessionKey) query.set('sessionKey', payload.sessionKey)
  if (payload.friendlyId) query.set('friendlyId', payload.friendlyId)
  const res = await fetch(`/api/history?${query.toString()}`, {
    signal: payload.signal,
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as HistoryResponse
}

export async function fetchSessionCards(
  options: {
    includeArchived?: boolean
  } = {},
): Promise<SessionCardListWire> {
  const path = options.includeArchived
    ? '/api/session-cards?includeArchived=true'
    : '/api/session-cards'
  const response = await fetch(path)
  if (!response.ok) throw new Error(await readError(response))
  return parseSessionCardList((await response.json()) as unknown)
}

function parseSessionCardHistory(value: unknown): SessionCardHistoryWire {
  if (
    !isWireRecord(value) ||
    !nonblankWireString(value.cardId) ||
    !nonblankWireString(value.canonicalSegmentKey) ||
    !Array.isArray(value.messages) ||
    (value.completeness !== 'complete' && value.completeness !== 'partial') ||
    typeof value.retryable !== 'boolean' ||
    !Array.isArray(value.missingSegments) ||
    (value.nextCursor !== undefined && !nonblankWireString(value.nextCursor))
  ) {
    return invalidSessionCardResponse()
  }

  const messages = value.messages.map((entry) => {
    if (
      !isWireRecord(entry) ||
      !nonblankWireString(entry.segmentKey) ||
      !isWireRecord(entry.message)
    ) {
      return invalidSessionCardResponse()
    }
    return {
      segmentKey: nonblankWireString(entry.segmentKey)!,
      message: { ...entry.message },
    }
  })
  const missingSegments = value.missingSegments.map((entry) => {
    const error = isWireRecord(entry) ? nonblankWireString(entry.error) : null
    if (
      !isWireRecord(entry) ||
      !nonblankWireString(entry.segmentKey) ||
      entry.retryable !== true ||
      !error ||
      error.length > 256 ||
      (entry.source !== undefined && !nonblankWireString(entry.source))
    ) {
      return invalidSessionCardResponse()
    }
    return {
      segmentKey: nonblankWireString(entry.segmentKey)!,
      ...(entry.source === undefined
        ? {}
        : { source: nonblankWireString(entry.source)! }),
      retryable: true as const,
      error,
    }
  })

  if (
    (value.completeness === 'complete' &&
      (value.retryable || missingSegments.length > 0)) ||
    (value.completeness === 'partial' &&
      (!value.retryable || value.nextCursor !== undefined))
  ) {
    return invalidSessionCardResponse()
  }

  return {
    cardId: nonblankWireString(value.cardId)!,
    canonicalSegmentKey: nonblankWireString(value.canonicalSegmentKey)!,
    messages,
    completeness: value.completeness,
    retryable: value.retryable,
    missingSegments,
    ...(value.nextCursor === undefined
      ? {}
      : { nextCursor: nonblankWireString(value.nextCursor)! }),
  }
}

export async function fetchSessionCardHistory(payload: {
  cardId: string
  canonicalSegmentKey: string
  parentCardId?: string
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<SessionCardHistoryWire> {
  if (
    !nonblankWireString(payload.cardId) ||
    !nonblankWireString(payload.canonicalSegmentKey) ||
    (payload.parentCardId !== undefined &&
      (!nonblankWireString(payload.parentCardId) ||
        payload.parentCardId === payload.cardId)) ||
    (payload.limit !== undefined &&
      (!Number.isSafeInteger(payload.limit) ||
        payload.limit < 1 ||
        payload.limit > 500)) ||
    (payload.cursor !== undefined &&
      (!payload.cursor || payload.cursor.length > 4096))
  ) {
    throw new RangeError('Invalid Session Card history request')
  }
  const query = new URLSearchParams()
  if (payload.parentCardId) query.set('parentCardId', payload.parentCardId)
  if (payload.limit !== undefined) query.set('limit', String(payload.limit))
  if (payload.cursor) query.set('cursor', payload.cursor)
  const suffix = query.size ? `?${query.toString()}` : ''
  const response = await fetch(
    `/api/session-cards/${encodeURIComponent(payload.cardId)}/history${suffix}`,
    { signal: payload.signal },
  )
  if (!response.ok) throw new Error(await readError(response))
  const history = parseSessionCardHistory((await response.json()) as unknown)
  if (
    history.cardId !== payload.cardId ||
    history.canonicalSegmentKey !== payload.canonicalSegmentKey
  ) {
    return invalidSessionCardResponse()
  }
  return history
}

export type SessionCardHistoryResponse = HistoryResponse & {
  cardId: string
  canonicalSegmentKey: string
  completeness: 'complete' | 'partial'
  retryable: boolean
  missingSegments: SessionCardHistoryWire['missingSegments']
}

function sessionCardMessage(
  entry: SessionCardHistoryWire['messages'][number],
): ChatMessage {
  return {
    ...entry.message,
    __segmentKey: entry.segmentKey,
  } as ChatMessage
}

/** Load every stable cursor page so the parent pane never drops older segments. */
export async function fetchCompleteSessionCardHistory(payload: {
  cardId: string
  canonicalSegmentKey: string
  parentCardId?: string
  signal?: AbortSignal
}): Promise<SessionCardHistoryResponse> {
  const messages: Array<ChatMessage> = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  let finalPage: SessionCardHistoryWire

  do {
    const page = await fetchSessionCardHistory({
      cardId: payload.cardId,
      canonicalSegmentKey: payload.canonicalSegmentKey,
      parentCardId: payload.parentCardId,
      cursor,
      limit: 500,
      signal: payload.signal,
    })
    messages.push(...page.messages.map(sessionCardMessage))
    finalPage = page
    cursor = page.nextCursor
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error('Invalid Session Card history cursor sequence')
      }
      seenCursors.add(cursor)
    }
  } while (cursor)

  return {
    sessionKey: finalPage.canonicalSegmentKey,
    cardId: finalPage.cardId,
    canonicalSegmentKey: finalPage.canonicalSegmentKey,
    messages,
    completeness: finalPage.completeness,
    retryable: finalPage.retryable,
    missingSegments: finalPage.missingSegments,
  }
}

function messageCacheIdentity(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of [
    'stableId',
    'id',
    'messageId',
    'clientId',
    'client_id',
    '__optimisticId',
  ]) {
    const value = nonblankWireString(raw[key])
    if (value) return `${message.role ?? ''}:${key}:${value}`
  }
  return `${message.role ?? ''}:content:${JSON.stringify(message.content ?? [])}`
}

function mergeCardHistoryMessages(
  primary: Array<ChatMessage>,
  secondary: Array<ChatMessage>,
): Array<ChatMessage> {
  const messages = [...primary]
  const seen = new Set(primary.map(messageCacheIdentity))
  for (const message of secondary) {
    const identity = messageCacheIdentity(message)
    if (seen.has(identity)) continue
    seen.add(identity)
    messages.push(message)
  }
  return messages
}

export function mergeSessionCardHistoryResponse(
  server: SessionCardHistoryResponse,
  cached: SessionCardHistoryResponse | undefined,
): SessionCardHistoryResponse {
  if (!cached) return server
  const optimistic = cached.messages.filter((message) => {
    const raw = message as Record<string, unknown>
    return (
      nonblankWireString(raw.__optimisticId) !== null ||
      raw.status === 'sending' ||
      raw.status === 'queued'
    )
  })
  return {
    ...server,
    messages: mergeCardHistoryMessages(server.messages, optimistic),
  }
}

export function updateSessionCardHistoryMessages(
  queryClient: QueryClient,
  cardId: string,
  canonicalSegmentKey: string,
  updater: (messages: Array<ChatMessage>) => Array<ChatMessage>,
) {
  const queryKey = sessionCardQueryKeys.history(cardId, canonicalSegmentKey)
  queryClient.setQueryData(queryKey, function update(data: unknown) {
    const current = data as SessionCardHistoryResponse | undefined
    return {
      sessionKey: canonicalSegmentKey,
      cardId,
      canonicalSegmentKey,
      completeness: current?.completeness ?? 'complete',
      retryable: current?.retryable ?? false,
      missingSegments: current?.missingSegments ?? [],
      messages: updater(
        Array.isArray(current?.messages) ? current.messages : [],
      ),
    } satisfies SessionCardHistoryResponse
  })
}

export function appendSessionCardHistoryMessage(
  queryClient: QueryClient,
  cardId: string,
  canonicalSegmentKey: string,
  message: ChatMessage,
) {
  updateSessionCardHistoryMessages(
    queryClient,
    cardId,
    canonicalSegmentKey,
    (messages) => mergeCardHistoryMessages(messages, [message]),
  )
}

export function moveSessionCardHistoryMessages(
  queryClient: QueryClient,
  cardId: string,
  fromCanonicalSegmentKey: string,
  toCanonicalSegmentKey: string,
) {
  if (fromCanonicalSegmentKey === toCanonicalSegmentKey) return
  const fromKey = sessionCardQueryKeys.history(cardId, fromCanonicalSegmentKey)
  const toKey = sessionCardQueryKeys.history(cardId, toCanonicalSegmentKey)
  const fromData = queryClient.getQueryData<SessionCardHistoryResponse>(fromKey)
  if (!fromData) return
  const toData = queryClient.getQueryData<SessionCardHistoryResponse>(toKey)
  queryClient.setQueryData(toKey, {
    ...fromData,
    ...toData,
    sessionKey: toCanonicalSegmentKey,
    cardId,
    canonicalSegmentKey: toCanonicalSegmentKey,
    messages: mergeCardHistoryMessages(
      fromData.messages,
      toData?.messages ?? [],
    ),
  } satisfies SessionCardHistoryResponse)
  queryClient.removeQueries({ queryKey: fromKey, exact: true })
}

export async function updateSessionCardMetadata(
  cardId: string,
  patch: {
    manualTitle?: string | null
    autoTitle?: string | null
    pinned?: boolean
  },
): Promise<{ card: SessionCard }> {
  const response = await fetch(
    `/api/session-cards/${encodeURIComponent(cardId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
  if (!response.ok) throw new Error(await readError(response))
  const value = (await response.json()) as unknown
  if (!isWireRecord(value)) return invalidSessionCardResponse()
  const card = parseSessionCard(value.card)
  if (
    card.cardId !== cardId ||
    !hasRootCardRelationshipSemantics(card) ||
    !hasUniqueSessionCardOwnership([card])
  ) {
    return invalidSessionCardResponse()
  }
  return { card }
}

export async function archiveSessionCard(
  cardId: string,
): Promise<SessionCardArchiveWire> {
  const response = await fetch(
    `/api/session-cards/${encodeURIComponent(cardId)}/archive`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  )
  if (!response.ok) throw new Error(await readError(response))
  const value = (await response.json()) as unknown
  if (
    !isWireRecord(value) ||
    value.ok !== true ||
    value.archived !== true ||
    value.cardId !== cardId
  ) {
    return invalidSessionCardResponse()
  }
  return { ok: true, cardId, archived: true }
}

export async function branchSessionCard(
  cardId: string,
  expectedCanonicalSegmentKey: string,
  options: { idempotencyKey: string; title?: string },
): Promise<SessionCardBranchWire> {
  const expectedCanonicalParent = nonblankWireString(
    expectedCanonicalSegmentKey,
  )
  if (
    !expectedCanonicalParent ||
    expectedCanonicalParent !== expectedCanonicalSegmentKey ||
    typeof options.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(options.idempotencyKey)
  ) {
    throw new RangeError('Invalid Session Card branch request')
  }
  const response = await fetch(
    `/api/session-cards/${encodeURIComponent(cardId)}/branch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedCanonicalSegmentKey,
        idempotencyKey: options.idempotencyKey,
        ...(options.title === undefined ? {} : { title: options.title }),
      }),
    },
  )
  if (!response.ok) throw new Error(await readError(response))
  const value = (await response.json()) as unknown
  const canonicalSegmentKey = isWireRecord(value)
    ? nonblankWireString(value.canonicalSegmentKey)
    : null
  const childSessionKey = isWireRecord(value)
    ? nonblankWireString(value.childSessionKey)
    : null
  if (
    !isWireRecord(value) ||
    value.ok !== true ||
    value.supported !== true ||
    value.cardId !== cardId ||
    !canonicalSegmentKey ||
    value.canonicalSegmentKey !== expectedCanonicalSegmentKey ||
    !childSessionKey ||
    childSessionKey === cardId ||
    childSessionKey === canonicalSegmentKey
  ) {
    return invalidSessionCardResponse()
  }
  return {
    ok: true,
    cardId,
    canonicalSegmentKey,
    childSessionKey,
    supported: true,
  }
}

export async function fetchStatus(): Promise<StatusResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch('/api/ping', { signal: controller.signal })
    if (!res.ok) {
      const error = new Error(await readError(res)) as Error & {
        status?: number
      }
      error.status = res.status
      throw error
    }
    const payload = (await res.json()) as StatusResponse
    return {
      ...payload,
      status: res.status,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Server check timed out')
    }
    throw err
  } finally {
    window.clearTimeout(timeout)
  }
}

export function updateHistoryMessages(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  updater: (messages: Array<ChatMessage>) => Array<ChatMessage>,
) {
  const queryKey = chatQueryKeys.history(friendlyId, sessionKey)
  queryClient.setQueryData(queryKey, function update(data: unknown) {
    const current = data as HistoryResponse | undefined
    const messages = Array.isArray(current?.messages) ? current.messages : []
    const nextMessages = updater(messages)
    return {
      sessionKey: current?.sessionKey ?? sessionKey,
      sessionId: current?.sessionId,
      messages: nextMessages,
    }
  })
}

/**
 * Extract normalized plain text content from a ChatMessage for dedup
 * comparison. Handles both content-array and legacy text/message fields.
 */
function normalizeMessageText(message: ChatMessage): string {
  const raw = message as Record<string, unknown>

  // Prefer structured content array (canonical format)
  if (Array.isArray(message.content)) {
    const text = message.content
      .map((part) => {
        if (part.type === 'text') return String(part.text ?? '')
        return ''
      })
      .join('')
      .trim()
    if (text.length > 0) return text
  }

  // Fall back to legacy top-level text/message fields (some server / channel
  // adapters use these instead of the content-array format)
  for (const key of ['text', 'message', 'body']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }

  return ''
}

/**
 * Build an attachment identity signature for image-only dedup.
 * Uses name + size because those survive the round-trip through the server;
 * the base64 content is stripped before storage/history.
 */
function normalizeAttachmentSignature(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const attachments = Array.isArray(raw.attachments)
    ? (raw.attachments as Array<Record<string, unknown>>)
    : []
  if (attachments.length === 0) return ''
  return attachments
    .map((a) => `${String(a.name ?? '')}:${String(a.size ?? '')}`)
    .sort()
    .join('|')
}

function replaceMatchingOptimisticUserMessage(
  messages: Array<ChatMessage>,
  incomingMessage: ChatMessage,
): Array<ChatMessage> | null {
  if (incomingMessage.role !== 'user') return null

  const incomingClientId = getMessageClientId(incomingMessage)
  const incomingOptimisticId = getMessageOptimisticId(incomingMessage)
  const incomingText = normalizeMessageText(incomingMessage)
  const incomingAttachSig = normalizeAttachmentSignature(incomingMessage)
  const nowMs = Date.now()
  const TEN_SECONDS = 10_000

  const matchIndex = messages.findIndex((message) => {
    if (message.role !== 'user') return false

    const raw = message as Record<string, unknown>
    const isOptimistic =
      typeof raw.__optimisticId === 'string' && raw.__optimisticId.length > 0
    if (!isOptimistic) return false

    if (
      incomingClientId &&
      isMatchingClientMessage(
        message,
        incomingClientId,
        incomingOptimisticId || `opt-${incomingClientId}`,
      )
    ) {
      return true
    }

    if (!incomingText && !incomingAttachSig) return false

    const textMatch =
      incomingText.length > 0 && normalizeMessageText(message) === incomingText
    const attachMatch =
      incomingAttachSig.length > 0 &&
      normalizeAttachmentSignature(message) === incomingAttachSig
    const isContentMatch =
      (incomingText.length > 0 && textMatch) ||
      (incomingText.length === 0 && incomingAttachSig.length > 0 && attachMatch)

    if (!isContentMatch) return false

    const timestamp =
      typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
        ? raw.timestamp
        : null
    if (timestamp !== null) {
      return nowMs - timestamp < TEN_SECONDS
    }

    const idx = messages.indexOf(message)
    return idx >= messages.length - 5
  })

  if (matchIndex === -1) return null

  const existing = messages[matchIndex]
  if (!existing) return null
  const replacement: ChatMessage = {
    ...existing,
    ...incomingMessage,
    clientId: incomingClientId || getMessageClientId(existing) || undefined,
    client_id: incomingClientId || getMessageClientId(existing) || undefined,
    __optimisticId: undefined,
    status: undefined,
  }

  const next = [...messages]
  next[matchIndex] = replacement
  return next
}

export function appendHistoryMessage(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  message: ChatMessage,
) {
  updateHistoryMessages(
    queryClient,
    friendlyId,
    sessionKey,
    function append(messages) {
      const replacedOptimistic = replaceMatchingOptimisticUserMessage(
        messages,
        message,
      )
      if (replacedOptimistic) return replacedOptimistic

      // Dedup: if a message with the same clientId (or optimistic id) already
      // exists, skip appending — prevents double-display when an optimistic
      // message is added on send and then echoed back via SSE onUserMessage.
      const incomingClientId = getMessageClientId(message)
      const incomingOptimisticId = getMessageOptimisticId(message)
      if (incomingClientId || incomingOptimisticId) {
        const optimisticKey = incomingClientId ? `opt-${incomingClientId}` : ''
        const alreadyExists = messages.some((m) =>
          isMatchingClientMessage(
            m,
            incomingClientId || incomingOptimisticId,
            optimisticKey || incomingOptimisticId,
          ),
        )
        if (alreadyExists) return messages
      }

      // Fallback dedup for SSE-echoed user messages that arrive WITHOUT a
      // clientId (server did not echo it back). Check if an existing optimistic
      // user message with the same text content (or attachment signature for
      // image-only sends) was added in the last 10 seconds. This prevents
      // duplicates without dropping legitimately repeated messages sent at
      // longer intervals.
      if (
        message.role === 'user' &&
        !incomingClientId &&
        !incomingOptimisticId
      ) {
        const incomingText = normalizeMessageText(message)
        const incomingAttachSig = normalizeAttachmentSignature(message)
        // Only apply dedup if there is SOME identity to match against
        if (incomingText.length > 0 || incomingAttachSig.length > 0) {
          const nowMs = Date.now()
          const TEN_SECONDS = 10_000
          const isDuplicate = messages.some((m) => {
            if (m.role !== 'user') return false

            // Determine if this candidate is a content match:
            // • Text messages: compare normalised text
            // • Image-only messages: compare attachment signatures
            // • Mixed (text + image): text takes priority; attachment sig is a
            //   secondary signal used only when text also matches
            const textMatch =
              incomingText.length > 0 &&
              normalizeMessageText(m) === incomingText
            const attachMatch =
              incomingAttachSig.length > 0 &&
              normalizeAttachmentSignature(m) === incomingAttachSig

            const isContentMatch =
              (incomingText.length > 0 && textMatch) ||
              (incomingText.length === 0 &&
                incomingAttachSig.length > 0 &&
                attachMatch)

            if (!isContentMatch) return false

            // If we have timestamps, check recency; otherwise check the last
            // few recent messages (optimistic messages are at the tail).
            const msgTimestamp =
              typeof m.timestamp === 'number' ? m.timestamp : null
            if (msgTimestamp !== null) {
              return nowMs - msgTimestamp < TEN_SECONDS
            }
            // No timestamps — check if this is one of the last 5 messages
            // (optimistic messages are always appended at the end)
            const idx = messages.indexOf(m)
            return idx >= messages.length - 5
          })
          if (isDuplicate) return messages
        }
      }

      // Insert in timestamp order so that late-arriving SSE echoes (e.g. a
      // user message whose echo arrives after the assistant reply is already
      // displayed) appear in the correct chronological position rather than
      // being appended to the bottom of the list.
      const incomingTs =
        typeof (message as Record<string, unknown>).timestamp === 'number'
          ? ((message as Record<string, unknown>).timestamp as number)
          : null

      if (incomingTs !== null) {
        // Find the first existing message whose timestamp is strictly greater
        // than the incoming message — insert before it.
        const insertIdx = messages.findIndex((m) => {
          const ts =
            typeof (m as Record<string, unknown>).timestamp === 'number'
              ? ((m as Record<string, unknown>).timestamp as number)
              : null
          return ts !== null && ts > incomingTs
        })
        if (insertIdx >= 0) {
          const next = [...messages]
          next.splice(insertIdx, 0, message)
          return next
        }
      }

      return [...messages, message]
    },
  )
}

export function updateHistoryMessageByClientId(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  clientId: string,
  updater: (message: ChatMessage) => ChatMessage,
) {
  const normalizedClientId = normalizeId(clientId)
  if (!normalizedClientId) return
  const optimisticId = `opt-${normalizedClientId}`
  updateHistoryMessages(
    queryClient,
    friendlyId,
    sessionKey,
    function update(messages) {
      return messages.map((message) => {
        if (
          isMatchingClientMessage(message, normalizedClientId, optimisticId)
        ) {
          return updater(message)
        }
        return message
      })
    },
  )
}

export function updateHistoryMessageByClientIdEverywhere(
  queryClient: QueryClient,
  clientId: string,
  updater: (message: ChatMessage) => ChatMessage,
) {
  const normalizedClientId = normalizeId(clientId)
  if (!normalizedClientId) return
  const optimisticId = `opt-${normalizedClientId}`
  const historyQueries = [
    ...queryClient.getQueriesData<HistoryResponse>({
      queryKey: ['chat', 'history'],
    }),
    ...queryClient.getQueriesData<HistoryResponse>({
      queryKey: ['chat', 'session-cards', 'history'],
    }),
  ]

  for (const [queryKey, data] of historyQueries) {
    const current = data
    const messages = Array.isArray(current?.messages) ? current.messages : []
    const changed = messages.some((message) =>
      isMatchingClientMessage(message, normalizedClientId, optimisticId),
    )
    if (!changed) continue
    const nextMessages = messages.map((message) => {
      if (!isMatchingClientMessage(message, normalizedClientId, optimisticId)) {
        return message
      }
      return updater(message)
    })
    queryClient.setQueryData(queryKey, { ...current, messages: nextMessages })
  }
}

export function removeHistoryMessageByClientId(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  clientId: string,
  optimisticId?: string,
) {
  const normalizedClientId = normalizeId(clientId)
  if (!normalizedClientId) return
  const resolvedOptimisticId =
    normalizeId(optimisticId) || `opt-${normalizedClientId}`

  updateHistoryMessages(
    queryClient,
    friendlyId,
    sessionKey,
    function remove(messages) {
      return messages.filter((message) => {
        return !isMatchingClientMessage(
          message,
          normalizedClientId,
          resolvedOptimisticId,
        )
      })
    },
  )
}

export function clearHistoryMessages(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
) {
  const queryKey = chatQueryKeys.history(friendlyId, sessionKey)
  queryClient.setQueryData(queryKey, {
    sessionKey,
    messages: [],
  })
}

export function moveHistoryMessages(
  queryClient: QueryClient,
  fromFriendlyId: string,
  fromSessionKey: string,
  toFriendlyId: string,
  toSessionKey: string,
) {
  const fromKey = chatQueryKeys.history(fromFriendlyId, fromSessionKey)
  const toKey = chatQueryKeys.history(toFriendlyId, toSessionKey)
  const fromData = queryClient.getQueryData<HistoryResponse>(fromKey)
  if (!fromData) return
  const fromMessages = Array.isArray(fromData.messages) ? fromData.messages : []
  const toData = queryClient.getQueryData<HistoryResponse>(toKey)
  const toMessages = Array.isArray(toData?.messages) ? toData.messages : []
  const messages = [...fromMessages]
  const seen = new Set(
    fromMessages.map((message) => {
      const id = normalizeId((message as Record<string, unknown>).id)
      if (id) return `${message.role ?? ''}:id:${id}`
      return `${message.role ?? ''}:content:${JSON.stringify(message.content ?? [])}`
    }),
  )
  for (const message of toMessages) {
    const id = normalizeId((message as Record<string, unknown>).id)
    const signature = id
      ? `${message.role ?? ''}:id:${id}`
      : `${message.role ?? ''}:content:${JSON.stringify(message.content ?? [])}`
    if (seen.has(signature)) continue
    seen.add(signature)
    messages.push(message)
  }
  queryClient.setQueryData(toKey, {
    sessionKey: toSessionKey,
    sessionId: fromData.sessionId ?? toData?.sessionId,
    messages,
  })
  queryClient.removeQueries({ queryKey: fromKey, exact: true })
}

export function reconcileSessionDraft(
  queryClient: QueryClient,
  fromFriendlyId: string,
  fromSessionKey: string,
  toFriendlyId: string,
  toSessionKey: string,
) {
  queryClient.setQueryData(
    chatQueryKeys.sessions,
    function reconcile(existing: unknown) {
      if (!Array.isArray(existing)) return existing
      const sessions = existing as Array<SessionMeta>
      const sourceIndex = sessions.findIndex((session) => {
        return (
          session.friendlyId === fromFriendlyId ||
          session.key === fromSessionKey ||
          session.key === fromFriendlyId
        )
      })

      if (sourceIndex === -1) {
        return sessions
      }

      const source = sessions[sourceIndex]
      if (!source) return sessions
      const targetIndex = sessions.findIndex((session, index) => {
        if (index === sourceIndex) return false
        return (
          session.friendlyId === toFriendlyId ||
          session.key === toSessionKey ||
          session.key === toFriendlyId
        )
      })

      if (targetIndex === -1) {
        return sessions.map((session, index) => {
          if (index !== sourceIndex) return session
          return {
            ...session,
            key: toSessionKey,
            friendlyId: toFriendlyId,
          }
        })
      }

      return sessions.flatMap((session, index) => {
        if (index === sourceIndex) return []
        if (index !== targetIndex) return [session]
        return [
          {
            ...session,
            key: toSessionKey,
            friendlyId: toFriendlyId,
            lastMessage: source.lastMessage ?? session.lastMessage,
            updatedAt:
              Math.max(source.updatedAt ?? 0, session.updatedAt ?? 0) ||
              session.updatedAt ||
              source.updatedAt,
            label: session.label ?? source.label,
            title: session.title ?? source.title,
            derivedTitle: session.derivedTitle ?? source.derivedTitle,
            titleStatus:
              session.titleStatus === 'idle'
                ? source.titleStatus
                : session.titleStatus,
            titleSource: session.titleSource ?? source.titleSource,
            titleError: session.titleError ?? source.titleError,
          },
        ]
      })
    },
  )
}

export function updateSessionLastMessage(
  queryClient: QueryClient,
  sessionKey: string,
  friendlyId: string,
  message: ChatMessage,
) {
  queryClient.setQueryData(
    chatQueryKeys.sessions,
    function update(messages: unknown) {
      if (!Array.isArray(messages)) return messages
      return (messages as Array<SessionMeta>).map((session) => {
        if (session.key !== sessionKey && session.friendlyId !== friendlyId) {
          return session
        }
        return {
          ...session,
          lastMessage: message,
        }
      })
    },
  )
}

export function removeSessionFromCache(
  queryClient: QueryClient,
  sessionKey: string,
  friendlyId: string,
) {
  queryClient.setQueryData(
    chatQueryKeys.sessions,
    function update(messages: unknown) {
      if (!Array.isArray(messages)) return messages
      return (messages as Array<SessionMeta>).filter((session) => {
        return session.key !== sessionKey && session.friendlyId !== friendlyId
      })
    },
  )

  queryClient.removeQueries({
    queryKey: ['chat', 'history', friendlyId],
    exact: false,
  })
  if (sessionKey && sessionKey !== friendlyId) {
    queryClient.removeQueries({
      queryKey: ['chat', 'history', sessionKey],
      exact: false,
    })
  }
}
