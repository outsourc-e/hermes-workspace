import {
  isCardTranscriptRecoveryMessagePortable,
  sanitizeCardOwnedMessage,
} from './card-transcript-recovery'
import type { ChatMessage } from './types'

export const CARD_TRANSCRIPT_SNAPSHOT_PREFIX =
  'workspace.card-transcript-snapshot.v1'
const CARD_TRANSCRIPT_SNAPSHOT_MAX_MESSAGES = 2_000
const CARD_TRANSCRIPT_SNAPSHOT_MAX_CHARS = 4_500_000

export type CardTranscriptSnapshotEnvelope = {
  version: 1
  cardId: string
  savedAt: number
  messages: Array<ChatMessage>
}

function validCardId(cardId: string): boolean {
  return cardId === cardId.trim() && /^(?:local|remote):\S+$/.test(cardId)
}

export function cardTranscriptSnapshotStorageKey(cardId: string): string {
  return `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:${encodeURIComponent(cardId)}`
}

function browserStorages(): Array<Storage> {
  if (typeof window === 'undefined') return []
  const result: Array<Storage> = []
  for (const getStorage of [
    () => window.localStorage,
    () => window.sessionStorage,
  ]) {
    try {
      const storage = getStorage()
      if (!result.includes(storage)) result.push(storage)
    } catch {
      // One browser store can still preserve the Card projection.
    }
  }
  return result
}

function parseSnapshot(
  raw: string,
  cardId: string,
): CardTranscriptSnapshotEnvelope | null {
  if (raw.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHARS) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (
      parsed.version !== 1 ||
      parsed.cardId !== cardId ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.savedAt) ||
      parsed.savedAt <= 0 ||
      parsed.savedAt > Date.now() + 60_000 ||
      !Array.isArray(parsed.messages) ||
      parsed.messages.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_MESSAGES
    ) {
      return null
    }
    const messages = parsed.messages.map((message) =>
      sanitizeCardOwnedMessage(message as ChatMessage),
    )
    if (
      messages.some(
        (message) => !isCardTranscriptRecoveryMessagePortable(message),
      )
    ) {
      return null
    }
    return {
      version: 1,
      cardId,
      savedAt: parsed.savedAt,
      messages,
    }
  } catch {
    return null
  }
}

/**
 * Save the last authoritative complete Card projection outside the query cache.
 * The scrubbed envelope contains only Card identity and portable messages.
 */
export function writeCardTranscriptSnapshot(
  cardId: string,
  messages: Array<ChatMessage>,
): CardTranscriptSnapshotEnvelope | null {
  if (
    !validCardId(cardId) ||
    messages.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_MESSAGES
  ) {
    return null
  }
  const sanitized = messages.map(sanitizeCardOwnedMessage)
  if (
    sanitized.some(
      (message) => !isCardTranscriptRecoveryMessagePortable(message),
    )
  ) {
    return null
  }
  const envelope: CardTranscriptSnapshotEnvelope = {
    version: 1,
    cardId,
    savedAt: Date.now(),
    messages: sanitized,
  }
  let raw: string
  try {
    raw = JSON.stringify(envelope)
  } catch {
    return null
  }
  if (raw.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHARS) return null

  // localStorage is the durable primary. sessionStorage is an independent
  // fallback for privacy modes or per-store quota/permission failures.
  for (const storage of browserStorages()) {
    try {
      storage.setItem(cardTranscriptSnapshotStorageKey(cardId), raw)
      return envelope
    } catch {
      // Try the independent browser store.
    }
  }
  return null
}

export function readCardTranscriptSnapshot(
  cardId: string,
): CardTranscriptSnapshotEnvelope | null {
  if (!validCardId(cardId)) return null
  const key = cardTranscriptSnapshotStorageKey(cardId)
  for (const storage of browserStorages()) {
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      continue
    }
    if (!raw) continue
    const parsed = parseSnapshot(raw, cardId)
    if (parsed) return parsed
    try {
      storage.removeItem(key)
    } catch {
      // Reject malformed data even when cleanup is denied.
    }
  }
  return null
}
