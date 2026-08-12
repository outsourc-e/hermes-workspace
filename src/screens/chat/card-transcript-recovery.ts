import { parsePortableAttachmentDataUrl } from './attachment-envelope'
import {
  mutateCardRecoveryAtomically,
  readCardRecovery as readIndexedDbCardRecovery,
  readLatestCardSnapshot,
  writeSnapshotAndAcknowledgeRecoveryAtomically,
} from './card-transcript-indexeddb'
import type {
  PortableValue,
  V4CardRecoveryRecord,
  V4LatestCardSnapshotRecord,
} from './card-transcript-indexeddb'
import type { ChatAttachment, ChatMessage } from './types'
import type { SwarmDirectChatUserAcknowledgement } from '@/lib/swarm-direct-chat-delivery'
import {
  SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
  parseSwarmDirectChatUserAcknowledgement,
  swarmDirectChatContentDigest,
} from '@/lib/swarm-direct-chat-delivery'

export const CARD_TRANSCRIPT_RECOVERY_VERSION = 4 as const
export const CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES = 50
export const CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGE_CHARS = 256 * 1024
export const CARD_TRANSCRIPT_RECOVERY_MAX_ENVELOPE_CHARS = 2 * 1024 * 1024
export const CARD_TRANSCRIPT_RECOVERY_MAX_ATTACHMENTS = 8
export const CARD_TRANSCRIPT_RECOVERY_MAX_ATTACHMENT_CHARS = 512 * 1024
export const CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS = 128 * 1024
const MAX_CAS_ATTEMPTS = 8

export type CardTranscriptRecoveryOwner = { cardId: string }
export type CardTranscriptRecoveryEnvelope = {
  version: 4
  cardId: string
  createdAt: number
  messages: Array<ChatMessage>
  revision: number
  writeId: string
  updatedAt: number
}

type CardTranscriptRecoveryPayload = {
  version: 4
  createdAt: number
  messages: Array<PortableValue>
}

type RecoveryOptions = { now?: number }

/** Test/process seam retained without an in-memory durability authority. */
export async function clearCardTranscriptRecoveryMemory(): Promise<void> {}

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

function streamToolCalls(message: ChatMessage): Array<Record<string, unknown>> {
  return Array.isArray(message.__streamToolCalls)
    ? (message.__streamToolCalls as Array<Record<string, unknown>>)
    : []
}

function streamToolCallIdentity(toolCall: Record<string, unknown>): string {
  for (const key of ['id', 'toolCallId', 'tool_call_id', 'callId', 'call_id']) {
    const value = normalizedString(toolCall[key])
    if (value) return value
  }
  return ''
}

function mergeDefinedToolCallFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) merged[key] = value
  }
  return merged
}

/**
 * Merge compact stream evidence by stable call identity. Calls without a stable
 * identity remain distinct rather than being collapsed by an index/type guess.
 * Defined incoming fields are newer and win; existing fields fill omissions.
 */
function mergeStreamToolCalls(
  existing: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = existing.map((toolCall) => ({ ...toolCall }))
  const indexesByIdentity = new Map<string, number>()
  for (const [index, toolCall] of merged.entries()) {
    const identity = streamToolCallIdentity(toolCall)
    if (identity && !indexesByIdentity.has(identity)) {
      indexesByIdentity.set(identity, index)
    }
  }
  for (const toolCall of incoming) {
    const identity = streamToolCallIdentity(toolCall)
    const existingIndex = identity ? indexesByIdentity.get(identity) : undefined
    if (existingIndex === undefined) {
      if (identity) indexesByIdentity.set(identity, merged.length)
      merged.push({ ...toolCall })
      continue
    }
    merged[existingIndex] = mergeDefinedToolCallFields(
      merged[existingIndex]!,
      toolCall,
    )
  }
  return merged
}

function mergeAcknowledgedRecoveryProjection(
  authoritativeMessage: ChatMessage,
  recoveryMessage: ChatMessage,
): ChatMessage {
  const recoveredStreamToolCalls = streamToolCalls(recoveryMessage)
  const mergedStreamToolCalls = mergeStreamToolCalls(
    streamToolCalls(authoritativeMessage),
    recoveredStreamToolCalls,
  )
  const streamEnriched: ChatMessage =
    recoveredStreamToolCalls.length > 0
      ? {
          ...authoritativeMessage,
          __streamToolCalls: mergedStreamToolCalls,
        }
      : authoritativeMessage
  const acknowledgement = swarmDeliveryAcknowledgement(recoveryMessage)
  const deliveryMatched = swarmDeliveryAcknowledgementMatches(
    recoveryMessage,
    authoritativeMessage,
  )
  const enriched: ChatMessage = deliveryMatched
    ? {
        ...streamEnriched,
        content: recoveryMessage.content,
        ...(acknowledgement
          ? { __swarmDeliveryAcknowledgement: acknowledgement }
          : {}),
      }
    : streamEnriched
  if ((recoveryMessage.attachments?.length ?? 0) === 0) return enriched
  return {
    ...enriched,
    attachments: mergeAcknowledgedAttachments(
      authoritativeMessage,
      recoveryMessage,
    ),
  }
}

