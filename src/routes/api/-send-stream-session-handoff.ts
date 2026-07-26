export type AuthoritativeStreamHandoff = {
  fromSessionKey: string
  sessionKey: string
}

export type AuthoritativeCardStreamHandoff = {
  cardId: string
  fromSegmentKey: string
  canonicalSegmentKey: string
}

export type VerifiedStreamCard = {
  cardId: string
  canonicalSegmentKey: string
  continuationSegmentKeys: ReadonlyArray<string>
  relationshipKind: 'root' | 'orphan' | 'branch' | 'child'
  parentCardId?: string
  collectionCompleteness: 'complete' | 'incomplete'
}

const SESSION_BOOTSTRAP_KEYS = new Set(['main', 'new'])

export function resolveAuthoritativeBootstrapHandoff(
  requestedSessionKey: string,
  resolvedSessionKey: string,
): AuthoritativeStreamHandoff | null {
  const fromSessionKey = requestedSessionKey.trim()
  const sessionKey = resolvedSessionKey.trim()
  if (
    !SESSION_BOOTSTRAP_KEYS.has(fromSessionKey) ||
    !sessionKey ||
    SESSION_BOOTSTRAP_KEYS.has(sessionKey)
  ) {
    return null
  }
  return { fromSessionKey, sessionKey }
}

export type VerifiedStreamContinuation = {
  requestedSessionId: string
  sessionId: string
  path: ReadonlyArray<string>
  changed: boolean
  supported: boolean
}

type QuarantinedStreamSource = {
  sessionKey?: string
  runId?: string
  sourceIsExplicitlyNonParent: boolean
}

export const STREAM_PROVENANCE_ID_LIMIT = 64

export type StreamEventProvenanceTracker = {
  recordParentRun: (runId?: string) => void
  quarantine: (source: QuarantinedStreamSource) => void
  getTrackedIdentityCount: () => number
  isExplicitlyRejectedSession: (sessionKey: string) => boolean
  isImplicitParentEligible: (
    runId?: string,
    activeParentRunId?: string | null,
  ) => boolean
}

/**
 * Tracks ownership only for one bounded HTTP stream lifecycle. Parent evidence
 * is additive: it never clears rejected-source evidence for an aliased run.
 */
export function createStreamEventProvenanceTracker(): StreamEventProvenanceTracker {
  const trackedIdentities = new Set<string>()
  const parentRunIds = new Set<string>()
  const quarantinedRunIds = new Set<string>()
  const explicitlyRejectedSessionKeys = new Set<string>()
  let observedSourceConflict = false
  let observedUnscopedConflict = false
  let saturated = false

  const normalizedId = (value?: string): string => value?.trim() || ''
  const reserveIdentity = (value: string): boolean => {
    if (!value) return false
    if (trackedIdentities.has(value)) return true
    if (trackedIdentities.size >= STREAM_PROVENANCE_ID_LIMIT) {
      saturated = true
      return false
    }
    trackedIdentities.add(value)
    return true
  }
  const addBounded = (set: Set<string>, value: string): void => {
    if (reserveIdentity(value)) set.add(value)
  }

  return {
    recordParentRun(runId) {
      addBounded(parentRunIds, normalizedId(runId))
    },
    quarantine({ sessionKey, runId, sourceIsExplicitlyNonParent }) {
      observedSourceConflict = true
      const normalizedRunId = normalizedId(runId)
      if (normalizedRunId) addBounded(quarantinedRunIds, normalizedRunId)
      else observedUnscopedConflict = true
      const normalizedSessionKey = normalizedId(sessionKey)
      if (sourceIsExplicitlyNonParent && normalizedSessionKey) {
        addBounded(explicitlyRejectedSessionKeys, normalizedSessionKey)
      }
    },
    getTrackedIdentityCount() {
      return trackedIdentities.size
    },
    isExplicitlyRejectedSession(sessionKey) {
      return (
        saturated || explicitlyRejectedSessionKeys.has(normalizedId(sessionKey))
      )
    },
    isImplicitParentEligible(runId, activeParentRunId) {
      if (saturated || observedUnscopedConflict) return false
      const normalizedRunId = normalizedId(runId)
      if (!normalizedRunId) return !observedSourceConflict
      if (quarantinedRunIds.has(normalizedRunId)) return false
      if (parentRunIds.has(normalizedRunId)) return true

      const normalizedActiveRunId = normalizedId(activeParentRunId || undefined)
      return (
        !observedSourceConflict &&
        (!normalizedActiveRunId || normalizedActiveRunId === normalizedRunId)
      )
    },
  }
}

