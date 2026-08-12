import {
  handoffPendingSendAtomically,
  handoffPendingSendToCardRecoveryAtomically,
  mutatePendingSendAtomically,
  readPendingSend as readIndexedDbPendingSend,
} from './card-transcript-indexeddb'
import type {
  PortableValue,
  V4CardRecoveryRecord,
  V4PendingSendRecord,
} from './card-transcript-indexeddb'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  isCardTranscriptRecoveryMessagePortable,
  mergeCardTranscriptRecoveryMessages,
  readCardTranscriptRecovery,
  sanitizeCardOwnedMessage,
} from './card-transcript-recovery'
import type {
  CardTranscriptRecoveryEnvelope,
  CardTranscriptRecoveryOwner,
} from './card-transcript-recovery'
import type { ChatAttachment, ChatMessage } from './types'

export type PendingSendPayload = {
  sessionKey: string
  friendlyId: string
  /** Per-browser-tab bootstrap owner. Required for the provisional `new` key. */
  provisionalOwnerId?: string
  message: string
  attachments: Array<ChatAttachment>
  optimisticMessage: ChatMessage
  recoveryMessages?: Array<ChatMessage>
}

type PendingSendV4Payload = {
  [key: string]: PortableValue
  version: 4
  sessionKey: string
  friendlyId: string
  provisionalOwnerId: string
  message: string
  attachments: Array<PortableValue>
  optimisticMessage: PortableValue
  recoveryMessages: Array<PortableValue>
}

type StoredPendingSend = Omit<PendingSendPayload, 'recoveryMessages'> & {
  version: 4
  revision: number
  writeId: string
  updatedAt: number
  ownerKey: string
  recoveryMessages: Array<ChatMessage>
}

let pendingSend: PendingSendPayload | null = null
let pendingGeneration = false
let recentSession: { friendlyId: string; at: number } | null = null

const NEW_CHAT_PROVISIONAL_OWNER_SESSION_KEY =
  'workspace.chat-provisional-owner.v4'
const MAX_CAS_ATTEMPTS = 8
const NO_PENDING_CHANGE = Symbol('no-pending-change')
let fallbackProvisionalOwnerId = ''

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function createProvisionalOwnerId(): string {
  return crypto.randomUUID()
}

/** Stable for one browser tab, but independent from sibling `/chat/new` tabs. */
export function getNewChatProvisionalOwnerId(): string {
  if (typeof window === 'undefined') {
    fallbackProvisionalOwnerId ||= createProvisionalOwnerId()
    return fallbackProvisionalOwnerId
  }
  try {
    const existing = normalized(
      window.sessionStorage.getItem(NEW_CHAT_PROVISIONAL_OWNER_SESSION_KEY),
    )
    if (existing) return existing
    const created = createProvisionalOwnerId()
    window.sessionStorage.setItem(
      NEW_CHAT_PROVISIONAL_OWNER_SESSION_KEY,
      created,
    )
    return created
  } catch {
    fallbackProvisionalOwnerId ||= createProvisionalOwnerId()
    return fallbackProvisionalOwnerId
  }
}

/** Clear only the opaque tab locator; no payload is ever stored in sessionStorage. */
export function resetNewChatProvisionalOwnerId(): void {
  fallbackProvisionalOwnerId = ''
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(NEW_CHAT_PROVISIONAL_OWNER_SESSION_KEY)
  } catch {
    // A denied locator does not authorize a payload fallback.
  }
}

export function pendingSendOwnerKey(
  sessionKey: string,
  provisionalOwnerId = '',
): string {
  const normalizedSessionKey = normalized(sessionKey)
  if (!normalizedSessionKey) throw new Error('Pending-send session key is required')
  if (normalizedSessionKey === 'new') {
    const ownerId = normalized(provisionalOwnerId) || getNewChatProvisionalOwnerId()
    return `new:${ownerId}`
  }
  return `session:${normalizedSessionKey}`
}

function pendingMessageClientId(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  return (
    normalized(raw.clientId) ||
    normalized(raw.client_id) ||
    normalized(raw.idempotencyKey)
  )
}

function pendingMessageRunId(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of [
    'recoveryId',
    'runId',
    'run_id',
    'providerRunId',
    'provider_run_id',
  ]) {
    const value = normalized(raw[key])
    if (value) return value
  }
  return ''
}

function pendingMessageText(message: ChatMessage): string {
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('')
}

function lastPendingUserMessage(
  messages: Array<ChatMessage>,
): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messages[index]
  }
  return undefined
}

