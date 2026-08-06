import {
  clearMessageJournal,
  readMessageJournal,
  removeMessageJournalValues,
  writeMessageJournal,
} from './durable-message-journal'
import type { ChatAttachment, ChatMessage } from './types'

export const CARD_TRANSCRIPT_RECOVERY_VERSION = 2 as const
export const CARD_TRANSCRIPT_RECOVERY_PREFIX =
  'workspace.card-transcript-recovery.v2'
const LEGACY_CARD_TRANSCRIPT_RECOVERY_PREFIX =
  'workspace.card-transcript-recovery.v1'
export const CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES = 50
export const CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGE_CHARS = 256 * 1024
export const CARD_TRANSCRIPT_RECOVERY_MAX_ENVELOPE_CHARS = 2 * 1024 * 1024
export const CARD_TRANSCRIPT_RECOVERY_MAX_ATTACHMENTS = 8
export const CARD_TRANSCRIPT_RECOVERY_MAX_ATTACHMENT_CHARS = 512 * 1024
export const CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS = 128 * 1024
const CARD_TRANSCRIPT_RECOVERY_MAX_MEMORY_OWNERS = 32

export type CardTranscriptRecoveryOwner = {
  cardId: string
}

export type CardTranscriptRecoveryEnvelope = {
  version: typeof CARD_TRANSCRIPT_RECOVERY_VERSION
  cardId: string
  createdAt: number
  messages: Array<ChatMessage>
  /** Monotonic browser commit identity used to select the newest mirror. */
  revision?: number
}

type RecoveryOptions = {
  storage?: Storage
  now?: number
}

// Card-owned fail-closed overlay for storage-denied writes. Existing
// failed owners are never evicted; new owners fail closed at the hard bound.
const memoryRecovery = new Map<string, CardTranscriptRecoveryEnvelope>()

/** Test/process-lifecycle seam; normal callers clear one exact Card owner. */
export function clearCardTranscriptRecoveryMemory(): void {
  memoryRecovery.clear()
}

function memoryRecoveryKey(owner: CardTranscriptRecoveryOwner): string {
  return owner.cardId
}

function rememberMemoryRecovery(
  owner: CardTranscriptRecoveryOwner,
  envelope: CardTranscriptRecoveryEnvelope,
): void {
  const key = memoryRecoveryKey(owner)
  if (
    !memoryRecovery.has(key) &&
    memoryRecovery.size >= CARD_TRANSCRIPT_RECOVERY_MAX_MEMORY_OWNERS
  ) {
    return
  }
  memoryRecovery.set(key, envelope)
}

function readMemoryRecovery(
  owner: CardTranscriptRecoveryOwner,
  _now: number,
): CardTranscriptRecoveryEnvelope | null {
  const key = memoryRecoveryKey(owner)
  const envelope = memoryRecovery.get(key)
  if (!envelope) return null
  return envelope
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRawTransportIdentityKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  const identitySuffixes = [
    'key',
    'keys',
    'id',
    'ids',
    'identity',
    'identities',
  ]
  const hasIdentitySuffix = identitySuffixes.some((suffix) =>
    normalized.endsWith(suffix),
  )
  const namesSessionOrSegmentIdentity =
    (normalized.includes('session') || normalized.includes('segment')) &&
    hasIdentitySuffix
  const namesCanonicalIdentity =
    normalized.startsWith('canonical') &&
    (normalized === 'canonical' || hasIdentitySuffix)
  return (
    normalized === 'session' ||
    normalized === 'segment' ||
    namesSessionOrSegmentIdentity ||
    namesCanonicalIdentity
  )
}

