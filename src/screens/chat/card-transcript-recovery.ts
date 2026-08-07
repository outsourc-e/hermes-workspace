import {
  clearMessageJournal,
  readMessageJournal,
  removeMessageJournalValues,
  writeMessageJournal,
} from './durable-message-journal'
import { parsePortableAttachmentDataUrl } from './attachment-envelope'
import type { ChatAttachment, ChatMessage } from './types'
import type { SwarmDirectChatUserAcknowledgement } from '@/lib/swarm-direct-chat-delivery'
import {
  SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
  parseSwarmDirectChatUserAcknowledgement,
  swarmDirectChatContentDigest,
} from '@/lib/swarm-direct-chat-delivery'

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
    'recoveryId',
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
      'recoveryId',
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

function messageText(message: ChatMessage): string {
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!record(part)) return ''
        const contentPart = part as Record<string, unknown>
        return typeof contentPart.text === 'string' ? contentPart.text : ''
      })
      .join('')
      .trim()
  }
  const raw = message as Record<string, unknown>
  return (
    ['text', 'body', 'message']
      .map((key) => (typeof raw[key] === 'string' ? raw[key].trim() : ''))
      .find(Boolean) ?? ''
  )
}

function swarmDeliveryAcknowledgement(
  message: ChatMessage,
): SwarmDirectChatUserAcknowledgement | null {
  const raw = message as Record<string, unknown>
  return parseSwarmDirectChatUserAcknowledgement(
    raw.__swarmDeliveryAcknowledgement,
  )
}

function swarmAcknowledgementAttachmentsMatchRecovery(
  recoveryMessage: ChatMessage,
  acknowledgement: SwarmDirectChatUserAcknowledgement,
): boolean {
  const recoveryAttachments = recoveryMessage.attachments ?? []
  if (acknowledgement.version !== SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION) {
    return recoveryAttachments.length === 0
  }
  if (acknowledgement.attachments.length !== recoveryAttachments.length) {
    return false
  }
  const recoveryByIdentity = new Map<string, ChatAttachment>()
  for (const attachment of recoveryAttachments) {
    const identity = normalizedString(attachment.id)
    if (!identity || recoveryByIdentity.has(identity)) return false
    recoveryByIdentity.set(identity, attachment)
  }
  return acknowledgement.attachments.every((acknowledgedAttachment) => {
    const recoveryAttachment = recoveryByIdentity.get(acknowledgedAttachment.id)
    return Boolean(
      recoveryAttachment &&
      normalizedString(recoveryAttachment.name) ===
        acknowledgedAttachment.name &&
      normalizedString(recoveryAttachment.contentType) ===
        acknowledgedAttachment.contentType &&
      recoveryAttachment.size === acknowledgedAttachment.size &&
      normalizedString(recoveryAttachment.contentDigest) ===
        acknowledgedAttachment.contentDigest,
    )
  })
}

function swarmDeliveryAcknowledgementMatches(
  recoveryMessage: ChatMessage,
  authoritativeMessage: ChatMessage,
): boolean {
  if (recoveryMessage.role !== 'user' || authoritativeMessage.role !== 'user') {
    return false
  }
  const acknowledgement = swarmDeliveryAcknowledgement(recoveryMessage)
  if (!acknowledgement) return false
  const recoveryClientIdentifiers = identifierSet(recoveryMessage, [
    'clientId',
    'client_id',
    'idempotencyKey',
    'nonce',
    '__optimisticId',
  ])
  if (!recoveryClientIdentifiers.has(acknowledgement.clientId)) return false
  if (
    !swarmAcknowledgementAttachmentsMatchRecovery(
      recoveryMessage,
      acknowledgement,
    )
  ) {
    return false
  }

  const projectedAcknowledgement =
    swarmDeliveryAcknowledgement(authoritativeMessage)
  if (projectedAcknowledgement) {
    return (
      projectedAcknowledgement.clientId === acknowledgement.clientId &&
      projectedAcknowledgement.observedAt === acknowledgement.observedAt &&
      projectedAcknowledgement.contentDigest ===
        acknowledgement.contentDigest &&
      JSON.stringify(projectedAcknowledgement) ===
        JSON.stringify(acknowledgement)
    )
  }
  return (
    timestamp(authoritativeMessage) === acknowledgement.observedAt &&
    swarmDirectChatContentDigest(messageText(authoritativeMessage)) ===
      acknowledgement.contentDigest
  )
}