const AUTHORITATIVE_IDENTITY_FIELDS = [
  ['id'],
  ['messageId', 'message_id'],
  ['stableId', 'stable_id'],
] as const

function hasSameAuthoritativeIdentityField(
  left: ChatMessage,
  right: ChatMessage,
): boolean {
  return AUTHORITATIVE_IDENTITY_FIELDS.some((aliases) =>
    intersects(identifierSet(left, aliases), identifierSet(right, aliases)),
  )
}

/**
 * Reapply browser-owned stream tool metadata only to the same authoritative
 * server message that previously received it. Content or timestamp similarity
 * is intentionally insufficient because repeated assistant text is common.
 * Identity aliases are compared within their semantic field, never as one
 * unordered bag where an `id` could collide with an unrelated `stableId`.
 */
export function mergeSnapshotBackedStreamToolCalls(
  authoritativeMessages: Array<ChatMessage>,
  snapshotMessages: Array<ChatMessage>,
): Array<ChatMessage> {
  return authoritativeMessages.map((authoritativeMessage) => {
    const matches = snapshotMessages.filter((snapshotMessage) => {
      if (snapshotMessage.role !== authoritativeMessage.role) return false
      if (streamToolCalls(snapshotMessage).length === 0) return false
      return hasSameAuthoritativeIdentityField(
        authoritativeMessage,
        snapshotMessage,
      )
    })
    if (matches.length !== 1) return authoritativeMessage
    const mergedToolCalls = mergeStreamToolCalls(
      streamToolCalls(matches[0]!),
      streamToolCalls(authoritativeMessage),
    )
    return {
      ...authoritativeMessage,
      __streamToolCalls: mergedToolCalls,
    }
  })
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


function projectAcknowledgedCardTranscriptRecoveryMessagesFromEnvelope(
  authoritativeMessages: Array<ChatMessage>,
  sourceRecovery: CardTranscriptRecoveryEnvelope | null,
): CardTranscriptAcknowledgementProjection {
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


function nowValue(options: RecoveryOptions = {}): number {
  const value = options.now ?? Date.now()
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Card recovery timestamp is invalid')
  }
  return value
}

function writeId(): string {
  return crypto.randomUUID()
}

function isCasFailure(error: unknown): boolean {
  return error instanceof Error && error.message.includes('compare-and-swap failed')
}

function parseRecoveryRecord(
  value: unknown,
  expectedOwner: CardTranscriptRecoveryOwner,
): CardTranscriptRecoveryEnvelope {
  if (!record(value)) throw new Error('Card recovery v4 record is malformed')
  const payload = value.payload
  if (
    value.schema !== 4 ||
    value.cardId !== expectedOwner.cardId ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision <= 0 ||
    typeof value.writeId !== 'string' ||
    !value.writeId.trim() ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0 ||
    !record(payload) ||
    payload.version !== 4 ||
    typeof payload.createdAt !== 'number' ||
    !Number.isFinite(payload.createdAt) ||
    payload.createdAt <= 0 ||
    !Array.isArray(payload.messages)
  ) {
    throw new Error('Card recovery v4 record metadata is invalid')
  }
  const messages = payload.messages.map((candidate) =>
    sanitizeCardOwnedMessage(candidate as ChatMessage),
  )
  if (
    messages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES ||
    messages.some((message) => !validMessage(message))
  ) {
    throw new Error('Card recovery v4 payload is invalid')
  }
  return {
    version: 4,
    cardId: expectedOwner.cardId,
    createdAt: payload.createdAt,
    messages: dedupeMessages(messages),
    revision: value.revision,
    writeId: value.writeId,
    updatedAt: value.updatedAt,
  }
}

function recoveryRecord(
  owner: CardTranscriptRecoveryOwner,
  messages: Array<ChatMessage>,
  previous: CardTranscriptRecoveryEnvelope | null,
  options: RecoveryOptions = {},
): V4CardRecoveryRecord<CardTranscriptRecoveryPayload> {
  const timestamp = nowValue(options)
  return {
    schema: 4,
    cardId: owner.cardId,
    revision: (previous?.revision ?? 0) + 1,
    writeId: writeId(),
    updatedAt: timestamp,
    payload: {
      version: 4,
      createdAt: previous?.createdAt ?? timestamp,
      messages: messages as Array<PortableValue>,
    },
  }
}

function envelopeFromRecord(
  value: V4CardRecoveryRecord<CardTranscriptRecoveryPayload>,
  owner: CardTranscriptRecoveryOwner,
): CardTranscriptRecoveryEnvelope {
  return parseRecoveryRecord(value, owner)
}

export function parseCardTranscriptRecovery(
  value: unknown,
  expectedOwner: CardTranscriptRecoveryOwner,
): CardTranscriptRecoveryEnvelope | null {
  if (!isValidCardTranscriptRecoveryOwner(expectedOwner)) return null
  try {
    return parseRecoveryRecord(value, expectedOwner)
  } catch {
    return null
  }
}

export async function readCardTranscriptRecovery(
  owner: CardTranscriptRecoveryOwner,
  _options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return null
  const stored = await readIndexedDbCardRecovery(owner.cardId)
  if (!stored) return null
  return parseRecoveryRecord(stored, owner)
}

async function mutateRecovery(
  owner: CardTranscriptRecoveryOwner,
  update: (
    current: CardTranscriptRecoveryEnvelope | null,
  ) => Array<ChatMessage> | null,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  if (!isValidCardTranscriptRecoveryOwner(owner)) return null
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await readCardTranscriptRecovery(owner, options)
    const messages = update(current)
    const replacement = messages?.length
      ? recoveryRecord(owner, messages, current, options)
      : null
    try {
      await mutateCardRecoveryAtomically({
        cardId: owner.cardId,
        expectedWriteId: current?.writeId ?? null,
        mutation: replacement
          ? { type: 'replace', record: replacement }
          : { type: 'delete' },
      })
      return replacement ? envelopeFromRecord(replacement, owner) : null
    } catch (error) {
      if (isCasFailure(error) && attempt + 1 < MAX_CAS_ATTEMPTS) continue
      throw error
    }
  }
  throw new Error('Card recovery compare-and-swap retries exhausted')
}

