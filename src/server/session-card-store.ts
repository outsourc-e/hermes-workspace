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
const SESSION_CARD_RECORD_MAX_BYTES = 96 * 1024
const SESSION_CARD_RECORD_MAX_COUNT = 2000
const SESSION_CARD_BRANCH_REPLAY_MAX_COUNT = 256
const SESSION_CARD_BRANCH_REPLAY_MAX_PER_CARD = 32
const SESSION_CARD_BRANCH_KEY_MAX_LENGTH = 2048
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const RECORD_FIELDS = new Set([
  'cardId',
  'manualTitle',
  'autoTitle',
  'pinned',
  'updatedAt',
  'archivedAt',
  'branchReplays',
])
const PATCH_FIELDS = new Set(['manualTitle', 'autoTitle', 'pinned'])

export type PersistedSessionCard = {
  cardId: string
  manualTitle?: string
  autoTitle?: string
  pinned?: boolean
  updatedAt: number
  archivedAt?: number
  branchReplays?: Array<PersistedSessionCardBranchReplay>
}

export type SessionCardBranchReplayOutcome =
  | {
      kind: 'created' | 'projection-pending'
      canonicalSegmentKey: string
      childSessionKey: string
    }
  | { kind: 'failed' }
  | { kind: 'unavailable' }

export type PersistedSessionCardBranchReplay = {
  requestKeyHash: string
  fingerprint: string
  createdAt: number
  outcome?: SessionCardBranchReplayOutcome
}

export type SessionCardBranchReplayReservation =
  | { status: 'reserved' }
  | {
      status: 'pending' | 'completed'
      replay: PersistedSessionCardBranchReplay
    }
  | { status: 'conflict' | 'capacity' }

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

function isBoundedBranchKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= SESSION_CARD_BRANCH_KEY_MAX_LENGTH &&
    value.trim() === value &&
    !hasControlCharacters(value)
  )
}

function validateBranchReplayOutcome(
  value: unknown,
): SessionCardBranchReplayOutcome | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null
  if (value.kind === 'failed' || value.kind === 'unavailable') {
    return Object.keys(value).length === 1 ? { kind: value.kind } : null
  }
  if (value.kind !== 'created' && value.kind !== 'projection-pending') {
    return null
  }
  if (
    Object.keys(value).some(
      (field) =>
        field !== 'kind' &&
        field !== 'canonicalSegmentKey' &&
        field !== 'childSessionKey',
    ) ||
    !isBoundedBranchKey(value.canonicalSegmentKey) ||
    !isBoundedBranchKey(value.childSessionKey)
  ) {
    return null
  }
  return {
    kind: value.kind,
    canonicalSegmentKey: value.canonicalSegmentKey,
    childSessionKey: value.childSessionKey,
  }
}

function validateBranchReplay(
  value: unknown,
): PersistedSessionCardBranchReplay | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (field) =>
        field !== 'requestKeyHash' &&
        field !== 'fingerprint' &&
        field !== 'createdAt' &&
        field !== 'outcome',
    ) ||
    typeof value.requestKeyHash !== 'string' ||
    !SHA256_HEX_PATTERN.test(value.requestKeyHash) ||
    typeof value.fingerprint !== 'string' ||
    !SHA256_HEX_PATTERN.test(value.fingerprint) ||
    !isTimestamp(value.createdAt)
  ) {
    return null
  }
  const replay: PersistedSessionCardBranchReplay = {
    requestKeyHash: value.requestKeyHash,
    fingerprint: value.fingerprint,
    createdAt: value.createdAt,
  }
  if ('outcome' in value) {
    const outcome = validateBranchReplayOutcome(value.outcome)
    if (!outcome) return null
    replay.outcome = outcome
  }
  return replay
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
    if ('branchReplays' in value) {
      if (
        !Array.isArray(value.branchReplays) ||
        value.branchReplays.length > SESSION_CARD_BRANCH_REPLAY_MAX_PER_CARD
      ) {
        return null
      }
      const branchReplays = value.branchReplays.map(validateBranchReplay)
      if (
        branchReplays.some((replay) => replay === null) ||
        new Set(branchReplays.map((replay) => replay?.requestKeyHash)).size !==
          branchReplays.length
      ) {
        return null
      }
      card.branchReplays =
        branchReplays as Array<PersistedSessionCardBranchReplay>
    }
    // Pins only apply to visible Cards. Retain archive/title metadata from an
    // older or externally-corrupted record, but fail closed on its pin state.
    if (card.archivedAt !== undefined) delete card.pinned
    return card
  } catch {
    return null
  }
}

function invalidPersistedStore(strict: boolean): PersistedSessionCardStore {
  if (strict) throw new Error('Session Card metadata store is invalid')
  return emptyStore()
}