function ordinaryServerAcknowledgementMatches(
  recoveryMessage: ChatMessage,
  authoritativeMessage: ChatMessage,
): boolean {
  const clientKeys = [
    'clientId',
    'client_id',
    'idempotencyKey',
    'nonce',
    '__optimisticId',
  ] as const
  const recoveryClientIdentifiers = identifierSet(recoveryMessage, clientKeys)
  const authoritativeClientIdentifiers = identifierSet(
    authoritativeMessage,
    clientKeys,
  )
  if (
    recoveryMessage.role !== authoritativeMessage.role ||
    !isRecoveryOverlay(recoveryMessage) ||
    !hasAuthoritativeIdentity(authoritativeMessage)
  ) {
    return false
  }
  if (
    swarmDeliveryAcknowledgementMatches(recoveryMessage, authoritativeMessage)
  ) {
    return true
  }
  // A browser-identified user turn has no safe text-only fallback. Without a
  // durable server cursor, a stale repeated row could otherwise consume a
  // newer recovery turn before its own authoritative echo arrives.
  if (
    recoveryMessage.role === 'user' &&
    recoveryClientIdentifiers.size > 0 &&
    !intersects(recoveryClientIdentifiers, authoritativeClientIdentifiers)
  ) {
    return false
  }
  return (
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
  if (
    value.contentDigest !== undefined &&
    (typeof value.contentDigest !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(value.contentDigest))
  ) {
    return false
  }
  if (
    value.dataUrl !== undefined &&
    !parsePortableAttachmentDataUrl(value.dataUrl, value.contentType)
  ) {
    return false
  }
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

function hasRecoveryClientIdentity(
  message: ChatMessage,
  clientId: string,
): boolean {
  return (
    message.role === 'user' &&
    identifierSet(message, [
      'clientId',
      'client_id',
      'idempotencyKey',
      'nonce',
      '__optimisticId',
    ]).has(clientId)
  )
}

/**
 * Roll back one user turn that failed the pre-transport durability gate.
 *
 * This intentionally bypasses the normal unioning writer: a rejected turn is
 * not accepted recovery state and must be removed by immutable client identity
 * from every in-process and browser-owned recovery authority without replacing
 * or evicting previously accepted rows.
 */
export function removeRejectedCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  clientId: string,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  const normalizedClientId = normalizedString(clientId)
  if (!isValidCardTranscriptRecoveryOwner(owner) || !normalizedClientId) {
    return null
  }

  const key = cardTranscriptRecoveryStorageKey(owner)
  const storages = resolveDefaultRecoveryStorages(options.storage)
  const journalMessages = readMessageJournal(
    key,
    storages,
    recoveryMessageIdentity,
    (value) => {
      const sanitized = sanitizeCardOwnedMessage(value as ChatMessage)
      return validMessage(sanitized) ? sanitized : null
    },
  )
  removeMessageJournalValues(
    key,
    journalMessages.filter((message) =>
      hasRecoveryClientIdentity(message, normalizedClientId),
    ),
    storages,
    recoveryMessageIdentity,
  )

  const memoryKey = memoryRecoveryKey(owner)
  const memory = memoryRecovery.get(memoryKey)
  if (memory) {
    const remaining = memory.messages.filter(
      (message) => !hasRecoveryClientIdentity(message, normalizedClientId),
    )
    if (remaining.length === 0) memoryRecovery.delete(memoryKey)
    else if (remaining.length !== memory.messages.length) {
      memoryRecovery.set(memoryKey, { ...memory, messages: remaining })
    }
  }

  for (const storage of storages) {
    let envelope: CardTranscriptRecoveryEnvelope | null = null
    try {
      const raw = storage.getItem(key)
      envelope = raw
        ? parseCardTranscriptRecovery(JSON.parse(raw), owner, options.now)
        : null
    } catch {
      continue
    }
    if (!envelope) continue
    const remaining = envelope.messages.filter(
      (message) => !hasRecoveryClientIdentity(message, normalizedClientId),
    )
    if (remaining.length === envelope.messages.length) continue
    if (remaining.length === 0) {
      try {
        storage.removeItem(key)
      } catch {
        // A denied mirror must not block cleanup in independent mirrors.
      }
      continue
    }
    const revision = nextRecoveryRevision(envelope.revision ?? 0)
    if (revision === null) continue
    const rollbackTime = options.now ?? Date.now()
    const nextEnvelope: CardTranscriptRecoveryEnvelope = {
      ...envelope,
      createdAt:
        Number.isFinite(rollbackTime) && rollbackTime > 0
          ? rollbackTime
          : envelope.createdAt,
      messages: remaining,
      revision,
    }
    try {
      storage.setItem(key, JSON.stringify(nextEnvelope))
    } catch {
      // Continue removing the rejected identity from independent mirrors.
    }
  }

  return readCardTranscriptRecovery(owner, options)
}

/**
 * Persist the exact server-observed echo for one already delivered Swarm turn.
 * The recovery row remains until complete Card history proves the echo (and,
 * for attachments, full attachment fidelity), so this cannot create a
 * delivery-success durability gap.
 */
export function acknowledgeDeliveredCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  clientId: string,
  acknowledgementValue: unknown,
  options: RecoveryOptions = {},
): CardTranscriptRecoveryEnvelope | null {
  const normalizedClientId = normalizedString(clientId)
  const acknowledgement = parseSwarmDirectChatUserAcknowledgement(
    acknowledgementValue,
    normalizedClientId,
  )
  if (
    !isValidCardTranscriptRecoveryOwner(owner) ||
    !normalizedClientId ||
    !acknowledgement
  ) {
    return null
  }
  const existing = readCardTranscriptRecovery(owner, options)
  if (!existing) return null
  if (
    !existing.messages.some(
      (message) =>
        hasRecoveryClientIdentity(message, normalizedClientId) &&
        swarmAcknowledgementAttachmentsMatchRecovery(message, acknowledgement),
    )
  ) {
    return null
  }
  const messages = existing.messages.map((message) => {
    if (
      !hasRecoveryClientIdentity(message, normalizedClientId) ||
      !swarmAcknowledgementAttachmentsMatchRecovery(message, acknowledgement)
    ) {
      return message
    }
    return {
      ...message,
      status: 'sent',
      __swarmDeliveryAcknowledgement: acknowledgement,
    }
  })
  const persisted = replaceCardTranscriptRecoveryMessages(
    owner,
    messages,
    options,
  )
  const acknowledged = persisted?.messages.find((message) =>
    hasRecoveryClientIdentity(message, normalizedClientId),
  )
  return parseSwarmDirectChatUserAcknowledgement(
    (acknowledged as Record<string, unknown> | undefined)
      ?.__swarmDeliveryAcknowledgement,
    normalizedClientId,
  )
    ? persisted
    : null
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
      merged[matchingIndex] = mergeAcknowledgedRecoveryProjection(
        merged[matchingIndex]!,
        recoveryMessage,
      )
      continue
    }
    merged.push(recoveryMessage)
  }
  return merged
}

