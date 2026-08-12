import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
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
export const SESSION_CARD_BRANCH_PENDING_TTL_MS = 5 * 60 * 1000
export const SESSION_CARD_BRANCH_COMPLETED_TTL_MS = 24 * 60 * 60 * 1000
const SESSION_CARD_STORE_LOCK_STALE_MS = 30 * 1000
const SESSION_CARD_STORE_LOCK_WAIT_MS = 2 * 1000
const SESSION_CARD_STORE_LOCK_POLL_MS = 10
const SESSION_CARD_BRANCH_KEY_MAX_LENGTH = 2048
const SESSION_CARD_STORE_LOCK_FILE = `${SESSION_CARD_STORE_FILE}.lock`
const SESSION_CARD_STORE_COMMIT_PREFIX = `${SESSION_CARD_STORE_FILE}.commit.`
const SESSION_CARD_STORE_FENCE_PREFIX = `${SESSION_CARD_STORE_FILE}.fence.`
const SESSION_CARD_STORE_FENCED_PREFIX = `${SESSION_CARD_STORE_FILE}.fenced.`
const SESSION_CARD_STORE_FENCE_WIDTH = 16
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/
const LOCK_TOKEN_PATTERN = /^[a-f0-9]{32}$/
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const RECORD_FIELDS = new Set([
  'cardId',
  'manualTitle',
  'autoTitle',
  'pinned',
  'pinnedAt',
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
  /** Timestamp of the current pin action; older values appear first. */
  pinnedAt?: number
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
  | { kind: 'ambiguous' }

export type PersistedSessionCardBranchReplay = {
  requestKeyHash: string
  fingerprint: string
  createdAt: number
  updatedAt: number
  expiresAt: number
  attemptCount: number
  reservationId?: string
  completedAt?: number
  outcome?: SessionCardBranchReplayOutcome
  reconciliation?: {
    kind: 'authoritative-projection'
    reconciledAt: number
  }
}

export type SessionCardBranchReplayReconciliationEvidence =
  | {
      kind: 'projection-created'
      canonicalSegmentKey: string
      childSessionKey: string
    }
  | {
      kind: 'operator-no-effect'
      actorFingerprint: string
      assertedAt: number
    }

export type SessionCardBranchReplayReconciliation =
  | {
      status: 'reconciled'
      replay: PersistedSessionCardBranchReplay
    }
  | { status: 'removed' }

export type SessionCardBranchReplayReservation =
  | { status: 'reserved'; reservationId: string }
  | { status: 'pending'; replay: PersistedSessionCardBranchReplay }
  | { status: 'completed'; replay: PersistedSessionCardBranchReplay }
  | { status: 'conflict' }
  | { status: 'capacity' }
  | { status: 'archived' }

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
  if (
    value.kind === 'failed' ||
    value.kind === 'unavailable' ||
    value.kind === 'ambiguous'
  ) {
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
        field !== 'updatedAt' &&
        field !== 'expiresAt' &&
        field !== 'attemptCount' &&
        field !== 'reservationId' &&
        field !== 'completedAt' &&
        field !== 'outcome' &&
        field !== 'reconciliation',
    ) ||
    typeof value.requestKeyHash !== 'string' ||
    !SHA256_HEX_PATTERN.test(value.requestKeyHash) ||
    typeof value.fingerprint !== 'string' ||
    !SHA256_HEX_PATTERN.test(value.fingerprint) ||
    !isTimestamp(value.createdAt)
  ) {
    return null
  }

  const outcome =
    'outcome' in value ? validateBranchReplayOutcome(value.outcome) : undefined
  if ('outcome' in value && !outcome) return null
  const updatedAt =
    'updatedAt' in value && isTimestamp(value.updatedAt)
      ? value.updatedAt
      : value.createdAt
  const expiresAt =
    'expiresAt' in value && isTimestamp(value.expiresAt)
      ? value.expiresAt
      : updatedAt +
        (outcome
          ? SESSION_CARD_BRANCH_COMPLETED_TTL_MS
          : SESSION_CARD_BRANCH_PENDING_TTL_MS)
  const attemptCount =
    'attemptCount' in value &&
    Number.isSafeInteger(value.attemptCount) &&
    Number(value.attemptCount) >= 1 &&
    Number(value.attemptCount) <= 2
      ? Number(value.attemptCount)
      : 'attemptCount' in value
        ? null
        : 1
  const expectedTtl = outcome
    ? SESSION_CARD_BRANCH_COMPLETED_TTL_MS
    : SESSION_CARD_BRANCH_PENDING_TTL_MS
  if (
    attemptCount === null ||
    !Number.isSafeInteger(expiresAt) ||
    updatedAt < value.createdAt ||
    updatedAt > Date.now() + SESSION_CARD_BRANCH_PENDING_TTL_MS ||
    expiresAt <= updatedAt ||
    expiresAt - updatedAt > expectedTtl
  ) {
    return null
  }

  const replay: PersistedSessionCardBranchReplay = {
    requestKeyHash: value.requestKeyHash,
    fingerprint: value.fingerprint,
    createdAt: value.createdAt,
    updatedAt,
    expiresAt,
    attemptCount,
  }
  if (outcome) {
    const completedAt =
      'completedAt' in value && isTimestamp(value.completedAt)
        ? value.completedAt
        : updatedAt
    if (completedAt < value.createdAt || completedAt > updatedAt) return null
    replay.completedAt = completedAt
    replay.outcome = outcome
    if ('reservationId' in value) return null
    if ('reconciliation' in value) {
      const reconciliation = value.reconciliation
      if (
        outcome.kind !== 'created' ||
        !isRecord(reconciliation) ||
        Object.keys(reconciliation).some(
          (field) => field !== 'kind' && field !== 'reconciledAt',
        ) ||
        reconciliation.kind !== 'authoritative-projection' ||
        !isTimestamp(reconciliation.reconciledAt) ||
        reconciliation.reconciledAt < value.createdAt ||
        reconciliation.reconciledAt > updatedAt
      ) {
        return null
      }
      replay.reconciliation = {
        kind: 'authoritative-projection',
        reconciledAt: reconciliation.reconciledAt,
      }
    }
  } else if ('completedAt' in value || 'reconciliation' in value) {
    return null
  } else if ('reservationId' in value) {
    if (
      typeof value.reservationId !== 'string' ||
      !LOCK_TOKEN_PATTERN.test(value.reservationId)
    ) {
      return null
    }
    replay.reservationId = value.reservationId
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
    if ('pinnedAt' in value) {
      if (value.pinned !== true || !isTimestamp(value.pinnedAt)) return null
      card.pinnedAt = value.pinnedAt
    }
    // Existing pinned records predate durable pin ordering. Preserve their
    // relative behavior with their last metadata update as a stable fallback.
    if (card.pinned === true && card.pinnedAt === undefined) {
      card.pinnedAt = card.updatedAt
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
    if (card.archivedAt !== undefined) {
      delete card.pinned
      delete card.pinnedAt
    }
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

type SessionCardStoreFenceState = {
  highWater: number
  commits: Map<number, string>
  fenced: Set<number>
}

function parseFenceSuffix(name: string, prefix: string): number | null {
  if (!name.startsWith(prefix)) return null
  const suffix = name.slice(prefix.length)
  if (
    suffix.length !== SESSION_CARD_STORE_FENCE_WIDTH ||
    !/^\d+$/u.test(suffix)
  ) {
    return null
  }
  const fence = Number(suffix)
  return Number.isSafeInteger(fence) && fence >= 0 ? fence : null
}

function sessionCardStoreFencePath(prefix: string, fence: number): string {
  return join(
    getStateDir(),
    `${prefix}${String(fence).padStart(SESSION_CARD_STORE_FENCE_WIDTH, '0')}`,
  )
}

function readSessionCardStoreFenceState(): SessionCardStoreFenceState {
  const commits = new Map<number, string>()
  const fenced = new Set<number>()
  let highWater = 0
  let names: Array<string>
  try {
    names = readdirSync(getStateDir())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { highWater, commits, fenced }
    }
    throw error
  }

  for (const name of names) {
    const commitFence = parseFenceSuffix(name, SESSION_CARD_STORE_COMMIT_PREFIX)
    if (commitFence !== null) {
      commits.set(commitFence, join(getStateDir(), name))
      highWater = Math.max(highWater, commitFence)
      continue
    }
    const activeFence = parseFenceSuffix(name, SESSION_CARD_STORE_FENCE_PREFIX)
    if (activeFence !== null) {
      highWater = Math.max(highWater, activeFence)
      continue
    }
    const invalidatedFence = parseFenceSuffix(
      name,
      SESSION_CARD_STORE_FENCED_PREFIX,
    )
    if (invalidatedFence !== null) {
      fenced.add(invalidatedFence)
      highWater = Math.max(highWater, invalidatedFence)
    }
  }
  return { highWater, commits, fenced }
}

function authoritativeSessionCardStorePath(): string {
  const state = readSessionCardStoreFenceState()
  const latest = Array.from(state.commits.keys())
    .filter((fence) => !state.fenced.has(fence))
    .sort((left, right) => right - left)[0]
  return latest === undefined
    ? sessionCardStorePath()
    : (state.commits.get(latest) ?? sessionCardStorePath())
}

function readStore(): PersistedSessionCardStore {
  try {
    const path = authoritativeSessionCardStorePath()
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) return emptyStore()
    if (stat.size > SESSION_CARD_STORE_MAX_BYTES) return emptyStore()
    return parseStore(readFileSync(path, 'utf8'))
  } catch {
    return emptyStore()
  }
}

function readStoreForBranchReplay(): PersistedSessionCardStore {
  const path = authoritativeSessionCardStorePath()
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

type SessionCardStoreLock = {
  token: string
  fence: number
  release: () => void
}

type SessionCardStoreLockMetadata = {
  token: string
  pid: number
  processIdentity?: string
  createdAt: number
  leaseUntil?: number
  fence?: number
}

let activeSessionCardStoreLock: SessionCardStoreLock | null = null

function sleepSync(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, milliseconds)
}

function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function readLockMetadata(path: string): SessionCardStoreLockMetadata | null {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) {
    throw new Error('Session Card metadata lock is invalid')
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (
      !isRecord(parsed) ||
      typeof parsed.token !== 'string' ||
      !LOCK_TOKEN_PATTERN.test(parsed.token) ||
      !Number.isSafeInteger(parsed.pid) ||
      Number(parsed.pid) <= 0 ||
      Number(parsed.pid) > 2_147_483_647 ||
      ('processIdentity' in parsed &&
        (typeof parsed.processIdentity !== 'string' ||
          parsed.processIdentity.length === 0 ||
          parsed.processIdentity.length > 256)) ||
      ('leaseUntil' in parsed && !isTimestamp(parsed.leaseUntil)) ||
      !isTimestamp(parsed.createdAt)
    ) {
      return null
    }
    const metadata: SessionCardStoreLockMetadata = {
      token: parsed.token,
      pid: Number(parsed.pid),
      createdAt: parsed.createdAt,
    }
    if ('processIdentity' in parsed) {
      metadata.processIdentity = parsed.processIdentity as string
    }
    if ('leaseUntil' in parsed) {
      metadata.leaseUntil = parsed.leaseUntil as number
    }
    if ('fence' in parsed) {
      if (!Number.isSafeInteger(parsed.fence) || Number(parsed.fence) < 1) {
        return null
      }
      metadata.fence = Number(parsed.fence)
    }
    return metadata
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error
    return null
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

type ProcessCreationLookup = (pid: number) => string | null
type ProcessLivenessLookup = (pid: number) => boolean

function readLinuxProcessStartTime(pid: number): string | null {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const closingParenthesis = raw.lastIndexOf(') ')
    if (closingParenthesis < 0) return null
    const fieldsAfterCommand = raw
      .slice(closingParenthesis + 2)
      .trim()
      .split(/\s+/u)
    const startTime = fieldsAfterCommand[19]
    return startTime && /^\d+$/u.test(startTime) ? startTime : null
  } catch {
    return null
  }
}

function readWindowsProcessCreationTime(pid: number): string | null {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$processInfo = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'`,
    'if ($null -ne $processInfo) { [Console]::Out.Write($processInfo.CreationDate.ToUniversalTime().Ticks) }',
  ].join('; ')
  try {
    const creationTime = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 2_000,
        maxBuffer: 1024,
      },
    ).trim()
    return /^\d+$/u.test(creationTime) ? creationTime : null
  } catch {
    return null
  }
}