export function getPendingRecoveryMessages(
  payload: PendingSendPayload,
): Array<ChatMessage> {
  const candidates =
    payload.recoveryMessages && payload.recoveryMessages.length > 0
      ? payload.recoveryMessages
      : [payload.optimisticMessage]
  return mergeCardTranscriptRecoveryMessages(
    [],
    candidates
      .map(sanitizeCardOwnedMessage)
      .filter(isCardTranscriptRecoveryMessagePortable),
  )
}

function isPortableAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((entry) => entry !== undefined)
}

function parsePendingRecord(
  value: unknown,
  ownerKey: string,
): StoredPendingSend {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Pending-send v4 record is malformed')
  }
  const record = value as Record<string, unknown>
  const payload = record.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Pending-send v4 payload is malformed')
  }
  const raw = payload as Record<string, unknown>
  if (
    record.schema !== 4 ||
    record.ownerKey !== ownerKey ||
    typeof record.revision !== 'number' ||
    !Number.isSafeInteger(record.revision) ||
    record.revision <= 0 ||
    !normalized(record.writeId) ||
    typeof record.updatedAt !== 'number' ||
    !Number.isFinite(record.updatedAt) ||
    record.updatedAt <= 0 ||
    raw.version !== 4 ||
    !normalized(raw.sessionKey) ||
    typeof raw.friendlyId !== 'string' ||
    typeof raw.provisionalOwnerId !== 'string' ||
    typeof raw.message !== 'string' ||
    !Array.isArray(raw.attachments) ||
    !raw.attachments.every(isPortableAttachment) ||
    !Array.isArray(raw.recoveryMessages) ||
    !raw.optimisticMessage ||
    typeof raw.optimisticMessage !== 'object'
  ) {
    throw new Error('Pending-send v4 metadata is invalid')
  }
  const optimisticMessage = sanitizeCardOwnedMessage(
    raw.optimisticMessage as ChatMessage,
  )
  const recoveryMessages = raw.recoveryMessages.map((message) =>
    sanitizeCardOwnedMessage(message as ChatMessage),
  )
  if (
    !isCardTranscriptRecoveryMessagePortable(optimisticMessage) ||
    recoveryMessages.some(
      (message) => !isCardTranscriptRecoveryMessagePortable(message),
    )
  ) {
    throw new Error('Pending-send v4 messages are invalid')
  }
  return {
    version: 4,
    ownerKey,
    revision: record.revision,
    writeId: String(record.writeId),
    updatedAt: record.updatedAt,
    sessionKey: String(raw.sessionKey),
    friendlyId: String(raw.friendlyId),
    ...(normalized(raw.provisionalOwnerId)
      ? { provisionalOwnerId: String(raw.provisionalOwnerId) }
      : {}),
    message: String(raw.message),
    attachments: raw.attachments as Array<ChatAttachment>,
    optimisticMessage,
    recoveryMessages,
  }
}

function makePendingRecord(
  ownerKey: string,
  payload: PendingSendPayload,
  previous: StoredPendingSend | null,
): V4PendingSendRecord<PendingSendV4Payload> {
  const provisionalOwnerId =
    payload.sessionKey === 'new'
      ? normalized(payload.provisionalOwnerId) || getNewChatProvisionalOwnerId()
      : ''
  const recoveryMessages = getPendingRecoveryMessages(payload)
  const updatedAt = Date.now()
  return {
    schema: 4,
    ownerKey,
    revision: (previous?.revision ?? 0) + 1,
    writeId: crypto.randomUUID(),
    updatedAt,
    payload: {
      version: 4,
      sessionKey: payload.sessionKey,
      friendlyId: payload.friendlyId,
      provisionalOwnerId,
      message: payload.message,
      attachments: payload.attachments as Array<PortableValue>,
      optimisticMessage: payload.optimisticMessage as PortableValue,
      recoveryMessages: recoveryMessages as Array<PortableValue>,
    },
  }
}

function isCasFailure(error: unknown): boolean {
  return error instanceof Error && error.message.includes('compare-and-swap failed')
}

