import { randomBytes } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { getStateDir } from './workspace-state-dir'

export const DEFAULT_SESSION_CARD_TITLE = 'New conversation'
export const SESSION_CARD_TITLE_MAX_LENGTH = 200
export const SESSION_CARD_STORE_MAX_BYTES = 1024 * 1024

const SESSION_CARD_STORE_VERSION = 1 as const
const SESSION_CARD_STORE_FILE = 'session-cards.v1.json'
const SESSION_CARD_ID_MAX_LENGTH = 256
// v1 remains backward compatible; reserve a bounded 16-byte JSON budget for
// an optional `pinned: false` field without changing the overall store cap.
const SESSION_CARD_RECORD_MAX_BYTES = 1040
const SESSION_CARD_RECORD_MAX_COUNT = 2000
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const RECORD_FIELDS = new Set([
  'cardId',
  'manualTitle',
  'autoTitle',
  'pinned',
  'updatedAt',
  'archivedAt',
])
const PATCH_FIELDS = new Set(['manualTitle', 'autoTitle', 'pinned'])

export type PersistedSessionCard = {
  cardId: string
  manualTitle?: string
  autoTitle?: string
  pinned?: boolean
  updatedAt: number
  archivedAt?: number
}

export type PersistedSessionCardStore = {
  version: typeof SESSION_CARD_STORE_VERSION
  cards: Record<string, PersistedSessionCard>
}

export type SessionCardMetadataUpdate = {
  manualTitle?: string | null
  autoTitle?: string | null
  pinned?: boolean
}

export type SessionCardTitleSource = 'default' | 'auto' | 'manual'

export type ResolvedSessionCardTitle = {
  title: string
  titleSource: SessionCardTitleSource
}

