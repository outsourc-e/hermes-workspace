import { projectSessionCards } from '../screens/chat/session-cards'
import { listSessionsPage, toSessionSummary } from './claude-api'
import { listLocalSessions } from './local-session-store'
import {
  archiveSessionCardMetadata,
  listSessionCardMetadata,
  updateSessionCardMetadata,
} from './session-card-store'
import type { ClaudeSessionPage } from './claude-api'
import type { SessionCardProjection } from '../screens/chat/session-cards'
import type {
  PersistedSessionCard,
  SessionCardMetadataUpdate,
} from './session-card-store'
import type { SessionCard, SessionMeta } from '../screens/chat/types'

export const DEFAULT_SESSION_CARD_PAGE_SIZE = 100
export const DEFAULT_SESSION_CARD_SAFE_CAP = 2000

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
  completeness: 'complete' | 'incomplete'
  retryable: boolean
  sources: Array<SessionCardSourceStatus>
}

export type ResolvedSessionCard = {
  card: SessionCard
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

type SessionCardServiceOptions = {
  remoteSource?: SessionCardRemoteSource | null
  localSource?: SessionCardLocalSource | null
  metadataStore?: SessionCardMetadataStore
  pageSize?: number
  maxSessions?: number
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
}

const CONTINUATION_RELATIONSHIP_TYPES = new Set([
  'continuation',
  'compression_continuation',
])
const LOCAL_LINEAGE_SOURCES = new Set(['local', 'portable'])
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
        backendKey: session.id,
        friendlyId: session.id,
        updatedAt: session.updatedAt,
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

function projectSourceQualifiedSessions(
  entries: Array<CollectedSession>,
  statusByOrigin: ReadonlyMap<
    CollectedSession['origin'],
    SessionCardSourceStatus
  >,
): Pick<
  SessionCardCollection,
  | 'sessions'
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
    sourceBySessionKey.set(projectedKey, entry.source)
    upstreamKeyBySessionKey.set(projectedKey, entry.session.key)
    const status = statusByOrigin.get(entry.origin)
    if (status) sourceStatusBySessionKey.set(projectedKey, status)
  }

  return {
    sessions,
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
  { manualTitle?: string; autoTitle?: string; archived?: boolean }
> {
  return new Map(
    metadata.map((card) => [
      card.cardId,
      {
        ...(card.manualTitle ? { manualTitle: card.manualTitle } : {}),
        ...(card.autoTitle ? { autoTitle: card.autoTitle } : {}),
        ...(card.archivedAt === undefined ? {} : { archived: true }),
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

export class SessionCardService {
  private readonly remoteSource: SessionCardRemoteSource | null
  private readonly localSource: SessionCardLocalSource | null
  private readonly metadataStore: SessionCardMetadataStore
  private readonly pageSize: number
  private readonly maxSessions: number
  private readonly allowLegacyRootAliases: boolean

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
    this.pageSize = normalizePositiveInteger(
      options.pageSize,
      DEFAULT_SESSION_CARD_PAGE_SIZE,
    )
    this.maxSessions = normalizePositiveInteger(
      options.maxSessions,
      DEFAULT_SESSION_CARD_SAFE_CAP,
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

    const projected = projectSourceQualifiedSessions(
      collectedSessions,
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

  private async freshProjection(): Promise<FreshProjection> {
    const collection = await this.collectSessions()
    const projection = projectSessionCards(collection.sessions, {
      cardMetadata: metadataProjectionMap(this.metadataStore.list()),
    })
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
    options: { includeArchived?: boolean } = {},
  ): Promise<SessionCardListResult> {
    const fresh = await this.freshProjection()
    return {
      cards: visibleRootCards(
        fresh.projection,
        options.includeArchived === true,
      ),
      completeness: fresh.collection.completeness,
      retryable: fresh.collection.retryable,
      sources: fresh.collection.sources,
    }
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

    const sourceBySegmentKey = new Map<string, string>()
    const upstreamKeyBySegmentKey = new Map<string, string>()
    const continuationSegmentKeys: Array<string> = []
    const seenContinuationSegmentKeys = new Set<string>()
    for (const loadedSegmentKey of card.continuationSegmentKeys) {
      const knownMissing =
        fresh.collection.knownMissingContinuationSegmentKeysBySessionKey.get(
          loadedSegmentKey,
        ) ?? []
      for (const segmentKey of [...knownMissing, loadedSegmentKey]) {
        if (seenContinuationSegmentKeys.has(segmentKey)) continue
        seenContinuationSegmentKeys.add(segmentKey)
        continuationSegmentKeys.push(segmentKey)
      }
    }
    const resolvedCard: SessionCard = {
      ...card,
      continuationSegmentKeys,
    }
    const requiredSources: Array<SessionCardSourceStatus> = []
    const seenRequiredSources = new Set<SessionCardSourceStatus>()
    let componentComplete = true
    for (const segmentKey of resolvedCard.continuationSegmentKeys) {
      const source = fresh.collection.sourceBySessionKey.get(segmentKey)
      const upstreamKey =
        fresh.collection.upstreamKeyBySessionKey.get(segmentKey)
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
    // Expose each direct child's fresh source-qualified upstream identity too.
    for (const child of resolvedCard.childNodes) {
      const source = fresh.collection.sourceBySessionKey.get(child.sessionKey)
      const upstreamKey = fresh.collection.upstreamKeyBySessionKey.get(
        child.sessionKey,
      )
      if (source) sourceBySegmentKey.set(child.sessionKey, source)
      if (upstreamKey) {
        upstreamKeyBySegmentKey.set(child.sessionKey, upstreamKey)
      }
    }

    return {
      card: resolvedCard,
      aliases: fresh.aliasesByCardId.get(card.cardId) ?? [card.cardId],
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

  async updateCardMetadata(
    cardId: string,
    patch: SessionCardMetadataUpdate,
  ): Promise<PersistedSessionCard> {
    const resolved = await this.resolveCard(cardId)
    return this.metadataStore.update(resolved.card.cardId, patch)
  }

  async archiveCard(cardId: string): Promise<PersistedSessionCard> {
    const resolved = await this.resolveCard(cardId, { includeArchived: true })
    return this.metadataStore.archive(resolved.card.cardId)
  }
}

export const sessionCardService = new SessionCardService()