/** Platform seam for process-creation identity. Windows uses CIM rather than
 * lease age so PID reuse can be distinguished without evicting a paused live
 * owner. Unsupported or failed lookups safely return null. */
export function resolveProcessIdentity(
  pid: number,
  platform: NodeJS.Platform,
  linuxStartTimeLookup: ProcessCreationLookup = readLinuxProcessStartTime,
  windowsCreationTimeLookup: ProcessCreationLookup = readWindowsProcessCreationTime,
): string | null {
  const lookup =
    platform === 'linux'
      ? linuxStartTimeLookup
      : platform === 'win32'
        ? windowsCreationTimeLookup
        : null
  if (!lookup) return null
  const creationIdentity = lookup(pid)
  return creationIdentity && /^\d+$/u.test(creationIdentity)
    ? `${platform === 'win32' ? 'windows' : 'linux'}:${creationIdentity}`
    : null
}

function getProcessIdentity(pid: number): string | null {
  return resolveProcessIdentity(pid, process.platform)
}

export function sessionCardStoreLockOwnerIsRecoverable(
  owner: SessionCardStoreLockMetadata | null,
  lockModifiedAt: number,
  now: number,
  processLivenessLookup: ProcessLivenessLookup = processIsAlive,
  processIdentityLookup: ProcessCreationLookup = getProcessIdentity,
): boolean {
  if (!owner) {
    return now - lockModifiedAt >= SESSION_CARD_STORE_LOCK_STALE_MS
  }
  if (!processLivenessLookup(owner.pid)) return true

  if (owner.processIdentity) {
    const currentIdentity = processIdentityLookup(owner.pid)
    // A matching PID + process-start identity is authoritative liveness. Never
    // evict that owner merely because wall-clock timestamps or its lease aged.
    if (currentIdentity === owner.processIdentity) return false
    if (currentIdentity !== null) return true
  }

  // A lease cannot fence a paused writer. If the PID is confirmed live but its
  // creation identity is unavailable, waiting for process death is the only
  // safe cross-platform fallback.
  return false
}