const CONTINUATION_RELATIONSHIP_TYPES = new Set([
  'continuation',
  'compression_continuation',
])
const SAME_PARENT_SESSION_SOURCES = new Set([
  'api_server',
  'cli',
  'dashboard',
  'desktop',
  'discord',
  'hermes_browser',
  'slack',
  'telegram',
])

function normalizedSameParentSource(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  const canonical = normalized === 'browser' ? 'hermes_browser' : normalized
  return SAME_PARENT_SESSION_SOURCES.has(canonical) ? canonical : null
}

type ParentSourceContext = {
  source?: unknown
  session_source?: unknown
  parent_source?: unknown
}

/**
 * Resolve the source identity from the active backend parent record. Nullable
 * optional fields are ignored because backends commonly serialize absent
 * lineage metadata as null; malformed, unknown, or contradictory facts fail
 * closed. The resulting source is immutable for this bounded stream.
 */
export function resolveActiveParentSource(
  context: ParentSourceContext,
): string | null {
  const sources: Array<string> = []
  for (const key of ['source', 'session_source', 'parent_source'] as const) {
    const value = context[key]
    if (value === undefined || value === null) continue
    const normalized = normalizedSameParentSource(value)
    if (!normalized) return null
    sources.push(normalized)
  }
  if (!sources.length || sources.some((source) => source !== sources[0])) {
    return null
  }
  return sources[0] ?? null
}

export function resolveAuthoritativeSessionSource(
  expectedSessionKey: string,
  context: ParentSourceContext & { id?: unknown },
): string | null {
  const normalizedExpectedSessionKey = expectedSessionKey.trim()
  const normalizedContextSessionKey =
    typeof context.id === 'string' ? context.id.trim() : ''
  if (
    !normalizedExpectedSessionKey ||
    normalizedContextSessionKey !== normalizedExpectedSessionKey
  ) {
    return null
  }
  return resolveActiveParentSource(context)
}

export function hasNonParentStreamFacts(
  data: Record<string, unknown>,
  activeParentSource?: string | null,
): boolean {
  if (Object.prototype.hasOwnProperty.call(data, 'relationship_type')) {
    const relationshipType = data.relationship_type
    if (typeof relationshipType !== 'string') return true
    const normalizedRelationship = relationshipType.trim().toLowerCase()
    if (
      !normalizedRelationship ||
      !CONTINUATION_RELATIONSHIP_TYPES.has(normalizedRelationship)
    ) {
      return true
    }
  }

  const normalizedSources: Array<string> = []
  for (const key of ['session_source', 'source', 'parent_source'] as const) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    const normalized = normalizedSameParentSource(data[key])
    if (!normalized) return true
    normalizedSources.push(normalized)
  }
  if (normalizedSources.some((source) => source !== normalizedSources[0])) {
    return true
  }

  if (activeParentSource !== undefined && activeParentSource !== null) {
    const normalizedParentSource =
      normalizedSameParentSource(activeParentSource)
    if (
      !normalizedParentSource ||
      normalizedSources.some((source) => source !== normalizedParentSource)
    ) {
      return true
    }
  }

  const isCrossSurfaceChild = data._cross_surface_child_session
  return (
    isCrossSurfaceChild === true ||
    (isCrossSurfaceChild !== undefined &&
      isCrossSurfaceChild !== null &&
      typeof isCrossSurfaceChild !== 'boolean')
  )
}