function emptyStore(): PersistedSessionCardStore {
  return { version: SESSION_CARD_STORE_VERSION, cards: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function assertCardId(cardId: string): string {
  if (
    typeof cardId !== 'string' ||
    cardId.length === 0 ||
    cardId.length > SESSION_CARD_ID_MAX_LENGTH ||
    /\s/u.test(cardId) ||
    hasControlCharacters(cardId) ||
    UNSAFE_OBJECT_KEYS.has(cardId)
  ) {
    throw new Error('Invalid Session Card ID')
  }
  return cardId
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Session Card title must be a string')
  }
  const title = value.trim()
  if (
    title.length === 0 ||
    title.length > SESSION_CARD_TITLE_MAX_LENGTH ||
    hasControlCharacters(title)
  ) {
    throw new Error(
      `Session Card title must contain 1-${SESSION_CARD_TITLE_MAX_LENGTH} list-safe characters`,
    )
  }
  return title
}

function safeTitle(value: unknown): string | undefined {
  try {
    return normalizeTitle(value)
  } catch {
    return undefined
  }
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function validatePersistedCard(
  key: string,
  value: unknown,
): PersistedSessionCard | null {
  if (!isRecord(value)) return null
  if (
    Object.keys(value).some((field) => !RECORD_FIELDS.has(field)) ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') >
      SESSION_CARD_RECORD_MAX_BYTES
  ) {
    return null
  }

  try {
    const cardId = assertCardId(value.cardId as string)
    if (cardId !== key || !isTimestamp(value.updatedAt)) return null

    const card: PersistedSessionCard = {
      cardId,
      updatedAt: value.updatedAt,
    }
    if ('manualTitle' in value) {
      card.manualTitle = normalizeTitle(value.manualTitle)
    }
    if ('autoTitle' in value) {
      card.autoTitle = normalizeTitle(value.autoTitle)
    }
    if ('pinned' in value) {
      if (typeof value.pinned !== 'boolean') return null
      card.pinned = value.pinned
    }
    if ('archivedAt' in value) {
      if (!isTimestamp(value.archivedAt)) return null
      card.archivedAt = value.archivedAt
    }
    // Pins only apply to visible Cards. Retain archive/title metadata from an
    // older or externally-corrupted record, but fail closed on its pin state.
    if (card.archivedAt !== undefined) delete card.pinned
    return card
  } catch {
    return null
  }
}

function parseStore(raw: string): PersistedSessionCardStore {
  if (Buffer.byteLength(raw, 'utf8') > SESSION_CARD_STORE_MAX_BYTES) {
    return emptyStore()
  }

  const parsed = JSON.parse(raw) as unknown
  if (
    !isRecord(parsed) ||
    Object.keys(parsed).some(
      (field) => field !== 'version' && field !== 'cards',
    ) ||
    parsed.version !== SESSION_CARD_STORE_VERSION ||
    !isRecord(parsed.cards)
  ) {
    return emptyStore()
  }

  const entries = Object.entries(parsed.cards)
  if (entries.length > SESSION_CARD_RECORD_MAX_COUNT) return emptyStore()

  const cards: Record<string, PersistedSessionCard> = {}
  for (const [key, value] of entries) {
    const card = validatePersistedCard(key, value)
    if (card) cards[key] = card
  }
  return { version: SESSION_CARD_STORE_VERSION, cards }
}

function readStore(): PersistedSessionCardStore {
  try {
    const path = sessionCardStorePath()
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) return emptyStore()
    if (stat.size > SESSION_CARD_STORE_MAX_BYTES) return emptyStore()
    return parseStore(readFileSync(path, 'utf8'))
  } catch {
    return emptyStore()
  }
}

function assertWritableStore(store: PersistedSessionCardStore): string {
  const cards = Object.values(store.cards)
  if (cards.length > SESSION_CARD_RECORD_MAX_COUNT) {
    throw new Error('Session Card metadata store has too many records')
  }
  for (const card of cards) {
    if (
      Buffer.byteLength(JSON.stringify(card), 'utf8') >
      SESSION_CARD_RECORD_MAX_BYTES
    ) {
      throw new Error('Session Card metadata record is too large')
    }
  }

  const serialized = `${JSON.stringify(store, null, 2)}\n`
  if (Buffer.byteLength(serialized, 'utf8') > SESSION_CARD_STORE_MAX_BYTES) {
    throw new Error('Session Card metadata store is too large')
  }
  return serialized
}

function writeStore(store: PersistedSessionCardStore): void {
  const serialized = assertWritableStore(store)
  const targetPath = sessionCardStorePath()
  const stateDir = getStateDir()
  mkdirSync(stateDir, { recursive: true })

  const tempPath = join(
    stateDir,
    `.${SESSION_CARD_STORE_FILE}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  )
  let writeFailed = false
  let writeFailure: unknown
  try {
    const descriptor = openSync(tempPath, 'wx', 0o600)
    try {
      writeFileSync(descriptor, serialized, 'utf8')
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(tempPath, targetPath)
  } catch (error) {
    writeFailed = true
    writeFailure = error
  }

  let cleanupFailed = false
  let cleanupFailure: unknown
  try {
    unlinkSync(tempPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      cleanupFailed = true
      cleanupFailure = error
    }
  }

  if (writeFailed && cleanupFailed) {
    throw new AggregateError(
      [writeFailure, cleanupFailure],
      'Session Card metadata write and temporary-file cleanup failed',
    )
  }
  if (writeFailed) throw writeFailure
  if (cleanupFailed) throw cleanupFailure
}

function normalizeUpdate(
  patch: SessionCardMetadataUpdate,
): SessionCardMetadataUpdate {
  if (!isRecord(patch)) {
    throw new Error('Session Card metadata update must be an object')
  }
  const fields = Object.keys(patch)
  const unsupported = fields.find((field) => !PATCH_FIELDS.has(field))
  if (unsupported) {
    throw new Error(`Unsupported Session Card metadata field: ${unsupported}`)
  }
  if (fields.length === 0) {
    throw new Error(
      'Session Card metadata update must contain a metadata field',
    )
  }

  const normalized: SessionCardMetadataUpdate = {}
  if ('manualTitle' in patch) {
    normalized.manualTitle =
      patch.manualTitle === null ? null : normalizeTitle(patch.manualTitle)
  }
  if ('autoTitle' in patch) {
    normalized.autoTitle =
      patch.autoTitle === null ? null : normalizeTitle(patch.autoTitle)
  }
  if ('pinned' in patch) {
    if (typeof patch.pinned !== 'boolean') {
      throw new Error('Session Card pinned state must be a boolean')
    }
    normalized.pinned = patch.pinned
  }
  return normalized
}

export function sessionCardStorePath(): string {
  return join(getStateDir(), SESSION_CARD_STORE_FILE)
}

export function resolveSessionCardTitle(
  metadata: PersistedSessionCard | null | undefined,
): ResolvedSessionCardTitle {
  const manualTitle = safeTitle(metadata?.manualTitle)
  if (manualTitle) return { title: manualTitle, titleSource: 'manual' }

  const autoTitle = safeTitle(metadata?.autoTitle)
  if (autoTitle) return { title: autoTitle, titleSource: 'auto' }

  return { title: DEFAULT_SESSION_CARD_TITLE, titleSource: 'default' }
}

export function readSessionCardMetadata(
  cardId: string,
): PersistedSessionCard | null {
  const normalizedCardId = assertCardId(cardId)
  const cards = readStore().cards
  const metadata = cards[normalizedCardId]
  return Object.hasOwn(cards, normalizedCardId) && metadata !== undefined
    ? metadata
    : null
}

export function listSessionCardMetadata(): Array<PersistedSessionCard> {
  return Object.values(readStore().cards).sort((a, b) =>
    a.cardId.localeCompare(b.cardId),
  )
}

export function updateSessionCardMetadata(
  cardId: string,
  patch: SessionCardMetadataUpdate,
): PersistedSessionCard {
  const normalizedCardId = assertCardId(cardId)
  const normalizedPatch = normalizeUpdate(patch)
  const store = readStore()
  const previous = store.cards[normalizedCardId]
  const next: PersistedSessionCard = {
    ...previous,
    cardId: normalizedCardId,
    updatedAt: Date.now(),
  }

  if ('manualTitle' in normalizedPatch) {
    if (normalizedPatch.manualTitle === null) delete next.manualTitle
    else next.manualTitle = normalizedPatch.manualTitle
  }
  if ('autoTitle' in normalizedPatch) {
    if (normalizedPatch.autoTitle === null) delete next.autoTitle
    else next.autoTitle = normalizedPatch.autoTitle
  }
  if (next.archivedAt !== undefined) delete next.pinned
  else if ('pinned' in normalizedPatch) next.pinned = normalizedPatch.pinned

  store.cards[normalizedCardId] = next
  writeStore(store)
  return next
}

export function archiveSessionCardMetadata(
  cardId: string,
): PersistedSessionCard {
  const normalizedCardId = assertCardId(cardId)
  const store = readStore()
  const now = Date.now()
  const next: PersistedSessionCard = {
    ...store.cards[normalizedCardId],
    cardId: normalizedCardId,
    updatedAt: now,
    archivedAt: now,
  }
  delete next.pinned
  store.cards[normalizedCardId] = next
  writeStore(store)
  return next
}
