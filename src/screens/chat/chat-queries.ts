import { normalizeSessions, readError } from './utils'
import {
  appendCardTranscriptRecoveryMessage,
  mergeCardTranscriptRecoveryMessages,
  readCardTranscriptRecovery,
  reconcileAcknowledgedCardTranscriptRecoveryMessages,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import {
  readCardTranscriptSnapshot,
  writeCardTranscriptSnapshot,
} from './card-transcript-snapshot'
import type { QueryClient } from '@tanstack/react-query'
import type {
  ChatMessage,
  HistoryResponse,
  SessionCard,
  SessionCardActivity,
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
  lists: ['chat', 'session-cards', 'list'] as const,
  list: function list(includeArchived = false, limit?: number) {
    return [
      'chat',
      'session-cards',
      'list',
      includeArchived,
      limit ?? 0,
    ] as const
  },
  chatInventory: function chatInventory(includeArchived = false) {
    return ['chat', 'session-cards', 'list', includeArchived, 'chat'] as const
  },
  detail: function detail(cardId: string) {
    return ['chat', 'session-cards', 'detail', cardId] as const
  },
  history: function history(cardId: string, options?: { cursor?: string }) {
    return [
      'chat',
      'session-cards',
      'history',
      cardId,
      options?.cursor ?? '',
    ] as const
  },
  childHistory: function childHistory(
    parentCardId: string,
    childCardId: string,
    options?: { cursor?: string },
  ) {
    return [
      'chat',
      'session-cards',
      'child-history',
      parentCardId,
      childCardId,
      options?.cursor ?? '',
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

export type SessionCardChildWire = Omit<SessionCardChild, 'childNodes'> & {
  childNodes?: Array<SessionCardChildWire>
}

export type SessionCardWire = Omit<SessionCard, 'childNodes'> & {
  childNodes: Array<SessionCardChildWire>
}

export type SessionCardListWire = {
  cards: Array<SessionCardWire>
  totalCards?: number
  cardResolutions: Array<{
    cardId: string
    completeness: 'complete' | 'incomplete'
    retryable: boolean
  }>
  completeness: 'complete' | 'incomplete'
  retryable: boolean
  sources: Array<SessionCardSourceStatusWire>
  nextCursor?: string
}

export type SessionCardDetailWire = {
  card: SessionCardWire
  resolution: SessionCardListWire['cardResolutions'][number]
  completeness: SessionCardListWire['completeness']
  retryable: boolean
  sources: Array<SessionCardSourceStatusWire>
}

export class SessionCardLookupError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'SessionCardLookupError'
    this.status = status
    this.retryable = retryable
  }
}

/**
 * A Card is safe to retain only when both the Card and its resolution metadata
 * are unique and the resolution explicitly says the Card is complete and not
 * retryable. Collection-level completeness cannot establish this per-Card
 * contract.
 */
export function hasExactCompleteSessionCardProjection(
  response: SessionCardListWire,
  cardId: string,
): boolean {
  if (
    !Array.isArray(response.cards) ||
    !Array.isArray(response.cardResolutions)
  ) {
    return false
  }
  const cards = response.cards.filter((card) => card.cardId === cardId)
  const resolutions = response.cardResolutions.filter(
    (resolution) => resolution.cardId === cardId,
  )
  return (
    cards.length === 1 &&
    (cards[0]!.canonicalSource === 'remote' ||
      cards[0]!.canonicalSource === 'local') &&
    resolutions.length === 1 &&
    resolutions[0]!.completeness === 'complete' &&
    resolutions[0]!.retryable === false
  )
}

/** Retain only exact per-Card complete projections and their evidence. */
export function retainCompleteSessionCardProjections(
  response: SessionCardListWire | undefined,
): SessionCardListWire | undefined {
  if (
    !response ||
    !Array.isArray(response.cards) ||
    !Array.isArray(response.cardResolutions)
  ) {
    return undefined
  }
  const cards = response.cards.filter((card) =>
    hasExactCompleteSessionCardProjection(response, card.cardId),
  )
  const retainedCardIds = new Set(cards.map((card) => card.cardId))
  return {
    ...response,
    cards,
    cardResolutions: response.cardResolutions.filter((resolution) =>
      retainedCardIds.has(resolution.cardId),
    ),
  }
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

function exactSourceQualifiedIdentity(
  value: unknown,
): { identity: string; source: 'local' | 'remote' } | null {
  if (typeof value !== 'string' || value.trim() !== value) return null
  return sourceQualifiedWireIdentity(value)
}

export type SessionCardHandoffTransition = {
  cardId: string
  fromSegmentKey: string
  canonicalSegmentKey: string
  runId: string
  verifiedContinuationSegmentKeys: ReadonlyArray<string>
}

export type SessionCardHandoffAuthority = Pick<
  SessionCard,
  | 'cardId'
  | 'canonicalSource'
  | 'canonicalSegmentKey'
  | 'continuationSegmentKeys'
  | 'relationshipKind'
  | 'childNodes'
>

function sessionCardChildOwnsIdentity(
  child: SessionCardChild,
  identity: string,
): boolean {
  if (
    child.cardId === identity ||
    child.sessionKey === identity ||
    child.continuationSegmentKeys.includes(identity)
  ) {
    return true
  }
  return (child.childNodes ?? []).some((descendant) =>
    sessionCardChildOwnsIdentity(descendant, identity),
  )
}

function sessionCardOwnsIdentity(card: SessionCard, identity: string): boolean {
  return (
    card.cardId === identity ||
    card.canonicalSegmentKey === identity ||
    card.continuationSegmentKeys.includes(identity) ||
    card.childNodes.some((child) =>
      sessionCardChildOwnsIdentity(child, identity),
    )
  )
}

/**
 * Validate the browser-side half of a server-authoritative Card transition.
 * A successor absent from the rendered projection is accepted only with the
 * complete same-Card continuation projection freshly verified by the server.
 * Absence from the paginated browser inventory never establishes ownership.
 */
export function isValidSessionCardHandoffTransition({
  handoff,
  activeCard,
  currentSegmentKey,
  sessionCards = [],
}: {
  handoff: SessionCardHandoffTransition
  activeCard?: SessionCardHandoffAuthority
  currentSegmentKey: string
  sessionCards?: ReadonlyArray<SessionCard>
}): boolean {
  if (!activeCard || activeCard.relationshipKind !== 'root') return false
  const card = exactSourceQualifiedIdentity(activeCard.cardId)
  const projectedCanonical = exactSourceQualifiedIdentity(
    activeCard.canonicalSegmentKey,
  )
  const from = exactSourceQualifiedIdentity(handoff.fromSegmentKey)
  const successor = exactSourceQualifiedIdentity(handoff.canonicalSegmentKey)
  const eventCard = exactSourceQualifiedIdentity(handoff.cardId)
  if (
    !card ||
    !projectedCanonical ||
    !from ||
    !successor ||
    !eventCard ||
    activeCard.canonicalSource !== card.source ||
    projectedCanonical.source !== card.source ||
    from.source !== card.source ||
    successor.source !== card.source ||
    eventCard.source !== card.source ||
    eventCard.identity !== card.identity ||
    handoff.fromSegmentKey !== currentSegmentKey ||
    !activeCard.continuationSegmentKeys.includes(handoff.fromSegmentKey)
  ) {
    return false
  }

  const verifiedSegments = handoff.verifiedContinuationSegmentKeys
  const fromIndex = verifiedSegments.indexOf(handoff.fromSegmentKey)
  const successorIndex = verifiedSegments.indexOf(handoff.canonicalSegmentKey)
  const activeProjectionIndexes = activeCard.continuationSegmentKeys.map(
    (segmentKey) => verifiedSegments.indexOf(segmentKey),
  )
  const verifiedSuccessorOwned =
    verifiedSegments.length >= 2 &&
    new Set(verifiedSegments).size === verifiedSegments.length &&
    verifiedSegments.at(-1) === handoff.canonicalSegmentKey &&
    fromIndex >= 0 &&
    successorIndex > fromIndex &&
    activeProjectionIndexes.every(
      (index, position) =>
        index >= 0 &&
        (position === 0 ||
          index > (activeProjectionIndexes[position - 1] ?? -1)),
    ) &&
    verifiedSegments.every(
      (segmentKey) =>
        exactSourceQualifiedIdentity(segmentKey)?.source === card.source,
    )
  if (!verifiedSuccessorOwned) return false

  // A newer projection makes an older event stale. An already-acknowledged
  // successor remains valid only when it is the projection's canonical tip.
  if (
    activeCard.canonicalSegmentKey !== handoff.fromSegmentKey &&
    activeCard.canonicalSegmentKey !== handoff.canonicalSegmentKey
  ) {
    return false
  }
  if (
    activeCard.continuationSegmentKeys.includes(handoff.canonicalSegmentKey) &&
    activeCard.canonicalSegmentKey !== handoff.canonicalSegmentKey
  ) {
    return false
  }

  if (
    activeCard.childNodes.some((child) =>
      sessionCardChildOwnsIdentity(child, handoff.canonicalSegmentKey),
    )
  ) {
    return false
  }
  return !sessionCards.some((cardCandidate) =>
    cardCandidate.cardId === activeCard.cardId
      ? cardCandidate.childNodes.some((child) =>
          sessionCardChildOwnsIdentity(child, handoff.canonicalSegmentKey),
        )
      : sessionCardOwnsIdentity(cardCandidate, handoff.canonicalSegmentKey),
  )
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

function parseSessionCardChild(
  value: unknown,
  expectedSource: 'local' | 'remote',
): SessionCardChildWire {
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
  const rawChildNodes = value.childNodes
  if (
    !cardIdentity ||
    !sessionIdentity ||
    !title ||
    !relationshipKind ||
    !status ||
    cardIdentity.source !== expectedSource ||
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
    sessionIdentity.source !== cardIdentity.source ||
    (rawChildNodes !== undefined && !Array.isArray(rawChildNodes))
  ) {
    return invalidSessionCardResponse()
  }
  const continuationSegmentKeys = continuationSegmentIdentities.map(
    (identity) => identity?.identity ?? invalidSessionCardResponse(),
  )
  const childNodes = (rawChildNodes ?? []).map((child) =>
    parseSessionCardChild(child, expectedSource),
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
    ...(rawChildNodes === undefined ? {} : { childNodes }),
  }
}

function parseSessionCardActivity(
  value: unknown,
): SessionCardActivity | null | undefined {
  if (value === undefined) return undefined
  if (!isWireRecord(value)) return null
  const state = wireEnum(value.state, [
    'running',
    'completed',
    'error',
    'pending_approval',
  ])
  if (
    !state ||
    !Number.isSafeInteger(value.updatedAt) ||
    (value.updatedAt as number) < 0
  ) {
    return null
  }
  return { state, updatedAt: value.updatedAt as number }
}

function parseSessionCard(value: unknown): SessionCardWire {
  if (!isWireRecord(value)) return invalidSessionCardResponse()
  const activity = parseSessionCardActivity(value.activity)
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
  const rawPinnedAt = value.pinnedAt
  const pinnedAt =
    typeof rawPinnedAt === 'number' &&
    Number.isSafeInteger(rawPinnedAt) &&
    rawPinnedAt >= 0
      ? rawPinnedAt
      : undefined
  if (
    activity === null ||
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
    (rawPinnedAt !== undefined && (pinnedAt === undefined || !value.pinned)) ||
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
  const childNodes = value.childNodes.map((child) =>
    parseSessionCardChild(child, canonicalSource),
  )
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
    ...(activity === undefined ? {} : { activity }),
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
    ...(pinnedAt === undefined ? {} : { pinnedAt }),
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

  const claimChildOwnership = (
    children: Array<SessionCardChildWire>,
  ): boolean => {
    for (const child of children) {
      const owner = {}
      const childAliases = [
        child.cardId,
        child.sessionKey,
        ...child.continuationSegmentKeys,
      ]
      if (childAliases.some((alias) => !claimIdentity(alias, owner))) {
        return false
      }
      if (!claimChildOwnership(child.childNodes ?? [])) return false
    }
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
    if (!claimChildOwnership(card.childNodes)) return false
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
  const totalCards = value.totalCards
  const nextCursor =
    value.nextCursor === undefined
      ? undefined
      : nonblankWireString(value.nextCursor)
  const sources = value.sources.map(parseSourceStatus)
  const cardResolutions = value.cardResolutions.map(parseCardResolution)
  const hasIncompleteSource = sources.some(
    (source) => source.status !== 'complete',
  )
  const sourceRetryable = sources.some((source) => source.retryable)
  if (
    cards.some((card) => !hasTopLevelCardRelationshipSemantics(card)) ||
    (totalCards !== undefined &&
      (typeof totalCards !== 'number' ||
        !Number.isSafeInteger(totalCards) ||
        totalCards < cards.length)) ||
    nextCursor === null ||
    (nextCursor !== undefined &&
      (nextCursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(nextCursor))) ||
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
    ...(totalCards === undefined ? {} : { totalCards }),
    ...(nextCursor === undefined ? {} : { nextCursor }),
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

const SESSION_CARD_RESPONSE_ATTEMPTS = 2

function isInvalidSessionCardResponseError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === 'Invalid Session Card response'
  )
}

/**
 * Card inventory and history are assembled from mutable upstream sources. Keep
 * the wire contract strict, but retry a single malformed successful response
 * before surfacing it to the user; a persistent contract mismatch still fails
 * closed on the second response.
 */
async function fetchAndParseSessionCardResponse<T>(
  request: () => Promise<Response>,
  parse: (value: unknown) => T,
  responseError?: (response: Response) => Promise<Error>,
): Promise<T> {
  let priorInvalidResponseError: unknown
  for (
    let attempt = 0;
    attempt < SESSION_CARD_RESPONSE_ATTEMPTS;
    attempt += 1
  ) {
    const response = await request()
    if (!response.ok) {
      throw responseError
        ? await responseError(response)
        : new Error(await readError(response))
    }
    const responseWasConsumed = response.bodyUsed
    try {
      return parse((await response.json()) as unknown)
    } catch (error) {
      if (responseWasConsumed && priorInvalidResponseError !== undefined) {
        throw priorInvalidResponseError
      }
      if (
        !isInvalidSessionCardResponseError(error) ||
        attempt === SESSION_CARD_RESPONSE_ATTEMPTS - 1
      ) {
        throw error
      }
      priorInvalidResponseError = error
    }
  }
  return invalidSessionCardResponse()
}

export async function fetchSessionCards(
  options: {
    includeArchived?: boolean
    limit?: number
  } = {},
): Promise<SessionCardListWire> {
  if (
    options.limit !== undefined &&
    (!Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 100)
  ) {
    throw new RangeError('Session Card limit must be an integer from 1 to 100')
  }
  const query = new URLSearchParams()
  if (options.includeArchived) query.set('includeArchived', 'true')
  if (options.limit !== undefined) query.set('limit', String(options.limit))
  const suffix = query.size ? `?${query.toString()}` : ''
  return fetchAndParseSessionCardResponse(
    () => fetch(`/api/session-cards${suffix}`),
    parseSessionCardList,
  )
}

export async function fetchChatSessionCardsPage(
  cursor?: string,
): Promise<SessionCardListWire> {
  const query = new URLSearchParams({ view: 'chat' })
  if (cursor !== undefined) query.set('cursor', cursor)
  return fetchAndParseSessionCardResponse(
    () => fetch(`/api/session-cards?${query.toString()}`),
    parseSessionCardList,
  )
}

function parseSessionCardDetail(value: unknown): SessionCardDetailWire {
  if (
    !isWireRecord(value) ||
    !Array.isArray(value.sources) ||
    (value.completeness !== 'complete' &&
      value.completeness !== 'incomplete') ||
    typeof value.retryable !== 'boolean'
  ) {
    return invalidSessionCardResponse()
  }
  const card = parseSessionCard(value.card)
  const resolution = parseCardResolution(value.resolution)
  const sources = value.sources.map(parseSourceStatus)
  const hasIncompleteSource = sources.some(
    (source) => source.status !== 'complete',
  )
  const sourceRetryable = sources.some((source) => source.retryable)
  if (
    !hasTopLevelCardRelationshipSemantics(card) ||
    !hasUniqueSessionCardOwnership([card]) ||
    resolution.cardId !== card.cardId ||
    (value.completeness === 'complete' &&
      (value.retryable || hasIncompleteSource)) ||
    (value.completeness === 'incomplete' && !hasIncompleteSource) ||
    value.retryable !== sourceRetryable
  ) {
    return invalidSessionCardResponse()
  }
  return {
    card,
    resolution,
    completeness: value.completeness,
    retryable: value.retryable,
    sources,
  }
}

export async function fetchSessionCard(
  cardId: string,
): Promise<SessionCardDetailWire> {
  return fetchAndParseSessionCardResponse(
    () => fetch(`/api/session-cards/${encodeURIComponent(cardId)}`),
    parseSessionCardDetail,
    async (response) => {
      const body = (await response.json().catch(() => null)) as unknown
      const message =
        isWireRecord(body) && typeof body.error === 'string'
          ? body.error
          : 'Unable to load Session Card'
      return new SessionCardLookupError(
        message,
        response.status,
        isWireRecord(body) && body.retryable === true,
      )
    },
  )
}

function mergeSourceStatuses(
  pages: ReadonlyArray<SessionCardListWire>,
): Array<SessionCardSourceStatusWire> {
  const sources = new Map<string, SessionCardSourceStatusWire>()
  for (const page of pages) {
    for (const source of page.sources) {
      const existing = sources.get(source.source)
      if (!existing || existing.status === 'complete' || source.retryable) {
        sources.set(source.source, source)
      }
    }
  }
  return [...sources.values()]
}

export function mergeChatSessionCardPages(
  pages: ReadonlyArray<SessionCardListWire>,
): SessionCardListWire | undefined {
  if (pages.length === 0) return undefined
  const cards: Array<SessionCardWire> = []
  const cardResolutions: SessionCardListWire['cardResolutions'] = []
  const seenCardIds = new Set<string>()
  for (const page of pages) {
    const resolutionByCardId = new Map(
      page.cardResolutions.map((resolution) => [resolution.cardId, resolution]),
    )
    for (const card of page.cards) {
      if (seenCardIds.has(card.cardId)) continue
      seenCardIds.add(card.cardId)
      cards.push(card)
      cardResolutions.push(resolutionByCardId.get(card.cardId)!)
    }
  }
  const sources = mergeSourceStatuses(pages)
  const retryable = pages.some((page) => page.retryable)
  const completeness = pages.some((page) => page.completeness !== 'complete')
    ? 'incomplete'
    : 'complete'
  const lastPage = pages.at(-1)!
  return {
    cards,
    totalCards: Math.max(
      cards.length,
      ...pages.map((page) => page.totalCards ?? page.cards.length),
    ),
    cardResolutions,
    completeness,
    retryable,
    sources,
    ...(lastPage.nextCursor ? { nextCursor: lastPage.nextCursor } : {}),
  }
}

export function mergeSessionCardDetail(
  inventory: SessionCardListWire | undefined,
  detail: SessionCardDetailWire | undefined,
): SessionCardListWire | undefined {
  if (!detail) return inventory
  if (!inventory) {
    return {
      cards: [detail.card],
      totalCards: 1,
      cardResolutions: [detail.resolution],
      completeness: detail.completeness,
      retryable: detail.retryable,
      sources: detail.sources,
    }
  }
  const existingIndex = inventory.cards.findIndex(
    (card) => card.cardId === detail.card.cardId,
  )
  const cards = [...inventory.cards]
  const cardResolutions = [...inventory.cardResolutions]
  if (existingIndex >= 0) {
    const inventoryCard = cards[existingIndex]!
    const inventoryActivity = inventoryCard.activity
    const detailActivity = detail.card.activity
    const activity =
      inventoryActivity &&
      (!detailActivity ||
        inventoryActivity.updatedAt > detailActivity.updatedAt)
        ? inventoryActivity
        : detailActivity
    cards[existingIndex] = {
      ...detail.card,
      ...(activity === undefined ? {} : { activity }),
    }
    const resolutionIndex = cardResolutions.findIndex(
      (resolution) => resolution.cardId === detail.card.cardId,
    )
    if (resolutionIndex >= 0)
      cardResolutions[resolutionIndex] = detail.resolution
  } else {
    cards.push(detail.card)
    cardResolutions.push(detail.resolution)
  }
  return {
    ...inventory,
    cards,
    totalCards: Math.max(inventory.totalCards ?? cards.length, cards.length),
    cardResolutions,
  }
}

function parseSessionCardHistory(
  value: unknown,
  allowedSegmentKeys?: ReadonlySet<string>,
): SessionCardHistoryWire {
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

  const cardIdentity = sourceQualifiedWireIdentity(value.cardId)
  const canonicalSegmentIdentity = sourceQualifiedWireIdentity(
    value.canonicalSegmentKey,
  )
  if (
    !cardIdentity ||
    !canonicalSegmentIdentity ||
    cardIdentity.source !== canonicalSegmentIdentity.source ||
    (allowedSegmentKeys &&
      !allowedSegmentKeys.has(canonicalSegmentIdentity.identity))
  ) {
    return invalidSessionCardResponse()
  }

  const messages = value.messages.map((entry) => {
    const segmentIdentity = isWireRecord(entry)
      ? sourceQualifiedWireIdentity(entry.segmentKey)
      : null
    if (
      !isWireRecord(entry) ||
      !segmentIdentity ||
      segmentIdentity.source !== cardIdentity.source ||
      (allowedSegmentKeys &&
        !allowedSegmentKeys.has(segmentIdentity.identity)) ||
      !isWireRecord(entry.message)
    ) {
      return invalidSessionCardResponse()
    }
    return {
      segmentKey: segmentIdentity.identity,
      message: { ...entry.message },
    }
  })
  const missingSegments = value.missingSegments.map((entry) => {
    const error = isWireRecord(entry) ? nonblankWireString(entry.error) : null
    const segmentIdentity = isWireRecord(entry)
      ? sourceQualifiedWireIdentity(entry.segmentKey)
      : null
    if (
      !isWireRecord(entry) ||
      !segmentIdentity ||
      segmentIdentity.source !== cardIdentity.source ||
      (allowedSegmentKeys &&
        !allowedSegmentKeys.has(segmentIdentity.identity)) ||
      entry.retryable !== true ||
      !error ||
      error.length > 256 ||
      (entry.source !== undefined && !nonblankWireString(entry.source))
    ) {
      return invalidSessionCardResponse()
    }
    return {
      segmentKey: segmentIdentity.identity,
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
    cardId: cardIdentity.identity,
    canonicalSegmentKey: canonicalSegmentIdentity.identity,
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
  continuationSegmentKeys?: ReadonlyArray<string>
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<SessionCardHistoryWire> {
  const cardIdentity = sourceQualifiedWireIdentity(payload.cardId)
  const canonicalSegmentIdentity = sourceQualifiedWireIdentity(
    payload.canonicalSegmentKey,
  )
  const parentIdentity =
    payload.parentCardId === undefined
      ? undefined
      : sourceQualifiedWireIdentity(payload.parentCardId)
  const continuationSegmentIdentities =
    payload.continuationSegmentKeys === undefined
      ? undefined
      : payload.continuationSegmentKeys.map(sourceQualifiedWireIdentity)
  const allowedSegmentKeys = continuationSegmentIdentities
    ? new Set(
        continuationSegmentIdentities.map(
          (identity) => identity?.identity ?? '',
        ),
      )
    : undefined
  if (
    !cardIdentity ||
    !canonicalSegmentIdentity ||
    cardIdentity.source !== canonicalSegmentIdentity.source ||
    (payload.parentCardId !== undefined &&
      (!parentIdentity ||
        parentIdentity.source !== cardIdentity.source ||
        parentIdentity.identity === cardIdentity.identity)) ||
    (continuationSegmentIdentities !== undefined &&
      (continuationSegmentIdentities.length === 0 ||
        continuationSegmentIdentities.some(
          (identity) => !identity || identity.source !== cardIdentity.source,
        ) ||
        allowedSegmentKeys?.size !== continuationSegmentIdentities.length ||
        !allowedSegmentKeys.has(canonicalSegmentIdentity.identity) ||
        (parentIdentity && allowedSegmentKeys.has(parentIdentity.identity)))) ||
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
  return fetchAndParseSessionCardResponse(
    () =>
      fetch(
        `/api/session-cards/${encodeURIComponent(payload.cardId)}/history${suffix}`,
        {
          signal: payload.signal,
        },
      ),
    (value) => {
      const history = parseSessionCardHistory(value, allowedSegmentKeys)
      if (
        history.cardId !== payload.cardId ||
        history.canonicalSegmentKey !== payload.canonicalSegmentKey
      ) {
        return invalidSessionCardResponse()
      }
      return history
    },
  )
}

export type SessionCardHistoryResponse = HistoryResponse & {
  cardId: string
  canonicalSegmentKey: string
  completeness: 'complete' | 'partial'
  retryable: boolean
  missingSegments: SessionCardHistoryWire['missingSegments']
  /** Server-persisted rows before exact Card recovery/live overlays. */
  persistedMessages?: Array<ChatMessage>
  /** Browser durability result for the latest authoritative complete snapshot. */
  completeSnapshotDurability?: 'verified' | 'failed'
}

/**
 * Mounted transcripts are usable only when the server explicitly proves the
 * entire Card history is complete and no retryable or missing segment remains.
 */
export function isAuthoritativeCompleteSessionCardHistory(
  history: SessionCardHistoryResponse | undefined,
): boolean {
  return Boolean(
    history &&
    history.completeness === 'complete' &&
    history.retryable === false &&
    history.missingSegments.length === 0,
  )
}

function sessionCardMessage(
  entry: SessionCardHistoryWire['messages'][number],
): ChatMessage {
  // Gateway-backed history stores persisted content as a string, while the
  // rendered ChatMessage contract uses typed content parts. Normalize at the
  // wire boundary so the transcript renderer can read both persisted forms.
  const rawContent = entry.message.content
  const content =
    typeof rawContent === 'string'
      ? [{ type: 'text' as const, text: rawContent }]
      : Array.isArray(rawContent)
        ? rawContent
        : []

  return {
    ...entry.message,
    content,
    __segmentKey: entry.segmentKey,
  } as ChatMessage
}

/** Load every stable cursor page so the parent pane never drops older segments. */
export async function fetchCompleteSessionCardHistory(payload: {
  cardId: string
  canonicalSegmentKey: string
  parentCardId?: string
  continuationSegmentKeys?: ReadonlyArray<string>
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
      continuationSegmentKeys: payload.continuationSegmentKeys,
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
    persistedMessages: messages,
    completeness: finalPage.completeness,
    retryable: finalPage.retryable,
    missingSegments: finalPage.missingSegments,
  }
}

function mergeCardHistoryMessages(
  primary: Array<ChatMessage>,
  secondary: Array<ChatMessage>,
): Array<ChatMessage> {
  return mergeCardTranscriptRecoveryMessages(primary, secondary)
}

function isSameSessionCardHistoryOwner(
  left: Pick<SessionCardHistoryResponse, 'cardId' | 'canonicalSegmentKey'>,
  right: Pick<SessionCardHistoryResponse, 'cardId' | 'canonicalSegmentKey'>,
): boolean {
  return (
    left.cardId === right.cardId &&
    left.canonicalSegmentKey === right.canonicalSegmentKey
  )
}

function persistedCardHistoryMessages(
  history: SessionCardHistoryResponse,
  fallbackToAllMessages = false,
): Array<ChatMessage> {
  if (history.persistedMessages) return history.persistedMessages
  const segmentRows = history.messages.filter((message) => {
    const segmentKey = sourceQualifiedWireIdentity(
      (message as Record<string, unknown>).__segmentKey,
    )
    return segmentKey !== null
  })
  return fallbackToAllMessages ? history.messages : segmentRows
}

function mergePartialPersistedCardHistory(
  server: SessionCardHistoryResponse,
  previous: SessionCardHistoryResponse | undefined,
  continuationSegmentKeys: ReadonlyArray<string> | undefined,
): Array<ChatMessage> {
  const serverMessages = persistedCardHistoryMessages(server, true)
  if (
    server.completeness === 'complete' ||
    !previous ||
    !isSameSessionCardHistoryOwner(server, previous)
  ) {
    return serverMessages
  }

  const previousMessages = persistedCardHistoryMessages(previous)
  if (!continuationSegmentKeys || continuationSegmentKeys.length === 0) {
    return mergeCardHistoryMessages(serverMessages, previousMessages)
  }

  const allowedSegmentKeys = new Set(continuationSegmentKeys)
  const messagesBySegment = (
    messages: Array<ChatMessage>,
  ): Map<string, Array<ChatMessage>> => {
    const grouped = new Map<string, Array<ChatMessage>>()
    for (const message of messages) {
      const identity = sourceQualifiedWireIdentity(
        (message as Record<string, unknown>).__segmentKey,
      )
      if (!identity || !allowedSegmentKeys.has(identity.identity)) continue
      const current = grouped.get(identity.identity) ?? []
      current.push(message)
      grouped.set(identity.identity, current)
    }
    return grouped
  }
  const serverBySegment = messagesBySegment(serverMessages)
  const previousBySegment = messagesBySegment(previousMessages)
  const retained: Array<ChatMessage> = []
  for (const segmentKey of continuationSegmentKeys) {
    retained.push(
      ...mergeCardHistoryMessages(
        serverBySegment.get(segmentKey) ?? [],
        previousBySegment.get(segmentKey) ?? [],
      ),
    )
  }
  return mergeCardHistoryMessages([], retained)
}

export function mergeSessionCardHistoryResponse(
  server: SessionCardHistoryResponse,
  recoveryMessages: Array<ChatMessage>,
): SessionCardHistoryResponse {
  const persistedMessages = persistedCardHistoryMessages(server, true)
  return {
    ...server,
    persistedMessages,
    messages: mergeCardHistoryMessages(persistedMessages, recoveryMessages),
  }
}

type ReconcileSessionCardHistoryOptions = {
  previous?: SessionCardHistoryResponse
  continuationSegmentKeys?: ReadonlyArray<string>
  /** Focused-test seam; production reads the exact recovery envelope. */
  recoveryMessages?: Array<ChatMessage>
}

/**
 * Reconcile one Card-history response with only same-owner persisted rows and
 * the exact Card recovery envelope. Complete history replaces retained
 * persisted rows and may acknowledge overlays; partial history keeps prior
 * validated rows visible and cannot clear recovery.
 */
export function reconcileSessionCardHistoryResponse(
  server: SessionCardHistoryResponse,
  options: ReconcileSessionCardHistoryOptions = {},
): SessionCardHistoryResponse {
  const owner = { cardId: server.cardId }
  const isComplete = isAuthoritativeCompleteSessionCardHistory(server)
  let persistedMessages = mergePartialPersistedCardHistory(
    server,
    options.previous,
    options.continuationSegmentKeys,
  )
  let completeSnapshotDurability = options.previous?.completeSnapshotDurability

  // Query memory is not a reload boundary. A partial response must retain the
  // last scrubbed complete Card projection even after a fresh QueryClient.
  if (!isComplete) {
    const snapshotMessages =
      readCardTranscriptSnapshot(server.cardId)?.messages ?? []
    persistedMessages = mergeCardHistoryMessages(
      snapshotMessages,
      persistedMessages,
    )
  }

  let recoveryMessages: Array<ChatMessage>
  if (options.recoveryMessages) {
    recoveryMessages = options.recoveryMessages
  } else if (isComplete) {
    // A complete projection must survive outside query memory before it is
    // allowed to acknowledge and remove any durable recovery overlay.
    const snapshot = writeCardTranscriptSnapshot(
      server.cardId,
      persistedMessages,
    )
    completeSnapshotDurability = snapshot ? 'verified' : 'failed'
    if (!snapshot) {
      recoveryMessages = readCardTranscriptRecovery(owner)?.messages ?? []
    } else {
      const acknowledgement =
        reconcileAcknowledgedCardTranscriptRecoveryMessages(
          owner,
          persistedMessages,
        )
      persistedMessages = acknowledgement.authoritativeMessages
      recoveryMessages = acknowledgement.recovery?.messages ?? []
      // Keep attachment-enriched rows as the newest complete baseline. The raw
      // complete baseline above remains durable if this best-effort update fails.
      writeCardTranscriptSnapshot(server.cardId, persistedMessages)
    }
  } else {
    recoveryMessages = readCardTranscriptRecovery(owner)?.messages ?? []
  }
  const persistedServer = {
    ...server,
    messages: persistedMessages,
    persistedMessages,
    ...(completeSnapshotDurability ? { completeSnapshotDurability } : {}),
  }
  return mergeSessionCardHistoryResponse(persistedServer, recoveryMessages)
}

export function updateSessionCardHistoryMessages(
  queryClient: QueryClient,
  cardId: string,
  canonicalSegmentKey: string,
  updater: (messages: Array<ChatMessage>) => Array<ChatMessage>,
) {
  const queryKey = sessionCardQueryKeys.history(cardId)
  queryClient.setQueryData(queryKey, function update(data: unknown) {
    const current = data as SessionCardHistoryResponse | undefined
    if (!current) {
      return {
        sessionKey: canonicalSegmentKey,
        cardId,
        canonicalSegmentKey,
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: canonicalSegmentKey,
            retryable: true,
            error: 'Complete Card history has not loaded.',
          },
        ],
        messages: updater([]),
      } satisfies SessionCardHistoryResponse
    }
    return {
      ...current,
      messages: updater(current.messages),
    } satisfies SessionCardHistoryResponse
  })
}

export function appendSessionCardHistoryMessage(
  queryClient: QueryClient,
  cardId: string,
  canonicalSegmentKey: string,
  message: ChatMessage,
  options: { persistRecovery?: boolean } = {},
) {
  if (options.persistRecovery ?? true) {
    appendCardTranscriptRecoveryMessage({ cardId }, message)
  }
  updateSessionCardHistoryMessages(
    queryClient,
    cardId,
    canonicalSegmentKey,
    (messages) => mergeCardHistoryMessages(messages, [message]),
  )
}

/** Persist and cache one explicit local Card overlay synchronously. */
export function appendSessionCardTransientMessage(
  queryClient: QueryClient,
  cardId: string,
  sessionKey: string,
  message: ChatMessage,
  options: { persistRecovery?: boolean } = {},
): void {
  appendSessionCardHistoryMessage(queryClient, cardId, sessionKey, message, {
    persistRecovery: options.persistRecovery ?? true,
  })
}

export function moveSessionCardHistoryMessages(
  queryClient: QueryClient,
  handoff: SessionCardHandoffTransition,
  activeCard: SessionCardHandoffAuthority,
  sessionCards: ReadonlyArray<SessionCard> = [],
  options: { recoveryStorage?: Storage; now?: number } = {},
): boolean {
  const { cardId, fromSegmentKey, canonicalSegmentKey } = handoff
  if (
    !isValidSessionCardHandoffTransition({
      handoff,
      activeCard,
      currentSegmentKey: fromSegmentKey,
      sessionCards,
    })
  ) {
    return false
  }
  // Recovery and browser cache ownership remain on the stable Card ID. The
  // successor segment updates only transport metadata in the same cache row.
  readCardTranscriptRecovery(
    { cardId },
    {
      storage: options.recoveryStorage,
      now: options.now,
    },
  )
  const historyKey = sessionCardQueryKeys.history(cardId)
  const fromData =
    queryClient.getQueryData<SessionCardHistoryResponse>(historyKey)
  if (!fromData) return true
  queryClient.setQueryData(historyKey, {
    ...fromData,
    sessionKey: canonicalSegmentKey,
    cardId,
    canonicalSegmentKey,
    messages: fromData.messages,
    persistedMessages: persistedCardHistoryMessages(fromData),
  } satisfies SessionCardHistoryResponse)
  return true
}

export function setSessionCardHandoffAuthority(
  queryClient: QueryClient,
  currentCard: SessionCard,
  authority: SessionCardHandoffAuthority,
): boolean {
  if (
    currentCard.cardId !== authority.cardId ||
    currentCard.canonicalSource !== authority.canonicalSource ||
    authority.continuationSegmentKeys.length === 0 ||
    authority.continuationSegmentKeys.at(-1) !== authority.canonicalSegmentKey
  ) {
    return false
  }

  const queryKey = sessionCardQueryKeys.detail(authority.cardId)
  const cached = queryClient.getQueryData<SessionCardDetailWire>(queryKey)
  if (cached && cached.card.cardId !== authority.cardId) return false
  const baseCard = cached?.card ?? currentCard
  queryClient.setQueryData<SessionCardDetailWire>(queryKey, {
    ...(cached ?? {
      resolution: {
        cardId: authority.cardId,
        completeness: 'complete',
        retryable: false,
      },
      completeness: 'complete',
      retryable: false,
      sources: [],
    }),
    card: {
      ...baseCard,
      ...authority,
      continuationSegmentKeys: [...authority.continuationSegmentKeys],
      continuationCount: authority.continuationSegmentKeys.length,
    },
  })
  return true
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

export function updateSessionCardTransientMessageByClientId(
  queryClient: QueryClient,
  cardId: string,
  canonicalSegmentKey: string,
  clientId: string,
  updater: (message: ChatMessage) => ChatMessage,
): boolean {
  if (
    !normalizeId(cardId) ||
    !normalizeId(canonicalSegmentKey) ||
    !normalizeId(clientId)
  ) {
    return false
  }

  const owner = { cardId }
  const recovery = readCardTranscriptRecovery(owner)
  const recoveredMatch =
    recovery?.messages.some((message) =>
      isMatchingClientMessage(message, clientId, clientId),
    ) ?? false
  if (recovery && recoveredMatch) {
    const messages = recovery.messages.map((message) => {
      if (!isMatchingClientMessage(message, clientId, clientId)) return message
      return updater(message)
    })
    replaceCardTranscriptRecoveryMessages(owner, messages)
  }

  const cached = queryClient.getQueryData<SessionCardHistoryResponse>(
    sessionCardQueryKeys.history(cardId),
  )
  const cacheMatch =
    cached?.messages.find((message) =>
      isMatchingClientMessage(message, clientId, clientId),
    ) ?? null
  if (cacheMatch) {
    updateSessionCardHistoryMessages(
      queryClient,
      cardId,
      canonicalSegmentKey,
      (messages) =>
        messages.map((message) =>
          isMatchingClientMessage(message, clientId, clientId)
            ? updater(message)
            : message,
        ),
    )
    if (!recoveredMatch) {
      const updatedCacheMatch = queryClient
        .getQueryData<SessionCardHistoryResponse>(
          sessionCardQueryKeys.history(cardId),
        )
        ?.messages.find((message) =>
          isMatchingClientMessage(message, clientId, clientId),
        )
      if (updatedCacheMatch) {
        appendCardTranscriptRecoveryMessage(owner, updatedCacheMatch)
      }
    }
  }
  return recoveredMatch || cacheMatch !== null
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

export function moveSessionCardHistoryToCard(
  queryClient: QueryClient,
  fromCardId: string,
  fromCanonicalSegmentKey: string,
  toCardId: string,
  toCanonicalSegmentKey: string,
) {
  if (
    fromCardId === toCardId &&
    fromCanonicalSegmentKey === toCanonicalSegmentKey
  ) {
    return
  }
  const fromKey = sessionCardQueryKeys.history(fromCardId)
  const toKey = sessionCardQueryKeys.history(toCardId)
  const fromData = queryClient.getQueryData<SessionCardHistoryResponse>(fromKey)
  if (!fromData) return
  const toData = queryClient.getQueryData<SessionCardHistoryResponse>(toKey)
  queryClient.setQueryData(toKey, {
    ...fromData,
    ...toData,
    sessionKey: toCanonicalSegmentKey,
    cardId: toCardId,
    canonicalSegmentKey: toCanonicalSegmentKey,
    messages: mergeCardHistoryMessages(
      fromData.messages,
      toData?.messages ?? [],
    ),
  } satisfies SessionCardHistoryResponse)
  queryClient.removeQueries({ queryKey: fromKey, exact: true })
}

/**
 * A bootstrap stream starts under the legacy `new/new` cache before its
 * authoritative Session Card exists. Once the route resolves, carry only its
 * transient user messages into the Card cache—the only transcript rendered by
 * a Card route. The Card entry remains partial until the server supplies a
 * complete history response.
 */
export function moveLegacyHistoryMessagesToSessionCard(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  cardId = friendlyId,
) {
  const fromKey = chatQueryKeys.history(friendlyId, sessionKey)
  const fromData = queryClient.getQueryData<HistoryResponse>(fromKey)
  if (!fromData) return
  const transient = fromData.messages.filter((message) => {
    if (message.role !== 'user') return false
    const raw = message as Record<string, unknown>
    return Boolean(
      nonblankWireString(raw.__optimisticId) ||
      nonblankWireString(raw.clientId) ||
      nonblankWireString(raw.client_id) ||
      raw.status === 'sending' ||
      raw.status === 'queued' ||
      raw.status === 'sent',
    )
  })
  queryClient.removeQueries({ queryKey: fromKey, exact: true })
  if (transient.length === 0) return

  for (const message of transient) {
    appendCardTranscriptRecoveryMessage({ cardId }, message)
  }
  updateSessionCardHistoryMessages(
    queryClient,
    cardId,
    sessionKey,
    (messages) => mergeCardHistoryMessages(transient, messages),
  )
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