export async function readPendingMessage(
  sessionKey: string,
  friendlyId?: string,
  provisionalOwnerId = '',
): Promise<PendingSendPayload | null> {
  if (!normalized(sessionKey)) return null
  const ownerKey = pendingSendOwnerKey(sessionKey, provisionalOwnerId)
  const stored = await readIndexedDbPendingSend(ownerKey)
  if (!stored) return null
  const parsed = parsePendingRecord(stored, ownerKey)
  if (friendlyId && parsed.friendlyId !== friendlyId) return null
  return {
    sessionKey: parsed.sessionKey,
    friendlyId: parsed.friendlyId,
    ...(parsed.provisionalOwnerId
      ? { provisionalOwnerId: parsed.provisionalOwnerId }
      : {}),
    message: parsed.message,
    attachments: parsed.attachments,
    optimisticMessage: parsed.optimisticMessage,
    recoveryMessages: parsed.recoveryMessages,
  }
}

async function readStoredPending(
  sessionKey: string,
  provisionalOwnerId = '',
): Promise<StoredPendingSend | null> {
  const ownerKey = pendingSendOwnerKey(sessionKey, provisionalOwnerId)
  const stored = await readIndexedDbPendingSend(ownerKey)
  return stored ? parsePendingRecord(stored, ownerKey) : null
}

async function mutatePending(
  sessionKey: string,
  provisionalOwnerId: string,
  update: (
    current: StoredPendingSend | null,
  ) => PendingSendPayload | null | typeof NO_PENDING_CHANGE,
): Promise<StoredPendingSend | null> {
  const ownerKey = pendingSendOwnerKey(sessionKey, provisionalOwnerId)
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await readStoredPending(sessionKey, provisionalOwnerId)
    const next = update(current)
    if (next === NO_PENDING_CHANGE) return current
    const replacement = next ? makePendingRecord(ownerKey, next, current) : null
    try {
      await mutatePendingSendAtomically({
        ownerKey,
        expectedWriteId: current?.writeId ?? null,
        mutation: replacement
          ? { type: 'replace', record: replacement }
          : { type: 'delete' },
      })
      return replacement ? parsePendingRecord(replacement, ownerKey) : null
    } catch (error) {
      if (isCasFailure(error) && attempt + 1 < MAX_CAS_ATTEMPTS) continue
      throw error
    }
  }
  throw new Error('Pending-send compare-and-swap retries exhausted')
}

export async function persistPendingMessage(
  payload: PendingSendPayload,
): Promise<boolean> {
  const provisionalOwnerId =
    payload.sessionKey === 'new'
      ? normalized(payload.provisionalOwnerId) || getNewChatProvisionalOwnerId()
      : ''
  const optimistic = sanitizeCardOwnedMessage(payload.optimisticMessage)
  if (!isCardTranscriptRecoveryMessagePortable(optimistic)) return false
  let admitted = false
  const result = await mutatePending(
    payload.sessionKey,
    provisionalOwnerId,
    (current) => {
      admitted = false
      const recoveryMessages = mergeCardTranscriptRecoveryMessages(
        current?.recoveryMessages ?? [],
        getPendingRecoveryMessages({ ...payload, optimisticMessage: optimistic }),
      )
      if (
        recoveryMessages.length === 0 ||
        recoveryMessages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES
      ) {
        return NO_PENDING_CHANGE
      }
      const clientId = pendingMessageClientId(optimistic)
      const admittedMessage = recoveryMessages.find(
        (message) => pendingMessageClientId(message) === clientId,
      )
      if (!admittedMessage) return NO_PENDING_CHANGE
      admitted = true
      return {
        ...payload,
        ...(provisionalOwnerId ? { provisionalOwnerId } : {}),
        optimisticMessage: admittedMessage,
        recoveryMessages,
      }
    },
  )
  return result !== null && admitted
}

export async function appendPendingRecoveryMessage(
  sessionKey: string,
  friendlyId: string,
  message: ChatMessage,
  provisionalOwnerId = '',
): Promise<boolean> {
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!isCardTranscriptRecoveryMessagePortable(sanitized)) return false
  let appended = false
  const result = await mutatePending(
    sessionKey,
    provisionalOwnerId,
    (current) => {
      appended = false
      if (!current || current.friendlyId !== friendlyId) {
        return NO_PENDING_CHANGE
      }
      const recoveryMessages = mergeCardTranscriptRecoveryMessages(
        current.recoveryMessages,
        [sanitized],
      )
      if (recoveryMessages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES) {
        throw new Error('Pending-send recovery capacity exceeded')
      }
      appended = true
      return { ...current, recoveryMessages }
    },
  )
  return result !== null && appended
}

