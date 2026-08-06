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
  /** Monotonic browser commit identity used to arbitrate durable mirrors. */
  revision: number
  messages: Array<ChatMessage>
}

let snapshotRevision = 0

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
    const revision =
      typeof parsed.revision === 'number' &&
      Number.isFinite(parsed.revision) &&
      parsed.revision > 0
        ? parsed.revision
        : 0
    return {
      version: 1,
      cardId,
      savedAt: parsed.savedAt,
      revision,
      messages,
    }
  } catch {
    return null
  }
}

function compareSnapshots(
  left: CardTranscriptSnapshotEnvelope,
  right: CardTranscriptSnapshotEnvelope,
): number {
  if (left.revision !== right.revision) return left.revision - right.revision
  if (left.savedAt !== right.savedAt) return left.savedAt - right.savedAt
  return left.messages.length - right.messages.length
}

function readSnapshotCandidates(cardId: string): {
  storages: Array<Storage>
  newest: CardTranscriptSnapshotEnvelope | null
} {
  const storages = browserStorages()
  const key = cardTranscriptSnapshotStorageKey(cardId)
  let newest: CardTranscriptSnapshotEnvelope | null = null
  for (const storage of storages) {
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      continue
    }
    if (!raw) continue
    const parsed = parseSnapshot(raw, cardId)
    if (parsed) {
      if (!newest || compareSnapshots(parsed, newest) > 0) newest = parsed
      continue
    }
    try {
      storage.removeItem(key)
    } catch {
      // Reject malformed data even when cleanup is denied.
    }
  }
  return { storages, newest }
}

/**
 * Save the last authoritative complete Card projection outside the query cache.
 * Every available durable mirror receives the same monotonic revision so a
 * stale primary can never mask a newer fallback on the next read.
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

  const { storages, newest } = readSnapshotCandidates(cardId)
  if (storages.length === 0) return null
  const savedAt = Date.now()
  const clockRevision = savedAt * 1_000
  snapshotRevision = Math.max(
    snapshotRevision + 1,
    clockRevision,
    (newest?.revision ?? 0) + 1,
  )
  const envelope: CardTranscriptSnapshotEnvelope = {
    version: 1,
    cardId,
    savedAt,
    revision: snapshotRevision,
    messages: sanitized,
  }
  let raw: string
  try {
    raw = JSON.stringify(envelope)
  } catch {
    return null
  }
  if (raw.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHARS) return null

  let durable = false
  for (const storage of storages) {
    try {
      storage.setItem(cardTranscriptSnapshotStorageKey(cardId), raw)
      durable = true
    } catch {
      // Keep writing independent mirrors; one successful commit is usable.
    }
  }
  return durable ? envelope : null
}

export function readCardTranscriptSnapshot(
  cardId: string,
): CardTranscriptSnapshotEnvelope | null {
  if (!validCardId(cardId)) return null
  return readSnapshotCandidates(cardId).newest
}
