import { projectSessionCards } from '../screens/chat/session-cards'
import { listSessionsPage, toSessionSummary } from './claude-api'
import { listLocalSessions } from './local-session-store'
import {
  archiveSessionCardMetadata,
  listSessionCardMetadata,
  updateSessionCardMetadata,
} from './session-card-store'
import { createSessionTopologyClientFromEnv } from './session-topology-client'
import type {
  SessionTopologySession,
  SessionTopologySource,
  SessionTopologyTimestamp,
} from './session-topology-client'
import type { ClaudeSessionPage } from './claude-api'
import type { SessionCardProjection } from '../screens/chat/session-cards'
import type {
  PersistedSessionCard,
  SessionCardMetadataUpdate,
} from './session-card-store'
import type {
  SessionCard,
  SessionCardCanonicalTransport,
  SessionCardChild,
  SessionCardChildStatus,
  SessionMeta,
} from '../screens/chat/types'

export const DEFAULT_SESSION_CARD_SAFE_CAP = 2000
// The current Hermes gateway and dashboard return an offset/total contract but
// do not provide a stable snapshot token. Collect the bounded inventory in one
// request so that a snapshot-less backend remains authoritative up to the safe
// cap; paging it would correctly (but permanently) be classified as unstable.
export const DEFAULT_SESSION_CARD_PAGE_SIZE = DEFAULT_SESSION_CARD_SAFE_CAP
export const DEFAULT_SESSION_CARD_PROJECTION_CACHE_TTL_MS = 30_000

export type SessionCardSessionPage = {
  sessions: Array<SessionMeta>
  source?: string
  offset: number
  limit: number
  total?: number
  snapshot?: string
  hasMore?: boolean
  pagination: 'supported' | 'unsupported'
}

export type SessionCardRemoteSource = {
  source: string
  listPage: (
    limit: number,
    offset: number,
    pinnedSource?: string,
  ) => Promise<SessionCardSessionPage>
  [key: string]: unknown
}

export type SessionCardLocalSource = {
  source: string
  listSessions: () => Array<SessionMeta> | Promise<Array<SessionMeta>>
}

export type SessionCardMetadataStore = {
  list: () => Array<PersistedSessionCard>
  update: (
    cardId: string,
    patch: SessionCardMetadataUpdate,
  ) => PersistedSessionCard
  archive: (cardId: string) => PersistedSessionCard
}