export async function clearCardTranscriptRecovery(
  owner: CardTranscriptRecoveryOwner,
  options: RecoveryOptions = {},
): Promise<void> {
  await mutateRecovery(owner, () => null, options)
}

export async function replaceCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  messages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  const sanitized = messages.map(sanitizeCardOwnedMessage)
  if (sanitized.some((message) => !validMessage(message))) return null
  return mutateRecovery(
    owner,
    (current) => {
      const merged = dedupeMessages([...(current?.messages ?? []), ...sanitized])
      if (merged.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES) {
        throw new Error('Card recovery capacity exceeded')
      }
      return merged
    },
    options,
  )
}

export async function appendCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  message: ChatMessage,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!validMessage(sanitized)) return null
  return replaceCardTranscriptRecoveryMessages(owner, [sanitized], options)
}

export async function checkpointCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  message: ChatMessage,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!validMessage(sanitized)) return null
  return mutateRecovery(
    owner,
    (current) => {
      const messages = [...(current?.messages ?? [])]
      const runId = messageRunIdentity(sanitized)
      const index = messages.findIndex(
        (candidate) =>
          candidate.role === 'assistant' &&
          Boolean(runId) &&
          messageRunIdentity(candidate) === runId,
      )
      if (index >= 0) messages[index] = sanitized
      else messages.push(sanitized)
      if (messages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES) {
        throw new Error('Card recovery capacity exceeded')
      }
      return messages
    },
    options,
  )
}

export async function removeRejectedCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  clientId: string,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  const normalizedClientId = normalizedString(clientId)
  if (!normalizedClientId) return readCardTranscriptRecovery(owner, options)
  return mutateRecovery(
    owner,
    (current) =>
      (current?.messages ?? []).filter(
        (message) => !hasRecoveryClientIdentity(message, normalizedClientId),
      ),
    options,
  )
}

