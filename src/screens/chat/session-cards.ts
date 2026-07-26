import { buildSessionTree } from './session-lineage'
import type {
  SessionCard,
  SessionCardChild,
  SessionCardChildStatus,
  SessionCardRelationshipKind,
  SessionCardTitleSource,
  SessionMeta,
  SessionTreeRow,
} from './types'

const DEFAULT_CARD_TITLE = 'New conversation'

export type SessionCardMetadata = {
  manualTitle?: string
  autoTitle?: string
  archived?: boolean
  pinned?: boolean
}

export type SessionCardProjectionOptions = {
  activeSessionKey?: string
  maxDepth?: number
  cardMetadata?: ReadonlyMap<string, SessionCardMetadata>
  childActivityByParentCardId?: ReadonlyMap<
    string,
    ReadonlyMap<string, { status: SessionCardChildStatus; updatedAt: number }>
  >
}

export type SessionCardProjection = {
  roots: Array<SessionCard>
  cards: Array<SessionCard>
  indexByCardId: ReadonlyMap<string, SessionCard>
  cardIdBySessionKey: ReadonlyMap<string, string>
  pinEligibleCardIds: ReadonlySet<string>
  activeCardId?: string
}

function sessionActivity(session: SessionMeta): number {
  const candidates = [
    session.updatedAt,
    session.lineage?.startedAt,
    session.lineage?.endedAt,
  ]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function deduplicateSessions(sessions: Array<SessionMeta>): Array<SessionMeta> {
  const sessionsByKey = new Map<string, SessionMeta>()
  for (const session of sessions) {
    if (!session.key) continue
    const existing = sessionsByKey.get(session.key)
    if (!existing || sessionActivity(session) > sessionActivity(existing)) {
      sessionsByKey.set(session.key, session)
    }
  }
  return [...sessionsByKey.values()]
}

function continuationDepth(
  session: SessionMeta,
  membersByKey: ReadonlyMap<string, SessionMeta>,
): number {
  const visited = new Set([session.key])
  let current = session
  let depth = 0

  while (depth < membersByKey.size) {
    const parentKey = current.lineage?.parentSessionId
    if (!parentKey || !membersByKey.has(parentKey) || visited.has(parentKey)) {
      break
    }
    const parent = membersByKey.get(parentKey)
    if (!parent) break
    visited.add(parentKey)
    current = parent
    depth += 1
  }

  return depth
}

function orderContinuationMembers(
  members: Array<SessionMeta>,
): Array<SessionMeta> {
  const membersByKey = new Map(members.map((member) => [member.key, member]))
  return [...members].sort((left, right) => {
    const depthDifference =
      continuationDepth(left, membersByKey) -
      continuationDepth(right, membersByKey)
    if (depthDifference !== 0) return depthDifference

    const leftStartedAt = left.lineage?.startedAt ?? 0
    const rightStartedAt = right.lineage?.startedAt ?? 0
    if (leftStartedAt !== rightStartedAt) return leftStartedAt - rightStartedAt

    const activityDifference = sessionActivity(left) - sessionActivity(right)
    if (activityDifference !== 0) return activityDifference
    return left.key.localeCompare(right.key)
  })
}

function cardIdForRow(
  row: SessionTreeRow,
  visibleKeyBySessionKey: ReadonlyMap<string, string>,
  logicalRootKeyBySessionKey: ReadonlyMap<string, string>,
): string {
  const declaredRootId = row.session.lineage?.lineageRootId?.trim()
  const loadedLogicalRoot = logicalRootKeyBySessionKey.get(row.key) ?? row.key
  if (
    declaredRootId &&
    !logicalRootKeyBySessionKey.has(declaredRootId) &&
    visibleKeyBySessionKey.get(declaredRootId) === row.key
  ) {
    // buildSessionTree only exposes a missing root as an alias after validating
    // the cold-loaded tip metadata. Loaded components keep their anchor key.
    return declaredRootId
  }
  return loadedLogicalRoot
}

function cardRelationshipKind(
  row: SessionTreeRow,
): SessionCardRelationshipKind {
  return row.relationshipKind === 'continuation'
    ? 'orphan'
    : row.relationshipKind
}

function hasChildRelationshipProvenance(session: SessionMeta): boolean {
  const lineage = session.lineage
  return (
    lineage?.sessionSource?.trim().toLowerCase() === 'fork' ||
    lineage?.relationshipType === 'child_session' ||
    lineage?.isCrossSurfaceChild === true ||
    lineage?.relationshipKind === 'branch' ||
    lineage?.relationshipKind === 'child'
  )
}

function normalizedTitle(value: string | undefined): string | undefined {
  const title = value?.trim()
  return title || undefined
}

function cardTitle(metadata: SessionCardMetadata | undefined): {
  title: string
  titleSource: SessionCardTitleSource
} {
  const manualTitle = normalizedTitle(metadata?.manualTitle)
  if (manualTitle) return { title: manualTitle, titleSource: 'manual' }

  const autoTitle = normalizedTitle(metadata?.autoTitle)
  if (autoTitle) return { title: autoTitle, titleSource: 'auto' }

  return { title: DEFAULT_CARD_TITLE, titleSource: 'default' }
}

function compareCards(left: SessionCard, right: SessionCard): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
  const activityDifference = right.updatedAt - left.updatedAt
  if (activityDifference !== 0) return activityDifference
  return left.cardId.localeCompare(right.cardId)
}