function sanitizeCardOwnedValueInternal(
  value: unknown,
  ancestors: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return undefined
    ancestors.add(value)
    const sanitized = value
      .map((entry) => sanitizeCardOwnedValueInternal(entry, ancestors))
      .filter((entry) => entry !== undefined)
    ancestors.delete(value)
    return sanitized
  }
  if (!record(value)) return value
  if (ancestors.has(value)) return undefined
  ancestors.add(value)
  const sanitized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isRawTransportIdentityKey(key)) continue
    const sanitizedEntry = sanitizeCardOwnedValueInternal(entry, ancestors)
    if (sanitizedEntry !== undefined) sanitized[key] = sanitizedEntry
  }
  ancestors.delete(value)
  return sanitized
}

/** Remove raw transport identities before data enters Card-owned browser state. */
export function sanitizeCardOwnedValue(value: unknown): unknown {
  return sanitizeCardOwnedValueInternal(value, new WeakSet<object>())
}

export function sanitizeCardOwnedMessage(message: ChatMessage): ChatMessage {
  return sanitizeCardOwnedValue(message) as ChatMessage
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sourceQualifiedIdentity(
  value: unknown,
): { identity: string; source: 'local' | 'remote' } | null {
  const identity = normalizedString(value)
  if (identity.startsWith('local:') && identity.length > 'local:'.length) {
    return { identity, source: 'local' }
  }
  if (identity.startsWith('remote:') && identity.length > 'remote:'.length) {
    return { identity, source: 'remote' }
  }
  return null
}

export function isValidCardTranscriptRecoveryOwner(
  owner: CardTranscriptRecoveryOwner,
): boolean {
  return sourceQualifiedIdentity(owner.cardId) !== null
}

export function cardTranscriptRecoveryStorageKey(
  owner: CardTranscriptRecoveryOwner,
): string {
  return `${CARD_TRANSCRIPT_RECOVERY_PREFIX}:${encodeURIComponent(owner.cardId)}`
}

function clearLegacyRecovery(storage: Storage): void {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key?.startsWith(`${LEGACY_CARD_TRANSCRIPT_RECOVERY_PREFIX}:`)) {
        storage.removeItem(key)
      }
    }
  } catch {
    // Legacy cleanup is best effort when browser storage is unavailable.
  }
}

function resolveDefaultRecoveryStorages(
  explicitStorage: Storage | undefined,
): Array<Storage> {
  if (explicitStorage) return [explicitStorage]
  if (typeof window === 'undefined') return []
  const storages: Array<Storage> = []
  for (const candidate of [
    () => window.sessionStorage,
    () => window.localStorage,
  ]) {
    try {
      const storage = candidate()
      if (!storages.includes(storage)) storages.push(storage)
    } catch {
      // One browser store may be denied while the independent mirror works.
    }
  }
  return storages
}

function timestamp(message: ChatMessage): number | null {
  const raw = message as Record<string, unknown>
  for (const key of ['timestamp', 'createdAt'] as const) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function messageTextAndAttachmentSignature(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const content = Array.isArray(message.content) ? message.content : []
  const contentSignature = JSON.stringify(content)
  const topLevelText = ['text', 'body', 'message']
    .map((key) => (typeof raw[key] === 'string' ? raw[key] : ''))
    .find((value) => value.length > 0)
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => ({
        name: normalizedString(attachment.name),
        contentType: normalizedString(attachment.contentType),
        size:
          typeof attachment.size === 'number' &&
          Number.isFinite(attachment.size)
            ? attachment.size
            : null,
      }))
    : []
  return JSON.stringify({
    content: contentSignature,
    text: topLevelText ?? '',
    attachments,
  })
}

function identifierSet(
  message: ChatMessage,
  keys: ReadonlyArray<string>,
): Set<string> {
  const raw = message as Record<string, unknown>
  const values = new Set<string>()
  for (const key of keys) {
    const value = normalizedString(raw[key])
    if (!value) continue
    values.add(value)
    if (key === '__optimisticId' && value.startsWith('opt-')) {
      values.add(value.slice('opt-'.length))
    }
  }
  return values
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true
  }
  return false
}

function compatibleContent(left: ChatMessage, right: ChatMessage): boolean {
  const leftSignature = messageTextAndAttachmentSignature(left)
  const rightSignature = messageTextAndAttachmentSignature(right)
  return leftSignature === rightSignature
}

