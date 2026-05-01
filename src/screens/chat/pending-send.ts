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
  return `${PENDING_MESSAGE_STORAGE_PREFIX}${sessionKey || 'main'}`
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

function writePendingSendToStorage(payload: PendingSendPayload) {
  if (!canUseLocalStorage()) return

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
  } catch {
    // Ignore storage write failures.
  }
}

function removePendingSendFromStorageByFriendlyId(friendlyId: string) {
  if (!canUseLocalStorage() || !friendlyId) return

  try {
    const keysToDelete: Array<string> = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(PENDING_MESSAGE_STORAGE_PREFIX)) continue
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
      if (!key?.startsWith(PENDING_MESSAGE_STORAGE_PREFIX)) continue
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

export function persistPendingMessage(payload: PendingSendPayload) {
  writePendingSendToStorage(payload)
}

export function readPendingMessage(
  sessionKey: string,
  friendlyId?: string,
): PendingSendPayload | null {
  if (!canUseLocalStorage() || !sessionKey) return null

  cleanupExpiredPendingSends()

  try {
    const raw = window.localStorage.getItem(getPendingStorageKey(sessionKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedPendingSendPayload
    if (isExpiredPendingPayload(parsed)) {
      window.localStorage.removeItem(getPendingStorageKey(sessionKey))
      return null
    }
    if (friendlyId && parsed.friendlyId !== friendlyId) return null
    return {
      sessionKey: parsed.sessionKey,
      friendlyId: parsed.friendlyId,
      message: parsed.message,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      optimisticMessage: parsed.optimisticMessage,
    }
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