function stableAttachmentIdentity(attachment: ChatAttachment): string {
  return normalizedString(attachment.id)
}

/**
 * Pair independently normalized attachment projections without relying on
 * array position. Shared, unique attachment IDs are authoritative. The lone
 * attachment compatibility case preserves existing browser/server ID
 * normalization while remaining unambiguous within the matched message.
 */
function pairAcknowledgedAttachments(
  authoritativeAttachments: Array<ChatAttachment>,
  recoveryAttachments: Array<ChatAttachment>,
): Array<number | null> {
  const recoveryIndexesByIdentity = new Map<string, Array<number>>()
  const authoritativeIdentityCounts = new Map<string, number>()
  for (const [index, attachment] of recoveryAttachments.entries()) {
    const identity = stableAttachmentIdentity(attachment)
    if (!identity) continue
    const indexes = recoveryIndexesByIdentity.get(identity) ?? []
    indexes.push(index)
    recoveryIndexesByIdentity.set(identity, indexes)
  }
  for (const attachment of authoritativeAttachments) {
    const identity = stableAttachmentIdentity(attachment)
    if (!identity) continue
    authoritativeIdentityCounts.set(
      identity,
      (authoritativeIdentityCounts.get(identity) ?? 0) + 1,
    )
  }

  const consumedRecoveryIndexes = new Set<number>()
  const pairings = authoritativeAttachments.map((attachment) => {
    const identity = stableAttachmentIdentity(attachment)
    const recoveryIndexes = identity
      ? recoveryIndexesByIdentity.get(identity)
      : undefined
    if (
      identity &&
      authoritativeIdentityCounts.get(identity) === 1 &&
      recoveryIndexes?.length === 1 &&
      !consumedRecoveryIndexes.has(recoveryIndexes[0]!)
    ) {
      consumedRecoveryIndexes.add(recoveryIndexes[0]!)
      return recoveryIndexes[0]!
    }
    return null
  })

  if (
    authoritativeAttachments.length === 1 &&
    recoveryAttachments.length === 1 &&
    pairings[0] === null
  ) {
    pairings[0] = 0
  }
  return pairings
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
  const pairings = pairAcknowledgedAttachments(
    authoritativeAttachments,
    recoveryAttachments,
  )
  const consumedRecoveryIndexes = new Set(
    pairings.filter((index): index is number => index !== null),
  )
  const merged = authoritativeAttachments.map(
    (authoritativeAttachment, authoritativeIndex) => {
      const recoveryIndex = pairings[authoritativeIndex]
      if (recoveryIndex === null || recoveryIndex === undefined) {
        return authoritativeAttachment
      }
      const recoveryAttachment = recoveryAttachments[recoveryIndex]!
      return {
        ...authoritativeAttachment,
        ...recoveryAttachment,
        id: authoritativeAttachment.id ?? recoveryAttachment.id,
      }
    },
  )
  for (const [index, recoveryAttachment] of recoveryAttachments.entries()) {
    if (!consumedRecoveryIndexes.has(index)) merged.push(recoveryAttachment)
  }
  return merged
}