function compatibleTimestamp(left: ChatMessage, right: ChatMessage): boolean {
  const leftTimestamp = timestamp(left)
  const rightTimestamp = timestamp(right)
  if (leftTimestamp === null || rightTimestamp === null) return true
  return Math.abs(leftTimestamp - rightTimestamp) <= 30_000
}

/**
 * Match only with Card-transcript evidence: role plus compatible content and a
 * stable/server identity, client correlation, or a close explicit timestamp.
 */
export function cardTranscriptMessagesMatch(
  left: ChatMessage,
  right: ChatMessage,
): boolean {
  if (!left.role || left.role !== right.role) return false
  if (!compatibleContent(left, right)) return false

  const runKeys = [
    'runId',
    'run_id',
    'providerRunId',
    'provider_run_id',
  ] as const
  const leftRunIdentifiers = identifierSet(left, runKeys)
  const rightRunIdentifiers = identifierSet(right, runKeys)
  if (intersects(leftRunIdentifiers, rightRunIdentifiers)) return true
  if (leftRunIdentifiers.size > 0 && rightRunIdentifiers.size > 0) {
    return false
  }

  const stableKeys = [
    'stableId',
    'stable_id',
    'id',
    'messageId',
    'message_id',
  ] as const
  const leftStableIdentifiers = identifierSet(left, stableKeys)
  const rightStableIdentifiers = identifierSet(right, stableKeys)
  if (intersects(leftStableIdentifiers, rightStableIdentifiers)) {
    return true
  }
  if (leftStableIdentifiers.size > 0 && rightStableIdentifiers.size > 0) {
    return false
  }

  const clientKeys = [
    'clientId',
    'client_id',
    'idempotencyKey',
    'nonce',
    '__optimisticId',
  ] as const
  const leftClientIdentifiers = identifierSet(left, clientKeys)
  const rightClientIdentifiers = identifierSet(right, clientKeys)
  if (intersects(leftClientIdentifiers, rightClientIdentifiers)) {
    return true
  }
  if (leftClientIdentifiers.size > 0 && rightClientIdentifiers.size > 0) {
    return false
  }

  if (left.role === 'user') return false
  return (
    compatibleTimestamp(left, right) &&
    timestamp(left) !== null &&
    timestamp(right) !== null
  )
}

function isRecoveryOverlay(message: ChatMessage): boolean {
  const raw = message as Record<string, unknown>
  if (message.role === 'user') {
    return (
      identifierSet(message, [
        'clientId',
        'client_id',
        'idempotencyKey',
        'nonce',
        '__optimisticId',
      ]).size > 0 ||
      ['sending', 'sent', 'error'].includes(normalizedString(raw.status))
    )
  }
  if (message.role !== 'assistant') return false
  return (
    identifierSet(message, [
      'runId',
      'run_id',
      'providerRunId',
      'provider_run_id',
      'stableId',
      'stable_id',
    ]).size > 0 ||
    ['complete', 'interrupted', 'error'].includes(
      normalizedString(raw.__streamingStatus),
    )
  )
}

function hasAuthoritativeIdentity(message: ChatMessage): boolean {
  return (
    identifierSet(message, [
      'id',
      'messageId',
      'message_id',
      'stableId',
      'stable_id',
    ]).size > 0
  )
}

function messageTextSignature(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const content = Array.isArray(message.content) ? message.content : []
  const topLevelText = ['text', 'body', 'message']
    .map((key) => (typeof raw[key] === 'string' ? raw[key] : ''))
    .find((value) => value.length > 0)
  return JSON.stringify({ content, text: topLevelText ?? '' })
}

function ordinaryServerAcknowledgementMatches(
  recoveryMessage: ChatMessage,
  authoritativeMessage: ChatMessage,
): boolean {
  return (
    recoveryMessage.role === authoritativeMessage.role &&
    isRecoveryOverlay(recoveryMessage) &&
    hasAuthoritativeIdentity(authoritativeMessage) &&
    messageTextSignature(recoveryMessage) ===
      messageTextSignature(authoritativeMessage) &&
    compatibleTimestamp(recoveryMessage, authoritativeMessage)
  )
}

