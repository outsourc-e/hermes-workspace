import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  cardTranscriptMessagesMatch,
  isCardTranscriptRecoveryMessagePortable,
  replaceCardTranscriptRecoveryMessages,
  sanitizeCardOwnedMessage,
} from './card-transcript-recovery'
import {
  clearMessageJournal,
  readMessageJournal,
  writeMessageJournal,
} from './durable-message-journal'
import type { ChatAttachment, ChatMessage } from './types'

export type PendingSendPayload = {
  sessionKey: string
  friendlyId: string
  /** Per-browser-tab bootstrap owner. Required for the provisional `new` key. */
  provisionalOwnerId?: string
  message: string
  attachments: Array<ChatAttachment>
  optimisticMessage: ChatMessage
  /** Durable bootstrap transcript retained until a verified Card migration. */
  recoveryMessages?: Array<ChatMessage>
}

let pendingSend: PendingSendPayload | null = null
let pendingGeneration = false
let recentSession: { friendlyId: string; at: number } | null = null

const PENDING_MESSAGE_STORAGE_PREFIX = 'claude_pending_msg_'
const LEGACY_NEW_CHAT_PROVISIONAL_STORAGE_KEY =
  'workspace.chat-provisional-send.v1:new-chat'
const NEW_CHAT_PROVISIONAL_STORAGE_PREFIX =
  'workspace.chat-provisional-send.v2:new-chat:'
const NEW_CHAT_PROVISIONAL_OWNER_SESSION_KEY =
  'workspace.chat-provisional-owner.v1'
let fallbackProvisionalOwnerId = ''

type PersistedPendingSendPayload = PendingSendPayload & {
  storedAt: number
}

function canUseLocalStorage() {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function normalizedProvisionalOwnerId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function createProvisionalOwnerId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `bootstrap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

/** Stable for one browser tab, but independent from sibling `/chat/new` tabs. */
export function getNewChatProvisionalOwnerId(): string {
  if (typeof window === 'undefined') return createProvisionalOwnerId()
  try {
    const existing = normalizedProvisionalOwnerId(
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

function pendingJournalIdentity(message: ChatMessage): string {
  const role = message.role ?? 'unknown'
  const runId = pendingMessageRunId(message)
  if (runId) return `${role}:run:${runId}`
  const clientId = pendingMessageClientId(message)
  if (clientId) {
    return `${role}:client:${clientId}:${JSON.stringify({ content: message.content, attachments: message.attachments ?? [] })}`
  }
  const raw = message as Record<string, unknown>
  for (const key of ['stableId', 'stable_id', 'id', 'messageId']) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) {
      return `${role}:${key}:${value.trim()}`
    }
  }
  const serialized = JSON.stringify(message)
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${role}:value:${(hash >>> 0).toString(36)}`
}

function readPendingJournal(key: string): Array<ChatMessage> {
  if (!canUseLocalStorage()) return []
  return readMessageJournal(
    key,
    [window.localStorage],
    pendingJournalIdentity,
    (value) => {
      const message = sanitizeCardOwnedMessage(value as ChatMessage)
      return isCardTranscriptRecoveryMessagePortable(message) ? message : null
    },
  )
}

function getPendingStorageKey(sessionKey: string, provisionalOwnerId = '') {
  if (sessionKey === 'new') {
    const ownerId =
      normalizedProvisionalOwnerId(provisionalOwnerId) ||
      getNewChatProvisionalOwnerId()
    return `${NEW_CHAT_PROVISIONAL_STORAGE_PREFIX}${encodeURIComponent(ownerId)}`
  }
  return `${PENDING_MESSAGE_STORAGE_PREFIX}${sessionKey || 'main'}`
}

function isPendingStorageKey(key: string | null): key is string {
  if (!key || key.includes(':entry:')) return false
  return (
    key === LEGACY_NEW_CHAT_PROVISIONAL_STORAGE_KEY ||
    key.startsWith(NEW_CHAT_PROVISIONAL_STORAGE_PREFIX) ||
    key.startsWith(PENDING_MESSAGE_STORAGE_PREFIX)
  )
}

