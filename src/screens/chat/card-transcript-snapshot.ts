import {
  readLatestCardSnapshot,
  writeLatestCardSnapshot,
} from './card-transcript-indexeddb'
import { sanitizeCardOwnedMessage } from './card-transcript-recovery'
import type { PortableValue } from './card-transcript-indexeddb'
import type { ChatMessage } from './types'

export type CardTranscriptSnapshotEnvelope = {
  version: 4
  cardId: string
  messages: Array<ChatMessage>
}

type CardTranscriptSnapshotPayload = {
  version: 4
  messages: Array<PortableValue>
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validCardId(cardId: string): boolean {
  return cardId === cardId.trim() && /^(?:local|remote):\S+$/.test(cardId)
}

function isPortableValue(value: unknown): value is PortableValue {
  if (value === null) return true
  if (typeof value === 'boolean' || typeof value === 'string') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isPortableValue)
  if (!record(value)) return false
  return Object.values(value).every(isPortableValue)
}

function validSnapshotMessage(value: unknown): value is ChatMessage {
  if (!record(value) || !isPortableValue(value)) return false
  if (value.role !== undefined && typeof value.role !== 'string') return false
  if (value.content !== undefined && !Array.isArray(value.content)) return false
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) {
    return false
  }
  return true
}

function snapshotEnvelope(
  cardId: string,
  payload: CardTranscriptSnapshotPayload,
): CardTranscriptSnapshotEnvelope | null {
  if (
    payload.version !== 4 ||
    !Array.isArray(payload.messages) ||
    payload.messages.some((message) => !validSnapshotMessage(message))
  ) {
    return null
  }
  return {
    version: 4,
    cardId,
    messages: payload.messages as Array<ChatMessage>,
  }
}

export async function writeCardTranscriptSnapshot(
  cardId: string,
  messages: Array<ChatMessage>,
): Promise<CardTranscriptSnapshotEnvelope | null> {
  if (!validCardId(cardId) || !Array.isArray(messages)) return null
  let sanitizedMessages: Array<ChatMessage>
  try {
    sanitizedMessages = messages.map(sanitizeCardOwnedMessage)
    if (sanitizedMessages.some((message) => !validSnapshotMessage(message))) {
      return null
    }
  } catch {
    return null
  }

  const payload: CardTranscriptSnapshotPayload = {
    version: 4,
    messages: sanitizedMessages as Array<PortableValue>,
  }
  await writeLatestCardSnapshot({ cardId, payload })
  return snapshotEnvelope(cardId, payload)
}

export async function readCardTranscriptSnapshot(
  cardId: string,
): Promise<CardTranscriptSnapshotEnvelope | null> {
  if (!validCardId(cardId)) return null
  const stored = await readLatestCardSnapshot<CardTranscriptSnapshotPayload>(cardId)
  if (!stored || stored.cardId !== cardId || !record(stored.payload)) return null
  return snapshotEnvelope(cardId, stored.payload as CardTranscriptSnapshotPayload)
}