function conflictingRunIdentity(
  left: ChatMessage,
  right: ChatMessage,
): boolean {
  const runKeys = [
    'runId',
    'run_id',
    'providerRunId',
    'provider_run_id',
  ] as const
  const leftRuns = identifierSet(left, runKeys)
  const rightRuns = identifierSet(right, runKeys)
  return (
    leftRuns.size > 0 && rightRuns.size > 0 && !intersects(leftRuns, rightRuns)
  )
}

function hasOversizedString(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS
  }
  if (Array.isArray(value)) return value.some(hasOversizedString)
  if (!record(value)) return false
  return Object.values(value).some(hasOversizedString)
}

function validAttachment(value: unknown): boolean {
  if (!record(value)) return false
  for (const key of ['dataUrl', 'previewUrl', 'url'] as const) {
    const candidate = value[key]
    if (
      candidate !== undefined &&
      (typeof candidate !== 'string' ||
        candidate.length > CARD_TRANSCRIPT_RECOVERY_MAX_ATTACHMENT_CHARS)
    ) {
      return false
    }
  }
  return true
}

function validMessage(value: unknown): value is ChatMessage {
  if (!record(value)) return false
  if (value.role !== 'user' && value.role !== 'assistant') return false
  if (value.content !== undefined && !Array.isArray(value.content)) return false
  if (
    Array.isArray(value.content) &&
    value.content.some(
      (part) => !record(part) || normalizedString(part.type).length === 0,
    )
  ) {
    return false
  }
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) {
    return false
  }
  if (
    Array.isArray(value.attachments) &&
    (value.attachments.length > CARD_TRANSCRIPT_RECOVERY_MAX_ATTACHMENTS ||
      value.attachments.some((attachment) => !validAttachment(attachment)))
  ) {
    return false
  }
  if (hasOversizedString(value)) return false
  try {
    return (
      JSON.stringify(value).length <= CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGE_CHARS
    )
  } catch {
    return false
  }
}