function toPendingSendPayload(
  parsed: Record<string, unknown>,
): PendingSendPayload | null {
  const optimisticMessage = parsed.optimisticMessage
  if (
    typeof parsed.sessionKey !== 'string' ||
    typeof parsed.friendlyId !== 'string' ||
    typeof parsed.message !== 'string' ||
    !optimisticMessage ||
    typeof optimisticMessage !== 'object'
  ) {
    return null
  }

  const provisionalOwnerId = normalizedProvisionalOwnerId(
    parsed.provisionalOwnerId,
  )
  if (parsed.sessionKey === 'new' && !provisionalOwnerId) return null

  const sanitizedOptimisticMessage = sanitizeCardOwnedMessage(
    optimisticMessage as ChatMessage,
  )
  if (!isCardTranscriptRecoveryMessagePortable(sanitizedOptimisticMessage)) {
    return null
  }
  const recoveryMessages = Array.isArray(parsed.recoveryMessages)
    ? parsed.recoveryMessages.map((message) =>
        sanitizeCardOwnedMessage(message as ChatMessage),
      )
    : [sanitizedOptimisticMessage]
  if (
    recoveryMessages.some(
      (message) => !isCardTranscriptRecoveryMessagePortable(message),
    )
  ) {
    return null
  }

  return {
    sessionKey: parsed.sessionKey,
    friendlyId: parsed.friendlyId,
    ...(provisionalOwnerId ? { provisionalOwnerId } : {}),
    message: parsed.message,
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    optimisticMessage: sanitizedOptimisticMessage,
    recoveryMessages:
      recoveryMessages.length > 0
        ? recoveryMessages
        : [sanitizedOptimisticMessage],
  }
}

export function getPendingRecoveryMessages(
  payload: PendingSendPayload,
): Array<ChatMessage> {
  const candidates =
    payload.recoveryMessages && payload.recoveryMessages.length > 0
      ? payload.recoveryMessages
      : [payload.optimisticMessage]
  const messages: Array<ChatMessage> = []
  for (const candidate of candidates) {
    const sanitized = sanitizeCardOwnedMessage(candidate)
    if (!isCardTranscriptRecoveryMessagePortable(sanitized)) continue
    const matchingIndex = messages.findIndex((message) =>
      cardTranscriptMessagesMatch(message, sanitized),
    )
    if (matchingIndex >= 0) messages[matchingIndex] = sanitized
    else messages.push(sanitized)
  }
  return messages
}

function writePendingSendToStorage(
  payload: PendingSendPayload,
  reserveTerminal = false,
): boolean {
  if (!canUseLocalStorage()) return false

  cleanupExpiredPendingSends()

  const provisionalOwnerId =
    payload.sessionKey === 'new'
      ? normalizedProvisionalOwnerId(payload.provisionalOwnerId) ||
        getNewChatProvisionalOwnerId()
      : undefined
  const ownedPayload: PendingSendPayload = {
    ...payload,
    ...(provisionalOwnerId ? { provisionalOwnerId } : {}),
  }

  // A provisional owner can accept another turn before a Card handoff. Preserve
  // only this tab's prior rows; sibling `/new` tabs use independent keys.
  let existing: PendingSendPayload | null = null
  const key = getPendingStorageKey(
    ownedPayload.sessionKey,
    ownedPayload.provisionalOwnerId,
  )
  try {
    const raw = window.localStorage.getItem(key)
    existing = raw
      ? toPendingSendPayload(JSON.parse(raw) as Record<string, unknown>)
      : null
  } catch {
    existing = null
  }
  const recoveryMessages = getPendingRecoveryMessages({
    ...ownedPayload,
    recoveryMessages: [
      ...(existing ? getPendingRecoveryMessages(existing) : []),
      ...readPendingJournal(key),
      ...getPendingRecoveryMessages(ownedPayload),
    ],
  })
  // Reserve one row for the terminal assistant before admitting the user send.
  // The follow-up terminal append may consume that row, but neither path may
  // evict a previously accepted recovery turn.
  if (
    recoveryMessages.length === 0 ||
    recoveryMessages.length > CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES ||
    (reserveTerminal &&
      recoveryMessages.length >= CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES)
  ) {
    return false
  }
  const optimisticClientId = pendingMessageClientId(
    ownedPayload.optimisticMessage,
  )
  const optimisticMessage = recoveryMessages.find(
    (message) => pendingMessageClientId(message) === optimisticClientId,
  )
  if (!optimisticMessage) return false

  const record: PersistedPendingSendPayload = {
    ...ownedPayload,
    optimisticMessage,
    recoveryMessages,
    storedAt: Date.now(),
  }

  try {
    const journalWrite = writeMessageJournal(
      key,
      recoveryMessages,
      [window.localStorage],
      pendingJournalIdentity,
    )
    if (!journalWrite.persistentVerified) return false
    const serialized = JSON.stringify(record)
    window.localStorage.setItem(key, serialized)
    // The per-message journal is the cross-context authority. The aggregate
    // record is retained for transport metadata and legacy readers.
    window.localStorage.getItem(key)
    return true
  } catch {
    return false
  }
}