function confirmsContinuation(
  fromSessionKey: string,
  sessionKey: string,
  verification: VerifiedStreamContinuation | null,
): boolean {
  if (
    !verification ||
    verification.supported !== true ||
    verification.changed !== true ||
    verification.requestedSessionId !== fromSessionKey ||
    verification.sessionId !== sessionKey ||
    !Array.isArray(verification.path) ||
    verification.path.length < 2
  ) {
    return false
  }

  const path = verification.path
  if (
    path[0] !== fromSessionKey ||
    path[path.length - 1] !== sessionKey ||
    path.some(
      (entry) =>
        typeof entry !== 'string' || !entry.trim() || entry.trim() !== entry,
    )
  ) {
    return false
  }
  return new Set(path).size === path.length
}

/**
 * A changed upstream session_id is only a handoff candidate. The caller must
 * also supply an authoritative backend continuation result and exact-session
 * source facts for both endpoints. Explicit child, worker, fork, cross-surface,
 * unknown, or malformed relation facts always fail closed; parent_session_id
 * alone is not proof.
 */
export function resolveAuthoritativeStreamHandoff(
  currentSessionKey: string,
  data: Record<string, unknown>,
  verification: VerifiedStreamContinuation | null,
  activeParentSource: string | null | undefined,
  targetSessionSource: string | null | undefined,
): AuthoritativeStreamHandoff | null {
  const fromSessionKey = currentSessionKey.trim()
  const sessionKey =
    typeof data.session_id === 'string' ? data.session_id.trim() : ''
  const normalizedParentSource = normalizedSameParentSource(activeParentSource)
  const normalizedTargetSource = normalizedSameParentSource(targetSessionSource)
  if (
    !fromSessionKey ||
    !sessionKey ||
    !normalizedParentSource ||
    !normalizedTargetSource ||
    normalizedTargetSource !== normalizedParentSource ||
    SESSION_BOOTSTRAP_KEYS.has(sessionKey) ||
    sessionKey === fromSessionKey ||
    hasNonParentStreamFacts(data, normalizedParentSource) ||
    !confirmsContinuation(fromSessionKey, sessionKey, verification)
  ) {
    return null
  }
  return { fromSessionKey, sessionKey }
}

function isParentCard(card: VerifiedStreamCard): boolean {
  return (
    (card.relationshipKind === 'root' || card.relationshipKind === 'orphan') &&
    card.parentCardId === undefined &&
    card.collectionCompleteness === 'complete' &&
    card.cardId.trim().length > 0 &&
    card.canonicalSegmentKey.trim().length > 0 &&
    card.continuationSegmentKeys.length > 0 &&
    card.continuationSegmentKeys.every(
      (segmentKey) =>
        typeof segmentKey === 'string' &&
        segmentKey.trim().length > 0 &&
        segmentKey.trim() === segmentKey,
    )
  )
}

/**
 * A parent card can rotate its concrete segment only after fresh card
 * projection confirms both segments belong to the same complete parent card.
 * Stream event claims alone never confer card ownership.
 */
export function resolveAuthoritativeCardStreamHandoff(
  currentSegmentKey: string,
  data: Record<string, unknown>,
  currentCard: VerifiedStreamCard | null,
  successorCard: VerifiedStreamCard | null,
): AuthoritativeCardStreamHandoff | null {
  const fromSegmentKey = currentSegmentKey.trim()
  const canonicalSegmentKey =
    typeof data.session_id === 'string' ? data.session_id.trim() : ''
  if (
    !fromSegmentKey ||
    !canonicalSegmentKey ||
    canonicalSegmentKey === fromSegmentKey ||
    SESSION_BOOTSTRAP_KEYS.has(canonicalSegmentKey) ||
    hasNonParentStreamFacts(data) ||
    !currentCard ||
    !successorCard ||
    !isParentCard(currentCard) ||
    !isParentCard(successorCard) ||
    currentCard.cardId !== successorCard.cardId ||
    successorCard.canonicalSegmentKey !== canonicalSegmentKey ||
    !successorCard.continuationSegmentKeys.includes(fromSegmentKey) ||
    !successorCard.continuationSegmentKeys.includes(canonicalSegmentKey)
  ) {
    return null
  }

  return {
    cardId: successorCard.cardId,
    fromSegmentKey,
    canonicalSegmentKey,
  }
}