function mergeAcknowledgedRecoveryProjection(
  authoritativeMessage: ChatMessage,
  recoveryMessage: ChatMessage,
): ChatMessage {
  const acknowledgement = swarmDeliveryAcknowledgement(recoveryMessage)
  const deliveryMatched = swarmDeliveryAcknowledgementMatches(
    recoveryMessage,
    authoritativeMessage,
  )
  const enriched: ChatMessage = deliveryMatched
    ? {
        ...authoritativeMessage,
        content: recoveryMessage.content,
        ...(acknowledgement
          ? { __swarmDeliveryAcknowledgement: acknowledgement }
          : {}),
      }
    : authoritativeMessage
  if ((recoveryMessage.attachments?.length ?? 0) === 0) return enriched
  return {
    ...enriched,
    attachments: mergeAcknowledgedAttachments(
      authoritativeMessage,
      recoveryMessage,
    ),
  }
}

function authoritativeAttachmentFidelityAcknowledges(
  authoritativeMessage: ChatMessage,
  recoveryMessage: ChatMessage,
): boolean {
  if (
    swarmDeliveryAcknowledgementMatches(recoveryMessage, authoritativeMessage)
  ) {
    return true
  }
  const authoritativeAttachments = authoritativeMessage.attachments ?? []
  const recoveryAttachments = recoveryMessage.attachments ?? []
  if (
    recoveryAttachments.length === 0 ||
    authoritativeAttachments.length !== recoveryAttachments.length
  ) {
    return recoveryAttachments.length === 0
  }
  const pairings = pairAcknowledgedAttachments(
    authoritativeAttachments,
    recoveryAttachments,
  )
  return pairings.every((recoveryIndex, authoritativeIndex) => {
    if (recoveryIndex === null) return false
    const recoveryAttachment = recoveryAttachments[recoveryIndex]
    const authoritativeAttachment = authoritativeAttachments[authoritativeIndex]
    if (!recoveryAttachment || !authoritativeAttachment) return false
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

export type CardTranscriptAcknowledgement = {
  authoritativeMessages: Array<ChatMessage>
  recovery: CardTranscriptRecoveryEnvelope | null
}

export type CardTranscriptAcknowledgementProjection =
  CardTranscriptAcknowledgement & {
    sourceRecovery: CardTranscriptRecoveryEnvelope | null
    acknowledgedMessages: Array<ChatMessage>
  }

/**
 * Compute attachment-enriched authoritative rows and acknowledgement candidates
 * without changing recovery storage. Durable snapshot callers use this exact
 * projection before crossing the recovery-removal boundary.
 */
export function projectAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): CardTranscriptAcknowledgementProjection {
  const sourceRecovery = readCardTranscriptRecovery(owner, options)
  if (!sourceRecovery) {
    return {
      authoritativeMessages,
      recovery: null,
      sourceRecovery: null,
      acknowledgedMessages: [],
    }
  }

  const boundedAuthoritativeStart = Math.max(
    0,
    authoritativeMessages.length - CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES * 4,
  )
  const acknowledgedRecoveryIndexes = new Set<number>()
  const enrichedAuthoritativeMessages = [...authoritativeMessages]
  let authoritativeCursor = boundedAuthoritativeStart

  for (const [
    recoveryIndex,
    recoveryMessage,
  ] of sourceRecovery.messages.entries()) {
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
    enrichedAuthoritativeMessages[authoritativeIndex] =
      mergeAcknowledgedRecoveryProjection(authoritativeMessage, recoveryMessage)
    if (
      authoritativeAttachmentFidelityAcknowledges(
        authoritativeMessages[authoritativeIndex]!,
        recoveryMessage,
      )
    ) {
      acknowledgedRecoveryIndexes.add(recoveryIndex)
    }
  }

  const remaining = sourceRecovery.messages.filter(
    (_recoveryMessage, index) => !acknowledgedRecoveryIndexes.has(index),
  )
  return {
    authoritativeMessages: enrichedAuthoritativeMessages,
    recovery:
      remaining.length > 0 ? { ...sourceRecovery, messages: remaining } : null,
    sourceRecovery,
    acknowledgedMessages: sourceRecovery.messages.filter((_message, index) =>
      acknowledgedRecoveryIndexes.has(index),
    ),
  }
}

function sameRecoveryEnvelope(
  left: CardTranscriptRecoveryEnvelope | null,
  right: CardTranscriptRecoveryEnvelope | null,
): boolean {
  if (!left || !right) return left === right
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

/**
 * Apply only the acknowledgement decision whose exact enriched projection was
 * already verified durable. A recovery change since projection keeps the newer
 * journal intact instead of acknowledging data outside that durability proof.
 */
export function acknowledgeProjectedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  projection: CardTranscriptAcknowledgementProjection,
  options: RecoveryOptions = {},
): CardTranscriptAcknowledgement {
  const recovery = projection.sourceRecovery
  const currentRecovery = readCardTranscriptRecovery(owner, options)
  if (!sameRecoveryEnvelope(currentRecovery, recovery)) {
    return {
      authoritativeMessages: projection.authoritativeMessages,
      recovery: currentRecovery,
    }
  }
  if (!recovery || projection.acknowledgedMessages.length === 0) {
    return {
      authoritativeMessages: projection.authoritativeMessages,
      recovery,
    }
  }

  const storages = resolveDefaultRecoveryStorages(options.storage)
  const key = cardTranscriptRecoveryStorageKey(owner)
  removeMessageJournalValues(
    key,
    projection.acknowledgedMessages,
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
  const remaining = projection.recovery?.messages ?? []
  const nextRecovery =
    remaining.length > 0
      ? replaceCardTranscriptRecoveryMessages(owner, remaining, options)
      : readCardTranscriptRecovery(owner, options)
  return {
    authoritativeMessages: projection.authoritativeMessages,
    recovery: nextRecovery,
  }
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
  const projection = projectAcknowledgedCardTranscriptRecoveryMessages(
    owner,
    authoritativeMessages,
    options,
  )
  return acknowledgeProjectedCardTranscriptRecoveryMessages(
    owner,
    projection,
    options,
  )
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