function compareChildNodes(
  left: SessionCardChild,
  right: SessionCardChild,
): number {
  const activityDifference = right.updatedAt - left.updatedAt
  if (activityDifference !== 0) return activityDifference
  return left.cardId.localeCompare(right.cardId)
}

/**
 * Project normalized backend sessions into stable logical conversation cards.
 * Relationship safety and continuation membership come exclusively from the
 * existing lineage tree; this layer only assigns card identity and view data.
 */
export function projectSessionCards(
  sessions: Array<SessionMeta>,
  options: SessionCardProjectionOptions = {},
): SessionCardProjection {
  const tree = buildSessionTree(sessions, {
    activeSessionKey: options.activeSessionKey,
    maxDepth: options.maxDepth,
  })
  const uniqueSessions = deduplicateSessions(sessions)
  const rowsByKey = new Map(tree.rows.map((row) => [row.key, row]))
  const membersByVisibleKey = new Map<string, Array<SessionMeta>>()

  for (const session of uniqueSessions) {
    const visibleKey = tree.visibleKeyBySessionKey.get(session.key)
    if (!visibleKey) continue
    const members = membersByVisibleKey.get(visibleKey) ?? []
    members.push(session)
    membersByVisibleKey.set(visibleKey, members)
  }

  const cardsByVisibleKey = new Map<string, SessionCard>()
  for (const row of tree.rows) {
    const cardId = cardIdForRow(
      row,
      tree.visibleKeyBySessionKey,
      tree.logicalRootKeyBySessionKey,
    )
    const metadata = options.cardMetadata?.get(cardId)
    const members = orderContinuationMembers(
      membersByVisibleKey.get(row.key) ?? [row.session],
    )
    const title = cardTitle(metadata)

    cardsByVisibleKey.set(row.key, {
      cardId,
      ...title,
      canonicalSegmentKey: row.key,
      continuationSegmentKeys: members.map((member) => member.key),
      continuationCount: row.continuationCount,
      relationshipKind: cardRelationshipKind(row),
      childNodes: [],
      updatedAt: members.reduce(
        (latest, member) => Math.max(latest, sessionActivity(member)),
        0,
      ),
      archived: metadata?.archived === true,
      pinned: false,
    })
  }

  for (const row of tree.rows) {
    if (!row.parentKey) continue
    const card = cardsByVisibleKey.get(row.key)
    const parentCard = cardsByVisibleKey.get(row.parentKey)
    if (!card || !parentCard || card.cardId === parentCard.cardId) continue

    card.parentCardId = parentCard.cardId
    if (
      card.relationshipKind !== 'branch' &&
      card.relationshipKind !== 'child'
    ) {
      continue
    }

    const childActivity = options.childActivityByParentCardId
      ?.get(parentCard.cardId)
      ?.get(card.cardId)
    parentCard.childNodes.push({
      cardId: card.cardId,
      sessionKey: card.canonicalSegmentKey,
      relationshipKind: card.relationshipKind,
      title: card.title,
      status: childActivity?.status ?? 'idle',
      updatedAt: Math.max(card.updatedAt, childActivity?.updatedAt ?? 0),
      continuationCount: card.continuationCount,
    })
  }

  const pinEligibleCardIds = new Set<string>()
  for (const [visibleKey, card] of cardsByVisibleKey) {
    const row = rowsByKey.get(visibleKey)
    const pinEligible =
      card.parentCardId === undefined &&
      !card.archived &&
      row !== undefined &&
      !hasChildRelationshipProvenance(row.session)
    if (pinEligible) pinEligibleCardIds.add(card.cardId)
    card.pinned =
      pinEligible && options.cardMetadata?.get(card.cardId)?.pinned === true
  }

  const cards = [...cardsByVisibleKey.values()].sort(compareCards)
  for (const card of cards) card.childNodes.sort(compareChildNodes)

  const indexByCardId = new Map(cards.map((card) => [card.cardId, card]))
  const cardIdBySessionKey = new Map<string, string>()
  for (const card of cards) {
    cardIdBySessionKey.set(card.cardId, card.cardId)
    cardIdBySessionKey.set(card.canonicalSegmentKey, card.cardId)
    for (const segmentKey of card.continuationSegmentKeys) {
      cardIdBySessionKey.set(segmentKey, card.cardId)
    }
  }
  for (const [sessionKey, visibleKey] of tree.visibleKeyBySessionKey) {
    const card = cardsByVisibleKey.get(visibleKey)
    if (card) cardIdBySessionKey.set(sessionKey, card.cardId)
  }

  const activeCardId = options.activeSessionKey
    ? cardIdBySessionKey.get(options.activeSessionKey)
    : undefined

  return {
    roots: cards.filter((card) => !card.parentCardId),
    cards,
    indexByCardId,
    cardIdBySessionKey,
    pinEligibleCardIds,
    ...(activeCardId ? { activeCardId } : {}),
  }
}