function parseStore(raw: string, strict = false): PersistedSessionCardStore {
  if (Buffer.byteLength(raw, 'utf8') > SESSION_CARD_STORE_MAX_BYTES) {
    return invalidPersistedStore(strict)
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
    return invalidPersistedStore(strict)
  }

  const entries = Object.entries(parsed.cards)
  if (entries.length > SESSION_CARD_RECORD_MAX_COUNT) {
    return invalidPersistedStore(strict)
  }

  const cards: Record<string, PersistedSessionCard> = {}
  let branchReplayCount = 0
  for (const [key, value] of entries) {
    const card = validatePersistedCard(key, value)
    if (card) {
      branchReplayCount += card.branchReplays?.length ?? 0
      if (branchReplayCount > SESSION_CARD_BRANCH_REPLAY_MAX_COUNT) {
        return invalidPersistedStore(strict)
      }
      cards[key] = card
    } else if (strict) {
      return invalidPersistedStore(true)
    }
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

function readStoreForBranchReplay(): PersistedSessionCardStore {
  const path = sessionCardStorePath()
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Session Card metadata store is not a regular file')
    }
    if (stat.size > SESSION_CARD_STORE_MAX_BYTES) {
      throw new Error('Session Card metadata store is too large')
    }
    return parseStore(readFileSync(path, 'utf8'), true)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
    throw error
  }
}

function assertWritableStore(store: PersistedSessionCardStore): string {
  const cards = Object.values(store.cards)
  if (cards.length > SESSION_CARD_RECORD_MAX_COUNT) {
    throw new Error('Session Card metadata store has too many records')
  }
  let branchReplayCount = 0
  for (const card of cards) {
    branchReplayCount += card.branchReplays?.length ?? 0
    if (
      (card.branchReplays?.length ?? 0) >
        SESSION_CARD_BRANCH_REPLAY_MAX_PER_CARD ||
      branchReplayCount > SESSION_CARD_BRANCH_REPLAY_MAX_COUNT
    ) {
      throw new Error('Session Card branch replay store is at capacity')
    }
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

function assertBranchReplayHash(value: string): string {
  if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) {
    throw new Error('Invalid Session Card branch replay fingerprint')
  }
  return value
}

export function readSessionCardBranchReplay(
  cardId: string,
  requestKeyHash: string,
): PersistedSessionCardBranchReplay | null {
  const normalizedCardId = assertCardId(cardId)
  const normalizedRequestKeyHash = assertBranchReplayHash(requestKeyHash)
  const replay = readStoreForBranchReplay().cards[
    normalizedCardId
  ]?.branchReplays?.find(
    (candidate) => candidate.requestKeyHash === normalizedRequestKeyHash,
  )
  return replay ?? null
}

export function reserveSessionCardBranchReplay(
  cardId: string,
  requestKeyHash: string,
  fingerprint: string,
): SessionCardBranchReplayReservation {
  const normalizedCardId = assertCardId(cardId)
  const normalizedRequestKeyHash = assertBranchReplayHash(requestKeyHash)
  const normalizedFingerprint = assertBranchReplayHash(fingerprint)
  const store = readStoreForBranchReplay()
  const previous = store.cards[normalizedCardId]
  const branchReplays = previous?.branchReplays ?? []
  const existing = branchReplays.find(
    (candidate) => candidate.requestKeyHash === normalizedRequestKeyHash,
  )
  if (existing) {
    if (existing.fingerprint !== normalizedFingerprint) {
      return { status: 'conflict' }
    }
    return {
      status: existing.outcome ? 'completed' : 'pending',
      replay: existing,
    }
  }

  const totalReplays = Object.values(store.cards).reduce(
    (count, card) => count + (card.branchReplays?.length ?? 0),
    0,
  )
  if (
    branchReplays.length >= SESSION_CARD_BRANCH_REPLAY_MAX_PER_CARD ||
    totalReplays >= SESSION_CARD_BRANCH_REPLAY_MAX_COUNT
  ) {
    return { status: 'capacity' }
  }

  const now = Date.now()
  store.cards[normalizedCardId] = {
    ...previous,
    cardId: normalizedCardId,
    updatedAt: previous?.updatedAt ?? now,
    branchReplays: [
      ...branchReplays,
      {
        requestKeyHash: normalizedRequestKeyHash,
        fingerprint: normalizedFingerprint,
        createdAt: now,
      },
    ],
  }
  writeStore(store)
  return { status: 'reserved' }
}

export function completeSessionCardBranchReplay(
  cardId: string,
  requestKeyHash: string,
  fingerprint: string,
  outcome: SessionCardBranchReplayOutcome,
): PersistedSessionCardBranchReplay {
  const normalizedCardId = assertCardId(cardId)
  const normalizedRequestKeyHash = assertBranchReplayHash(requestKeyHash)
  const normalizedFingerprint = assertBranchReplayHash(fingerprint)
  const normalizedOutcome = validateBranchReplayOutcome(outcome)
  if (!normalizedOutcome) {
    throw new Error('Invalid Session Card branch replay outcome')
  }

  const store = readStoreForBranchReplay()
  const card = store.cards[normalizedCardId]
  const replayIndex = card?.branchReplays?.findIndex(
    (candidate) => candidate.requestKeyHash === normalizedRequestKeyHash,
  )
  if (
    !card ||
    replayIndex === undefined ||
    replayIndex < 0 ||
    card.branchReplays?.[replayIndex]?.fingerprint !== normalizedFingerprint
  ) {
    throw new Error('Session Card branch replay reservation is unavailable')
  }

  const replay: PersistedSessionCardBranchReplay = {
    ...card.branchReplays[replayIndex],
    outcome: normalizedOutcome,
  }
  card.branchReplays[replayIndex] = replay
  writeStore(store)
  return replay
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
