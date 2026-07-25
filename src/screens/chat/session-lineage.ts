import type {
  SessionMeta,
  SessionRelationshipKind,
  SessionTree,
  SessionTreeRow,
} from './types'

const DEFAULT_MAX_DEPTH = 64
const LOCAL_SOURCES = new Set(['local', 'portable'])
const CONTINUATION_RELATIONSHIP_TYPES = new Set([
  'continuation',
  'compression_continuation',
])
const CONTINUATION_END_REASONS = new Set(['compression', 'cli_close'])

type BuildSessionTreeOptions = {
  activeSessionKey?: string
  expandedSessionKeys?: Iterable<string>
  maxDepth?: number
}

type LogicalNode = {
  key: string
  session: SessionMeta
  relationshipKind: SessionRelationshipKind
  parentKey?: string
  continuationCount: number
  activity: number
}

function normalizedSource(value: string | undefined): string | undefined {
  const source = value?.trim().toLowerCase()
  return source || undefined
}

function isLocalOrPortable(session: SessionMeta): boolean {
  const source = normalizedSource(session.lineage?.source)
  return source ? LOCAL_SOURCES.has(source) : false
}

function hasUnsafeAncestorPath(
  session: SessionMeta,
  sessionsById: ReadonlyMap<string, SessionMeta>,
  maxDepth: number,
): boolean {
  const visited = new Set([session.key])
  let current = session

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parentId = current.lineage?.parentSessionId
    if (!parentId) return false
    if (visited.has(parentId)) return true

    const parent = sessionsById.get(parentId)
    if (!parent) return false
    visited.add(parentId)
    current = parent
  }

  return Boolean(current.lineage?.parentSessionId)
}

function lineageSourcesConflict(
  session: SessionMeta,
  parent: SessionMeta,
): boolean {
  const childSource = normalizedSource(
    session.lineage?.source ?? session.lineage?.sessionSource,
  )
  const parentSource = normalizedSource(
    session.lineage?.parentSource ??
      parent.lineage?.source ??
      parent.lineage?.sessionSource,
  )
  return Boolean(childSource && parentSource && childSource !== parentSource)
}

function hasAuthoritativeContinuationMetadata(
  session: SessionMeta,
  parent: SessionMeta,
): boolean {
  const lineage = session.lineage
  if (!lineage || lineageSourcesConflict(session, parent)) return false

  if (
    lineage.relationshipType &&
    CONTINUATION_RELATIONSHIP_TYPES.has(lineage.relationshipType)
  ) {
    return true
  }
  if (parent.lineage?.lineageTipId === session.key) return true

  const parentRoot = parent.lineage?.lineageRootId ?? parent.key
  const hasMatchingRoot = lineage.lineageRootId === parentRoot
  const hasLineageDeclaration =
    Boolean(lineage.lineageTipId) ||
    typeof lineage.compressionSegmentCount === 'number'
  return hasMatchingRoot && hasLineageDeclaration
}

function hasValidLifecycleContinuation(
  session: SessionMeta,
  parent: SessionMeta,
): boolean {
  const childLineage = session.lineage
  const parentLineage = parent.lineage
  if (!childLineage || !parentLineage) return false

  const childSource = normalizedSource(
    childLineage.source ?? childLineage.sessionSource,
  )
  const parentSource = normalizedSource(
    childLineage.parentSource ??
      parentLineage.source ??
      parentLineage.sessionSource,
  )
  if (!childSource || !parentSource || childSource !== parentSource)
    return false

  const endReason = parentLineage.endReason?.trim().toLowerCase()
  if (!endReason || !CONTINUATION_END_REASONS.has(endReason)) return false

  const endedAt = parentLineage.endedAt
  const startedAt = childLineage.startedAt
  return (
    typeof endedAt === 'number' &&
    Number.isFinite(endedAt) &&
    typeof startedAt === 'number' &&
    Number.isFinite(startedAt) &&
    startedAt >= endedAt
  )
}

/**
 * Classify one normalized session without mutating it or inferring a relation
 * from parentSessionId alone.
 */
