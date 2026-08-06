import type { ChatMessage } from './types'

export const CARD_TRANSCRIPT_RECOVERY_VERSION = 2 as const
export const CARD_TRANSCRIPT_RECOVERY_PREFIX =
  'workspace.card-transcript-recovery.v2'
const LEGACY_CARD_TRANSCRIPT_RECOVERY_PREFIX =
  'workspace.card-transcript-recovery.v1'
export const CARD_TRANSCRIPT_RECOVERY_TTL_MS = 10 * 60 * 1000
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
  now: number,
): CardTranscriptRecoveryEnvelope | null {
  const key = memoryRecoveryKey(owner)
  const envelope = memoryRecovery.get(key)
  if (!envelope) return null
  if (now - envelope.createdAt > CARD_TRANSCRIPT_RECOVERY_TTL_MS) {
    memoryRecovery.delete(key)
    return null
  }
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

function resolveStorage(storage: Storage | undefined): Storage | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
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
        id: normalizedString(attachment.id),
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

/**
 * Ordinary persisted rows often receive new server-side client/run IDs. They
 * may acknowledge a recovery overlay only when content, role, and timestamp
 * agree and the mapping is unique in both directions. The uniqueness gate is
 * what preserves genuinely distinct repeated same-text turns.
 */
function ordinaryServerAcknowledgementMatches(
  recoveryMessage: ChatMessage,
  authoritativeMessage: ChatMessage,
): boolean {
  return (
    recoveryMessage.role === authoritativeMessage.role &&
    isRecoveryOverlay(recoveryMessage) &&
    hasAuthoritativeIdentity(authoritativeMessage) &&
    compatibleContent(recoveryMessage, authoritativeMessage) &&
    compatibleTimestamp(recoveryMessage, authoritativeMessage)
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

function dedupeMessages(messages: Array<ChatMessage>): Array<ChatMessage> {
  const deduped: Array<ChatMessage> = []
  for (const message of messages) {
    const matchingIndex = deduped.findIndex((candidate) =>
      cardTranscriptMessagesMatch(candidate, message),
    )
    if (matchingIndex >= 0) deduped[matchingIndex] = message
    else deduped.push(message)
  }
  return deduped.slice(-CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES)
}

export function parseCardTranscriptRecovery(
  value: unknown,
  expectedOwner: CardTranscriptRecoveryOwner,
  now = Date.now(),
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
    value.createdAt < 0 ||
    value.createdAt > now + 60_000 ||
    now - value.createdAt > CARD_TRANSCRIPT_RECOVERY_TTL_MS
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
  const storage = resolveStorage(options.storage)
  if (!storage) return memory
  clearLegacyRecovery(storage)
  const key = cardTranscriptRecoveryStorageKey(owner)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return memory
  }
  if (!raw) return memory
  if (raw.length > CARD_TRANSCRIPT_RECOVERY_MAX_ENVELOPE_CHARS) {
    try {
      storage.removeItem(key)
    } catch {
      // Storage can become unavailable between operations.
    }
    return memory
  }
  try {
    const envelope = parseCardTranscriptRecovery(JSON.parse(raw), owner, now)
    if (envelope) {
      try {
        const sanitizedRaw = JSON.stringify(envelope)
        if (sanitizedRaw !== raw) storage.setItem(key, sanitizedRaw)
      } catch {
        // The sanitized in-memory value remains safe when storage is denied.
      }
      return memory ?? envelope
    }
  } catch {
    // Remove malformed data below.
  }
  try {
    storage.removeItem(key)
  } catch {
    // Ignore unavailable storage while rejecting the record.
  }
  return memory
}

export function clearCardTranscriptRecovery(
  owner: CardTranscriptRecoveryOwner,
  options: Pick<RecoveryOptions, 'storage'> = {},
): void {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return
  memoryRecovery.delete(memoryRecoveryKey(owner))
  const storage = resolveStorage(options.storage)
  if (!storage) return
  clearLegacyRecovery(storage)
  try {
    storage.removeItem(cardTranscriptRecoveryStorageKey(owner))
  } catch {
    // Ignore unavailable storage.
  }
}

export function replaceCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  messages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return null
  const sanitizedMessages = messages.map(sanitizeCardOwnedMessage)
  if (sanitizedMessages.some((message) => !validMessage(message))) return null
  const deduped = dedupeMessages(sanitizedMessages)
  if (deduped.length === 0) {
    clearCardTranscriptRecovery(owner, { storage: options.storage })
    return null
  }
  const envelope: CardTranscriptRecoveryEnvelope = {
    version: CARD_TRANSCRIPT_RECOVERY_VERSION,
    cardId: owner.cardId,
    createdAt: options.now ?? Date.now(),
    messages: deduped,
  }
  const storage = resolveStorage(options.storage)
  if (!storage) {
    rememberMemoryRecovery(owner, envelope)
    return null
  }
  clearLegacyRecovery(storage)
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
  try {
    storage.setItem(cardTranscriptRecoveryStorageKey(owner), serialized)
  } catch {
    rememberMemoryRecovery(owner, envelope)
    return null
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

export function mergeCardTranscriptRecoveryMessages(
  persistedMessages: Array<ChatMessage>,
  recoveryMessages: Array<ChatMessage>,
): Array<ChatMessage> {
  const merged = [...persistedMessages]
  for (const recoveryMessage of recoveryMessages) {
    if (
      merged.some((persistedMessage) =>
        cardTranscriptMessagesMatch(persistedMessage, recoveryMessage),
      )
    ) {
      continue
    }
    merged.push(recoveryMessage)
  }
  return merged
}

export function removeAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  const recovery = readCardTranscriptRecovery(owner, options)
  if (!recovery) return null
  const acknowledgedRecoveryIndexes = new Set<number>()
  const consumedAuthoritativeIndexes = new Set<number>()

  for (const [recoveryIndex, recoveryMessage] of recovery.messages.entries()) {
    const authoritativeIndex = authoritativeMessages.findIndex(
      (authoritativeMessage, index) =>
        !consumedAuthoritativeIndexes.has(index) &&
        cardTranscriptMessagesMatch(authoritativeMessage, recoveryMessage),
    )
    if (authoritativeIndex < 0) continue
    acknowledgedRecoveryIndexes.add(recoveryIndex)
    consumedAuthoritativeIndexes.add(authoritativeIndex)
  }

  for (const [recoveryIndex, recoveryMessage] of recovery.messages.entries()) {
    if (acknowledgedRecoveryIndexes.has(recoveryIndex)) continue
    const candidateAuthoritativeIndexes = authoritativeMessages
      .map((authoritativeMessage, index) => ({ authoritativeMessage, index }))
      .filter(
        ({ authoritativeMessage, index }) =>
          !consumedAuthoritativeIndexes.has(index) &&
          ordinaryServerAcknowledgementMatches(
            recoveryMessage,
            authoritativeMessage,
          ),
      )
      .map(({ index }) => index)
    if (candidateAuthoritativeIndexes.length !== 1) continue

    const authoritativeIndex = candidateAuthoritativeIndexes[0]!
    const authoritativeMessage = authoritativeMessages[authoritativeIndex]!
    const candidateRecoveryCount = recovery.messages.filter(
      (candidate, index) =>
        !acknowledgedRecoveryIndexes.has(index) &&
        ordinaryServerAcknowledgementMatches(candidate, authoritativeMessage),
    ).length
    if (candidateRecoveryCount !== 1) continue

    acknowledgedRecoveryIndexes.add(recoveryIndex)
    consumedAuthoritativeIndexes.add(authoritativeIndex)
  }

  const remaining = recovery.messages.filter(
    (_recoveryMessage, index) => !acknowledgedRecoveryIndexes.has(index),
  )
  if (remaining.length === recovery.messages.length) return recovery
  return replaceCardTranscriptRecoveryMessages(owner, remaining, options)
}