function createFenceMarker(prefix: string, fence: number): void {
  const path = sessionCardStoreFencePath(prefix, fence)
  let descriptor: number | null = null
  try {
    descriptor = openSync(path, 'wx', 0o600)
    writeFileSync(descriptor, `${fence}\n`, 'utf8')
    fsyncSync(descriptor)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  } finally {
    if (descriptor !== null) closeSync(descriptor)
  }
}

function pruneOlderFenceMarkers(currentFence: number): void {
  for (const name of readdirSync(getStateDir())) {
    const fence = parseFenceSuffix(name, SESSION_CARD_STORE_FENCE_PREFIX)
    if (fence !== null && fence < currentFence) {
      unlinkIfPresent(join(getStateDir(), name))
    }
  }
}

function recoverStaleLock(lockPath: string, now: number): boolean {
  let metadata: SessionCardStoreLockMetadata | null
  let observed
  try {
    observed = lstatSync(lockPath)
    metadata = readLockMetadata(lockPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
  if (
    !sessionCardStoreLockOwnerIsRecoverable(metadata, observed.mtimeMs, now)
  ) {
    return false
  }

  const claimPath = `${lockPath}.claim.${process.pid}.${randomBytes(8).toString('hex')}`
  try {
    linkSync(lockPath, claimPath)
    const current = lstatSync(lockPath)
    const claim = lstatSync(claimPath)
    if (
      current.dev === claim.dev &&
      current.ino === claim.ino &&
      observed.dev === claim.dev &&
      observed.ino === claim.ino
    ) {
      const fence =
        metadata?.fence ?? readSessionCardStoreFenceState().highWater + 1
      const commitPath = sessionCardStoreFencePath(
        SESSION_CARD_STORE_COMMIT_PREFIX,
        fence,
      )
      try {
        lstatSync(commitPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        // Once takeover wins, a delayed publication from the expired owner is
        // permanently ignored even if that owner resumes after the successor.
        createFenceMarker(SESSION_CARD_STORE_FENCED_PREFIX, fence)
      }
      createFenceMarker(SESSION_CARD_STORE_FENCE_PREFIX, fence)
      unlinkSync(lockPath)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  } finally {
    unlinkIfPresent(claimPath)
  }
}

function acquireSessionCardStoreLock(): SessionCardStoreLock {
  const stateDir = getStateDir()
  mkdirSync(stateDir, { recursive: true })
  const lockPath = sessionCardStoreLockPath()
  const token = randomBytes(16).toString('hex')
  const startedAt = process.hrtime.bigint()

  for (;;) {
    let descriptor: number | null = null
    try {
      const fence = readSessionCardStoreFenceState().highWater + 1
      if (!Number.isSafeInteger(fence)) {
        throw new Error('Session Card metadata fence is exhausted')
      }
      const createdAt = Date.now()
      const processIdentity = getProcessIdentity(process.pid)
      descriptor = openSync(lockPath, 'wx', 0o600)
      writeFileSync(
        descriptor,
        `${JSON.stringify({
          token,
          pid: process.pid,
          ...(processIdentity ? { processIdentity } : {}),
          createdAt,
          leaseUntil: createdAt + SESSION_CARD_STORE_LOCK_STALE_MS,
          fence,
        })}\n`,
        'utf8',
      )
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = null
      try {
        createFenceMarker(SESSION_CARD_STORE_FENCE_PREFIX, fence)
      } catch (error) {
        unlinkIfPresent(lockPath)
        throw error
      }
      return {
        token,
        fence,
        release: () => {
          let owned = false
          try {
            const current = readLockMetadata(lockPath)
            owned =
              current !== null &&
              current.token === token &&
              current.fence === fence
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
            throw error
          }
          if (owned) {
            unlinkIfPresent(lockPath)
            pruneOlderFenceMarkers(fence)
          }
        },
      }
    } catch (error) {
      if (descriptor !== null) {
        try {
          closeSync(descriptor)
        } finally {
          unlinkIfPresent(lockPath)
        }
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (recoverStaleLock(lockPath, Date.now())) continue
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      if (elapsedMs >= SESSION_CARD_STORE_LOCK_WAIT_MS) {
        throw new Error('Session Card metadata store is busy')
      }
      sleepSync(SESSION_CARD_STORE_LOCK_POLL_MS)
    }
  }
}

function assertSessionCardStoreLockOwned(lock: SessionCardStoreLock): void {
  let current: SessionCardStoreLockMetadata | null
  try {
    current = readLockMetadata(sessionCardStoreLockPath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Session Card metadata lock ownership was lost')
    }
    throw error
  }
  if (current?.token !== lock.token || current.fence !== lock.fence) {
    throw new Error('Session Card metadata lock ownership was lost')
  }
}

function withSessionCardStoreLock<T>(operation: () => T): T {
  const lock = acquireSessionCardStoreLock()
  const previousActiveLock = activeSessionCardStoreLock
  activeSessionCardStoreLock = lock
  let failed = false
  let failure: unknown
  let result: T | undefined
  try {
    result = operation()
  } catch (error) {
    failed = true
    failure = error
  } finally {
    activeSessionCardStoreLock = previousActiveLock
  }

  try {
    lock.release()
  } catch (releaseError) {
    if (failed) {
      throw new AggregateError(
        [failure, releaseError],
        'Session Card metadata operation and lock release failed',
      )
    }
    throw releaseError
  }
  if (failed) throw failure
  return result as T
}

function writeStore(store: PersistedSessionCardStore): void {
  const serialized = assertWritableStore(store)
  const lock = activeSessionCardStoreLock
  if (!lock) {
    throw new Error('Session Card metadata write requires lock ownership')
  }
  assertSessionCardStoreLockOwned(lock)

  const targetPath = sessionCardStorePath()
  const stateDir = getStateDir()
  mkdirSync(stateDir, { recursive: true })

  const nonce = `${process.pid}.${randomBytes(6).toString('hex')}`
  const tempPath = join(stateDir, `.${SESSION_CARD_STORE_FILE}.${nonce}.tmp`)
  const preparedPath = `${tempPath}.prepared`
  const commitPath = sessionCardStoreFencePath(
    SESSION_CARD_STORE_COMMIT_PREFIX,
    lock.fence,
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
    renameSync(tempPath, preparedPath)
    assertSessionCardStoreLockOwned(lock)

    // Hard-link publication is an immutable create-if-absent commit. A stale
    // owner can never replace a successor's generation, and takeover records a
    // permanent invalidation marker before removing the expired lock.
    linkSync(preparedPath, commitPath)
    unlinkSync(preparedPath)

    const fenceState = readSessionCardStoreFenceState()
    if (
      fenceState.fenced.has(lock.fence) ||
      fenceState.highWater > lock.fence
    ) {
      throw new Error('Session Card metadata publication was fenced')
    }

    const projectionPath = join(
      stateDir,
      `.${SESSION_CARD_STORE_FILE}.${nonce}.projection`,
    )
    try {
      linkSync(commitPath, projectionPath)
      renameSync(projectionPath, targetPath)
    } finally {
      unlinkIfPresent(projectionPath)
    }

    // Keep only the newest authoritative snapshot. Invalidation markers remain
    // durable because an arbitrarily delayed expired process may still resume.
    for (const [fence, path] of fenceState.commits) {
      if (fence < lock.fence) unlinkIfPresent(path)
    }
    pruneOlderFenceMarkers(lock.fence)
  } catch (error) {
    writeFailed = true
    writeFailure = error
  }

  let cleanupFailed = false
  let cleanupFailure: unknown
  for (const path of [tempPath, preparedPath]) {
    try {
      unlinkSync(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        cleanupFailed = true
        cleanupFailure = cleanupFailure
          ? new AggregateError([cleanupFailure, error])
          : error
      }
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

export function sessionCardStoreLockPath(): string {
  return join(getStateDir(), SESSION_CARD_STORE_LOCK_FILE)
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
  return replay &&
    (replay.reconciliation !== undefined ||
      replay.outcome?.kind === 'ambiguous' ||
      replay.expiresAt > Date.now())
    ? replay
    : null
}

function ambiguousExpiredReplay(
  replay: PersistedSessionCardBranchReplay,
): PersistedSessionCardBranchReplay {
  const completedAt = replay.expiresAt
  const ambiguous: PersistedSessionCardBranchReplay = {
    ...replay,
    updatedAt: completedAt,
    completedAt,
    expiresAt: completedAt + SESSION_CARD_BRANCH_COMPLETED_TTL_MS,
    outcome: { kind: 'ambiguous' },
  }
  delete ambiguous.reservationId
  return ambiguous
}

function pruneExpiredBranchReplays(
  store: PersistedSessionCardStore,
  now: number,
  requestedKeyHash: string,
): boolean {
  let changed = false
  for (const card of Object.values(store.cards)) {
    if (!card.branchReplays) continue
    const retained: Array<PersistedSessionCardBranchReplay> = []
    for (const replay of card.branchReplays) {
      if (replay.requestKeyHash === requestedKeyHash) {
        retained.push(replay)
      } else if (replay.outcome) {
        if (
          replay.reconciliation !== undefined ||
          replay.outcome.kind === 'ambiguous' ||
          replay.expiresAt > now
        ) {
          retained.push(replay)
        } else changed = true
      } else if (replay.expiresAt <= now) {
        retained.push(ambiguousExpiredReplay(replay))
        changed = true
      } else {
        retained.push(replay)
      }
    }
    if (retained.length !== card.branchReplays.length) changed = true
    if (retained.length > 0) card.branchReplays = retained
    else delete card.branchReplays
  }
  return changed
}

export function reserveSessionCardBranchReplay(
  cardId: string,
  requestKeyHash: string,
  fingerprint: string,
): SessionCardBranchReplayReservation {
  const normalizedCardId = assertCardId(cardId)
  const normalizedRequestKeyHash = assertBranchReplayHash(requestKeyHash)
  const normalizedFingerprint = assertBranchReplayHash(fingerprint)
  return withSessionCardStoreLock(() => {
    const now = Date.now()
    const store = readStoreForBranchReplay()
    const previous = store.cards[normalizedCardId]
    const branchReplays = previous?.branchReplays ?? []
    const existingIndex = branchReplays.findIndex(
      (candidate) => candidate.requestKeyHash === normalizedRequestKeyHash,
    )
    let changed = false
    if (existingIndex >= 0) {
      const existing = branchReplays[existingIndex]
      if (!existing) {
        throw new Error('Session Card branch replay reservation is unavailable')
      }
      if (
        existing.outcome &&
        (existing.reconciliation !== undefined ||
          existing.outcome.kind === 'ambiguous' ||
          existing.expiresAt > now)
      ) {
        if (existing.fingerprint !== normalizedFingerprint) {
          return { status: 'conflict' }
        }
        return { status: 'completed', replay: existing }
      }
      if (!existing.outcome && existing.expiresAt > now) {
        if (existing.fingerprint !== normalizedFingerprint) {
          return { status: 'conflict' }
        }
        return { status: 'pending', replay: existing }
      }

      const retained = existing.outcome
        ? null
        : ambiguousExpiredReplay(existing)
      if (retained) {
        branchReplays[existingIndex] = retained
        writeStore(store)
        if (retained.fingerprint !== normalizedFingerprint) {
          return { status: 'conflict' }
        }
        return { status: 'completed', replay: retained }
      }
      branchReplays.splice(existingIndex, 1)
      changed = true
    }

    changed =
      pruneExpiredBranchReplays(store, now, normalizedRequestKeyHash) || changed
    const current = store.cards[normalizedCardId]
    const currentBranchReplays = current?.branchReplays ?? []
    const totalReplays = Object.values(store.cards).reduce(
      (count, card) => count + (card.branchReplays?.length ?? 0),
      0,
    )
    if (current?.archivedAt !== undefined) {
      if (changed) writeStore(store)
      return { status: 'archived' }
    }
    if (
      currentBranchReplays.length >= SESSION_CARD_BRANCH_REPLAY_MAX_PER_CARD ||
      totalReplays >= SESSION_CARD_BRANCH_REPLAY_MAX_COUNT
    ) {
      if (changed) writeStore(store)
      return { status: 'capacity' }
    }

    const reservationId = randomBytes(16).toString('hex')
    store.cards[normalizedCardId] = {
      ...current,
      cardId: normalizedCardId,
      updatedAt: current?.updatedAt ?? now,
      branchReplays: [
        ...currentBranchReplays,
        {
          // Reservation is the durable effect-intent boundary. The adapter has
          // no upstream idempotency/reconciliation key, so an incomplete lease
          // is ambiguous and must never be reclaimed for another opaque fork.
          requestKeyHash: normalizedRequestKeyHash,
          fingerprint: normalizedFingerprint,
          createdAt: now,
          updatedAt: now,
          expiresAt: now + SESSION_CARD_BRANCH_PENDING_TTL_MS,
          attemptCount: 1,
          reservationId,
        },
      ],
    }
    writeStore(store)
    return { status: 'reserved', reservationId }
  })
}

export function completeSessionCardBranchReplay(
  cardId: string,
  requestKeyHash: string,
  fingerprint: string,
  reservationId: string,
  outcome: SessionCardBranchReplayOutcome,
): PersistedSessionCardBranchReplay {
  const normalizedCardId = assertCardId(cardId)
  const normalizedRequestKeyHash = assertBranchReplayHash(requestKeyHash)
  const normalizedFingerprint = assertBranchReplayHash(fingerprint)
  if (
    typeof reservationId !== 'string' ||
    !LOCK_TOKEN_PATTERN.test(reservationId)
  ) {
    throw new Error('Invalid Session Card branch replay reservation')
  }
  const normalizedOutcome = validateBranchReplayOutcome(outcome)
  if (!normalizedOutcome) {
    throw new Error('Invalid Session Card branch replay outcome')
  }

  return withSessionCardStoreLock(() => {
    const now = Date.now()
    const store = readStoreForBranchReplay()
    const card = store.cards[normalizedCardId]
    const replayIndex = card?.branchReplays?.findIndex(
      (candidate) => candidate.requestKeyHash === normalizedRequestKeyHash,
    )
    const pending =
      replayIndex === undefined || replayIndex < 0
        ? undefined
        : card?.branchReplays?.[replayIndex]
    if (
      !card ||
      replayIndex === undefined ||
      replayIndex < 0 ||
      !pending ||
      pending.outcome ||
      pending.fingerprint !== normalizedFingerprint ||
      pending.reservationId !== reservationId ||
      pending.expiresAt <= now
    ) {
      throw new Error('Session Card branch replay reservation is unavailable')
    }

    const replay: PersistedSessionCardBranchReplay = {
      ...pending,
      updatedAt: now,
      completedAt: now,
      expiresAt: now + SESSION_CARD_BRANCH_COMPLETED_TTL_MS,
      outcome: normalizedOutcome,
    }
    delete replay.reservationId
    card.branchReplays![replayIndex] = replay
    writeStore(store)
    return replay
  })
}

export function reconcileSessionCardBranchReplay(
  cardId: string,
  requestKeyHash: string,
  fingerprint: string,
  evidence: SessionCardBranchReplayReconciliationEvidence,
): SessionCardBranchReplayReconciliation {
  const normalizedCardId = assertCardId(cardId)
  const normalizedRequestKeyHash = assertBranchReplayHash(requestKeyHash)
  const normalizedFingerprint = assertBranchReplayHash(fingerprint)
  if (!isRecord(evidence)) {
    throw new Error('Invalid Session Card branch reconciliation evidence')
  }

  const now = Date.now()
  const evidenceRecord = evidence as unknown as Record<string, unknown>
  const evidenceKind = evidenceRecord.kind
  if (evidenceKind === 'projection-created') {
    const canonicalSegmentKey = evidenceRecord.canonicalSegmentKey
    const childSessionKey = evidenceRecord.childSessionKey
    if (
      Object.keys(evidence).some(
        (field) =>
          field !== 'kind' &&
          field !== 'canonicalSegmentKey' &&
          field !== 'childSessionKey',
      ) ||
      typeof canonicalSegmentKey !== 'string' ||
      !isBoundedBranchKey(canonicalSegmentKey) ||
      typeof childSessionKey !== 'string' ||
      !isBoundedBranchKey(childSessionKey) ||
      canonicalSegmentKey === childSessionKey
    ) {
      throw new Error('Invalid Session Card branch reconciliation evidence')
    }
  } else if (evidenceKind === 'operator-no-effect') {
    const actorFingerprint = evidenceRecord.actorFingerprint
    const assertedAt = evidenceRecord.assertedAt
    if (
      Object.keys(evidence).some(
        (field) =>
          field !== 'kind' &&
          field !== 'actorFingerprint' &&
          field !== 'assertedAt',
      ) ||
      typeof actorFingerprint !== 'string' ||
      !SHA256_HEX_PATTERN.test(actorFingerprint) ||
      !isTimestamp(assertedAt) ||
      assertedAt > now ||
      now - assertedAt > SESSION_CARD_BRANCH_PENDING_TTL_MS
    ) {
      throw new Error('Invalid Session Card branch reconciliation evidence')
    }
  } else {
    throw new Error('Invalid Session Card branch reconciliation evidence')
  }

  return withSessionCardStoreLock(() => {
    const store = readStoreForBranchReplay()
    const card = store.cards[normalizedCardId]
    const replayIndex = card?.branchReplays?.findIndex(
      (candidate) => candidate.requestKeyHash === normalizedRequestKeyHash,
    )
    const replay =
      replayIndex === undefined || replayIndex < 0
        ? undefined
        : card?.branchReplays?.[replayIndex]
    if (
      !card ||
      replayIndex === undefined ||
      replayIndex < 0 ||
      !replay ||
      replay.fingerprint !== normalizedFingerprint ||
      replay.outcome?.kind !== 'ambiguous'
    ) {
      throw new Error('Session Card branch ambiguity is unavailable')
    }

    if (evidence.kind === 'operator-no-effect') {
      card.branchReplays!.splice(replayIndex, 1)
      if (card.branchReplays!.length === 0) delete card.branchReplays
      writeStore(store)
      return { status: 'removed' }
    }

    const reconciled: PersistedSessionCardBranchReplay = {
      ...replay,
      updatedAt: now,
      completedAt: now,
      expiresAt: now + SESSION_CARD_BRANCH_COMPLETED_TTL_MS,
      outcome: {
        kind: 'created',
        canonicalSegmentKey: evidence.canonicalSegmentKey,
        childSessionKey: evidence.childSessionKey,
      },
      reconciliation: {
        kind: 'authoritative-projection',
        reconciledAt: now,
      },
    }
    delete reconciled.reservationId
    card.branchReplays![replayIndex] = reconciled
    writeStore(store)
    return { status: 'reconciled', replay: reconciled }
  })
}

export function updateSessionCardMetadata(
  cardId: string,
  patch: SessionCardMetadataUpdate,
): PersistedSessionCard {
  const normalizedCardId = assertCardId(cardId)
  const normalizedPatch = normalizeUpdate(patch)
  return withSessionCardStoreLock(() => {
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
    if (next.archivedAt !== undefined) {
      delete next.pinned
      delete next.pinnedAt
    } else if ('pinned' in normalizedPatch) {
      next.pinned = normalizedPatch.pinned
      if (normalizedPatch.pinned && previous?.pinned !== true) {
        const latestPinOrder = Object.values(store.cards).reduce(
          (latest, card) =>
            card.pinned === true
              ? Math.max(latest, card.pinnedAt ?? card.updatedAt)
              : latest,
          -1,
        )
        next.pinnedAt = Math.max(next.updatedAt, latestPinOrder + 1)
      } else if (!normalizedPatch.pinned) {
        delete next.pinnedAt
      }
    }

    store.cards[normalizedCardId] = next
    writeStore(store)
    return next
  })
}

export function archiveSessionCardMetadata(
  cardId: string,
): PersistedSessionCard {
  const normalizedCardId = assertCardId(cardId)
  return withSessionCardStoreLock(() => {
    const store = readStore()
    const now = Date.now()
    const next: PersistedSessionCard = {
      ...store.cards[normalizedCardId],
      cardId: normalizedCardId,
      updatedAt: now,
      archivedAt: now,
    }
    delete next.pinned
    delete next.pinnedAt
    store.cards[normalizedCardId] = next
    writeStore(store)
    return next
  })
}