export function classifySessionRelationship(
  session: SessionMeta,
  sessionsById: ReadonlyMap<string, SessionMeta>,
  options?: { maxDepth?: number },
): SessionRelationshipKind {
  if (isLocalOrPortable(session)) return 'root'

  const lineage = session.lineage
  const parentId = lineage?.parentSessionId
  if (!parentId) {
    // A backend can retain child/fork context when its parent is absent from
    // this page or surface. Keep that session discoverable as an orphan
    // instead of silently promoting it to an unrelated root.
    if (
      lineage?.sessionSource?.trim().toLowerCase() === 'fork' ||
      lineage?.relationshipType === 'child_session' ||
      lineage?.isCrossSurfaceChild === true ||
      lineage?.parentTitle ||
      lineage?.parentSource
    ) {
      return 'orphan'
    }
    return 'root'
  }

  const parent = sessionsById.get(parentId)
  if (!parent || parent.key === session.key) return 'orphan'

  const maxDepth = Math.max(1, options?.maxDepth ?? DEFAULT_MAX_DEPTH)
  if (hasUnsafeAncestorPath(session, sessionsById, maxDepth)) return 'orphan'

  if (lineage.sessionSource?.trim().toLowerCase() === 'fork') return 'branch'
  if (lineage.relationshipType === 'child_session') return 'child'
  if (lineage.isCrossSurfaceChild === true) return 'child'
  if (hasAuthoritativeContinuationMetadata(session, parent)) {
    return 'continuation'
  }

  // An explicit but unrecognized backend relation is authoritative: do not
  // reinterpret it as a compression edge using lifecycle heuristics.
  if (lineage.relationshipType) return 'orphan'

  return hasValidLifecycleContinuation(session, parent)
    ? 'continuation'
    : 'orphan'
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
  const byKey = new Map<string, SessionMeta>()
  for (const session of sessions) {
    if (!session.key) continue
    const existing = byKey.get(session.key)
    if (!existing || sessionActivity(session) > sessionActivity(existing)) {
      byKey.set(session.key, session)
    }
  }
  return [...byKey.values()]
}

function compareTipCandidates(
  a: SessionMeta,
  b: SessionMeta,
  declaredTipIds: ReadonlySet<string>,
): number {
  const aDeclared = declaredTipIds.has(a.key) ? 1 : 0
  const bDeclared = declaredTipIds.has(b.key) ? 1 : 0
  if (aDeclared !== bDeclared) return bDeclared - aDeclared

  const aSegments = a.lineage?.compressionSegmentCount ?? 0
  const bSegments = b.lineage?.compressionSegmentCount ?? 0
  if (aSegments !== bSegments) return bSegments - aSegments

  const aNotSnapshot = a.lineage?.isPreCompressionSnapshot === true ? 0 : 1
  const bNotSnapshot = b.lineage?.isPreCompressionSnapshot === true ? 0 : 1
  if (aNotSnapshot !== bNotSnapshot) return bNotSnapshot - aNotSnapshot

  const activityDifference = sessionActivity(b) - sessionActivity(a)
  if (activityDifference !== 0) return activityDifference
  return a.key.localeCompare(b.key)
}

function compareLogicalNodes(a: LogicalNode, b: LogicalNode): number {
  const activityDifference = b.activity - a.activity
  if (activityDifference !== 0) return activityDifference
  return a.key.localeCompare(b.key)
}

/**
 * Collapse only confirmed continuation components and project all remaining
 * relationships into a stable, bounded tree suitable for presentation.
 */