export async function acknowledgeDeliveredCardTranscriptRecoveryMessage(
  owner: CardTranscriptRecoveryOwner,
  clientId: string,
  acknowledgementValue: unknown,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  const normalizedClientId = normalizedString(clientId)
  const acknowledgement = parseSwarmDirectChatUserAcknowledgement(
    acknowledgementValue,
    normalizedClientId,
  )
  if (!acknowledgement) return readCardTranscriptRecovery(owner, options)
  return mutateRecovery(
    owner,
    (current) =>
      (current?.messages ?? []).map((message) =>
        hasRecoveryClientIdentity(message, normalizedClientId) &&
        swarmAcknowledgementAttachmentsMatchRecovery(message, acknowledgement)
          ? {
              ...message,
              status: 'sent',
              __swarmDeliveryAcknowledgement: acknowledgement,
            }
          : message,
      ),
    options,
  )
}

export async function projectAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): Promise<CardTranscriptAcknowledgementProjection> {
  return projectAcknowledgedCardTranscriptRecoveryMessagesFromEnvelope(
    authoritativeMessages,
    await readCardTranscriptRecovery(owner, options),
  )
}

function sameRecoveryEnvelope(
  left: CardTranscriptRecoveryEnvelope | null,
  right: CardTranscriptRecoveryEnvelope | null,
): boolean {
  return left?.writeId === right?.writeId
}

export async function acknowledgeProjectedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  projection: CardTranscriptAcknowledgementProjection,
  options: RecoveryOptions = {},
): Promise<CardTranscriptAcknowledgement> {
  const current = await readCardTranscriptRecovery(owner, options)
  if (!sameRecoveryEnvelope(current, projection.sourceRecovery)) {
    return { authoritativeMessages: projection.authoritativeMessages, recovery: current }
  }
  const acknowledged = new Set(projection.acknowledgedMessages.map(recoveryMessageIdentity))
  const recovery = await mutateRecovery(
    owner,
    (latest) =>
      (latest?.messages ?? []).filter(
        (message) => !acknowledged.has(recoveryMessageIdentity(message)),
      ),
    options,
  )
  return { authoritativeMessages: projection.authoritativeMessages, recovery }
}

function snapshotMetadata(previous: unknown): { revision: number } {
  if (
    record(previous) &&
    previous.schema === 4 &&
    typeof previous.revision === 'number' &&
    Number.isSafeInteger(previous.revision) &&
    previous.revision > 0
  ) {
    return { revision: previous.revision + 1 }
  }
  return { revision: 1 }
}

export async function writeSnapshotAndAcknowledgeCardTranscriptRecovery(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): Promise<CardTranscriptAcknowledgement> {
  const sanitizedAuthoritative = authoritativeMessages.map(sanitizeCardOwnedMessage)
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const recovery = await readCardTranscriptRecovery(owner, options)
    const projection = projectAcknowledgedCardTranscriptRecoveryMessagesFromEnvelope(
      sanitizedAuthoritative,
      recovery,
    )
    const previousSnapshot = await readLatestCardSnapshot(owner.cardId)
    const timestamp = nowValue(options)
    const snapshot: V4LatestCardSnapshotRecord = {
      schema: 4,
      cardId: owner.cardId,
      revision: snapshotMetadata(previousSnapshot).revision,
      writeId: writeId(),
      updatedAt: timestamp,
      payload: {
        version: 4,
        messages: projection.authoritativeMessages as Array<PortableValue>,
      },
    }
    const remaining = projection.recovery?.messages ?? []
    const replacement = remaining.length
      ? recoveryRecord(owner, remaining, recovery, options)
      : null
    try {
      await writeSnapshotAndAcknowledgeRecoveryAtomically({
        snapshot,
        expectedRecoveryWriteId: recovery?.writeId ?? null,
        recoveryMutation: replacement
          ? { type: 'replace', record: replacement }
          : { type: 'delete' },
      })
      return {
        authoritativeMessages: projection.authoritativeMessages,
        recovery: replacement ? envelopeFromRecord(replacement, owner) : null,
      }
    } catch (error) {
      if (isCasFailure(error) && attempt + 1 < MAX_CAS_ATTEMPTS) continue
      throw error
    }
  }
  throw new Error('Snapshot acknowledgement compare-and-swap retries exhausted')
}

export async function reconcileAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): Promise<CardTranscriptAcknowledgement> {
  const projection = await projectAcknowledgedCardTranscriptRecoveryMessages(
    owner,
    authoritativeMessages,
    options,
  )
  return acknowledgeProjectedCardTranscriptRecoveryMessages(owner, projection, options)
}

export async function removeAcknowledgedCardTranscriptRecoveryMessages(
  owner: CardTranscriptRecoveryOwner,
  authoritativeMessages: Array<ChatMessage>,
  options: RecoveryOptions = {},
): Promise<CardTranscriptRecoveryEnvelope | null> {
  return (
    await reconcileAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      authoritativeMessages,
      options,
    )
  ).recovery
}