export type SessionCardSourceStatus = {
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

export type SessionCardCollection = {
  sessions: Array<SessionMeta>
  originBySessionKey: ReadonlyMap<string, 'remote' | 'local'>
  sourceBySessionKey: ReadonlyMap<string, string>
  upstreamKeyBySessionKey: ReadonlyMap<string, string>
  sourceStatusBySessionKey: ReadonlyMap<string, SessionCardSourceStatus>
  knownMissingContinuationSegmentKeysBySessionKey: ReadonlyMap<
    string,
    ReadonlyArray<string>
  >
  completeness: 'complete' | 'incomplete'
  retryable: boolean
  sources: Array<SessionCardSourceStatus>
}

export type SessionCardListResult = {
  cards: Array<SessionCard>
  /** Number of root Cards before a caller-requested presentation limit. */
  totalCards: number
  cardResolutions: Array<{
    cardId: string
    completeness: 'complete' | 'incomplete'
    retryable: boolean
  }>
  completeness: 'complete' | 'incomplete'
  retryable: boolean
  sources: Array<SessionCardSourceStatus>
}

export type ResolvedSessionCard = {
  card: SessionCard
  pinEligible: boolean
  aliases: Array<string>
  sourceBySegmentKey: ReadonlyMap<string, string>
  upstreamKeyBySegmentKey: ReadonlyMap<string, string>
  collection: Pick<
    SessionCardCollection,
    'completeness' | 'retryable' | 'sources'
  >
}

export class SessionCardNotFoundError extends Error {
  constructor(cardId: string) {
    super(`Session Card not found: ${cardId}`)
    this.name = 'SessionCardNotFoundError'
  }
}

export class SessionCardPinNotEligibleError extends Error {
  constructor(cardId: string) {
    super(`Session Card cannot be pinned: ${cardId}`)
    this.name = 'SessionCardPinNotEligibleError'
  }
}

export class SessionCardProjectionIncompleteError extends Error {
  constructor(cardId: string) {
    super(`Session Card projection is incomplete: ${cardId}`)
    this.name = 'SessionCardProjectionIncompleteError'
  }
}

type SessionCardServiceOptions = {
  remoteSource?: SessionCardRemoteSource | null
  localSource?: SessionCardLocalSource | null
  metadataStore?: SessionCardMetadataStore
  topologySource?: SessionTopologySource | null
  pageSize?: number
  maxSessions?: number
  now?: () => number
  /**
   * Reusing a complete projection prevents every mounted client from
   * independently rescanning the full gateway/topology inventory. Tests keep
   * this disabled unless they opt in explicitly.
   */
  projectionCacheTtlMs?: number
}

export type SessionCardChildLifecycleInput = {
  parentCardId: string
  childUpstreamSessionKey: string
  runId: string
  status: Exclude<SessionCardChildStatus, 'idle'>
}

export type SessionCardChildLifecycleObservation = {
  cardId: string
  childCardId: string
  childSessionKey: string
  runId: string
  status: Exclude<SessionCardChildStatus, 'idle'>
  updatedAt: number
}

type StoredChildLifecycle = SessionCardChildLifecycleObservation & {
  binding: string
  supersededRunIds: Array<string>
}

type FreshProjection = {
  projection: SessionCardProjection
  collection: SessionCardCollection
  aliasesByCardId: ReadonlyMap<string, Array<string>>
}

type CollectedSession = {
  session: SessionMeta
  source: string
  origin: 'remote' | 'local'
  projectionStatus?: SessionCardSourceStatus
}

const CONTINUATION_RELATIONSHIP_TYPES = new Set([
  'continuation',
  'compression_continuation',
])
const LOCAL_LINEAGE_SOURCES = new Set(['local', 'portable'])
const MAX_CHILD_LIFECYCLE_ENTRIES = 512
const RUNNING_CHILD_LIFECYCLE_TTL_MS = 30 * 60 * 1000
const TERMINAL_CHILD_LIFECYCLE_TTL_MS = 24 * 60 * 60 * 1000
const LINEAGE_ID_FIELDS = [
  'parentSessionId',
  'lineageRootId',
  'lineageTipId',
  'parentLineageRootId',
  'parentLineageTipId',
] as const

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isExactIdentity(value: string): boolean {
  return value.length > 0 && value.trim() === value
}

function childLifecycleKey(parentCardId: string, childCardId: string): string {
  return JSON.stringify([parentCardId, childCardId])
}

function childLifecycleTtl(status: StoredChildLifecycle['status']): number {
  return status === 'running'
    ? RUNNING_CHILD_LIFECYCLE_TTL_MS
    : TERMINAL_CHILD_LIFECYCLE_TTL_MS
}

function childRelationshipBinding(
  parent: SessionCard,
  child: SessionCard,
  collection: SessionCardCollection,
): string | null {
  const anchorSegmentKey = child.continuationSegmentKeys[0]
  if (
    child.parentCardId !== parent.cardId ||
    (child.relationshipKind !== 'branch' &&
      child.relationshipKind !== 'child') ||
    !anchorSegmentKey
  ) {
    return null
  }

  const parentOrigin = collection.originBySessionKey.get(
    parent.canonicalSegmentKey,
  )
  const childOrigin = collection.originBySessionKey.get(anchorSegmentKey)
  const upstreamAnchorKey =
    collection.upstreamKeyBySessionKey.get(anchorSegmentKey)
  const parentSourceStatus = collection.sourceStatusBySessionKey.get(
    parent.canonicalSegmentKey,
  )
  const childSourceStatus =
    collection.sourceStatusBySessionKey.get(anchorSegmentKey)
  const anchorSession = collection.sessions.find(
    (session) => session.key === anchorSegmentKey,
  )
  if (
    !parentOrigin ||
    parentOrigin !== childOrigin ||
    !upstreamAnchorKey ||
    parentSourceStatus?.status !== 'complete' ||
    childSourceStatus?.status !== 'complete' ||
    !anchorSession
  ) {
    return null
  }

  const lineage = anchorSession.lineage
  return JSON.stringify([
    parent.cardId,
    child.cardId,
    parentOrigin,
    upstreamAnchorKey,
    anchorSegmentKey,
    lineage?.parentSessionId ?? null,
    lineage?.relationshipType ?? null,
    lineage?.relationshipKind ?? null,
    lineage?.sessionSource ?? null,
    lineage?.isCrossSurfaceChild ?? null,
    lineage?.lineageRootId ?? null,
    lineage?.startedAt ?? null,
  ])
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback
}

function defaultRemoteSource(): SessionCardRemoteSource {
  return {
    source: 'hermes',
    async listPage(limit, offset, pinnedSource) {
      if (
        pinnedSource !== undefined &&
        pinnedSource !== 'dashboard' &&
        pinnedSource !== 'gateway'
      ) {
        throw new Error(`Unknown pinned session source: ${pinnedSource}`)
      }
      const page = await listSessionsPage(limit, offset, pinnedSource)
      return claudePageToSessionCardPage(page)
    },
  }
}

function claudePageToSessionCardPage(
  page: ClaudeSessionPage,
): SessionCardSessionPage {
  return {
    sessions: page.sessions.map(toSessionSummary),
    source: page.source,
    offset: page.offset,
    limit: page.limit,
    ...(page.total === undefined ? {} : { total: page.total }),
    ...(page.snapshot === undefined ? {} : { snapshot: page.snapshot }),
    hasMore: page.hasMore,
    pagination: page.pagination,
  }
}

function defaultLocalSource(): SessionCardLocalSource {
  return {
    source: 'local',
    listSessions: () =>
      listLocalSessions().map((session) => ({
        key: session.id,
        ...(session.upstreamSessionId
          ? { backendKey: session.upstreamSessionId }
          : {}),
        friendlyId: session.id,
        updatedAt: session.updatedAt,
        title: session.title ?? undefined,
        lineage: { source: 'local' },
      })),
  }
}

function defaultMetadataStore(): SessionCardMetadataStore {
  return {
    list: listSessionCardMetadata,
    update: updateSessionCardMetadata,
    archive: archiveSessionCardMetadata,
  }
}

function hasMoreRows(
  page: SessionCardSessionPage,
  nextOffset: number,
  requestedLimit: number,
): boolean {
  if (typeof page.hasMore === 'boolean') return page.hasMore
  if (typeof page.total === 'number') return nextOffset < page.total
  return page.sessions.length >= requestedLimit
}

function normalizedLower(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
}

function sourceNamespace(entry: CollectedSession): string {
  return entry.origin
}

function collectedIdentity(
  entry: CollectedSession,
  sessionKey: string,
): string {
  return JSON.stringify([entry.origin, sessionKey])
}

function explicitSharedUpstreamIdentity(
  entry: CollectedSession,
): string | undefined {
  const identity =
    entry.origin === 'remote'
      ? (entry.session.backendKey ?? entry.session.key)
      : entry.session.backendKey
  return identity && isExactIdentity(identity) ? identity : undefined
}

function applySourcePrecedence(
  entries: Array<CollectedSession>,
  remoteStatus: SessionCardSourceStatus | undefined,
): {
  entries: Array<CollectedSession>
  excludedRemoteTopologyIds: ReadonlySet<string>
} {
  if (!remoteStatus) {
    return { entries, excludedRemoteTopologyIds: new Set<string>() }
  }

  // A local backendKey is the explicit proof that a portable row caches the
  // matching remote identity. Opaque local keys, titles, and timestamps never
  // participate. A complete remote inventory owns a proven match; otherwise
  // the local row remains the retryable history fallback for that identity.
  const remoteIdentities = new Set(
    entries
      .filter((entry) => entry.origin === 'remote')
      .map(explicitSharedUpstreamIdentity)
      .filter((identity): identity is string => identity !== undefined),
  )
  const localFallbackIdentities = new Set(
    entries
      .filter((entry) => entry.origin === 'local')
      .map(explicitSharedUpstreamIdentity)
      .filter((identity): identity is string => identity !== undefined),
  )

  if (remoteStatus.status === 'complete') {
    return {
      entries: entries.filter((entry) => {
        if (entry.origin !== 'local') return true
        const identity = explicitSharedUpstreamIdentity(entry)
        return !identity || !remoteIdentities.has(identity)
      }),
      excludedRemoteTopologyIds: new Set<string>(),
    }
  }

  const excludedRemoteTopologyIds = new Set<string>()
  const retainedEntries = entries.filter((entry) => {
    if (entry.origin !== 'remote') return true
    const identity = explicitSharedUpstreamIdentity(entry)
    if (!identity || !localFallbackIdentities.has(identity)) return true
    // Topology closure is allowed to add missing connected records, but it must
    // never resurrect the exact remote identity already displaced by a proven
    // local fallback. Track both adapter key forms because topology IDs can use
    // either the row key or its explicit backend identity.
    excludedRemoteTopologyIds.add(entry.session.key)
    excludedRemoteTopologyIds.add(identity)
    return false
  })

  return {
    entries: retainedEntries.map((entry) =>
      entry.origin === 'local' && explicitSharedUpstreamIdentity(entry)
        ? { ...entry, projectionStatus: remoteStatus }
        : entry,
    ),
    excludedRemoteTopologyIds,
  }
}

function strictColdContinuationMissingKeys(
  session: SessionMeta,
  loadedSessionKeys: ReadonlySet<string>,
): Array<string> {
  const lineage = session.lineage
  const rootId = lineage?.lineageRootId?.trim()
  const tipId = lineage?.lineageTipId?.trim()
  if (
    !lineage ||
    !rootId ||
    loadedSessionKeys.has(rootId) ||
    tipId !== session.key ||
    rootId === session.key
  ) {
    return []
  }

  const lineageSource = normalizedLower(lineage.source)
  const sessionSource = normalizedLower(lineage.sessionSource)
  const relationshipType = normalizedLower(lineage.relationshipType)
  if (
    (lineageSource && LOCAL_LINEAGE_SOURCES.has(lineageSource)) ||
    (sessionSource &&
      (LOCAL_LINEAGE_SOURCES.has(sessionSource) || sessionSource === 'fork')) ||
    lineage.relationshipKind === 'branch' ||
    lineage.relationshipKind === 'child' ||
    lineage.isCrossSurfaceChild === true ||
    (relationshipType && !CONTINUATION_RELATIONSHIP_TYPES.has(relationshipType))
  ) {
    return []
  }

  const parentSessionId = lineage.parentSessionId?.trim()
  const parentRootId = lineage.parentLineageRootId?.trim()
  const parentTipId = lineage.parentLineageTipId?.trim()
  if (
    parentRootId === rootId &&
    parentTipId &&
    parentTipId !== session.key &&
    (parentSessionId === parentTipId ||
      (parentSessionId === rootId &&
        relationshipType &&
        CONTINUATION_RELATIONSHIP_TYPES.has(relationshipType)))
  ) {
    return [...new Set([rootId, parentTipId])].filter(
      (key) => !loadedSessionKeys.has(key),
    )
  }
  return []
}

function hasStrictColdRootAlias(
  session: SessionMeta,
  loadedSessionKeys: ReadonlySet<string>,
): boolean {
  const rootId = session.lineage?.lineageRootId?.trim()
  return Boolean(
    (rootId && loadedSessionKeys.has(rootId)) ||
    strictColdContinuationMissingKeys(session, loadedSessionKeys).length,
  )
}

function sanitizeColdRootAlias(
  session: SessionMeta,
  loadedSessionKeys: ReadonlySet<string>,
): SessionMeta {
  const rootId = session.lineage?.lineageRootId?.trim()
  if (
    !rootId ||
    loadedSessionKeys.has(rootId) ||
    hasStrictColdRootAlias(session, loadedSessionKeys)
  ) {
    return session
  }

  const lineage = { ...session.lineage }
  delete lineage.lineageRootId
  return { ...session, lineage }
}

function qualifiedSessionKey(
  entry: CollectedSession,
  sessionKey = entry.session.key,
): string {
  return `${entry.origin}:${encodeURIComponent(sessionKey)}`
}

function topologyTimestampMs(
  timestamp: SessionTopologyTimestamp | null,
): number | undefined {
  if (timestamp === null) return undefined
  if (typeof timestamp === 'number') return timestamp * 1000
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? parsed : undefined
}

function sessionFromTopology(
  topology: SessionTopologySession,
  existing?: SessionMeta,
  continuationFacts?: {
    rootId: string
    tipId: string
    segmentCount: number
  },
): SessionMeta {
  const relationshipKind =
    topology.relationship === 'delegate' ? 'child' : topology.relationship
  const startedAt = topologyTimestampMs(topology.started_at)
  const endedAt = topologyTimestampMs(topology.ended_at)
  return {
    ...(existing ?? { key: topology.id, friendlyId: topology.id }),
    key: topology.id,
    ...(!existing && (endedAt ?? startedAt) !== undefined
      ? { updatedAt: endedAt ?? startedAt }
      : {}),
    lineage: {
      source: topology.source,
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(endedAt === undefined ? {} : { endedAt }),
      ...(topology.end_reason === null
        ? {}
        : { endReason: topology.end_reason }),
      relationshipKind,
      ...(topology.parent_session_id === null
        ? {}
        : { parentSessionId: topology.parent_session_id }),
      ...(continuationFacts
        ? {
            lineageRootId: continuationFacts.rootId,
            lineageTipId: continuationFacts.tipId,
            compressionSegmentCount: continuationFacts.segmentCount,
          }
        : {}),
      ...(topology.relationship === 'branch' ? { sessionSource: 'fork' } : {}),
      ...(topology.relationship === 'delegate' ||
      topology.relationship === 'child'
        ? { relationshipType: 'child_session' }
        : {}),
    },
  }
}

function continuationFactsBySessionId(
  topologySessions: ReadonlyArray<SessionTopologySession>,
): Map<string, { rootId: string; tipId: string; segmentCount: number }> {
  const byId = new Map(topologySessions.map((session) => [session.id, session]))
  const rootIdBySessionId = new Map<string, string>()
  for (const session of topologySessions) {
    let root = session
    while (
      root.relationship === 'continuation' &&
      root.parent_session_id !== null
    ) {
      const parent = byId.get(root.parent_session_id)
      if (!parent) break
      root = parent
    }
    if (root.id !== session.id || session.relationship === 'continuation') {
      rootIdBySessionId.set(session.id, root.id)
      rootIdBySessionId.set(root.id, root.id)
    }
  }

  const membersByRoot = new Map<string, Array<string>>()
  for (const [id, rootId] of rootIdBySessionId) {
    const members = membersByRoot.get(rootId) ?? []
    members.push(id)
    membersByRoot.set(rootId, members)
  }
  const result = new Map<
    string,
    { rootId: string; tipId: string; segmentCount: number }
  >()
  for (const [rootId, members] of membersByRoot) {
    const continuationParents = new Set(
      members
        .map((id) => byId.get(id))
        .filter(
          (session): session is SessionTopologySession =>
            session?.relationship === 'continuation' &&
            session.parent_session_id !== null,
        )
        .map((session) => session.parent_session_id!),
    )
    const tips = members.filter((id) => !continuationParents.has(id))
    if (tips.length !== 1) continue
    const facts = {
      rootId,
      tipId: tips[0]!,
      segmentCount: members.length,
    }
    for (const id of members) result.set(id, facts)
  }
  return result
}

function remoteTopologyClosure(
  topologySessions: ReadonlyArray<SessionTopologySession>,
  remoteSessionIds: ReadonlySet<string>,
): Set<string> {
  const byId = new Map(topologySessions.map((session) => [session.id, session]))
  const adjacent = new Map<string, Set<string>>()
  for (const session of topologySessions) {
    adjacent.set(session.id, adjacent.get(session.id) ?? new Set<string>())
    if (session.parent_session_id === null) continue
    adjacent.get(session.id)!.add(session.parent_session_id)
    const parentAdjacent =
      adjacent.get(session.parent_session_id) ?? new Set<string>()
    parentAdjacent.add(session.id)
    adjacent.set(session.parent_session_id, parentAdjacent)
  }

  const included = new Set<string>()
  const pending = [...remoteSessionIds].filter((id) => byId.has(id))
  while (pending.length > 0) {
    const id = pending.pop()!
    if (included.has(id)) continue
    included.add(id)
    for (const connectedId of adjacent.get(id) ?? []) {
      if (!included.has(connectedId)) pending.push(connectedId)
    }
  }
  return included
}

function stripRemoteTopology(
  entries: Array<CollectedSession>,
): Array<CollectedSession> {
  return entries.map((entry) =>
    entry.origin === 'remote'
      ? {
          ...entry,
          session: { ...entry.session, lineage: undefined },
        }
      : entry,
  )
}

function applyRemoteTopology(
  entries: Array<CollectedSession>,
  topologySessions: ReadonlyArray<SessionTopologySession>,
  excludedRemoteTopologyIds: ReadonlySet<string>,
): Array<CollectedSession> {
  const remoteEntries = entries.filter((entry) => entry.origin === 'remote')
  const localEntries = entries.filter((entry) => entry.origin === 'local')
  const remoteById = new Map(
    remoteEntries.map((entry) => [entry.session.key, entry]),
  )
  // Remove proven source-precedence exclusions before computing connectivity or
  // continuation facts. This preserves topology's fail-closed behavior: loaded
  // records beyond an excluded node remain independently visible, but cannot
  // use that node as an authoritative relationship bridge.
  const eligibleTopologySessions = topologySessions.filter(
    (session) => !excludedRemoteTopologyIds.has(session.id),
  )
  const included = remoteTopologyClosure(
    eligibleTopologySessions,
    new Set(remoteById.keys()),
  )
  const defaultSource = remoteEntries[0]?.source
  const continuationFacts = continuationFactsBySessionId(
    eligibleTopologySessions,
  )
  const projectedRemote: Array<CollectedSession> = []

  for (const topology of eligibleTopologySessions) {
    if (!included.has(topology.id)) continue
    const existing = remoteById.get(topology.id)
    const source = existing?.source ?? defaultSource
    if (!source) continue
    projectedRemote.push({
      origin: 'remote',
      source,
      session: sessionFromTopology(
        topology,
        existing?.session,
        continuationFacts.get(topology.id),
      ),
    })
    remoteById.delete(topology.id)
  }

  for (const entry of remoteById.values()) {
    projectedRemote.push({
      ...entry,
      session: { ...entry.session, lineage: undefined },
    })
  }
  return [...projectedRemote, ...localEntries]
}

function projectSourceQualifiedSessions(
  entries: Array<CollectedSession>,
  statusByOrigin: ReadonlyMap<
    CollectedSession['origin'],
    SessionCardSourceStatus
  >,
): Pick<
  SessionCardCollection,
  | 'sessions'
  | 'originBySessionKey'
  | 'sourceBySessionKey'
  | 'upstreamKeyBySessionKey'
  | 'sourceStatusBySessionKey'
  | 'knownMissingContinuationSegmentKeysBySessionKey'
> {
  const loadedKeysByNamespace = new Map<string, Set<string>>()
  for (const entry of entries) {
    const namespace = sourceNamespace(entry)
    const loadedKeys = loadedKeysByNamespace.get(namespace) ?? new Set<string>()
    loadedKeys.add(entry.session.key)
    loadedKeysByNamespace.set(namespace, loadedKeys)
  }

  const projectedKeyByIdentity = new Map<string, string>()
  for (const entry of entries) {
    projectedKeyByIdentity.set(
      collectedIdentity(entry, entry.session.key),
      qualifiedSessionKey(entry),
    )
  }

  const sessions: Array<SessionMeta> = []
  const originBySessionKey = new Map<string, CollectedSession['origin']>()
  const sourceBySessionKey = new Map<string, string>()
  const upstreamKeyBySessionKey = new Map<string, string>()
  const sourceStatusBySessionKey = new Map<string, SessionCardSourceStatus>()
  const knownMissingContinuationSegmentKeysBySessionKey = new Map<
    string,
    Array<string>
  >()
  for (const entry of entries) {
    const namespaceKeys =
      loadedKeysByNamespace.get(sourceNamespace(entry)) ?? new Set<string>()
    const sanitized = sanitizeColdRootAlias(entry.session, namespaceKeys)
    const projectedKey = projectedKeyByIdentity.get(
      collectedIdentity(entry, entry.session.key),
    )
    if (!projectedKey) continue

    const knownMissingKeys = strictColdContinuationMissingKeys(
      entry.session,
      namespaceKeys,
    )
    if (knownMissingKeys.length > 0) {
      knownMissingContinuationSegmentKeysBySessionKey.set(
        projectedKey,
        knownMissingKeys.map((key) => qualifiedSessionKey(entry, key)),
      )
    }

    const lineage = sanitized.lineage ? { ...sanitized.lineage } : undefined
    if (lineage) {
      for (const field of LINEAGE_ID_FIELDS) {
        const value = lineage[field]
        if (!value) continue
        const mapped = projectedKeyByIdentity.get(
          collectedIdentity(entry, value),
        )
        lineage[field] = mapped ?? qualifiedSessionKey(entry, value)
      }
    }

    sessions.push({
      ...sanitized,
      key: projectedKey,
      ...(lineage ? { lineage } : {}),
    })
    originBySessionKey.set(projectedKey, entry.origin)
    sourceBySessionKey.set(projectedKey, entry.source)
    upstreamKeyBySessionKey.set(projectedKey, entry.session.key)
    const status = entry.projectionStatus ?? statusByOrigin.get(entry.origin)
    if (status) sourceStatusBySessionKey.set(projectedKey, status)
  }

  return {
    sessions,
    originBySessionKey,
    sourceBySessionKey,
    upstreamKeyBySessionKey,
    sourceStatusBySessionKey,
    knownMissingContinuationSegmentKeysBySessionKey,
  }
}

function metadataProjectionMap(
  metadata: Array<PersistedSessionCard>,
): ReadonlyMap<
  string,
  {
    manualTitle?: string
    autoTitle?: string
    archived?: boolean
    pinned?: boolean
  }
> {
  return new Map(
    metadata.map((card) => [
      card.cardId,
      {
        ...(card.manualTitle ? { manualTitle: card.manualTitle } : {}),
        ...(card.autoTitle ? { autoTitle: card.autoTitle } : {}),
        ...(card.archivedAt === undefined ? {} : { archived: true }),
        ...(card.pinned === undefined ? {} : { pinned: card.pinned }),
      },
    ]),
  )
}

function safeAliases(
  projection: SessionCardProjection,
  loadedSessionKeys: ReadonlySet<string>,
  upstreamKeyBySessionKey: ReadonlyMap<string, string>,
  allowLegacyRootAliases: boolean,
): ReadonlyMap<string, Array<string>> {
  const aliasesByCardId = new Map<string, Set<string>>()
  for (const root of projection.roots) {
    aliasesByCardId.set(root.cardId, new Set([root.cardId]))
  }

  // buildSessionTree may expose a server-validated cold lineage alias which is
  // absent from the loaded rows. Never turn a loaded continuation or child key
  // into a card request alias.
  for (const [alias, cardId] of projection.cardIdBySessionKey) {
    if (loadedSessionKeys.has(alias)) continue
    aliasesByCardId.get(cardId)?.add(alias)
  }

  // The previous unqualified Card API is safe only when this service has one
  // configured source. With multiple configured sources, accepting a bare key
  // would let availability decide its owner and could target the wrong card.
  if (allowLegacyRootAliases) {
    for (const root of projection.roots) {
      const firstSegment = root.continuationSegmentKeys[0]
      if (!firstSegment || firstSegment !== root.cardId) continue
      const upstreamKey = upstreamKeyBySessionKey.get(firstSegment)
      if (upstreamKey) aliasesByCardId.get(root.cardId)?.add(upstreamKey)
    }
  }

  return new Map(
    [...aliasesByCardId].map(([cardId, aliases]) => [cardId, [...aliases]]),
  )
}

function visibleRootCards(
  projection: SessionCardProjection,
  includeArchived: boolean,
): Array<SessionCard> {
  const visibleCardIds = new Set(
    projection.cards
      .filter((card) => includeArchived || !card.archived)
      .map((card) => card.cardId),
  )

  return projection.roots
    .filter((card) => visibleCardIds.has(card.cardId))
    .map((card) => ({
      ...card,
      childNodes: card.childNodes.filter((child) =>
        visibleCardIds.has(child.cardId),
      ),
    }))
}

function canonicalSourceForCard(
  card: SessionCard,
  collection: SessionCardCollection,
): 'local' | 'remote' {
  const canonicalSource = collection.originBySessionKey.get(
    card.canonicalSegmentKey,
  )
  if (!canonicalSource) {
    throw new Error(
      `Canonical Session Card source is unavailable: ${card.cardId}`,
    )
  }
  return canonicalSource
}

function canonicalTransportForCard(
  card: SessionCard,
  collection: SessionCardCollection,
): SessionCardCanonicalTransport | undefined {
  if (canonicalSourceForCard(card, collection) !== 'remote') return undefined
  const transport = collection.sourceBySessionKey.get(card.canonicalSegmentKey)
  return transport === 'gateway' || transport === 'dashboard'
    ? transport
    : undefined
}

function expandedContinuationSegmentKeys(
  card: SessionCard,
  collection: SessionCardCollection,
): Array<string> {
  const continuationSegmentKeys: Array<string> = []
  const seenContinuationSegmentKeys = new Set<string>()
  for (const loadedSegmentKey of card.continuationSegmentKeys) {
    const knownMissing =
      collection.knownMissingContinuationSegmentKeysBySessionKey.get(
        loadedSegmentKey,
      ) ?? []
    for (const segmentKey of [...knownMissing, loadedSegmentKey]) {
      if (seenContinuationSegmentKeys.has(segmentKey)) continue
      seenContinuationSegmentKeys.add(segmentKey)
      continuationSegmentKeys.push(segmentKey)
    }
  }
  return continuationSegmentKeys
}

function isSourceQualifiedCardIdentity(
  identity: string,
  source: 'local' | 'remote',
): boolean {
  const prefix = `${source}:`
  return (
    identity.trim() === identity &&
    identity.startsWith(prefix) &&
    identity.length > prefix.length
  )
}

function assertAuthoritativeContinuationAliases(
  owner: { cardId: string; canonicalSegmentKey: string },
  continuationSegmentKeys: Array<string>,
  continuationCount: number,
  canonicalSource: 'local' | 'remote',
): void {
  if (
    !isSourceQualifiedCardIdentity(owner.cardId, canonicalSource) ||
    !isSourceQualifiedCardIdentity(
      owner.canonicalSegmentKey,
      canonicalSource,
    ) ||
    continuationSegmentKeys.length === 0 ||
    continuationCount !== continuationSegmentKeys.length ||
    new Set(continuationSegmentKeys).size !== continuationSegmentKeys.length ||
    continuationSegmentKeys[0] !== owner.cardId ||
    continuationSegmentKeys.at(-1) !== owner.canonicalSegmentKey ||
    continuationSegmentKeys.some(
      (identity) => !isSourceQualifiedCardIdentity(identity, canonicalSource),
    )
  ) {
    throw new Error(
      `Invalid authoritative Session Card aliases: ${owner.cardId}`,
    )
  }
}

function authoritativeChildProjection(
  fresh: FreshProjection,
  parentCard: SessionCard,
  childNode: SessionCardChild,
  canonicalSource: 'local' | 'remote',
  ancestors: ReadonlySet<string>,
): SessionCardChild {
  const childCard = fresh.projection.indexByCardId.get(childNode.cardId)
  if (
    !childCard ||
    childCard.parentCardId !== parentCard.cardId ||
    childCard.canonicalSegmentKey !== childNode.sessionKey ||
    (childCard.relationshipKind !== 'branch' &&
      childCard.relationshipKind !== 'child') ||
    ancestors.has(childCard.cardId)
  ) {
    throw new Error(
      `Invalid authoritative Session Card child: ${childNode.cardId}`,
    )
  }
  const childSource = canonicalSourceForCard(childCard, fresh.collection)
  if (childSource !== canonicalSource) {
    throw new Error(
      `Invalid authoritative Session Card child source: ${childNode.cardId}`,
    )
  }
  const childContinuationSegmentKeys = expandedContinuationSegmentKeys(
    childCard,
    fresh.collection,
  )
  assertAuthoritativeContinuationAliases(
    childCard,
    childContinuationSegmentKeys,
    childContinuationSegmentKeys.length,
    childSource,
  )
  const nextAncestors = new Set(ancestors)
  nextAncestors.add(childCard.cardId)
  return {
    ...childNode,
    sessionKey: childCard.canonicalSegmentKey,
    continuationSegmentKeys: childContinuationSegmentKeys,
    continuationCount: childContinuationSegmentKeys.length,
    childNodes: childCard.childNodes.map((descendant) =>
      authoritativeChildProjection(
        fresh,
        childCard,
        descendant,
        canonicalSource,
        nextAncestors,
      ),
    ),
  }
}

function authoritativeCardProjection(
  fresh: FreshProjection,
  card: SessionCard,
): SessionCard {
  const canonicalSource = canonicalSourceForCard(card, fresh.collection)
  const canonicalTransport = canonicalTransportForCard(card, fresh.collection)
  const continuationSegmentKeys = expandedContinuationSegmentKeys(
    card,
    fresh.collection,
  )
  const ancestors = new Set([card.cardId])
  const childNodes = card.childNodes.map((childNode) =>
    authoritativeChildProjection(
      fresh,
      card,
      childNode,
      canonicalSource,
      ancestors,
    ),
  )
  const projectedCard: SessionCard = {
    ...card,
    canonicalSource,
    ...(canonicalTransport === undefined ? {} : { canonicalTransport }),
    continuationSegmentKeys,
    continuationCount: continuationSegmentKeys.length,
    childNodes,
  }
  assertAuthoritativeContinuationAliases(
    projectedCard,
    continuationSegmentKeys,
    projectedCard.continuationCount,
    canonicalSource,
  )
  if (projectedCard.archived && projectedCard.pinned) {
    throw new Error(
      `Invalid archived Session Card pin: ${projectedCard.cardId}`,
    )
  }
  return projectedCard
}

function authoritativeCardProjections(
  fresh: FreshProjection,
  cards: Array<SessionCard>,
): Array<SessionCard> {
  const projectedCards = cards.map((card) =>
    authoritativeCardProjection(fresh, card),
  )
  const ownerByIdentity = new Map<string, object>()
  const claimIdentity = (identity: string, owner: object) => {
    const existingOwner = ownerByIdentity.get(identity)
    if (existingOwner !== undefined && existingOwner !== owner) {
      throw new Error(
        `Conflicting authoritative Session Card alias: ${identity}`,
      )
    }
    ownerByIdentity.set(identity, owner)
  }
  const claimChildOwnership = (children: Array<SessionCardChild>): void => {
    for (const child of children) {
      for (const identity of [
        child.cardId,
        child.sessionKey,
        ...child.continuationSegmentKeys,
      ]) {
        claimIdentity(identity, child)
      }
      claimChildOwnership(child.childNodes ?? [])
    }
  }
  for (const card of projectedCards) {
    for (const identity of [
      card.cardId,
      card.canonicalSegmentKey,
      ...card.continuationSegmentKeys,
    ]) {
      claimIdentity(identity, card)
    }
    claimChildOwnership(card.childNodes)
  }
  return projectedCards
}

function resolveProjectedCard(
  fresh: FreshProjection,
  card: SessionCard,
  aliases: Array<string>,
  pinEligible: boolean,
): ResolvedSessionCard {
  const sourceBySegmentKey = new Map<string, string>()
  const upstreamKeyBySegmentKey = new Map<string, string>()
  const resolvedCard = authoritativeCardProjections(fresh, [card])[0]!
  const requiredSources: Array<SessionCardSourceStatus> = []
  const seenRequiredSources = new Set<SessionCardSourceStatus>()
  let componentComplete = true
  for (const segmentKey of resolvedCard.continuationSegmentKeys) {
    const source = fresh.collection.sourceBySessionKey.get(segmentKey)
    const upstreamKey = fresh.collection.upstreamKeyBySessionKey.get(segmentKey)
    const sourceStatus =
      fresh.collection.sourceStatusBySessionKey.get(segmentKey)
    if (source) sourceBySegmentKey.set(segmentKey, source)
    if (upstreamKey) upstreamKeyBySegmentKey.set(segmentKey, upstreamKey)
    if (!source || !upstreamKey || sourceStatus?.status !== 'complete') {
      componentComplete = false
    }
    if (sourceStatus && !seenRequiredSources.has(sourceStatus)) {
      seenRequiredSources.add(sourceStatus)
      requiredSources.push(sourceStatus)
    }
  }

  // Relationship projection alone is not authoritative enough for mutations.
  // Expose each direct child's fresh source-qualified upstream identities too.
  for (const child of resolvedCard.childNodes) {
    for (const segmentKey of child.continuationSegmentKeys) {
      const source = fresh.collection.sourceBySessionKey.get(segmentKey)
      const upstreamKey =
        fresh.collection.upstreamKeyBySessionKey.get(segmentKey)
      if (source) sourceBySegmentKey.set(segmentKey, source)
      if (upstreamKey) upstreamKeyBySegmentKey.set(segmentKey, upstreamKey)
    }
  }

  return {
    card: resolvedCard,
    pinEligible,
    aliases,
    sourceBySegmentKey,
    upstreamKeyBySegmentKey,
    collection: {
      completeness: componentComplete ? 'complete' : 'incomplete',
      retryable:
        !componentComplete ||
        requiredSources.some((source) => source.retryable),
      sources: requiredSources,
    },
  }
}

export class SessionCardService {
  private readonly remoteSource: SessionCardRemoteSource | null
  private readonly localSource: SessionCardLocalSource | null
  private readonly metadataStore: SessionCardMetadataStore
  private readonly topologySource: SessionTopologySource | null
  private readonly pageSize: number
  private readonly maxSessions: number
  private readonly allowLegacyRootAliases: boolean
  private readonly now: () => number
  private readonly projectionCacheTtlMs: number
  private projectionCache:
    | { value: FreshProjection; expiresAt: number }
    | undefined
  private projectionInFlight: Promise<FreshProjection> | undefined
  private readonly childLifecycleByBinding = new Map<
    string,
    StoredChildLifecycle
  >()

  constructor(options: SessionCardServiceOptions = {}) {
    this.remoteSource =
      options.remoteSource === undefined
        ? defaultRemoteSource()
        : options.remoteSource
    this.localSource =
      options.localSource === undefined
        ? defaultLocalSource()
        : options.localSource
    this.metadataStore = options.metadataStore ?? defaultMetadataStore()
    this.topologySource = options.topologySource ?? null
    this.pageSize = normalizePositiveInteger(
      options.pageSize,
      DEFAULT_SESSION_CARD_PAGE_SIZE,
    )
    this.maxSessions = normalizePositiveInteger(
      options.maxSessions,
      DEFAULT_SESSION_CARD_SAFE_CAP,
    )
    this.now = options.now ?? Date.now
    this.projectionCacheTtlMs = normalizePositiveInteger(
      options.projectionCacheTtlMs,
      0,
    )
    this.allowLegacyRootAliases =
      Number(this.remoteSource !== null) + Number(this.localSource !== null) ===
      1
  }

  async collectSessions(): Promise<SessionCardCollection> {
    const collectedSessions: Array<CollectedSession> = []
    const collectedIdentities = new Set<string>()
    const sources: Array<SessionCardSourceStatus> = []
    const statusByOrigin = new Map<
      CollectedSession['origin'],
      SessionCardSourceStatus
    >()
    const retainSession = (entry: CollectedSession): void => {
      if (!entry.session.key) return
      const identity = collectedIdentity(entry, entry.session.key)
      if (collectedIdentities.has(identity)) return
      collectedIdentities.add(identity)
      collectedSessions.push(entry)
    }

    if (this.remoteSource) {
      let fetched = 0
      let offset = 0
      let reportedSource = this.remoteSource.source
      let pinnedSource: string | undefined
      let expectedTotal: number | undefined
      let totalContractInitialized = false
      let expectedSnapshot: string | undefined
      let snapshotContractInitialized = false
      let fetchedMultiplePages = false
      let status: SessionCardSourceStatus = {
        source: reportedSource,
        status: 'complete',
        fetched: 0,
        retryable: false,
      }

      try {
        for (;;) {
          const remaining = this.maxSessions - fetched
          if (remaining <= 0) {
            status = {
              source: reportedSource,
              status: 'incomplete',
              fetched,
              retryable: true,
              reason: 'safe-cap',
            }
            break
          }

          const requestedLimit = Math.min(this.pageSize, remaining)
          const page = await this.remoteSource.listPage(
            requestedLimit,
            offset,
            pinnedSource,
          )
          const pageSource =
            page.source?.trim() || this.remoteSource.source.trim() || 'remote'
          if (pinnedSource !== undefined && pageSource !== pinnedSource) {
            throw new Error(
              `Session source changed during collection (${pinnedSource} -> ${pageSource}).`,
            )
          }
          pinnedSource = pageSource
          reportedSource = pinnedSource

          if (!Number.isSafeInteger(page.offset) || page.offset !== offset) {
            throw new Error(
              `Session page offset mismatch (${offset} expected, ${page.offset} received).`,
            )
          }
          if (
            page.total !== undefined &&
            (!Number.isSafeInteger(page.total) || page.total < 0)
          ) {
            throw new Error(`Session page total is invalid: ${page.total}.`)
          }
          if (!totalContractInitialized) {
            expectedTotal = page.total
            totalContractInitialized = true
          } else if (page.total !== expectedTotal) {
            throw new Error(
              `Session page total changed during collection (${expectedTotal ?? 'missing'} -> ${page.total ?? 'missing'}).`,
            )
          }
          const pageSnapshot =
            typeof page.snapshot === 'string' && page.snapshot.length > 0
              ? page.snapshot
              : undefined
          if (!snapshotContractInitialized) {
            expectedSnapshot = pageSnapshot
            snapshotContractInitialized = true
          } else if (pageSnapshot !== expectedSnapshot) {
            throw new Error(
              `Session page snapshot changed during collection (${expectedSnapshot ?? 'missing'} -> ${pageSnapshot ?? 'missing'}).`,
            )
          }
          if (page.sessions.length > requestedLimit) {
            throw new Error(
              `Session page exceeded the requested limit (${requestedLimit} requested, ${page.sessions.length} received).`,
            )
          }

          const pageEntries: Array<CollectedSession> = []
          const pageIdentities = new Set<string>()
          for (const session of page.sessions) {
            if (!session.key) {
              throw new Error(
                'Session page contains a row without a logical identity.',
              )
            }
            const entry: CollectedSession = {
              session,
              source: reportedSource,
              origin: 'remote',
            }
            const identity = collectedIdentity(entry, session.key)
            if (
              collectedIdentities.has(identity) ||
              pageIdentities.has(identity)
            ) {
              throw new Error(
                `Duplicate session identity in paginated snapshot: ${qualifiedSessionKey(entry)}.`,
              )
            }
            pageIdentities.add(identity)
            pageEntries.push(entry)
          }

          const received = pageEntries.length
          const nextOffset = offset + received
          fetchedMultiplePages ||= offset > 0
          if (expectedTotal !== undefined && nextOffset > expectedTotal) {
            throw new Error(
              `Session page total ${expectedTotal} is smaller than the validated offset ${nextOffset}.`,
            )
          }
          const more = hasMoreRows(page, nextOffset, requestedLimit)
          if (
            expectedTotal !== undefined &&
            typeof page.hasMore === 'boolean' &&
            page.hasMore !== nextOffset < expectedTotal
          ) {
            throw new Error(
              `Session page total ${expectedTotal} conflicts with hasMore=${page.hasMore} at offset ${nextOffset}.`,
            )
          }
          if (more && received < requestedLimit) {
            throw new Error(
              `Session page shortened unexpectedly (${requestedLimit} requested, ${received} received with more rows reported).`,
            )
          }
          if (
            !more &&
            expectedTotal !== undefined &&
            nextOffset !== expectedTotal
          ) {
            throw new Error(
              `Session page total ${expectedTotal} cannot be reconciled with ${nextOffset} validated records.`,
            )
          }

          for (const entry of pageEntries) retainSession(entry)
          fetched += received

          if (!more) {
            status =
              fetchedMultiplePages && expectedSnapshot === undefined
                ? {
                    source: reportedSource,
                    status: 'incomplete',
                    fetched,
                    retryable: true,
                    reason: 'unstable-pagination',
                  }
                : {
                    source: reportedSource,
                    status: 'complete',
                    fetched,
                    retryable: false,
                  }
            break
          }
          if (page.pagination === 'unsupported') {
            status = {
              source: reportedSource,
              status: 'incomplete',
              fetched,
              retryable: true,
              reason: 'unsupported-pagination',
            }
            break
          }
          if (received === 0) {
            status = {
              source: reportedSource,
              status: 'incomplete',
              fetched,
              retryable: true,
              reason: 'stalled-pagination',
            }
            break
          }
          if (fetched >= this.maxSessions) {
            status = {
              source: reportedSource,
              status: 'incomplete',
              fetched,
              retryable: true,
              reason: 'safe-cap',
            }
            break
          }
          offset = nextOffset
        }
      } catch (error) {
        status = {
          source: reportedSource,
          status: fetched > 0 ? 'incomplete' : 'unavailable',
          fetched,
          retryable: true,
          error: errorMessage(error),
        }
      }
      sources.push(status)
      statusByOrigin.set('remote', status)
    }

    if (this.localSource) {
      let status: SessionCardSourceStatus
      try {
        const localSessions = await this.localSource.listSessions()
        const retainedLocalSessions = localSessions.slice(0, this.maxSessions)
        let fetched = 0
        for (const session of retainedLocalSessions) {
          fetched += 1
          retainSession({
            session,
            source: this.localSource.source,
            origin: 'local',
          })
        }
        const capped = localSessions.length > retainedLocalSessions.length
        status = {
          source: this.localSource.source,
          status: capped ? 'incomplete' : 'complete',
          fetched,
          retryable: capped,
          ...(capped ? { reason: 'safe-cap' } : {}),
        }
      } catch (error) {
        status = {
          source: this.localSource.source,
          status: 'unavailable',
          fetched: 0,
          retryable: true,
          error: errorMessage(error),
        }
      }
      sources.push(status)
      statusByOrigin.set('local', status)
    }

    const { entries: sourcePrecedenceSessions, excludedRemoteTopologyIds } =
      applySourcePrecedence(collectedSessions, statusByOrigin.get('remote'))
    let authoritativeSessions = sourcePrecedenceSessions
    if (this.remoteSource && this.topologySource) {
      let topologyStatus: SessionCardSourceStatus
      try {
        const topology = await this.topologySource.listAll()
        topologyStatus = {
          source: 'session-topology-adapter',
          status: 'complete',
          fetched: topology.sessions.length,
          retryable: false,
        }
        authoritativeSessions = applyRemoteTopology(
          sourcePrecedenceSessions,
          topology.sessions,
          excludedRemoteTopologyIds,
        )
      } catch {
        topologyStatus = {
          source: 'session-topology-adapter',
          status: 'unavailable',
          fetched: 0,
          retryable: true,
          error: 'Session topology is unavailable.',
        }
        authoritativeSessions = stripRemoteTopology(sourcePrecedenceSessions)
        statusByOrigin.set('remote', topologyStatus)
      }
      sources.push(topologyStatus)
    }

    const projected = projectSourceQualifiedSessions(
      authoritativeSessions,
      statusByOrigin,
    )
    const incomplete = sources.some((source) => source.status !== 'complete')
    return {
      ...projected,
      completeness: incomplete ? 'incomplete' : 'complete',
      retryable: sources.some((source) => source.retryable),
      sources,
    }
  }

  invalidateTopology(): void {
    this.topologySource?.invalidate()
    this.invalidateProjectionCache()
  }

  private invalidateProjectionCache(): void {
    this.projectionCache = undefined
  }

  private validatedChildActivity(
    projection: SessionCardProjection,
    collection: SessionCardCollection,
  ): ReadonlyMap<
    string,
    ReadonlyMap<string, { status: SessionCardChildStatus; updatedAt: number }>
  > {
    const now = this.now()
    const activityByParentCardId = new Map<
      string,
      Map<string, { status: SessionCardChildStatus; updatedAt: number }>
    >()

    for (const [key, stored] of this.childLifecycleByBinding) {
      const parent = projection.roots.find(
        (candidate) => candidate.cardId === stored.cardId,
      )
      const child = projection.indexByCardId.get(stored.childCardId)
      const remainsDirectChild = parent?.childNodes.some(
        (candidate) => candidate.cardId === stored.childCardId,
      )
      if (!parent || !child || !remainsDirectChild) {
        this.childLifecycleByBinding.delete(key)
        continue
      }
      const binding = childRelationshipBinding(parent, child, collection)
      const expired = now - stored.updatedAt > childLifecycleTtl(stored.status)
      if (!binding || binding !== stored.binding || expired) {
        this.childLifecycleByBinding.delete(key)
        continue
      }

      const childActivity =
        activityByParentCardId.get(parent.cardId) ??
        new Map<string, { status: SessionCardChildStatus; updatedAt: number }>()
      childActivity.set(child.cardId, {
        status: stored.status,
        updatedAt: stored.updatedAt,
      })
      activityByParentCardId.set(parent.cardId, childActivity)
    }

    return activityByParentCardId
  }

  private async freshProjection(): Promise<FreshProjection> {
    const cached = this.projectionCache
    if (cached && cached.expiresAt > this.now()) return cached.value
    if (this.projectionInFlight) return this.projectionInFlight

    const pending = this.buildFreshProjection()
    this.projectionInFlight = pending
    try {
      const fresh = await pending
      if (this.projectionCacheTtlMs > 0) {
        this.projectionCache = {
          value: fresh,
          expiresAt: this.now() + this.projectionCacheTtlMs,
        }
      }
      return fresh
    } finally {
      if (this.projectionInFlight === pending) {
        this.projectionInFlight = undefined
      }
    }
  }

  private async buildFreshProjection(): Promise<FreshProjection> {
    const collection = await this.collectSessions()
    const cardMetadata = metadataProjectionMap(this.metadataStore.list())
    const baseProjection = projectSessionCards(collection.sessions, {
      cardMetadata,
    })
    const childActivityByParentCardId = this.validatedChildActivity(
      baseProjection,
      collection,
    )
    const projection = childActivityByParentCardId.size
      ? projectSessionCards(collection.sessions, {
          cardMetadata,
          childActivityByParentCardId,
        })
      : baseProjection
    return {
      projection,
      collection,
      aliasesByCardId: safeAliases(
        projection,
        new Set(collection.sessions.map((session) => session.key)),
        collection.upstreamKeyBySessionKey,
        this.allowLegacyRootAliases,
      ),
    }
  }

  async listCards(
    options: { includeArchived?: boolean; limit?: number } = {},
  ): Promise<SessionCardListResult> {
    const fresh = await this.freshProjection()
    const visibleCards = authoritativeCardProjections(
      fresh,
      visibleRootCards(fresh.projection, options.includeArchived === true),
    )
    const limit = options.limit
    const cards =
      Number.isSafeInteger(limit) && limit !== undefined && limit > 0
        ? [...visibleCards]
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .slice(0, limit)
        : visibleCards
    return {
      cards,
      totalCards: visibleCards.length,
      cardResolutions: cards.map((card) => {
        const resolved = resolveProjectedCard(
          fresh,
          card,
          fresh.aliasesByCardId.get(card.cardId) ?? [card.cardId],
          fresh.projection.pinEligibleCardIds.has(card.cardId),
        )
        return {
          cardId: card.cardId,
          completeness: resolved.collection.completeness,
          retryable: resolved.collection.retryable,
        }
      }),
      completeness: fresh.collection.completeness,
      retryable: fresh.collection.retryable,
      sources: fresh.collection.sources,
    }
  }

  async observeChildLifecycle(
    input: SessionCardChildLifecycleInput,
  ): Promise<SessionCardChildLifecycleObservation | null> {
    if (
      !isExactIdentity(input.parentCardId) ||
      !isExactIdentity(input.childUpstreamSessionKey) ||
      !isExactIdentity(input.runId)
    ) {
      return null
    }

    const fresh = await this.freshProjection()
    const parent = fresh.projection.roots.find(
      (candidate) =>
        candidate.cardId === input.parentCardId && !candidate.archived,
    )
    if (!parent) return null

    const matches: Array<{ child: SessionCard; binding: string }> = []
    for (const childNode of parent.childNodes) {
      const child = fresh.projection.indexByCardId.get(childNode.cardId)
      if (!child) continue
      const matchingSegments = child.continuationSegmentKeys.filter(
        (segmentKey) =>
          fresh.collection.upstreamKeyBySessionKey.get(segmentKey) ===
          input.childUpstreamSessionKey,
      )
      if (matchingSegments.length !== 1) continue
      const binding = childRelationshipBinding(parent, child, fresh.collection)
      if (binding) matches.push({ child, binding })
    }
    if (matches.length !== 1) return null

    const { child, binding } = matches[0]!
    const key = childLifecycleKey(parent.cardId, child.cardId)
    const existing = this.childLifecycleByBinding.get(key)
    const current = existing?.binding === binding ? existing : null
    if (current?.supersededRunIds.includes(input.runId)) return null
    if (input.status === 'running') {
      if (current?.runId === input.runId && current.status !== 'running') {
        return null
      }
    } else if (
      !current ||
      current.runId !== input.runId ||
      current.status !== 'running'
    ) {
      return null
    }
    const supersededRunIds = current
      ? [
          ...current.supersededRunIds,
          ...(input.status === 'running' && current.runId !== input.runId
            ? [current.runId]
            : []),
        ].slice(-32)
      : []

    const observation: SessionCardChildLifecycleObservation = {
      cardId: parent.cardId,
      childCardId: child.cardId,
      childSessionKey: child.canonicalSegmentKey,
      runId: input.runId,
      status: input.status,
      updatedAt: this.now(),
    }
    this.childLifecycleByBinding.delete(key)
    while (this.childLifecycleByBinding.size >= MAX_CHILD_LIFECYCLE_ENTRIES) {
      const oldestKey = this.childLifecycleByBinding.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.childLifecycleByBinding.delete(oldestKey)
    }
    this.childLifecycleByBinding.set(key, {
      ...observation,
      binding,
      supersededRunIds,
    })
    return observation
  }

  async resolveCard(
    requestedCardId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<ResolvedSessionCard> {
    const cardId = requestedCardId.trim()
    const fresh = await this.freshProjection()
    const roots = visibleRootCards(
      fresh.projection,
      options.includeArchived === true,
    )
    const card = roots.find((candidate) => {
      const aliases = fresh.aliasesByCardId.get(candidate.cardId) ?? [
        candidate.cardId,
      ]
      return aliases.includes(cardId)
    })
    if (!card) throw new SessionCardNotFoundError(requestedCardId)

    return resolveProjectedCard(
      fresh,
      card,
      fresh.aliasesByCardId.get(card.cardId) ?? [card.cardId],
      fresh.projection.pinEligibleCardIds.has(card.cardId),
    )
  }

  private async resolveCardByUpstreamSession(
    origin: 'remote' | 'local',
    requestedUpstreamSessionKey: string,
  ): Promise<ResolvedSessionCard> {
    const upstreamSessionKey = requestedUpstreamSessionKey.trim()
    const fresh = await this.freshProjection()
    const matches = visibleRootCards(fresh.projection, false)
      .map((card) => ({
        card,
        segmentKeys: card.continuationSegmentKeys.filter(
          (segmentKey) =>
            fresh.collection.originBySessionKey.get(segmentKey) === origin &&
            fresh.collection.upstreamKeyBySessionKey.get(segmentKey) ===
              upstreamSessionKey,
        ),
      }))
      .filter(({ segmentKeys }) => segmentKeys.length > 0)
    if (
      !upstreamSessionKey ||
      matches.length !== 1 ||
      matches[0]!.segmentKeys.length !== 1
    ) {
      throw new SessionCardNotFoundError(requestedUpstreamSessionKey)
    }

    const card = matches[0]!.card
    const resolved = resolveProjectedCard(
      fresh,
      card,
      fresh.aliasesByCardId.get(card.cardId) ?? [card.cardId],
      fresh.projection.pinEligibleCardIds.has(card.cardId),
    )
    if (
      resolved.collection.completeness !== 'complete' ||
      resolved.card.canonicalSource !== origin
    ) {
      throw new SessionCardNotFoundError(requestedUpstreamSessionKey)
    }
    return resolved
  }

  /**
   * Resolves a backend session through a fresh remote Card projection. Raw
   * upstream identity is accepted only at this server-side boundary; callers
   * receive the authoritative Card ID and canonical projected segment.
   */
  async resolveRemoteCardByUpstreamSession(
    requestedUpstreamSessionKey: string,
  ): Promise<ResolvedSessionCard> {
    return this.resolveCardByUpstreamSession(
      'remote',
      requestedUpstreamSessionKey,
    )
  }

  /** Resolve an internal portable-session key through a fresh local Card. */
  async resolveLocalCardByUpstreamSession(
    requestedUpstreamSessionKey: string,
  ): Promise<ResolvedSessionCard> {
    return this.resolveCardByUpstreamSession(
      'local',
      requestedUpstreamSessionKey,
    )
  }

  async resolveChildCard(
    requestedParentCardId: string,
    requestedChildCardId: string,
  ): Promise<ResolvedSessionCard> {
    const parentCardId = requestedParentCardId.trim()
    const childCardId = requestedChildCardId.trim()
    const fresh = await this.freshProjection()
    const parent = visibleRootCards(fresh.projection, false).find(
      (candidate) => {
        const aliases = fresh.aliasesByCardId.get(candidate.cardId) ?? [
          candidate.cardId,
        ]
        return aliases.includes(parentCardId)
      },
    )
    const child = fresh.projection.indexByCardId.get(childCardId)
    let belongsToParent = false
    let descendant = child
    const visited = new Set<string>()
    while (
      parent &&
      descendant &&
      !visited.has(descendant.cardId) &&
      (descendant.relationshipKind === 'branch' ||
        descendant.relationshipKind === 'child')
    ) {
      visited.add(descendant.cardId)
      if (descendant.parentCardId === parent.cardId) {
        belongsToParent = true
        break
      }
      descendant = descendant.parentCardId
        ? fresh.projection.indexByCardId.get(descendant.parentCardId)
        : undefined
    }
    if (!parent || !child || !belongsToParent) {
      throw new SessionCardNotFoundError(requestedChildCardId)
    }

    return resolveProjectedCard(fresh, child, [child.cardId], false)
  }

  async updateCardMetadata(
    cardId: string,
    patch: SessionCardMetadataUpdate,
  ): Promise<PersistedSessionCard> {
    const resolved = await this.resolveCard(cardId)
    if (resolved.collection.completeness !== 'complete') {
      throw new SessionCardProjectionIncompleteError(resolved.card.cardId)
    }
    if (patch.pinned === true && !resolved.pinEligible) {
      throw new SessionCardPinNotEligibleError(resolved.card.cardId)
    }
    const updated = this.metadataStore.update(resolved.card.cardId, patch)
    this.invalidateProjectionCache()
    return updated
  }

  async archiveCard(cardId: string): Promise<PersistedSessionCard> {
    const resolved = await this.resolveCard(cardId, { includeArchived: true })
    if (resolved.collection.completeness !== 'complete') {
      throw new SessionCardProjectionIncompleteError(resolved.card.cardId)
    }
    const archived = this.metadataStore.archive(resolved.card.cardId)
    this.invalidateProjectionCache()
    return archived
  }
}

export const sessionCardService = new SessionCardService({
  topologySource: createSessionTopologyClientFromEnv(),
  projectionCacheTtlMs: DEFAULT_SESSION_CARD_PROJECTION_CACHE_TTL_MS,
})
