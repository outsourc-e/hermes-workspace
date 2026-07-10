/**
 * Vault graph insights — the operational layer of the memory galaxy.
 *
 * Pure analysis over the real knowledge graph (notes + wikilink edges).
 * Produces findings and cleanup RECOMMENDATIONS shaped as review inputs.
 * Nothing here edits the vault: Obsidian stays the source of truth and
 * every recommendation must pass through a Fabric review proposal.
 */

export type InsightGraphNode = {
  id: string
  title?: string
  path?: string
  folder?: string
  modified?: string
}

export type InsightGraphEdge = { source: string; target: string }

export type InsightGraph = {
  nodes?: Array<InsightGraphNode>
  edges?: Array<InsightGraphEdge>
}

export type InsightNote = {
  id: string
  title: string
  path: string
  folder: string
  degree: number
  modified: string | null
}

export type MissingBacklink = InsightNote & { inboundOnly: number }

export type DuplicateCandidate = {
  ids: Array<string>
  titles: Array<string>
  normalizedTitle: string
}

export type CleanupRecommendation = {
  kind: 'link-or-archive-orphan' | 'refresh-stale-hub' | 'merge-duplicates'
  title: string
  reason: string
  notePaths: Array<string>
}

export type VaultGraphInsights = {
  generatedAt: string
  totals: { notes: number; edges: number }
  orphans: Array<InsightNote>
  staleImportant: Array<InsightNote>
  missingBacklinks: Array<MissingBacklink>
  duplicateCandidates: Array<DuplicateCandidate>
  recommendations: Array<CleanupRecommendation>
}

const LIST_CAP = 15
const STALE_DAYS = 30
const IMPORTANT_DEGREE = 4
const SINK_INBOUND_THRESHOLD = 3

function toInsightNote(
  node: InsightGraphNode,
  degree: number,
): InsightNote {
  return {
    id: node.id,
    title: node.title ?? node.id,
    path: node.path ?? node.id,
    folder: node.folder ?? '',
    degree,
    modified: node.modified ?? null,
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function buildVaultGraphInsights(
  graph: InsightGraph,
  now?: string,
): VaultGraphInsights {
  const generatedAt = now ?? new Date().toISOString()
  const nowMs = Date.parse(generatedAt)
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []

  const outbound = new Map<string, number>()
  const inbound = new Map<string, number>()
  for (const edge of edges) {
    outbound.set(edge.source, (outbound.get(edge.source) ?? 0) + 1)
    inbound.set(edge.target, (inbound.get(edge.target) ?? 0) + 1)
  }
  const degreeOf = (id: string): number =>
    (outbound.get(id) ?? 0) + (inbound.get(id) ?? 0)

  const orphans: Array<InsightNote> = []
  const staleImportant: Array<InsightNote> = []
  const missingBacklinks: Array<MissingBacklink> = []

  for (const node of nodes) {
    const degree = degreeOf(node.id)
    if (degree === 0) {
      orphans.push(toInsightNote(node, 0))
      continue
    }
    const modifiedMs = node.modified ? Date.parse(node.modified) : Number.NaN
    const ageDays = Number.isFinite(modifiedMs)
      ? (nowMs - modifiedMs) / (24 * 60 * 60 * 1000)
      : null
    if (degree >= IMPORTANT_DEGREE && ageDays !== null && ageDays > STALE_DAYS) {
      staleImportant.push(toInsightNote(node, degree))
    }
    const inboundCount = inbound.get(node.id) ?? 0
    const outboundCount = outbound.get(node.id) ?? 0
    if (inboundCount >= SINK_INBOUND_THRESHOLD && outboundCount === 0) {
      missingBacklinks.push({
        ...toInsightNote(node, degree),
        inboundOnly: inboundCount,
      })
    }
  }

  const byNormalizedTitle = new Map<string, Array<InsightGraphNode>>()
  for (const node of nodes) {
    const normalized = normalizeTitle(node.title ?? node.id)
    if (normalized.length < 4) continue
    const bucket = byNormalizedTitle.get(normalized) ?? []
    bucket.push(node)
    byNormalizedTitle.set(normalized, bucket)
  }
  const duplicateCandidates: Array<DuplicateCandidate> = []
  for (const [normalized, bucket] of byNormalizedTitle) {
    if (bucket.length < 2) continue
    duplicateCandidates.push({
      ids: bucket.map((node) => node.id),
      titles: bucket.map((node) => node.title ?? node.id),
      normalizedTitle: normalized,
    })
  }

  const sortByDegreeDesc = (a: InsightNote, b: InsightNote): number =>
    b.degree - a.degree

  const cappedOrphans = orphans.slice(0, LIST_CAP)
  const cappedStale = staleImportant.sort(sortByDegreeDesc).slice(0, LIST_CAP)
  const cappedMissing = missingBacklinks
    .sort((a, b) => b.inboundOnly - a.inboundOnly)
    .slice(0, LIST_CAP)
  const cappedDuplicates = duplicateCandidates.slice(0, LIST_CAP)

  const recommendations: Array<CleanupRecommendation> = []
  if (cappedOrphans.length > 0) {
    recommendations.push({
      kind: 'link-or-archive-orphan',
      title: `Link or archive ${cappedOrphans.length} orphan note${cappedOrphans.length === 1 ? '' : 's'}`,
      reason:
        'These notes have no wikilinks in or out, so they are invisible to recall and the galaxy.',
      notePaths: cappedOrphans.map((note) => note.path),
    })
  }
  if (cappedStale.length > 0) {
    recommendations.push({
      kind: 'refresh-stale-hub',
      title: `Review ${cappedStale.length} stale hub note${cappedStale.length === 1 ? '' : 's'}`,
      reason: `Heavily-linked notes untouched for over ${STALE_DAYS} days may hold outdated decisions.`,
      notePaths: cappedStale.map((note) => note.path),
    })
  }
  for (const duplicate of cappedDuplicates.slice(0, 5)) {
    recommendations.push({
      kind: 'merge-duplicates',
      title: `Possible duplicates: ${duplicate.titles[0]}`,
      reason: `Notes share the normalized title "${duplicate.normalizedTitle}" and may need merging.`,
      notePaths: duplicate.ids,
    })
  }

  return {
    generatedAt,
    totals: { notes: nodes.length, edges: edges.length },
    orphans: cappedOrphans,
    staleImportant: cappedStale,
    missingBacklinks: cappedMissing,
    duplicateCandidates: cappedDuplicates,
    recommendations,
  }
}