function readPendingSendFromStorageByFriendlyId(
  friendlyId: string,
): PendingSendPayload | null {
  if (!canUseLocalStorage() || !friendlyId) return null

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!isPendingStorageKey(key)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as PersistedPendingSendPayload
        if (parsed.friendlyId !== friendlyId) continue
        return toPendingSendPayload(parsed)
      } catch {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // Ignore storage read failures.
  }

  return null
}

function removePendingSendFromStorageByFriendlyId(friendlyId: string) {
  if (!canUseLocalStorage() || !friendlyId) return

  try {
    const keysToDelete: Array<string> = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!isPendingStorageKey(key)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as PersistedPendingSendPayload
        if (parsed.friendlyId === friendlyId) {
          keysToDelete.push(key)
        }
      } catch {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function cleanupExpiredPendingSends() {
  // Intentionally retained as a compatibility no-op. Pending, failed,
  // cancelled, and retryable turns have no safe time-based deletion point.
}

export function persistPendingMessage(payload: PendingSendPayload): boolean {
  return writePendingSendToStorage(payload, true)
}

/** Append terminal bootstrap output without relinquishing provisional ownership. */
export function appendPendingRecoveryMessage(
  sessionKey: string,
  friendlyId: string,
  message: ChatMessage,
  provisionalOwnerId = '',
): boolean {
  const source = readPendingMessage(sessionKey, friendlyId, provisionalOwnerId)
  if (!source) return false
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!isCardTranscriptRecoveryMessagePortable(sanitized)) return false
  return writePendingSendToStorage({
    ...source,
    recoveryMessages: [...getPendingRecoveryMessages(source), sanitized],
  })
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
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Persist the newest bootstrap assistant prefix without accumulating copies. */
export function checkpointPendingRecoveryMessage(
  sessionKey: string,
  friendlyId: string,
  message: ChatMessage,
  provisionalOwnerId = '',
): boolean {
  const source = readPendingMessage(sessionKey, friendlyId, provisionalOwnerId)
  if (!source) return false
  const sanitized = sanitizeCardOwnedMessage(message)
  if (!isCardTranscriptRecoveryMessagePortable(sanitized)) return false
  const runId = pendingMessageRunId(sanitized)
  const recoveryMessages = getPendingRecoveryMessages(source)
  const index = recoveryMessages.findIndex(
    (candidate) =>
      candidate.role === 'assistant' &&
      Boolean(runId) &&
      pendingMessageRunId(candidate) === runId,
  )
  if (index >= 0) recoveryMessages[index] = sanitized
  else recoveryMessages.push(sanitized)
  return writePendingSendToStorage({ ...source, recoveryMessages })
}

function pendingMessageClientId(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of ['clientId', 'client_id', 'idempotencyKey']) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Update the durable provisional/legacy overlay before a route can remount. */
export function updatePendingMessageByClientId(
  clientId: string,
  updater: (message: ChatMessage) => ChatMessage,
): boolean {
  if (!canUseLocalStorage() || !clientId) return false
  let updated = false
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!isPendingStorageKey(key)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as PersistedPendingSendPayload
        const payload = toPendingSendPayload(parsed)
        if (
          !payload ||
          pendingMessageClientId(payload.optimisticMessage) !== clientId
        ) {
          continue
        }
        const optimisticMessage = sanitizeCardOwnedMessage(
          updater(payload.optimisticMessage),
        )
        const recoveryMessages = getPendingRecoveryMessages(payload).map(
          (message) =>
            pendingMessageClientId(message) === clientId
              ? optimisticMessage
              : message,
        )
        const next = { ...parsed, optimisticMessage, recoveryMessages }
        window.localStorage.setItem(key, JSON.stringify(next))
        if (
          pendingSend &&
          pendingMessageClientId(pendingSend.optimisticMessage) === clientId
        ) {
          pendingSend = {
            ...pendingSend,
            optimisticMessage,
            recoveryMessages,
          }
        }
        updated = true
      } catch {
        // One malformed/stale sibling record must not block the provisional owner.
      }
    }
  } catch {
    return updated
  }
  return updated
}