function recoveryMessageIdentity(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const role = message.role ?? 'unknown'
  for (const key of [
    'recoveryId',
    'runId',
    'run_id',
    'providerRunId',
    'provider_run_id',
    'stableId',
    'stable_id',
  ]) {
    const value = normalizedString(raw[key])
    if (value) return `${role}:run:${value}`
  }
  for (const key of ['clientId', 'client_id', 'idempotencyKey', 'nonce']) {
    const value = normalizedString(raw[key])
    if (value) {
      return `${role}:client:${value}:${messageTextAndAttachmentSignature(message)}`
    }
  }
  for (const key of ['id', 'messageId', 'message_id']) {
    const value = normalizedString(raw[key])
    if (value) return `${role}:id:${value}`
  }
  const serialized = JSON.stringify(message)
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${role}:value:${(hash >>> 0).toString(36)}`
}

function dedupeMessages(messages: Array<ChatMessage>): Array<ChatMessage> {
  const deduped: Array<ChatMessage> = []
  for (const message of messages) {
    const matchingIndex = deduped.findIndex((candidate) =>
      cardTranscriptMessagesMatch(candidate, message),
    )
    if (matchingIndex >= 0) deduped[matchingIndex] = message
    else deduped.push(message)
  }
  return deduped
}

export function parseCardTranscriptRecovery(
  value: unknown,
  expectedOwner: CardTranscriptRecoveryOwner,
  _now = Date.now(),
): CardTranscriptRecoveryEnvelope | null {
  if (!isValidCardTranscriptRecoveryOwner(expectedOwner) || !record(value)) {
    return null
  }
  if (value.version !== CARD_TRANSCRIPT_RECOVERY_VERSION) return null
  if (value.cardId !== expectedOwner.cardId) {
    return null
  }
  if (!isValidCardTranscriptRecoveryOwner(expectedOwner)) return null
  if (
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt <= 0 ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision <= 0
  ) {
    return null
  }
  if (!Array.isArray(value.messages)) {
    return null
  }
  const sanitizedMessages = value.messages.map((message) =>
    sanitizeCardOwnedMessage(message as ChatMessage),
  )
  if (
    sanitizedMessages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES ||
    sanitizedMessages.some((message) => !validMessage(message))
  )
    return null

  const envelope: CardTranscriptRecoveryEnvelope = {
    version: CARD_TRANSCRIPT_RECOVERY_VERSION,
    cardId: expectedOwner.cardId,
    createdAt: value.createdAt,
    messages: dedupeMessages(sanitizedMessages),
    revision: value.revision,
  }
  try {
    if (
      JSON.stringify(envelope).length >
      CARD_TRANSCRIPT_RECOVERY_MAX_ENVELOPE_CHARS
    ) {
      return null
    }
  } catch {
    return null
  }
  return envelope
}

export function readCardTranscriptRecovery(
  owner: CardTranscriptRecoveryOwner,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return null
  const now = options.now ?? Date.now()
  const memory = readMemoryRecovery(owner, now)
  const storages = resolveDefaultRecoveryStorages(options.storage)
  if (storages.length === 0) return memory
  const key = cardTranscriptRecoveryStorageKey(owner)
  let newest: CardTranscriptRecoveryEnvelope | null = null
  let newestRawLength = -1

  for (const storage of storages) {
    clearLegacyRecovery(storage)
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      continue
    }
    if (!raw) continue
    if (raw.length > CARD_TRANSCRIPT_RECOVERY_MAX_ENVELOPE_CHARS) {
      try {
        storage.removeItem(key)
      } catch {
        // Storage can become unavailable between operations.
      }
      continue
    }
    try {
      const envelope = parseCardTranscriptRecovery(JSON.parse(raw), owner, now)
      if (envelope) {
        const revision = envelope.revision ?? envelope.createdAt
        const newestRevision = newest?.revision ?? newest?.createdAt ?? -1
        if (
          !newest ||
          revision > newestRevision ||
          (revision === newestRevision && raw.length > newestRawLength)
        ) {
          newest = envelope
          newestRawLength = raw.length
        }
        try {
          const sanitizedRaw = JSON.stringify(envelope)
          if (sanitizedRaw !== raw) storage.setItem(key, sanitizedRaw)
        } catch {
          // A valid durable record remains usable if normalization is denied.
        }
        continue
      }
    } catch {
      // Remove malformed data below.
    }
    try {
      storage.removeItem(key)
    } catch {
      // Ignore unavailable storage while rejecting the record.
    }
  }

  const journalMessages = readMessageJournal(
    key,
    storages,
    recoveryMessageIdentity,
    (value) => {
      const sanitized = sanitizeCardOwnedMessage(value as ChatMessage)
      return validMessage(sanitized) ? sanitized : null
    },
  )
  if (journalMessages.length > 0) {
    const mergedMessages = dedupeMessages(journalMessages)
    newest = {
      version: CARD_TRANSCRIPT_RECOVERY_VERSION,
      cardId: owner.cardId,
      createdAt: newest?.createdAt ?? Math.max(1, now),
      revision: newest?.revision ?? 1,
      messages: mergedMessages,
    }
  }

  if (!memory) return newest
  if (!newest) return memory
  const memoryRevision = memory.revision ?? 0
  const durableRevision = newest.revision ?? 0
  if (memoryRevision > durableRevision) {
    return {
      ...memory,
      messages: dedupeMessages([...newest.messages, ...memory.messages]),
    }
  }
  return {
    ...newest,
    messages: dedupeMessages([...memory.messages, ...newest.messages]),
  }
}

export function clearCardTranscriptRecovery(
  owner: CardTranscriptRecoveryOwner,
  options: Pick<RecoveryOptions, 'storage'> = {},
): void {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return
  memoryRecovery.delete(memoryRecoveryKey(owner))
  const storages = resolveDefaultRecoveryStorages(options.storage)
  const key = cardTranscriptRecoveryStorageKey(owner)
  clearMessageJournal(key, storages)
  for (const storage of storages) {
    clearLegacyRecovery(storage)
    try {
      storage.removeItem(key)
    } catch {
      // Ignore unavailable storage.
    }
  }
}

let recoveryRevision = 0

function nextRecoveryRevision(previousRevision: number): number | null {
  const next = Math.max(recoveryRevision, previousRevision) + 1
  if (!Number.isSafeInteger(next) || next <= 0) return null
  recoveryRevision = next
  return next
}

export function replaceCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  messages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return null
  const sanitizedMessages = messages.map(sanitizeCardOwnedMessage)
  if (sanitizedMessages.some((message) => !validMessage(message))) return null
  const existing = readCardTranscriptRecovery(owner, options)
  const deduped = dedupeMessages([
    ...(existing?.messages ?? []),
    ...sanitizedMessages,
  ])
  // Capacity is an admission boundary, never an eviction policy. Silently
  // dropping the oldest unacknowledged turn would make an accepted send
  // unrecoverable, so callers must fail closed before transport instead.
  if (deduped.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES) return null
  if (deduped.length === 0) {
    clearCardTranscriptRecovery(owner, { storage: options.storage })
    return null
  }
  const createdAt = options.now ?? Date.now()
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null
  const revision = nextRecoveryRevision(existing?.revision ?? 0)
  if (revision === null) return null
  const envelope: CardTranscriptRecoveryEnvelope = {
    version: CARD_TRANSCRIPT_RECOVERY_VERSION,
    cardId: owner.cardId,
    createdAt,
    messages: deduped,
    revision,
  }
  const storages = resolveDefaultRecoveryStorages(options.storage)
  if (storages.length === 0) {
    rememberMemoryRecovery(owner, envelope)
    return null
  }
  let serialized: string
  try {
    serialized = JSON.stringify(envelope)
  } catch {
    return null
  }
  if (serialized.length > CARD_TRANSCRIPT_RECOVERY_MAX_ENVELOPE_CHARS) {
    rememberMemoryRecovery(owner, envelope)
    return null
  }
  const key = cardTranscriptRecoveryStorageKey(owner)
  const journalWrite = writeMessageJournal(
    key,
    deduped,
    storages,
    recoveryMessageIdentity,
  )
  const durable = options.storage
    ? journalWrite.anyVerified
    : journalWrite.persistentVerified
  if (!durable) {
    rememberMemoryRecovery(owner, envelope)
    return null
  }
  for (const storage of storages) {
    clearLegacyRecovery(storage)
    try {
      storage.setItem(key, serialized)
      // Journal rows are authoritative across contexts; the aggregate envelope
      // is a compact compatibility mirror and may be replaced by another tab.
      storage.getItem(key)
    } catch {
      // The verified per-message journal remains readable in this mirror.
    }
  }
  memoryRecovery.delete(memoryRecoveryKey(owner))
  return envelope
}

export function appendCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  message: ChatMessage,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  if (!validMessage(message)) return null
  const existing = readCardTranscriptRecovery(owner, options)
  return replaceCardTranscriptRecoveryMessages(
    owner,
    [...(existing?.messages ?? []), message],
    options,
  )
}

function messageRunIdentity(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of [
    'recoveryId',
    'runId',
    'run_id',
    'providerRunId',
    'provider_run_id',
  ]) {
    const value = normalizedString(raw[key])
    if (value) return value
  }
  return ''
}

/** Replace one in-flight assistant checkpoint by immutable run identity. */
export function checkpointCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  message: ChatMessage,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!validMessage(sanitized)) return null
  const runId = messageRunIdentity(sanitized)
  if (!runId || sanitized.role !== 'assistant') {
    return appendCardTranscriptRecoveryMessage(owner, sanitized, options)
  }
  const existing = readCardTranscriptRecovery(owner, options)
  const messages = [...(existing?.messages ?? [])]
  const index = messages.findIndex(
    (candidate) =>
      candidate.role === 'assistant' && messageRunIdentity(candidate) === runId,
  )
  if (index >= 0) messages[index] = sanitized
  else messages.push(sanitized)
  return replaceCardTranscriptRecoveryMessages(owner, messages, options)
}

/** Preflight the exact scrubbed message representation used for recovery. */
export function isCardTranscriptRecoveryMessagePortable(
  message: ChatMessage,
): boolean {
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!validMessage(sanitized)) return false
  try {
    return (
      JSON.stringify(sanitized).length <=
      CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGE_CHARS
    )
  } catch {
    return false
  }
}

export function mergeCardTranscriptRecoveryMessages(
  persistedMessages: Array<ChatMessage>,
  recoveryMessages: Array<ChatMessage>,
): Array<ChatMessage> {
  const merged = [...persistedMessages]
  const consumedPersistedIndexes = new Set<number>()
  for (const recoveryMessage of recoveryMessages) {
    const matchingIndex = merged.findIndex(
      (persistedMessage, index) =>
        index < persistedMessages.length &&
        !consumedPersistedIndexes.has(index) &&
        (cardTranscriptMessagesMatch(persistedMessage, recoveryMessage) ||
          (!conflictingRunIdentity(recoveryMessage, persistedMessage) &&
            ordinaryServerAcknowledgementMatches(
              recoveryMessage,
              persistedMessage,
            ))),
    )
    if (matchingIndex >= 0) {
      consumedPersistedIndexes.add(matchingIndex)
      if ((recoveryMessage.attachments?.length ?? 0) > 0) {
        const persistedMessage = merged[matchingIndex]!
        merged[matchingIndex] = {
          ...persistedMessage,
          attachments: mergeAcknowledgedAttachments(
            persistedMessage,
            recoveryMessage,
          ),
        }
      }
      continue
    }
    merged.push(recoveryMessage)
  }
  return merged
}

function mergeAcknowledgedAttachments(
  authoritativeMessage: ChatMessage,
  recoveryMessage: ChatMessage,
): Array<ChatAttachment> {
  const authoritativeAttachments = Array.isArray(
    authoritativeMessage.attachments,
  )
    ? authoritativeMessage.attachments
    : []
  const recoveryAttachments = recoveryMessage.attachments ?? []
  const merged = recoveryAttachments.map((recoveryAttachment, index) => ({
    ...recoveryAttachment,
    ...(authoritativeAttachments[index] ?? {}),
  }))
  if (authoritativeAttachments.length > recoveryAttachments.length) {
    merged.push(...authoritativeAttachments.slice(recoveryAttachments.length))
  }
  return merged
}

function authoritativeAttachmentFidelityAcknowledges(
  authoritativeMessage: ChatMessage,
  recoveryMessage: ChatMessage,
): boolean {
  const authoritativeAttachments = authoritativeMessage.attachments ?? []
  const recoveryAttachments = recoveryMessage.attachments ?? []
  if (
    recoveryAttachments.length === 0 ||
    authoritativeAttachments.length !== recoveryAttachments.length
  ) {
    return recoveryAttachments.length === 0
  }
  return recoveryAttachments.every((recoveryAttachment, index) => {
    const authoritativeAttachment = authoritativeAttachments[index]
    if (!authoritativeAttachment) return false
    return (
      Object.entries(recoveryAttachment) as Array<[string, unknown]>
    ).every(
      ([key, value]) =>
        // Attachment IDs are browser/server correlation metadata and may be
        // normalized independently. Every actual metadata/content field must
        // still be present byte-for-byte before recovery can be discarded.
        key === 'id' ||
        value === undefined ||
        (authoritativeAttachment as Record<string, unknown>)[key] === value,
    )
  })
}

type CardTranscriptAcknowledgement = {
  authoritativeMessages: Array<ChatMessage>
  recovery: CardTranscriptRecoveryEnvelope | null
}

/**
 * Consume ordinary history acknowledgements as one bounded, ordered sequence.
 * Each authoritative row can acknowledge at most one recovery row. This makes
 * repeated equal text deterministic: two persisted pairs acknowledge two local
 * pairs, while one persisted pair leaves the truly additional local pair.
 */
export function reconcileAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): CardTranscriptAcknowledgement {
  const recovery = readCardTranscriptRecovery(owner, options)
  if (!recovery) {
    return { authoritativeMessages, recovery: null }
  }

  const boundedAuthoritativeStart = Math.max(
    0,
    authoritativeMessages.length - CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES * 4,
  )
  const acknowledgedRecoveryIndexes = new Set<number>()
  const enrichedAuthoritativeMessages = [...authoritativeMessages]
  let authoritativeCursor = boundedAuthoritativeStart

  for (const [recoveryIndex, recoveryMessage] of recovery.messages.entries()) {
    let authoritativeIndex = -1

    for (
      let index = authoritativeCursor;
      index < authoritativeMessages.length;
      index += 1
    ) {
      const authoritativeMessage = authoritativeMessages[index]!
      if (
        cardTranscriptMessagesMatch(authoritativeMessage, recoveryMessage) ||
        (!conflictingRunIdentity(recoveryMessage, authoritativeMessage) &&
          ordinaryServerAcknowledgementMatches(
            recoveryMessage,
            authoritativeMessage,
          ))
      ) {
        authoritativeIndex = index
        break
      }
    }

    if (authoritativeIndex < 0) continue
    authoritativeCursor = authoritativeIndex + 1

    const authoritativeMessage =
      enrichedAuthoritativeMessages[authoritativeIndex]!
    if (
      Array.isArray(recoveryMessage.attachments) &&
      recoveryMessage.attachments.length > 0
    ) {
      // Ordinary server history may omit portable attachment bytes. Keep the
      // authoritative row identity/order and hydrate its attachment projection
      // without rendering a second copy. Recovery remains durable until the
      // authoritative payload itself contains every attachment content field.
      enrichedAuthoritativeMessages[authoritativeIndex] = {
        ...authoritativeMessage,
        attachments: mergeAcknowledgedAttachments(
          authoritativeMessage,
          recoveryMessage,
        ),
      }
    }
    if (
      authoritativeAttachmentFidelityAcknowledges(
        authoritativeMessages[authoritativeIndex]!,
        recoveryMessage,
      )
    ) {
      acknowledgedRecoveryIndexes.add(recoveryIndex)
    }
  }

  const remaining = recovery.messages.filter(
    (_recoveryMessage, index) => !acknowledgedRecoveryIndexes.has(index),
  )
  let nextRecovery: CardTranscriptRecoveryEnvelope | null = recovery
  if (remaining.length !== recovery.messages.length) {
    const acknowledged = recovery.messages.filter((_message, index) =>
      acknowledgedRecoveryIndexes.has(index),
    )
    const storages = resolveDefaultRecoveryStorages(options.storage)
    const key = cardTranscriptRecoveryStorageKey(owner)
    removeMessageJournalValues(
      key,
      acknowledged,
      storages,
      recoveryMessageIdentity,
    )
    memoryRecovery.delete(memoryRecoveryKey(owner))
    for (const storage of storages) {
      try {
        storage.removeItem(key)
      } catch {
        // Journal rows remain the authority if compact-envelope cleanup fails.
      }
    }
    nextRecovery =
      remaining.length > 0
        ? replaceCardTranscriptRecoveryMessages(owner, remaining, options)
        : readCardTranscriptRecovery(owner, options)
  }
  return {
    authoritativeMessages: enrichedAuthoritativeMessages,
    recovery: nextRecovery,
  }
}

export function removeAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  return reconcileAcknowledgedCardTranscriptRecoveryMessages(
    owner,
    authoritativeMessages,
    options,
  ).recovery
}
