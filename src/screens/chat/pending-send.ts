import type { ChatAttachment, ChatMessage } from './types'

export type PendingSendPayload = {
  sessionKey: string
  friendlyId: string
  message: string
  attachments: Array<ChatAttachment>
  optimisticMessage: ChatMessage
}

let pendingSend: PendingSendPayload | null = null
let pendingGeneration = false
let recentSession: { friendlyId: string; at: number } | null = null

const PENDING_MESSAGE_STORAGE_PREFIX = 'claude_pending_msg_'
const NEW_CHAT_PROVISIONAL_STORAGE_KEY =
  'workspace.chat-provisional-send.v1:new-chat'
const PENDING_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000

type PersistedPendingSendPayload = PendingSendPayload & {
  storedAt: number
}

function canUseLocalStorage() {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function getPendingStorageKey(sessionKey: string) {
  if (sessionKey === 'new') return NEW_CHAT_PROVISIONAL_STORAGE_KEY
  return `${PENDING_MESSAGE_STORAGE_PREFIX}${sessionKey || 'main'}`
}

function isPendingStorageKey(key: string | null): key is string {
  return (
    key === NEW_CHAT_PROVISIONAL_STORAGE_KEY ||
    Boolean(key?.startsWith(PENDING_MESSAGE_STORAGE_PREFIX))
  )
}

function isExpiredPendingPayload(payload: { storedAt?: unknown }) {
  if (
    typeof payload.storedAt !== 'number' ||
    !Number.isFinite(payload.storedAt)
  ) {
    return true
  }
  return Date.now() - payload.storedAt > PENDING_MESSAGE_MAX_AGE_MS
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

  return {
    sessionKey: parsed.sessionKey,
    friendlyId: parsed.friendlyId,
    message: parsed.message,
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    optimisticMessage: optimisticMessage as ChatMessage,
  }
}

function writePendingSendToStorage(payload: PendingSendPayload): boolean {
  if (!canUseLocalStorage()) return false

  cleanupExpiredPendingSends()

  const record: PersistedPendingSendPayload = {
    ...payload,
    storedAt: Date.now(),
  }

  try {
    window.localStorage.setItem(
      getPendingStorageKey(payload.sessionKey),
      JSON.stringify(record),
    )
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
        if (isExpiredPendingPayload(parsed)) {
          window.localStorage.removeItem(key)
          continue
        }
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
  if (!canUseLocalStorage()) return

  try {
    const keysToDelete: Array<string> = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!isPendingStorageKey(key)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        keysToDelete.push(key)
        continue
      }
      try {
        const parsed = JSON.parse(raw) as PersistedPendingSendPayload
        if (isExpiredPendingPayload(parsed)) {
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

export function persistPendingMessage(payload: PendingSendPayload): boolean {
  return writePendingSendToStorage(payload)
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
        const optimisticMessage = updater(payload.optimisticMessage)
        const next = { ...parsed, optimisticMessage }
        window.localStorage.setItem(key, JSON.stringify(next))
        if (
          pendingSend &&
          pendingMessageClientId(pendingSend.optimisticMessage) === clientId
        ) {
          pendingSend = { ...pendingSend, optimisticMessage }
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
) {
  const normalizedFrom = fromSessionKey.trim()
  const normalizedTo = toSessionKey.trim()
  const normalizedFriendlyId = toFriendlyId.trim() || normalizedTo
  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo)
    return

  const persisted = readPendingMessage(normalizedFrom)
  const source =
    pendingSend?.sessionKey === normalizedFrom ? pendingSend : persisted
  if (!source) return

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
  clearPendingMessage(normalizedFrom)
}

export function readPendingMessage(
  sessionKey: string,
  friendlyId?: string,
): PendingSendPayload | null {
  if (!canUseLocalStorage() || !sessionKey) return null

  cleanupExpiredPendingSends()

  try {
    const raw = window.localStorage.getItem(getPendingStorageKey(sessionKey))
    if (!raw) {
      return friendlyId
        ? readPendingSendFromStorageByFriendlyId(friendlyId)
        : null
    }
    const parsed = JSON.parse(raw) as PersistedPendingSendPayload
    if (isExpiredPendingPayload(parsed)) {
      window.localStorage.removeItem(getPendingStorageKey(sessionKey))
      return null
    }
    if (friendlyId && parsed.friendlyId !== friendlyId) {
      return readPendingSendFromStorageByFriendlyId(friendlyId)
    }
    return toPendingSendPayload(parsed)
  } catch {
    try {
      window.localStorage.removeItem(getPendingStorageKey(sessionKey))
    } catch {
      // Ignore storage cleanup failures.
    }
    return null
  }
}

export function clearPendingMessage(sessionKey: string) {
  if (!canUseLocalStorage() || !sessionKey) return
  try {
    window.localStorage.removeItem(getPendingStorageKey(sessionKey))
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
    clearPendingMessage(pendingSend.sessionKey)
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