export async function checkpointPendingRecoveryMessage(
  sessionKey: string,
  friendlyId: string,
  message: ChatMessage,
  provisionalOwnerId = '',
): Promise<boolean> {
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!isCardTranscriptRecoveryMessagePortable(sanitized)) return false
  let checkpointed = false
  const result = await mutatePending(
    sessionKey,
    provisionalOwnerId,
    (current) => {
      checkpointed = false
      if (!current || current.friendlyId !== friendlyId) {
        return NO_PENDING_CHANGE
      }
      const recoveryMessages = [...current.recoveryMessages]
      const runId = pendingMessageRunId(sanitized)
      const index = recoveryMessages.findIndex(
        (candidate) =>
          candidate.role === 'assistant' &&
          Boolean(runId) &&
          pendingMessageRunId(candidate) === runId,
      )
      if (index >= 0) recoveryMessages[index] = sanitized
      else recoveryMessages.push(sanitized)
      if (recoveryMessages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES) {
        throw new Error('Pending-send recovery capacity exceeded')
      }
      checkpointed = true
      return { ...current, recoveryMessages }
    },
  )
  return result !== null && checkpointed
}

export async function removeRejectedPendingMessage(
  sessionKey: string,
  clientId: string,
  provisionalOwnerId = '',
): Promise<void> {
  const normalizedClientId = normalized(clientId)
  if (!normalizedClientId) return
  await mutatePending(sessionKey, provisionalOwnerId, (current) => {
    if (!current) return null
    const recoveryMessages = current.recoveryMessages.filter(
      (message) => pendingMessageClientId(message) !== normalizedClientId,
    )
    if (recoveryMessages.length === 0) return null
    const optimisticMessage =
      pendingMessageClientId(current.optimisticMessage) === normalizedClientId
        ? lastPendingUserMessage(recoveryMessages)
        : current.optimisticMessage
    if (!optimisticMessage) return null
    return {
      ...current,
      message: pendingMessageText(optimisticMessage),
      attachments: optimisticMessage.attachments ?? [],
      optimisticMessage,
      recoveryMessages,
    }
  })
}

export async function updatePendingMessageByClientId(
  sessionKey: string,
  clientId: string,
  updater: (message: ChatMessage) => ChatMessage,
  provisionalOwnerId = '',
): Promise<boolean> {
  let updated = false
  const result = await mutatePending(
    sessionKey,
    provisionalOwnerId,
    (current) => {
      if (!current) return null
      const recoveryMessages = current.recoveryMessages.map((message) => {
        if (pendingMessageClientId(message) !== clientId) return message
        updated = true
        return sanitizeCardOwnedMessage(updater(message))
      })
      if (!updated) return current
      const optimisticMessage =
        pendingMessageClientId(current.optimisticMessage) === clientId
          ? sanitizeCardOwnedMessage(updater(current.optimisticMessage))
          : current.optimisticMessage
      return { ...current, optimisticMessage, recoveryMessages }
    },
  )
  return result !== null && updated
}

function recoveryHandoffRecord(
  owner: CardTranscriptRecoveryOwner,
  messages: Array<ChatMessage>,
  current: CardTranscriptRecoveryEnvelope | null,
): V4CardRecoveryRecord {
  const updatedAt = Date.now()
  return {
    schema: 4,
    cardId: owner.cardId,
    revision: (current?.revision ?? 0) + 1,
    writeId: crypto.randomUUID(),
    updatedAt,
    payload: {
      version: 4,
      createdAt: current?.createdAt ?? updatedAt,
      messages: messages as Array<PortableValue>,
    },
  }
}

