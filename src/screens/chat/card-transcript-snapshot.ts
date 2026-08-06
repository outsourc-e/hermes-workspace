import {
  sanitizeCardOwnedMessage,
  sanitizeCardOwnedValue,
} from './card-transcript-recovery'
import type { ChatMessage } from './types'

export const CARD_TRANSCRIPT_SNAPSHOT_PREFIX =
  'workspace.card-transcript-snapshot.v1'
const CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS = 512 * 1024
const CARD_TRANSCRIPT_SNAPSHOT_MAX_CHUNKS = 100_000

export type CardTranscriptSnapshotEnvelope = {
  version: 1
  cardId: string
  savedAt: number
  /** Monotonic browser commit identity used to arbitrate durable mirrors. */
  revision: number
  messages: Array<ChatMessage>
}

type CardTranscriptSnapshotIndex = {
  version: 2
  cardId: string
  savedAt: number
  revision: number
  messageCount: number
  chunkCount: number
  serializedLength: number
  chunkId: string
}

type StoredSnapshot = {
  envelope: CardTranscriptSnapshotEnvelope
  chunkKeys: Array<string>
  indexRaw: string
}

function validCardId(cardId: string): boolean {
  return cardId === cardId.trim() && /^(?:local|remote):\S+$/.test(cardId)
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function validSavedAt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= Date.now() + 60_000
  )
}

function validSnapshotMessage(value: unknown): value is ChatMessage {
  if (!record(value)) return false
  if (value.content !== undefined && !Array.isArray(value.content)) return false
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) {
    return false
  }
  return true
}

export function cardTranscriptSnapshotStorageKey(cardId: string): string {
  return `${CARD_TRANSCRIPT_SNAPSHOT_PREFIX}:${encodeURIComponent(cardId)}`
}

function cardTranscriptSnapshotChunkKey(
  cardId: string,
  chunkId: string,
  index: number,
): string {
  return `${cardTranscriptSnapshotStorageKey(cardId)}:chunk:${chunkId}:${index}`
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

function parseSnapshotEnvelope(
  value: unknown,
  cardId: string,
): CardTranscriptSnapshotEnvelope | null {
  if (!record(value)) return null
  if (
    value.version !== 1 ||
    value.cardId !== cardId ||
    !validSavedAt(value.savedAt) ||
    !Array.isArray(value.messages)
  ) {
    return null
  }
  const revision = positiveSafeInteger(value.revision) ? value.revision : 0
  const messages = value.messages.map((message) =>
    sanitizeCardOwnedMessage(message as ChatMessage),
  )
  if (messages.some((message) => !validSnapshotMessage(message))) return null
  return {
    version: 1,
    cardId,
    savedAt: value.savedAt,
    revision,
    messages,
  }
}

function parseSnapshotIndex(
  value: unknown,
  cardId: string,
): CardTranscriptSnapshotIndex | null {
  if (!record(value)) return null
  if (
    value.version !== 2 ||
    value.cardId !== cardId ||
    !validSavedAt(value.savedAt) ||
    !positiveSafeInteger(value.revision) ||
    typeof value.messageCount !== 'number' ||
    !Number.isSafeInteger(value.messageCount) ||
    value.messageCount < 0 ||
    !positiveSafeInteger(value.chunkCount) ||
    value.chunkCount > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHUNKS ||
    !positiveSafeInteger(value.serializedLength) ||
    typeof value.chunkId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.chunkId)
  ) {
    return null
  }
  return value as CardTranscriptSnapshotIndex
}

function readStoredSnapshot(
  storage: Storage,
  cardId: string,
): StoredSnapshot | null {
  const key = cardTranscriptSnapshotStorageKey(cardId)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const legacyEnvelope = parseSnapshotEnvelope(parsed, cardId)
  if (legacyEnvelope) {
    return { envelope: legacyEnvelope, chunkKeys: [], indexRaw: raw }
  }

  const index = parseSnapshotIndex(parsed, cardId)
  if (!index) return null
  const chunks: Array<string> = []
  const chunkKeys: Array<string> = []
  let serializedLength = 0
  for (let chunkIndex = 0; chunkIndex < index.chunkCount; chunkIndex += 1) {
    const chunkKey = cardTranscriptSnapshotChunkKey(
      cardId,
      index.chunkId,
      chunkIndex,
    )
    let chunk: string | null
    try {
      chunk = storage.getItem(chunkKey)
    } catch {
      return null
    }
    if (
      chunk === null ||
      chunk.length === 0 ||
      chunk.length > CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS
    ) {
      return null
    }
    chunks.push(chunk)
    chunkKeys.push(chunkKey)
    serializedLength += chunk.length
    if (serializedLength > index.serializedLength) return null
  }
  if (serializedLength !== index.serializedLength) return null

  let envelope: CardTranscriptSnapshotEnvelope | null
  try {
    envelope = parseSnapshotEnvelope(JSON.parse(chunks.join('')), cardId)
  } catch {
    return null
  }
  if (
    !envelope ||
    envelope.revision !== index.revision ||
    envelope.savedAt !== index.savedAt ||
    envelope.messages.length !== index.messageCount
  ) {
    return null
  }
  return { envelope, chunkKeys, indexRaw: raw }
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
    const stored = readStoredSnapshot(storage, cardId)
    if (stored) {
      if (!newest || compareSnapshots(stored.envelope, newest) > 0) {
        newest = stored.envelope
      }
      continue
    }
    try {
      if (storage.getItem(key) !== null) storage.removeItem(key)
    } catch {
      // Reject malformed data even when cleanup is denied.
    }
  }
  return { storages, newest }
}

