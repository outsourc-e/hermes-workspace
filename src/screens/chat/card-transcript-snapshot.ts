import { sanitizeCardOwnedMessage } from './card-transcript-recovery'
import type { ChatMessage } from './types'

export const CARD_TRANSCRIPT_SNAPSHOT_PREFIX =
  'workspace.card-transcript-snapshot.v3'
const OBSOLETE_SNAPSHOT_PREFIX = 'workspace.card-transcript-snapshot.v1:'
const OBSOLETE_DISCARD_MARKER = `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:obsolete-v1-discarded`
const CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS = 512 * 1024
const CARD_TRANSCRIPT_SNAPSHOT_MAX_CHUNKS = 100_000
const SNAPSHOT_CONTEXT_STORAGE_KEY = `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:tab-context`

export type CardTranscriptSnapshotEnvelope = {
  version: 3
  cardId: string
  savedAt: number
  revision: number
  messages: Array<ChatMessage>
}

type SnapshotChunkRef = {
  key: string
  charLength: number
  checksum: string
}

type CardTranscriptSnapshotCommit = {
  version: 3
  kind: 'commit'
  cardId: string
  commitId: string
  contextId: string
  savedAt: number
  revision: number
  messageCount: number
  serializedLength: number
  checksum: string
  chunkRefs: Array<SnapshotChunkRef>
}

type CardTranscriptSnapshotChunk = {
  version: 3
  kind: 'chunk'
  cardId: string
  charLength: number
  checksum: string
  data: string
}

type CardTranscriptSnapshotAggregate = {
  version: 3
  kind: 'aggregate'
  cardId: string
  savedAt: number
  revision: number
  commitKeys: Array<string>
}

type StoredCommit = {
  index: CardTranscriptSnapshotCommit
  raw: string
  payloadRaw: string
  messages: Array<ChatMessage>
}

type AggregateState = {
  aggregate: CardTranscriptSnapshotAggregate
  raw: string
  commits: Map<string, StoredCommit>
  projection: Array<ChatMessage>
}

type LockManagerLike = {
  request: <T>(name: string, callback: () => T | Promise<T>) => Promise<T>
}

type PublishResult =
  | { ok: true; envelope: CardTranscriptSnapshotEnvelope }
  | { ok: false; quota: boolean }

type SnapshotCompaction = {
  rollback: () => void
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validCardId(cardId: string): boolean {
  return cardId === cardId.trim() && /^(?:local|remote):\S+$/.test(cardId)
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validSavedAt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function validSnapshotMessage(value: unknown): value is ChatMessage {
  if (!record(value)) return false
  if (value.content !== undefined && !Array.isArray(value.content)) return false
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) {
    return false
  }
  return true
}

export function cardTranscriptSnapshotStorageKey(cardId: string): string {
  return `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:${encodeURIComponent(cardId)}`
}

function aggregateKey(cardId: string): string {
  return `${cardTranscriptSnapshotStorageKey(cardId)}:aggregate`
}

function commitPrefix(cardId: string): string {
  return `${cardTranscriptSnapshotStorageKey(cardId)}:commit:`
}

function chunkPrefix(cardId: string): string {
  return `${cardTranscriptSnapshotStorageKey(cardId)}:chunk:`
}

function storageKeys(storage: Storage): Array<string> {
  const keys: Array<string> = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null) keys.push(key)
  }
  return keys
}

/**
 * This development-only format reset deliberately discards obsolete snapshot
 * keys without reading or interpreting their values. Recovery and send journals
 * use different namespaces and are never candidates for removal.
 */
function discardObsoleteSnapshots(storage: Storage): void {
  try {
    if (storage.getItem(OBSOLETE_DISCARD_MARKER) === 'done') return
  } catch {
    return
  }
  try {
    for (const key of storageKeys(storage)) {
      if (key.startsWith(OBSOLETE_SNAPSHOT_PREFIX)) storage.removeItem(key)
    }
    storage.setItem(OBSOLETE_DISCARD_MARKER, 'done')
  } catch {
    // A denied cleanup cannot authorize reading obsolete data.
  }
}

function browserPersistentStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const local = window.localStorage
    discardObsoleteSnapshots(local)
    try {
      const session = window.sessionStorage
      if (session !== local) discardObsoleteSnapshots(session)
    } catch {
      // Obsolete tab-scoped data cannot interfere with the persistent v3 store.
    }
    return local
  } catch {
    return null
  }
}

/**
 * Keep one writer identity for the lifetime of a browser tab. Reloading must
 * not create an unbounded sequence of duplicate snapshot contexts.
 */
function snapshotContextId(): string {
  if (typeof window !== 'undefined') {
    try {
      const session = window.sessionStorage
      const existing = session.getItem(SNAPSHOT_CONTEXT_STORAGE_KEY)
      if (typeof existing === 'string' && existing.trim()) return existing
      const created = Math.random().toString(36).slice(2) || 'snapshot-context'
      session.setItem(SNAPSHOT_CONTEXT_STORAGE_KEY, created)
      if (session.getItem(SNAPSHOT_CONTEXT_STORAGE_KEY) === created) {
        return created
      }
    } catch {
      // Fall through to an isolated, non-destructive fallback context.
    }
  }
  return Math.random().toString(36).slice(2) || 'snapshot-context'
}

function canonicalSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSnapshotValue)
  if (!record(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .flatMap((key) => {
        const nested = value[key]
        if (
          nested === undefined ||
          typeof nested === 'function' ||
          typeof nested === 'symbol'
        ) {
          return []
        }
        return [[key, canonicalSnapshotValue(nested)]]
      }),
  )
}

function canonicalSerialized(value: unknown): string | null {
  try {
    return JSON.stringify(canonicalSnapshotValue(value))
  } catch {
    return null
  }
}

function sameSnapshotMessages(
  left: Array<ChatMessage>,
  right: Array<ChatMessage>,
): boolean {
  const leftRaw = canonicalSerialized(left)
  return leftRaw !== null && leftRaw === canonicalSerialized(right)
}