export function buildSessionTree(
  sessions: Array<SessionMeta>,
  options: BuildSessionTreeOptions = {},
): SessionTree {
  const uniqueSessions = deduplicateSessions(sessions)
  const sessionsById = new Map(
    uniqueSessions.map((session) => [session.key, session]),
  )
  const maxDepth = Math.max(0, options.maxDepth ?? DEFAULT_MAX_DEPTH)
  const classificationDepth = Math.max(maxDepth + 1, DEFAULT_MAX_DEPTH)
  const kinds = new Map<string, SessionRelationshipKind>()
  for (const session of uniqueSessions) {
    kinds.set(
      session.key,
      classifySessionRelationship(session, sessionsById, {
        maxDepth: classificationDepth,
      }),
    )
  }

  const unionParent = new Map<string, string>()
  const find = (key: string): string => {
    let root = unionParent.get(key) ?? key
    while ((unionParent.get(root) ?? root) !== root) {
      root = unionParent.get(root) ?? root
    }
    let current = key
    while ((unionParent.get(current) ?? current) !== root) {
      const next = unionParent.get(current) ?? current
      unionParent.set(current, root)
      current = next
    }
    return root
  }
  const union = (left: string, right: string): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) unionParent.set(rightRoot, leftRoot)
  }

  for (const session of uniqueSessions) {
    unionParent.set(session.key, session.key)
  }
  for (const session of uniqueSessions) {
    const parentId = session.lineage?.parentSessionId
    if (kinds.get(session.key) === 'continuation' && parentId) {
      union(session.key, parentId)
    }
  }

  const components = new Map<string, Array<SessionMeta>>()
  for (const session of uniqueSessions) {
    const componentKey = find(session.key)
    const members = components.get(componentKey) ?? []
    members.push(session)
    components.set(componentKey, members)
  }

  const visibleKeyBySessionKey = new Map<string, string>()
  const logicalRootKeyBySessionKey = new Map<string, string>()
  const logicalNodes = new Map<string, LogicalNode>()
  for (const members of components.values()) {
    const declaredTipIds = new Set(
      members
        .map((member) => member.lineage?.lineageTipId)
        .filter((key): key is string => Boolean(key)),
    )
    const sortedCandidates = [...members].sort((a, b) =>
      compareTipCandidates(a, b, declaredTipIds),
    )
    const selected = sortedCandidates[0]
    if (!selected) continue

    for (const member of members) {
      visibleKeyBySessionKey.set(member.key, selected.key)
    }

    const memberIds = new Set(members.map((member) => member.key))
    const anchor =
      members.find((member) => kinds.get(member.key) !== 'continuation') ??
      members.find(
        (member) =>
          !member.lineage?.parentSessionId ||
          !memberIds.has(member.lineage.parentSessionId),
      ) ??
      selected
    const anchorKind = kinds.get(anchor.key) ?? 'orphan'
    for (const member of members) {
      logicalRootKeyBySessionKey.set(member.key, anchor.key)
    }
    const declaredSegmentCount = members.reduce(
      (largest, member) =>
        Math.max(largest, member.lineage?.compressionSegmentCount ?? 0),
      0,
    )
    const activity = members.reduce(
      (latest, member) => Math.max(latest, sessionActivity(member)),
      0,
    )

    logicalNodes.set(selected.key, {
      key: selected.key,
      session: selected,
      relationshipKind: anchorKind === 'continuation' ? 'orphan' : anchorKind,
      parentKey: anchor.lineage?.parentSessionId,
      continuationCount: Math.max(members.length, declaredSegmentCount),
      activity,
    })
  }

  for (const node of logicalNodes.values()) {
    if (
      !node.parentKey ||
      node.relationshipKind === 'orphan' ||
      node.relationshipKind === 'root'
    ) {
      node.parentKey = undefined
      continue
    }
    const visibleParentKey = visibleKeyBySessionKey.get(node.parentKey)
    if (!visibleParentKey || visibleParentKey === node.key) {
      node.relationshipKind = 'orphan'
      node.parentKey = undefined
      continue
    }
    node.parentKey = visibleParentKey
  }

  // Promote corrupt, cyclic, or over-depth logical nodes to visible orphans.
  for (const node of logicalNodes.values()) {
    const visited = new Set([node.key])
    let parentKey = node.parentKey
    let depth = 0
    let unsafe = false
    while (parentKey) {
      depth += 1
      if (visited.has(parentKey) || depth > maxDepth) {
        unsafe = true
        break
      }
      visited.add(parentKey)
      parentKey = logicalNodes.get(parentKey)?.parentKey
    }
    if (unsafe) {
      node.relationshipKind = 'orphan'
      node.parentKey = undefined
    }
  }

  const childrenByParent = new Map<string, Array<LogicalNode>>()
  const rootNodes: Array<LogicalNode> = []
  for (const node of logicalNodes.values()) {
    if (!node.parentKey) {
      rootNodes.push(node)
      continue
    }
    const children = childrenByParent.get(node.parentKey) ?? []
    children.push(node)
    childrenByParent.set(node.parentKey, children)
  }
  rootNodes.sort(compareLogicalNodes)
  for (const children of childrenByParent.values()) {
    children.sort(compareLogicalNodes)
  }

  const expandedAncestorIds = new Set<string>()
  for (const key of options.expandedSessionKeys ?? []) {
    const visibleKey = visibleKeyBySessionKey.get(key) ?? key
    if (logicalNodes.has(visibleKey)) expandedAncestorIds.add(visibleKey)
  }
  if (options.activeSessionKey) {
    const visibleActiveKey =
      visibleKeyBySessionKey.get(options.activeSessionKey) ??
      options.activeSessionKey
    if (
      visibleActiveKey !== options.activeSessionKey &&
      logicalNodes.has(visibleActiveKey)
    ) {
      expandedAncestorIds.add(visibleActiveKey)
    }
    let parentKey = logicalNodes.get(visibleActiveKey)?.parentKey
    const visited = new Set<string>()
    while (parentKey && !visited.has(parentKey)) {
      visited.add(parentKey)
      expandedAncestorIds.add(parentKey)
      parentKey = logicalNodes.get(parentKey)?.parentKey
    }
  }

  const rows: Array<SessionTreeRow> = []
  const indexByKey = new Map<string, SessionTreeRow>()
  const appendRows = (
    nodes: Array<LogicalNode>,
    depth: number,
    parentKey?: string,
  ): void => {
    for (const node of nodes) {
      const children = childrenByParent.get(node.key) ?? []
      const row: SessionTreeRow = {
        key: node.key,
        session: node.session,
        relationshipKind: node.relationshipKind,
        depth,
        isExpandable: children.length > 0,
        isExpanded: expandedAncestorIds.has(node.key),
        childCount: children.length,
        continuationCount: node.continuationCount,
        ...(parentKey ? { parentKey } : {}),
        isOrphan: node.relationshipKind === 'orphan',
      }
      rows.push(row)
      indexByKey.set(row.key, row)
      appendRows(children, depth + 1, node.key)
    }
  }
  appendRows(rootNodes, 0)

  return {
    roots: rootNodes
      .map((node) => indexByKey.get(node.key))
      .filter((row): row is SessionTreeRow => Boolean(row)),
    rows,
    indexByKey,
    visibleKeyBySessionKey,
    logicalRootKeyBySessionKey,
    expandedAncestorIds,
  }
}