function transactionId(revision: number): string {
  const random = Math.random().toString(36).slice(2)
  return `${revision.toString(36)}-${random || 'snapshot'}`
}

function removeChunkKeys(storage: Storage, chunkKeys: Array<string>): void {
  for (const chunkKey of chunkKeys) {
    try {
      storage.removeItem(chunkKey)
    } catch {
      // Committed data remains valid if obsolete chunk cleanup is denied.
    }
  }
}

/**
 * Save the last authoritative complete Card projection outside the query cache.
 * The payload is chunked and committed by an index written last, so a failed
 * large write cannot replace a previously readable projection with a prefix.
 */
export function writeCardTranscriptSnapshot(
  cardId: string,
  messages: Array<ChatMessage>,
): CardTranscriptSnapshotEnvelope | null {
  if (!validCardId(cardId)) return null
  const sanitized = messages.map(sanitizeCardOwnedMessage)
  if (sanitized.some((message) => !validSnapshotMessage(message))) return null

  const { storages, newest } = readSnapshotCandidates(cardId)
  if (storages.length === 0) return null
  const savedAt = Date.now()
  if (!validSavedAt(savedAt)) return null
  const revision = (newest?.revision ?? 0) + 1
  if (!Number.isSafeInteger(revision)) return null
  const envelope: CardTranscriptSnapshotEnvelope = {
    version: 1,
    cardId,
    savedAt,
    revision,
    messages: sanitized,
  }
  let serialized: string
  try {
    serialized = JSON.stringify(envelope)
  } catch {
    return null
  }
  const chunks = Array.from(
    {
      length: Math.ceil(
        serialized.length / CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS,
      ),
    },
    (_, index) =>
      serialized.slice(
        index * CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS,
        (index + 1) * CARD_TRANSCRIPT_SNAPSHOT_CHUNK_CHARS,
      ),
  )
  if (
    chunks.length === 0 ||
    chunks.length > CARD_TRANSCRIPT_SNAPSHOT_MAX_CHUNKS
  ) {
    return null
  }
  const chunkId = transactionId(revision)
  const index: CardTranscriptSnapshotIndex = {
    version: 2,
    cardId,
    savedAt,
    revision,
    messageCount: sanitized.length,
    chunkCount: chunks.length,
    serializedLength: serialized.length,
    chunkId,
  }
  const serializedIndex = JSON.stringify(
    sanitizeCardOwnedValue(index) as CardTranscriptSnapshotIndex,
  )

  let durable = false
  for (const storage of storages) {
    const previous = readStoredSnapshot(storage, cardId)
    const newChunkKeys: Array<string> = []
    try {
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkKey = cardTranscriptSnapshotChunkKey(
          cardId,
          chunkId,
          chunkIndex,
        )
        storage.setItem(chunkKey, chunk)
        newChunkKeys.push(chunkKey)
      }
      storage.setItem(cardTranscriptSnapshotStorageKey(cardId), serializedIndex)
      const committed = readStoredSnapshot(storage, cardId)
      if (committed?.envelope.revision !== revision) {
        throw new Error('Card transcript snapshot read-back failed')
      }
      durable = true
      removeChunkKeys(storage, previous?.chunkKeys ?? [])
    } catch {
      removeChunkKeys(storage, newChunkKeys)
      try {
        if (previous) {
          storage.setItem(
            cardTranscriptSnapshotStorageKey(cardId),
            previous.indexRaw,
          )
        } else if (
          storage.getItem(cardTranscriptSnapshotStorageKey(cardId)) ===
          serializedIndex
        ) {
          storage.removeItem(cardTranscriptSnapshotStorageKey(cardId))
        }
      } catch {
        // Another mirror remains eligible; never report this one as durable.
      }
      // Keep writing independent mirrors; one verified commit is usable.
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