export function handoffPendingSend(
  fromSessionKey: string,
  toSessionKey: string,
  toFriendlyId: string,
  options: {
    verifiedCardDestination?: boolean
    provisionalOwnerId?: string
  } = {},
) {
  const normalizedFrom = fromSessionKey.trim()
  const normalizedTo = toSessionKey.trim()
  const normalizedFriendlyId = toFriendlyId.trim() || normalizedTo
  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo)
    return

  const persisted = readPendingMessage(
    normalizedFrom,
    undefined,
    options.provisionalOwnerId,
  )
  const source =
    pendingSend?.sessionKey === normalizedFrom &&
    (!options.provisionalOwnerId ||
      pendingSend.provisionalOwnerId === options.provisionalOwnerId)
      ? pendingSend
      : persisted
  if (!source) return

  // A bootstrap owner can move only into a verified source-qualified Card.
  // Never replace the provisional key with a raw canonical segment key.
  if (normalizedFrom === 'new') {
    if (
      !options.verifiedCardDestination ||
      (!normalizedFriendlyId.startsWith('remote:') &&
        !normalizedFriendlyId.startsWith('local:'))
    ) {
      return
    }
    const migrated = replaceCardTranscriptRecoveryMessages(
      { cardId: normalizedFriendlyId },
      getPendingRecoveryMessages(source),
    )
    if (!migrated) return
    if (pendingSend?.sessionKey === normalizedFrom) pendingSend = null
    clearPendingMessage(normalizedFrom, source.provisionalOwnerId)
    return
  }

  const next: PendingSendPayload = {
    ...source,
    sessionKey: normalizedTo,
    friendlyId: normalizedFriendlyId,
  }
  // Never delete the provisional owner until the authoritative destination
  // record has landed. A quota/storage failure must leave the first turn
  // recoverable on /chat/new rather than losing both copies during handoff.
  if (!writePendingSendToStorage(next)) return
  pendingSend = pendingSend?.sessionKey === normalizedFrom ? next : pendingSend
  clearPendingMessage(normalizedFrom, source.provisionalOwnerId)
}

export function readPendingMessage(
  sessionKey: string,
  friendlyId?: string,
  provisionalOwnerId = '',
): PendingSendPayload | null {
  if (!canUseLocalStorage() || !sessionKey) return null

  cleanupExpiredPendingSends()

  const key = getPendingStorageKey(sessionKey, provisionalOwnerId)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return friendlyId && sessionKey !== 'new'
        ? readPendingSendFromStorageByFriendlyId(friendlyId)
        : null
    }
    const parsed = JSON.parse(raw) as PersistedPendingSendPayload
    if (friendlyId && parsed.friendlyId !== friendlyId) {
      return sessionKey === 'new'
        ? null
        : readPendingSendFromStorageByFriendlyId(friendlyId)
    }
    const payload = toPendingSendPayload(parsed)
    if (!payload) return null
    return {
      ...payload,
      recoveryMessages: getPendingRecoveryMessages({
        ...payload,
        recoveryMessages: [
          ...getPendingRecoveryMessages(payload),
          ...readPendingJournal(key),
        ],
      }),
    }
  } catch {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage cleanup failures.
    }
    return null
  }
}

export function clearPendingMessage(
  sessionKey: string,
  provisionalOwnerId = '',
) {
  if (!canUseLocalStorage() || !sessionKey) return
  try {
    const key = getPendingStorageKey(sessionKey, provisionalOwnerId)
    clearMessageJournal(key, [window.localStorage])
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function stashPendingSend(payload: PendingSendPayload) {
  pendingSend = payload
  writePendingSendToStorage(payload)
}

export function hasPendingSend() {
  return pendingSend !== null
}

export function setPendingGeneration(value: boolean) {
  pendingGeneration = value
}

export function hasPendingGeneration() {
  return pendingGeneration
}

export function resetPendingSend() {
  if (pendingSend?.sessionKey) {
    clearPendingMessage(pendingSend.sessionKey, pendingSend.provisionalOwnerId)
  }
  pendingSend = null
  pendingGeneration = false
}

export function clearPendingSendForSession(
  sessionKey: string,
  friendlyId: string,
) {
  if (sessionKey) {
    clearPendingMessage(sessionKey)
  } else if (friendlyId) {
    removePendingSendFromStorageByFriendlyId(friendlyId)
  }

  if (!pendingSend) return
  if (sessionKey && pendingSend.sessionKey === sessionKey) {
    resetPendingSend()
    return
  }
  if (friendlyId && pendingSend.friendlyId === friendlyId) {
    resetPendingSend()
  }
}

export function setRecentSession(friendlyId: string) {
  recentSession = { friendlyId, at: Date.now() }
}

export function isRecentSession(friendlyId: string, maxAgeMs = 15000) {
  if (!recentSession) return false
  if (recentSession.friendlyId !== friendlyId) return false
  if (Date.now() - recentSession.at > maxAgeMs) return false
  return true
}

export function consumePendingSend(
  sessionKey: string,
  friendlyId?: string,
): PendingSendPayload | null {
  if (!pendingSend) return null
  if (sessionKey && pendingSend.sessionKey === sessionKey) {
    const payload = pendingSend
    pendingSend = null
    return payload
  }
  if (friendlyId && pendingSend.friendlyId === friendlyId) {
    const payload = pendingSend
    pendingSend = null
    return payload
  }
  return null
}