function checksum(value: string): string {
  let first = 2166136261
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first ^= code
    first = Math.imul(first, 16777619)
    second ^= code + 0x9e3779b9 + (second << 6) + (second >>> 2)
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`
}

function splitPayload(payloadRaw: string): Array<string> {
  const chunks: Array<string> = []
  for (
    let start = 0;
    start < payloadRaw.length;
    start += CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS
  ) {
    let end = Math.min(
      payloadRaw.length,
      start + CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS,
    )
    const finalCode = payloadRaw.charCodeAt(end - 1)
    if (end < payloadRaw.length && finalCode >= 0xd800 && finalCode <= 0xdbff) {
      end -= 1
    }
    chunks.push(payloadRaw.slice(start, end))
    start = end - CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS
  }
  return chunks
}

function transactionId(revision: number): string {
  const random = Math.random().toString(36).slice(2)
  return `${revision.toString(36)}-${random || 'snapshot'}`
}

function parseChunk(
  raw: string,
  cardId: string,
): CardTranscriptSnapshotChunk | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !record(value) ||
    value.version !== 3 ||
    value.kind !== 'chunk' ||
    value.cardId !== cardId ||
    typeof value.data !== 'string' ||
    !nonnegativeSafeInteger(value.charLength) ||
    value.data.length !== value.charLength ||
    typeof value.checksum !== 'string' ||
    checksum(value.data) !== value.checksum
  ) {
    return null
  }
  return value as CardTranscriptSnapshotChunk
}

function parseCommit(
  raw: string,
  cardId: string,
  key: string,
): CardTranscriptSnapshotCommit | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !record(value) ||
    value.version !== 3 ||
    value.kind !== 'commit' ||
    value.cardId !== cardId ||
    typeof value.commitId !== 'string' ||
    key !== `${commitPrefix(cardId)}${value.commitId}` ||
    typeof value.contextId !== 'string' ||
    !validSavedAt(value.savedAt) ||
    !positiveSafeInteger(value.revision) ||
    !nonnegativeSafeInteger(value.messageCount) ||
    !positiveSafeInteger(value.serializedLength) ||
    typeof value.checksum !== 'string' ||
    !Array.isArray(value.chunkRefs) ||
    value.chunkRefs.length === 0 ||
    value.chunkRefs.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHUNKS
  ) {
    return null
  }
  const refs = value.chunkRefs as Array<unknown>
  if (
    refs.some(
      (ref) =>
        !record(ref) ||
        typeof ref.key !== 'string' ||
        !ref.key.startsWith(chunkPrefix(cardId)) ||
        !positiveSafeInteger(ref.charLength) ||
        typeof ref.checksum !== 'string',
    )
  ) {
    return null
  }
  return value as CardTranscriptSnapshotCommit
}

function parseAggregate(
  raw: string,
  cardId: string,
): CardTranscriptSnapshotAggregate | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !record(value) ||
    value.version !== 3 ||
    value.kind !== 'aggregate' ||
    value.cardId !== cardId ||
    !validSavedAt(value.savedAt) ||
    !positiveSafeInteger(value.revision) ||
    !Array.isArray(value.commitKeys) ||
    value.commitKeys.length === 0 ||
    value.commitKeys.some(
      (key) => typeof key !== 'string' || !key.startsWith(commitPrefix(cardId)),
    ) ||
    new Set(value.commitKeys).size !== value.commitKeys.length
  ) {
    return null
  }
  return value as CardTranscriptSnapshotAggregate
}

function readStoredCommit(
  storage: Storage,
  cardId: string,
  key: string,
): StoredCommit | null {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  const index = parseCommit(raw, cardId, key)
  if (!index) return null

  const chunks: Array<string> = []
  let serializedLength = 0
  for (const ref of index.chunkRefs) {
    let chunkRaw: string | null
    try {
      chunkRaw = storage.getItem(ref.key)
    } catch {
      return null
    }
    if (!chunkRaw) return null
    const chunk = parseChunk(chunkRaw, cardId)
    if (
      !chunk ||
      chunk.charLength !== ref.charLength ||
      chunk.checksum !== ref.checksum
    ) {
      return null
    }
    chunks.push(chunk.data)
    serializedLength += chunk.data.length
    if (serializedLength > index.serializedLength) return null
  }
  const payloadRaw = chunks.join('')
  if (
    payloadRaw.length !== index.serializedLength ||
    checksum(payloadRaw) !== index.checksum
  ) {
    return null
  }
  let parsedMessages: unknown
  try {
    parsedMessages = JSON.parse(payloadRaw)
  } catch {
    return null
  }
  if (
    !Array.isArray(parsedMessages) ||
    parsedMessages.length !== index.messageCount
  ) {
    return null
  }
  const messages = parsedMessages.map((message) =>
    sanitizeCardOwnedMessage(message as ChatMessage),
  )
  if (messages.some((message) => !validSnapshotMessage(message))) return null
  return { index, raw, payloadRaw, messages }
}

function snapshotMessageBaseIdentity(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of [
    'runId',
    'run_id',
    'providerRunId',
    'provider_run_id',
    'stableId',
    'stable_id',
    'clientId',
    'client_id',
    'idempotencyKey',
    'id',
    'messageId',
    'message_id',
  ]) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) {
      return `${message.role ?? 'unknown'}:${key}:${value.trim()}`
    }
  }
  const serialized = canonicalSerialized(message) ?? ''
  return `${message.role ?? 'unknown'}:value:${checksum(serialized)}`
}

function aggregateProjection(commits: Array<StoredCommit>): Array<ChatMessage> {
  const byIdentity = new Map<string, ChatMessage>()
  for (const commit of commits) {
    const occurrences = new Map<string, number>()
    for (const message of commit.messages) {
      const baseIdentity = snapshotMessageBaseIdentity(message)
      const occurrence = occurrences.get(baseIdentity) ?? 0
      occurrences.set(baseIdentity, occurrence + 1)
      byIdentity.set(`${baseIdentity}:occurrence:${occurrence}`, message)
    }
  }
  return [...byIdentity.values()]
}

function readAggregateState(
  storage: Storage,
  cardId: string,
): AggregateState | null {
  let raw: string | null
  try {
    raw = storage.getItem(aggregateKey(cardId))
  } catch {
    return null
  }
  if (!raw) return null
  const aggregate = parseAggregate(raw, cardId)
  if (!aggregate) return null
  const commits = new Map<string, StoredCommit>()
  for (const key of aggregate.commitKeys) {
    const commit = readStoredCommit(storage, cardId, key)
    if (!commit) return null
    commits.set(key, commit)
  }
  return {
    aggregate,
    raw,
    commits,
    projection: aggregateProjection(
      aggregate.commitKeys.map((key) => commits.get(key)!),
    ),
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.code === 22)
  )
}

function restoreAggregate(
  storage: Storage,
  cardId: string,
  previousRaw: string | null,
): void {
  try {
    if (previousRaw === null) storage.removeItem(aggregateKey(cardId))
    else storage.setItem(aggregateKey(cardId), previousRaw)
  } catch {
    // The previous commits/chunks remain intact even if restoration is denied.
  }
}

function removeKeys(storage: Storage, keys: Iterable<string>): void {
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      // Retaining an unreferenced v3 record is safer than broad cleanup.
    }
  }
}

function writeVerifiedChunk(
  storage: Storage,
  cardId: string,
  commitId: string,
  data: string,
  newlyWritten: Set<string>,
): SnapshotChunkRef {
  const chunkChecksum = checksum(data)
  const baseKey = `${chunkPrefix(cardId)}${chunkChecksum}:${data.length.toString(36)}`
  let key = baseKey
  let existingRaw = storage.getItem(key)
  if (existingRaw !== null) {
    const existing = parseChunk(existingRaw, cardId)
    if (existing?.data === data) {
      return { key, charLength: data.length, checksum: chunkChecksum }
    }
    key = `${baseKey}:${commitId}`
    existingRaw = storage.getItem(key)
    if (existingRaw !== null) {
      const collision = parseChunk(existingRaw, cardId)
      if (collision?.data === data) {
        return { key, charLength: data.length, checksum: chunkChecksum }
      }
      throw new Error('Card transcript snapshot chunk collision')
    }
  }
  const chunk: CardTranscriptSnapshotChunk = {
    version: 3,
    kind: 'chunk',
    cardId,
    charLength: data.length,
    checksum: chunkChecksum,
    data,
  }
  const raw = JSON.stringify(chunk)
  storage.setItem(key, raw)
  newlyWritten.add(key)
  if (storage.getItem(key) !== raw) {
    throw new Error('Card transcript snapshot chunk read-back failed')
  }
  return { key, charLength: data.length, checksum: chunkChecksum }
}

function publishAggregate(
  storage: Storage,
  cardId: string,
  aggregate: CardTranscriptSnapshotAggregate,
): AggregateState | null {
  const raw = JSON.stringify(aggregate)
  storage.setItem(aggregateKey(cardId), raw)
  if (storage.getItem(aggregateKey(cardId)) !== raw) return null
  const state = readAggregateState(storage, cardId)
  return state?.raw === raw ? state : null
}

function publishCandidate(
  storage: Storage,
  cardId: string,
  messages: Array<ChatMessage>,
  contextId: string,
  cleanupOnFailure: boolean,
): PublishResult {
  const previous = readAggregateState(storage, cardId)
  let existingAggregateRaw: string | null
  try {
    existingAggregateRaw = storage.getItem(aggregateKey(cardId))
  } catch {
    return { ok: false, quota: false }
  }
  // A nonempty v3 aggregate is authoritative even when one of its commits or
  // chunks can no longer be read. Do not replace that reference set with a new
  // one: callers must retain recovery and fail closed instead.
  if (!previous && existingAggregateRaw !== null) {
    return { ok: false, quota: false }
  }
  const previousRaw = previous?.raw ?? null
  const payloadRaw = canonicalSerialized(messages)
  if (!payloadRaw || payloadRaw === '[]') return { ok: false, quota: false }
  const ownedEquivalent = previous?.aggregate.commitKeys
    .map((key) => previous.commits.get(key)!)
    .find(
      (commit) =>
        commit.index.contextId === contextId &&
        commit.payloadRaw === payloadRaw,
    )
  if (ownedEquivalent) {
    return {
      ok: true,
      envelope: {
        version: 3,
        cardId,
        savedAt: ownedEquivalent.index.savedAt,
        revision: ownedEquivalent.index.revision,
        messages: ownedEquivalent.messages,
      },
    }
  }
  const revision = (previous?.aggregate.revision ?? 0) + 1
  const savedAt = Date.now()
  if (!positiveSafeInteger(revision) || !validSavedAt(savedAt)) {
    return { ok: false, quota: false }
  }
  const chunks = splitPayload(payloadRaw)
  if (
    chunks.length === 0 ||
    chunks.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHUNKS
  ) {
    return { ok: false, quota: false }
  }

  const commitId = transactionId(revision)
  const commitKey = `${commitPrefix(cardId)}${commitId}`
  const newlyWritten = new Set<string>()
  let commitWritten = false
  try {
    const chunkRefs = chunks.map((chunk) =>
      writeVerifiedChunk(storage, cardId, commitId, chunk, newlyWritten),
    )
    const commit: CardTranscriptSnapshotCommit = {
      version: 3,
      kind: 'commit',
      cardId,
      commitId,
      contextId,
      savedAt,
      revision,
      messageCount: messages.length,
      serializedLength: payloadRaw.length,
      checksum: checksum(payloadRaw),
      chunkRefs,
    }
    const commitRaw = JSON.stringify(commit)
    storage.setItem(commitKey, commitRaw)
    commitWritten = true
    if (storage.getItem(commitKey) !== commitRaw) {
      throw new Error('Card transcript snapshot commit read-back failed')
    }
    const verifiedCommit = readStoredCommit(storage, cardId, commitKey)
    if (
      !verifiedCommit ||
      verifiedCommit.payloadRaw !== payloadRaw ||
      !sameSnapshotMessages(verifiedCommit.messages, messages)
    ) {
      throw new Error('Card transcript snapshot payload read-back failed')
    }

    const aggregate: CardTranscriptSnapshotAggregate = {
      version: 3,
      kind: 'aggregate',
      cardId,
      savedAt,
      revision,
      commitKeys: [...(previous?.aggregate.commitKeys ?? []), commitKey],
    }
    const published = publishAggregate(storage, cardId, aggregate)
    const publishedCommit = published?.commits.get(commitKey)
    if (
      !published ||
      !publishedCommit ||
      publishedCommit.payloadRaw !== payloadRaw ||
      !sameSnapshotMessages(publishedCommit.messages, messages)
    ) {
      throw new Error('Card transcript snapshot aggregate read-back failed')
    }
    return {
      ok: true,
      envelope: { version: 3, cardId, savedAt, revision, messages },
    }
  } catch (error) {
    if (previousRaw !== null || cleanupOnFailure) {
      restoreAggregate(storage, cardId, previousRaw)
    }
    if (cleanupOnFailure) {
      if (commitWritten) removeKeys(storage, [commitKey])
      removeKeys(storage, newlyWritten)
    }
    return { ok: false, quota: isQuotaError(error) }
  }
}

/**
 * Remove at most one exact duplicate commit. The reduced aggregate is published
 * and reconstructed through Storage before any commit or chunk is deleted.
 */
function compactOneRedundantCommit(
  storage: Storage,
  cardId: string,
): SnapshotCompaction | null {
  const original = readAggregateState(storage, cardId)
  if (!original || original.aggregate.commitKeys.length < 2) return null

  // Re-publish the proof base before compaction; only valid v3 commits and chunks
  // participate in this read-back domain.
  const proofBase = publishAggregate(storage, cardId, original.aggregate)
  if (
    !proofBase ||
    !sameSnapshotMessages(proofBase.projection, original.projection)
  ) {
    restoreAggregate(storage, cardId, original.raw)
    return null
  }

  let victimKey: string | null = null
  for (const key of proofBase.aggregate.commitKeys) {
    const victim = proofBase.commits.get(key)!
    const hasExactSurvivor = proofBase.aggregate.commitKeys.some((otherKey) => {
      if (otherKey === key) return false
      return proofBase.commits.get(otherKey)!.payloadRaw === victim.payloadRaw
    })
    if (hasExactSurvivor) {
      victimKey = key
      break
    }
  }
  if (!victimKey) return null

  const survivorKeys = proofBase.aggregate.commitKeys.filter(
    (key) => key !== victimKey,
  )
  if (survivorKeys.length === 0) return null
  const revision = proofBase.aggregate.revision + 1
  const savedAt = Date.now()
  if (!positiveSafeInteger(revision) || !validSavedAt(savedAt)) return null
  const reduced: CardTranscriptSnapshotAggregate = {
    ...proofBase.aggregate,
    savedAt,
    revision,
    commitKeys: survivorKeys,
  }

  let reducedState: AggregateState | null = null
  try {
    reducedState = publishAggregate(storage, cardId, reduced)
  } catch {
    reducedState = null
  }
  if (
    !reducedState ||
    !sameSnapshotMessages(reducedState.projection, proofBase.projection)
  ) {
    restoreAggregate(storage, cardId, original.raw)
    return null
  }

  const victim = proofBase.commits.get(victimKey)!
  const referencedChunks = new Set(
    survivorKeys.flatMap((key) =>
      reducedState.commits.get(key)!.index.chunkRefs.map((ref) => ref.key),
    ),
  )
  const removedChunkValues = new Map<string, string>()
  for (const ref of victim.index.chunkRefs) {
    if (referencedChunks.has(ref.key)) continue
    const raw = storage.getItem(ref.key)
    if (raw !== null) removedChunkValues.set(ref.key, raw)
  }
  removeKeys(storage, [victimKey])
  removeKeys(storage, removedChunkValues.keys())
  return {
    rollback: () => {
      try {
        for (const [key, raw] of removedChunkValues) storage.setItem(key, raw)
        storage.setItem(victimKey, victim.raw)
        storage.setItem(aggregateKey(cardId), original.raw)
      } catch {
        // A failed rollback still never broadens reclamation beyond this Card.
      }
    },
  }
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null
  const candidate = (navigator as unknown as { locks?: LockManagerLike }).locks
  return typeof candidate?.request === 'function' ? candidate : null
}

/**
 * Persist one immutable v3 complete projection. Same-Card chunks are reused only
 * after exact stored-value verification. A quota failure permits one locked,
 * proof-based compaction and one retry; otherwise all existing v3 data remains.
 */
export async function writeCardTranscriptSnapshot(
  cardId: string,
  messages: Array<ChatMessage>,
  options: { contextId?: string } = {},
): Promise<CardTranscriptSnapshotEnvelope | null> {
  if (!validCardId(cardId)) return null
  const candidateMessages = messages.map(sanitizeCardOwnedMessage)
  if (
    candidateMessages.length === 0 ||
    candidateMessages.some((message) => !validSnapshotMessage(message))
  ) {
    return null
  }
  const storage = browserPersistentStorage()
  if (!storage) return null
  const contextId = options.contextId ?? snapshotContextId()

  const mutate = (locked: boolean) => {
    const first = publishCandidate(
      storage,
      cardId,
      candidateMessages,
      contextId,
      locked,
    )
    if (first.ok) {
      if (locked) compactOneRedundantCommit(storage, cardId)
      return first.envelope
    }
    if (!first.quota || !locked) return null
    const compaction = compactOneRedundantCommit(storage, cardId)
    if (!compaction) return null
    const retry = publishCandidate(
      storage,
      cardId,
      candidateMessages,
      contextId,
      true,
    )
    if (!retry.ok) compaction.rollback()
    return retry.ok ? retry.envelope : null
  }

  const locks = lockManager()
  if (!locks) return mutate(false)
  try {
    return await locks.request(
      `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:${encodeURIComponent(cardId)}`,
      () => mutate(true),
    )
  } catch {
    return null
  }
}

export function readCardTranscriptSnapshot(
  cardId: string,
): CardTranscriptSnapshotEnvelope | null {
  if (!validCardId(cardId)) return null
  const storage = browserPersistentStorage()
  if (!storage) return null
  const state = readAggregateState(storage, cardId)
  if (!state) return null
  return {
    version: 3,
    cardId,
    savedAt: state.aggregate.savedAt,
    revision: state.aggregate.revision,
    messages: state.projection,
  }
}