export async function handoffPendingSend(
  fromSessionKey: string,
  toSessionKey: string,
  toFriendlyId: string,
  options: {
    verifiedCardDestination?: boolean
    provisionalOwnerId?: string
  } = {},
): Promise<boolean> {
  const sourceSessionKey = normalized(fromSessionKey)
  const destinationSessionKey = normalized(toSessionKey)
  const destinationFriendlyId = normalized(toFriendlyId) || destinationSessionKey
  if (
    !sourceSessionKey ||
    !destinationSessionKey ||
    sourceSessionKey === destinationSessionKey
  ) {
    return false
  }
  const sourceOwnerKey = pendingSendOwnerKey(
    sourceSessionKey,
    options.provisionalOwnerId,
  )

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const source = await readStoredPending(
      sourceSessionKey,
      options.provisionalOwnerId,
    )
    if (!source) return true
    try {
      if (sourceSessionKey === 'new') {
        const recoveryOwner = { cardId: destinationFriendlyId }
        if (
          !options.verifiedCardDestination ||
          (!destinationFriendlyId.startsWith('remote:') &&
            !destinationFriendlyId.startsWith('local:'))
        ) {
          return false
        }
        const currentRecovery = await readCardTranscriptRecovery(recoveryOwner)
        const messages = mergeCardTranscriptRecoveryMessages(
          currentRecovery?.messages ?? [],
          source.recoveryMessages,
        )
        if (messages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES) {
          throw new Error('Card recovery capacity exceeded during handoff')
        }
        await handoffPendingSendToCardRecoveryAtomically({
          sourceOwnerKey,
          expectedPendingWriteId: source.writeId,
          recoveryCardId: destinationFriendlyId,
          expectedRecoveryWriteId: currentRecovery?.writeId ?? null,
          recoveryMutation: {
            type: 'merge',
            record: recoveryHandoffRecord(
              recoveryOwner,
              messages,
              currentRecovery,
            ),
          },
        })
      } else {
        const destinationOwnerKey = pendingSendOwnerKey(destinationSessionKey)
        const destination = await readStoredPending(destinationSessionKey)
        const nextPayload: PendingSendPayload = {
          ...source,
          sessionKey: destinationSessionKey,
          friendlyId: destinationFriendlyId,
          recoveryMessages: mergeCardTranscriptRecoveryMessages(
            destination?.recoveryMessages ?? [],
            source.recoveryMessages,
          ),
        }
        const destinationRecord = makePendingRecord(
          destinationOwnerKey,
          nextPayload,
          destination,
        )
        await handoffPendingSendAtomically({
          sourceOwnerKey,
          expectedSourceWriteId: source.writeId,
          destination: destinationRecord,
          ...(destination
            ? {
                existingDestinationMerge: {
                  expectedWriteId: destination.writeId,
                  record: destinationRecord,
                },
              }
            : {}),
        })
      }
      if (pendingSend?.sessionKey === sourceSessionKey) pendingSend = null
      return true
    } catch (error) {
      if (isCasFailure(error) && attempt + 1 < MAX_CAS_ATTEMPTS) continue
      throw error
    }
  }
  throw new Error('Pending-send handoff compare-and-swap retries exhausted')
}

export async function clearPendingMessage(
  sessionKey: string,
  provisionalOwnerId = '',
): Promise<void> {
  if (!normalized(sessionKey)) return
  await mutatePending(sessionKey, provisionalOwnerId, () => null)
}

export async function stashPendingSend(
  payload: PendingSendPayload,
): Promise<boolean> {
  const persisted = await persistPendingMessage(payload)
  if (persisted) pendingSend = payload
  return persisted
}

export function hasPendingSend(): boolean {
  return pendingSend !== null
}

export function setPendingGeneration(value: boolean): void {
  pendingGeneration = value
}

export function hasPendingGeneration(): boolean {
  return pendingGeneration
}

export async function resetPendingSend(): Promise<void> {
  const current = pendingSend
  pendingSend = null
  pendingGeneration = false
  if (current?.sessionKey) {
    await clearPendingMessage(current.sessionKey, current.provisionalOwnerId)
  }
  resetNewChatProvisionalOwnerId()
}

export async function clearPendingSendForSession(
  sessionKey: string,
  friendlyId: string,
): Promise<void> {
  if (normalized(sessionKey)) await clearPendingMessage(sessionKey)
  if (
    pendingSend &&
    ((sessionKey && pendingSend.sessionKey === sessionKey) ||
      (friendlyId && pendingSend.friendlyId === friendlyId))
  ) {
    pendingSend = null
  }
}

export function cleanupExpiredPendingSends(): void {
  // Clean v4 pending rows have no time-based deletion policy.
}

export function setRecentSession(friendlyId: string): void {
  recentSession = { friendlyId, at: Date.now() }
}

export function isRecentSession(friendlyId: string, maxAgeMs = 15000): boolean {
  if (!recentSession || recentSession.friendlyId !== friendlyId) return false
  return Date.now() - recentSession.at <= maxAgeMs
}

export function consumePendingSend(
  sessionKey: string,
  friendlyId?: string,
): PendingSendPayload | null {
  if (!pendingSend) return null
  if (
    (sessionKey && pendingSend.sessionKey === sessionKey) ||
    (friendlyId && pendingSend.friendlyId === friendlyId)
  ) {
    const payload = pendingSend
    pendingSend = null
    return payload
  }
  return null
}
