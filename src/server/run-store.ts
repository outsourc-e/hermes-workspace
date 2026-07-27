import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { getHermesRoot } from './claude-paths'
import { assertSafeRunId, isSafeRunId } from './run-id'

export type PersistedRunToolCall = {
  id: string
  name: string
  phase: string
  args?: unknown
  preview?: string
  result?: string
}

export type PersistedRunLifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

export type PersistedRunState = {
  runId: string
  providerRunId?: string
  sessionKey: string
  friendlyId: string
  cardId?: string
  canonicalSegmentKey?: string
  status: 'accepted' | 'active' | 'handoff' | 'stalled' | 'complete' | 'error'
  createdAt: number
  updatedAt: number
  lastEventAt: number
  assistantText: string
  thinkingText: string
  toolCalls: Array<PersistedRunToolCall>
  lifecycleEvents: Array<PersistedRunLifecycleEvent>
  errorMessage?: string
}

export type PersistedRunOwnerProjection = {
  runId: string
  sessionKey: string
  friendlyId: string
  cardId?: string
  canonicalSegmentKey?: string
}

/**
 * Persisted runs are accepted only through an exact owner projection. Card
 * ownership is all-or-nothing: legacy records without Card metadata remain
 * usable through legacy session recovery, but cannot be claimed by a Card
 * handoff after the fact.
 */
export function persistedRunMatchesOwner(
  run: PersistedRunState | null | undefined,
  owner: PersistedRunOwnerProjection,
): run is PersistedRunState {
  if (
    !run ||
    !isSafeRunId(run.runId) ||
    !isSafeRunId(owner.runId) ||
    run.runId !== owner.runId ||
    run.sessionKey !== owner.sessionKey ||
    run.friendlyId !== owner.friendlyId
  ) {
    return false
  }

  const ownerHasCardIdentity =
    owner.cardId !== undefined || owner.canonicalSegmentKey !== undefined
  if (!ownerHasCardIdentity) {
    return run.cardId === undefined && run.canonicalSegmentKey === undefined
  }
  return (
    owner.cardId !== undefined &&
    owner.canonicalSegmentKey !== undefined &&
    run.cardId === owner.cardId &&
    run.canonicalSegmentKey === owner.canonicalSegmentKey
  )
}

const RUNS_ROOT = path.resolve(getHermesRoot(), 'webui-mvp', 'runs')
const runUpdateQueues = new Map<string, Promise<void>>()

const RUN_LOCK_WAIT_MS = 10_000
const RUN_LOCK_POLL_MS = 5
const TERMINAL_RUN_STATUSES = new Set<PersistedRunState['status']>([
  'complete',
  'error',
  'handoff',
])

export const MAX_PERSISTED_RUN_TOOL_CALLS = 128
export const PERSISTED_TOOL_ID_MAX_BYTES = 256
export const PERSISTED_TOOL_NAME_MAX_BYTES = 128
export const PERSISTED_TOOL_PHASE_MAX_BYTES = 32
export const PERSISTED_TOOL_ARGS_MAX_BYTES = 16 * 1024
export const PERSISTED_TOOL_PREVIEW_MAX_BYTES = 2 * 1024
export const PERSISTED_TOOL_RESULT_MAX_BYTES = 16 * 1024
export const PERSISTED_TOOL_CALLS_MAX_BYTES = 256 * 1024

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let result = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maxBytes) break
    result += character
    bytes += characterBytes
  }
  return result
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function boundedExactIdentifier(
  value: unknown,
  maxBytes: number,
): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return null
  }
  if (containsControlCharacter(value)) return null
  return Buffer.byteLength(value, 'utf8') <= maxBytes ? value : null
}

function sanitizeToolArgs(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    const serialized = JSON.stringify(value)
    if (Buffer.byteLength(serialized, 'utf8') > PERSISTED_TOOL_ARGS_MAX_BYTES) {
      return { omitted: 'Tool arguments exceeded the persistence limit.' }
    }
    return JSON.parse(serialized) as unknown
  } catch {
    return { omitted: 'Tool arguments could not be serialized safely.' }
  }
}

function sanitizePersistedToolCall(
  input: PersistedRunToolCall,
): PersistedRunToolCall | null {
  const id = boundedExactIdentifier(input.id, PERSISTED_TOOL_ID_MAX_BYTES)
  if (!id) return null
  const exactName = boundedExactIdentifier(
    input.name,
    PERSISTED_TOOL_NAME_MAX_BYTES,
  )
  const phase = boundedExactIdentifier(
    input.phase,
    PERSISTED_TOOL_PHASE_MAX_BYTES,
  )
  if (!phase) return null
  const args = sanitizeToolArgs(input.args)
  const preview =
    typeof input.preview === 'string'
      ? truncateUtf8(input.preview, PERSISTED_TOOL_PREVIEW_MAX_BYTES)
      : undefined
  const result =
    input.phase === 'error'
      ? 'Tool failed.'
      : typeof input.result === 'string'
        ? truncateUtf8(input.result, PERSISTED_TOOL_RESULT_MAX_BYTES)
        : undefined
  return {
    id,
    name: exactName ?? 'tool',
    phase,
    ...(args === undefined ? {} : { args }),
    ...(preview === undefined ? {} : { preview }),
    ...(result === undefined ? {} : { result }),
  }
}

function boundPersistedToolCalls(
  input: Array<PersistedRunToolCall>,
  protectedToolId?: string,
): Array<PersistedRunToolCall> {
  const bounded: Array<PersistedRunToolCall> = []
  const seen = new Set<string>()
  for (const entry of input) {
    const sanitized = sanitizePersistedToolCall(entry)
    if (!sanitized || seen.has(sanitized.id)) continue
    bounded.push(sanitized)
    seen.add(sanitized.id)
    if (bounded.length >= MAX_PERSISTED_RUN_TOOL_CALLS) break
  }
  if (serializedBytes(bounded) <= PERSISTED_TOOL_CALLS_MAX_BYTES) return bounded

  for (let index = bounded.length - 1; index >= 0; index -= 1) {
    const entry = bounded[index]
    if (!entry) continue
    bounded[index] = {
      id: entry.id,
      name: entry.name,
      phase: entry.phase,
      ...(entry.id === protectedToolId && entry.phase === 'error'
        ? { result: 'Tool failed.' }
        : {}),
    }
    if (serializedBytes(bounded) <= PERSISTED_TOOL_CALLS_MAX_BYTES)
      return bounded
  }
  return bounded.map((entry) => ({
    id: entry.id,
    name: 'tool',
    phase: entry.phase,
  }))
}

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey || 'main')
}

function resolveDescendant(root: string, ...segments: Array<string>): string {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, ...segments)
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Resolved path must stay beneath the runs root')
  }
  return resolvedPath
}

function sessionDir(sessionKey: string): string {
  return resolveDescendant(RUNS_ROOT, encodeSessionKey(sessionKey))
}

function runPath(sessionKey: string, runId: string): string {
  assertSafeRunId(runId)
  return resolveDescendant(sessionDir(sessionKey), `${runId}.json`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

type RunLockIdentity = { sessionKey: string; runId: string }

function runLockPath(identity: RunLockIdentity): string {
  return `${runPath(identity.sessionKey, identity.runId)}.lock`
}

type AcquiredRunLock = { path: string; token: string }

type RunLockOwner = { token: string; pid: number }

function parseRunLockOwner(value: string): RunLockOwner | null {
  try {
    const parsed = JSON.parse(value) as Partial<RunLockOwner>
    return typeof parsed.token === 'string' &&
      /^[a-f0-9-]{36}$/u.test(parsed.token) &&
      Number.isSafeInteger(parsed.pid) &&
      (parsed.pid ?? 0) > 0
      ? { token: parsed.token, pid: parsed.pid! }
      : null
  } catch {
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

async function recoverDeadRunLock(lockPath: string): Promise<boolean> {
  let observed
  try {
    observed = await lstat(lockPath)
    if (
      !observed.isFile() ||
      observed.isSymbolicLink() ||
      observed.size > 1024
    ) {
      throw new Error('Persisted run update lock is invalid')
    }
    const owner = parseRunLockOwner(await readFile(lockPath, 'utf8'))
    if (!owner) throw new Error('Persisted run update lock is invalid')
    if (processIsAlive(owner.pid)) return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }

  const claimPath = `${lockPath}.claim.${process.pid}.${crypto.randomUUID()}`
  try {
    await link(lockPath, claimPath)
    const [current, claim] = await Promise.all([
      lstat(lockPath),
      lstat(claimPath),
    ])
    if (
      current.dev === claim.dev &&
      current.ino === claim.ino &&
      observed.dev === claim.dev &&
      observed.ino === claim.ino
    ) {
      await unlink(lockPath)
      return true
    }
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  } finally {
    await unlink(claimPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function acquireRunLock(
  identity: RunLockIdentity,
): Promise<AcquiredRunLock> {
  await ensureDir(sessionDir(identity.sessionKey))
  const lockPath = runLockPath(identity)
  const token = crypto.randomUUID()
  const candidatePath = `${lockPath}.owner.${process.pid}.${token}`
  const startedAt = Date.now()
  await writeFile(
    candidatePath,
    `${JSON.stringify({ token, pid: process.pid })}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  )
  try {
    for (;;) {
      try {
        // Publish a fully-written owner record atomically. Writing directly with
        // `flag: 'wx'` makes the empty inode visible before writeFile fills it,
        // so a competing process can misclassify a live lock as invalid.
        await link(candidatePath, lockPath)
        return { path: lockPath, token }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (await recoverDeadRunLock(lockPath)) continue
        if (Date.now() - startedAt >= RUN_LOCK_WAIT_MS) {
          throw Object.assign(
            new Error(
              `Timed out waiting for persisted run ${identity.runId} update lock`,
            ),
            { code: 'EBUSY' },
          )
        }
        await new Promise((resolve) => setTimeout(resolve, RUN_LOCK_POLL_MS))
      }
    }
  } finally {
    await unlink(candidatePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function releaseRunLock(lock: AcquiredRunLock): Promise<void> {
  try {
    const owner = parseRunLockOwner(await readFile(lock.path, 'utf8'))
    if (owner?.token !== lock.token) {
      throw new Error('Persisted run update lock ownership changed')
    }
    await unlink(lock.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function withRunLocks<T>(
  identities: Array<RunLockIdentity>,
  work: () => Promise<T>,
): Promise<T> {
  const unique = new Map(
    identities.map((identity) => [runLockPath(identity), identity] as const),
  )
  const ordered = [...unique.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const acquired: Array<AcquiredRunLock> = []
  try {
    for (const [, identity] of ordered) {
      acquired.push(await acquireRunLock(identity))
    }
    return await work()
  } finally {
    for (const lock of acquired.reverse()) await releaseRunLock(lock)
  }
}

function assertSameRunOwner(
  current: PersistedRunState,
  next: PersistedRunState,
): void {
  if (
    next.runId !== current.runId ||
    next.providerRunId !== current.providerRunId ||
    next.sessionKey !== current.sessionKey ||
    next.friendlyId !== current.friendlyId ||
    next.cardId !== current.cardId ||
    next.canonicalSegmentKey !== current.canonicalSegmentKey ||
    next.createdAt !== current.createdAt
  ) {
    throw new Error(
      `Persisted run ${current.runId} owner cannot change during update`,
    )
  }
}

async function writeRun(run: PersistedRunState): Promise<void> {
  assertSafeRunId(run.runId)
  const dir = sessionDir(run.sessionKey)
  await ensureDir(dir)
  const targetPath = runPath(run.sessionKey, run.runId)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  await writeFile(tempPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  await rename(tempPath, targetPath)
}

async function writeRunExclusive(run: PersistedRunState): Promise<void> {
  assertSafeRunId(run.runId)
  const dir = sessionDir(run.sessionKey)
  await ensureDir(dir)
  const targetPath = runPath(run.sessionKey, run.runId)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  await writeFile(tempPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  try {
    // A hard link publishes the fully-written temp inode only when the target
    // does not exist. Unlike rename(), this cannot replace another owner that
    // won a destination race after our preflight check.
    await link(tempPath, targetPath)
  } finally {
    await unlink(tempPath).catch(() => undefined)
  }
}

async function enqueueRunUpdate<T>(
  sessionKey: string,
  runId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${encodeSessionKey(sessionKey)}:${runId}`
  const previous = runUpdateQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(work)
  const marker = current.then(
    () => undefined,
    () => undefined,
  )
  runUpdateQueues.set(key, marker)
  try {
    return await current
  } finally {
    if (runUpdateQueues.get(key) === marker) {
      runUpdateQueues.delete(key)
    }
  }
}

export async function createPersistedRun(input: {
  runId: string
  providerRunId?: string
  sessionKey: string
  friendlyId?: string
  cardId?: string
  canonicalSegmentKey?: string
}): Promise<PersistedRunState> {
  assertSafeRunId(input.runId)
  if (input.providerRunId !== undefined) assertSafeRunId(input.providerRunId)
  const now = Date.now()
  const run: PersistedRunState = {
    runId: input.runId,
    ...(input.providerRunId ? { providerRunId: input.providerRunId } : {}),
    sessionKey: input.sessionKey,
    friendlyId: input.friendlyId || input.sessionKey,
    ...(input.cardId?.trim() ? { cardId: input.cardId.trim() } : {}),
    ...(input.canonicalSegmentKey?.trim()
      ? { canonicalSegmentKey: input.canonicalSegmentKey.trim() }
      : {}),
    status: 'accepted',
    createdAt: now,
    updatedAt: now,
    lastEventAt: now,
    assistantText: '',
    thinkingText: '',
    toolCalls: [],
    lifecycleEvents: [],
  }
  await writeRunExclusive(run)
  return run
}

export async function getPersistedRun(
  sessionKey: string,
  runId: string,
): Promise<PersistedRunState | null> {
  try {
    const raw = await readFile(runPath(sessionKey, runId), 'utf8')
    const run = JSON.parse(raw) as PersistedRunState
    if (
      !isSafeRunId(run.runId) ||
      run.runId !== runId ||
      run.sessionKey !== sessionKey
    ) {
      return null
    }
    return run
  } catch {
    return null
  }
}

export async function migratePersistedRun(
  fromSessionKey: string,
  toSessionKey: string,
  runId: string,
  friendlyId?: string,
  cardIdentity?: { cardId: string; canonicalSegmentKey: string },
): Promise<PersistedRunState | null> {
  const normalizedFrom = fromSessionKey.trim()
  const normalizedTo = toSessionKey.trim()
  if (!normalizedFrom || !normalizedTo || !isSafeRunId(runId)) return null
  const normalizedRunId = runId
  const normalizedFriendlyId = friendlyId?.trim() || normalizedTo
  const normalizedCardId = cardIdentity?.cardId.trim()
  const normalizedCanonicalSegmentKey = cardIdentity?.canonicalSegmentKey.trim()
  const isCardMigration = cardIdentity !== undefined
  if (
    isCardMigration &&
    (!normalizedCardId ||
      !normalizedCanonicalSegmentKey ||
      normalizedCanonicalSegmentKey !== normalizedTo ||
      normalizedFriendlyId !== normalizedCardId)
  ) {
    throw new Error(
      `Persisted run ${normalizedRunId} source owner does not match the requested Card migration`,
    )
  }

  const targetOwner: PersistedRunOwnerProjection = {
    runId: normalizedRunId,
    sessionKey: normalizedTo,
    friendlyId: normalizedFriendlyId,
    ...(isCardMigration
      ? {
          cardId: normalizedCardId,
          canonicalSegmentKey: normalizedCanonicalSegmentKey,
        }
      : {}),
  }

  if (normalizedFrom === normalizedTo) {
    const existing = await getPersistedRun(normalizedTo, normalizedRunId)
    if (!existing) return null
    if (!persistedRunMatchesOwner(existing, targetOwner)) {
      throw new Error(
        `Persisted run ${normalizedRunId} source owner does not match the requested migration`,
      )
    }
    return existing
  }

  return enqueueRunUpdate(normalizedFrom, normalizedRunId, async () =>
    withRunLocks(
      [
        { sessionKey: normalizedFrom, runId: normalizedRunId },
        { sessionKey: normalizedTo, runId: normalizedRunId },
      ],
      async () => {
        const current = await getPersistedRun(normalizedFrom, normalizedRunId)
        const destination = await getPersistedRun(normalizedTo, normalizedRunId)
        if (!current) {
          if (!destination) return null
          if (!persistedRunMatchesOwner(destination, targetOwner)) {
            throw new Error(
              `Persisted run ${normalizedRunId} destination owner does not match the requested migration`,
            )
          }
          return destination
        }

        const sourceOwner: PersistedRunOwnerProjection = {
          runId: normalizedRunId,
          sessionKey: normalizedFrom,
          friendlyId: isCardMigration
            ? normalizedFriendlyId
            : current.friendlyId,
          ...(isCardMigration
            ? {
                cardId: normalizedCardId,
                canonicalSegmentKey: normalizedFrom,
              }
            : {}),
        }
        if (!persistedRunMatchesOwner(current, sourceOwner)) {
          throw new Error(
            `Persisted run ${normalizedRunId} source owner does not match the requested migration`,
          )
        }
        if (destination) {
          const detail = persistedRunMatchesOwner(destination, targetOwner)
            ? 'already exists'
            : 'does not match'
          throw new Error(
            `Persisted run ${normalizedRunId} destination owner ${detail} for the requested migration`,
          )
        }

        const migrated: PersistedRunState = {
          ...current,
          sessionKey: normalizedTo,
          friendlyId:
            normalizedFriendlyId || current.friendlyId || normalizedTo,
          ...(isCardMigration
            ? {
                cardId: normalizedCardId,
                canonicalSegmentKey: normalizedCanonicalSegmentKey,
              }
            : {}),
          updatedAt: Date.now(),
        }
        try {
          await writeRunExclusive(migrated)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(
              `Persisted run ${normalizedRunId} destination owner changed during migration`,
              { cause: error },
            )
          }
          throw error
        }
        try {
          await unlink(runPath(normalizedFrom, normalizedRunId))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return migrated

          try {
            await unlink(runPath(normalizedTo, normalizedRunId))
          } catch (rollbackError) {
            if ((rollbackError as NodeJS.ErrnoException).code !== 'ENOENT') {
              const now = Date.now()
              try {
                await writeRun({
                  ...migrated,
                  status: 'error',
                  updatedAt: now,
                  lastEventAt: now,
                  errorMessage:
                    'Run migration failed; recover from the original session.',
                })
              } catch (terminalizationError) {
                throw new AggregateError(
                  [error, rollbackError, terminalizationError],
                  `Failed to remove persisted run ${normalizedRunId} from ${normalizedFrom}, roll back ${normalizedTo}, or terminalize the successor`,
                )
              }
              throw new AggregateError(
                [error, rollbackError],
                `Failed to remove persisted run ${normalizedRunId} from ${normalizedFrom} and roll back ${normalizedTo}`,
              )
            }
          }
          throw error
        }
        return migrated
      },
    ),
  )
}

export async function updatePersistedRun(
  sessionKey: string,
  runId: string,
  updater: (run: PersistedRunState) => PersistedRunState,
): Promise<PersistedRunState | null> {
  if (!isSafeRunId(runId)) return null
  return enqueueRunUpdate(sessionKey, runId, async () =>
    withRunLocks([{ sessionKey, runId }], async () => {
      const current = await getPersistedRun(sessionKey, runId)
      if (!current) return null
      if (TERMINAL_RUN_STATUSES.has(current.status)) return current
      const next = updater(current)
      assertSameRunOwner(current, next)
      const stored = { ...next, updatedAt: Date.now() }
      await writeRun(stored)
      return stored
    }),
  )
}

export async function appendRunText(
  sessionKey: string,
  runId: string,
  text: string,
  options?: { replace?: boolean },
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    assistantText: options?.replace ? text : `${run.assistantText}${text}`,
  }))
}

type RunTextWriter = (
  text: string,
  options: { replace: boolean },
) => Promise<unknown>

export type RunTextPersistenceBuffer = {
  append: (text: string) => void
  replace: (text: string) => void
  flush: () => Promise<void>
  seal: () => Promise<void>
}

const RUN_TEXT_PERSIST_INTERVAL_MS = 500
const RUN_TEXT_SEAL_MAX_ATTEMPTS = 3
const RUN_TEXT_SEAL_RETRY_BASE_DELAY_MS = 25

type PendingRunTextBatch = { text: string; replace: boolean }

export function createRunTextPersistenceBuffer(
  write: RunTextWriter,
  intervalMs = RUN_TEXT_PERSIST_INTERVAL_MS,
): RunTextPersistenceBuffer {
  let pending: PendingRunTextBatch | null = null
  const queuedBatches: Array<PendingRunTextBatch> = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let writeQueue: Promise<void> | null = null
  let sealPromise: Promise<void> | null = null
  let sealed = false

  const clearFlushTimer = () => {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const queuePendingBatch = () => {
    if (!pending) return
    queuedBatches.push(pending)
    pending = null
  }

  const drainQueuedBatches = async (): Promise<void> => {
    try {
      while (queuedBatches.length > 0) {
        const batch = queuedBatches[0]
        if (!batch) break
        await write(batch.text, { replace: batch.replace })
        queuedBatches.shift()
      }
    } finally {
      writeQueue = null
    }
  }

  const flush = async (): Promise<void> => {
    clearFlushTimer()
    queuePendingBatch()
    if (!writeQueue && queuedBatches.length > 0) {
      writeQueue = drainQueuedBatches()
    }
    await writeQueue
  }

  const scheduleFlush = () => {
    if (flushTimer || sealed) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush().catch(() => undefined)
    }, intervalMs)
  }

  const append = (text: string) => {
    if (sealed) return
    if (pending) pending.text += text
    else pending = { text, replace: false }
    scheduleFlush()
  }

  const replace = (text: string) => {
    if (sealed) return
    pending = { text, replace: true }
    scheduleFlush()
  }

  const seal = (): Promise<void> => {
    sealed = true
    if (sealPromise) return sealPromise

    sealPromise = (async () => {
      for (let attempt = 1; attempt <= RUN_TEXT_SEAL_MAX_ATTEMPTS; attempt++) {
        try {
          await flush()
          return
        } catch (error) {
          if (attempt === RUN_TEXT_SEAL_MAX_ATTEMPTS) throw error
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              RUN_TEXT_SEAL_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
            ),
          )
        }
      }
    })()
    return sealPromise
  }

  return { append, replace, flush, seal }
}

export async function setRunThinking(
  sessionKey: string,
  runId: string,
  thinkingText: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    thinkingText,
  }))
}

export async function upsertRunToolCall(
  sessionKey: string,
  runId: string,
  toolCall: PersistedRunToolCall,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    const incomingId = boundedExactIdentifier(
      toolCall.id,
      PERSISTED_TOOL_ID_MAX_BYTES,
    )
    const existingCalls = boundPersistedToolCalls(run.toolCalls)
    if (!incomingId) return { ...run, toolCalls: existingCalls }

    const existingIndex = existingCalls.findIndex(
      (existing) => existing.id === incomingId,
    )
    if (
      existingIndex < 0 &&
      existingCalls.length >= MAX_PERSISTED_RUN_TOOL_CALLS
    ) {
      return { ...run, toolCalls: existingCalls }
    }

    const candidate = sanitizePersistedToolCall({
      ...(existingIndex >= 0 ? existingCalls[existingIndex] : {}),
      ...toolCall,
      id: incomingId,
    } as PersistedRunToolCall)
    if (!candidate) return { ...run, toolCalls: existingCalls }

    const nextTools = [...existingCalls]
    if (existingIndex >= 0) nextTools[existingIndex] = candidate
    else nextTools.push(candidate)
    const toolCalls = boundPersistedToolCalls(nextTools, incomingId)
    const failed = toolCall.phase === 'error'
    return {
      ...run,
      status: failed ? 'error' : 'active',
      lastEventAt: Date.now(),
      toolCalls,
      errorMessage: failed ? 'A tool call failed.' : run.errorMessage,
    }
  })
}

export async function addRunLifecycleEvent(
  sessionKey: string,
  runId: string,
  event: PersistedRunLifecycleEvent,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    lastEventAt: Date.now(),
    lifecycleEvents: [...run.lifecycleEvents, event].slice(-40),
  }))
}

export async function markRunStatus(
  sessionKey: string,
  runId: string,
  status: PersistedRunState['status'],
  errorMessage?: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status,
    lastEventAt: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  }))
}

// A run that hasn't been touched in this long is considered orphaned (e.g.
// the agent process crashed, the network dropped silently, or the user
// navigated away during a `handoff` that never resolved). Treating these as
// "active" makes every chat re-open show a phantom "Thinking…" indicator
// until the 120s client-side failsafe clears it.
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000

async function readRunsInDir(dir: string): Promise<Array<PersistedRunState>> {
  const files = (await readdir(dir)).filter((name) => {
    if (!name.endsWith('.json')) return false
    return isSafeRunId(name.slice(0, -'.json'.length))
  })
  if (files.length === 0) return []
  const runs = await Promise.all(
    files.map(async (name) => {
      try {
        const raw = await readFile(path.join(dir, name), 'utf8')
        const run = JSON.parse(raw) as PersistedRunState
        const fileRunId = name.slice(0, -'.json'.length)
        return run.runId === fileRunId && isSafeRunId(run.runId) ? run : null
      } catch {
        return null
      }
    }),
  )
  return runs.filter((run): run is PersistedRunState => Boolean(run))
}

export async function getActiveRunForSession(
  sessionKey: string,
): Promise<PersistedRunState | null> {
  try {
    const runs = await readRunsInDir(sessionDir(sessionKey))
    const now = Date.now()
    const candidates = runs
      .filter((run) => !['complete', 'error'].includes(run.status))
      .filter((run) => now - run.updatedAt < STALE_RUN_THRESHOLD_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return candidates[0] ?? null
  } catch {
    return null
  }
}

export type CardScopedActiveRun = PersistedRunState & {
  recoverySourceCanonicalSegmentKey?: string
}

export async function getActiveRunForCard(
  cardId: string,
  canonicalSegmentKey: string,
): Promise<CardScopedActiveRun | null> {
  const normalizedCardId = cardId.trim()
  const normalizedCanonicalSegmentKey = canonicalSegmentKey.trim()
  if (!normalizedCardId || !normalizedCanonicalSegmentKey) return null
  try {
    const entries = await readdir(RUNS_ROOT, { withFileTypes: true })
    const runsBySession = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readRunsInDir(path.join(RUNS_ROOT, entry.name))),
    )
    const now = Date.now()
    const candidates = runsBySession
      .flat()
      .filter(
        (run) =>
          run.runId.length > 0 &&
          run.runId.trim() === run.runId &&
          run.sessionKey.length > 0 &&
          run.sessionKey.trim() === run.sessionKey &&
          run.canonicalSegmentKey?.length &&
          run.canonicalSegmentKey.trim() === run.canonicalSegmentKey &&
          persistedRunMatchesOwner(run, {
            runId: run.runId,
            sessionKey: run.sessionKey,
            friendlyId: normalizedCardId,
            cardId: normalizedCardId,
            canonicalSegmentKey: run.canonicalSegmentKey,
          }),
      )
      .filter((run) => !['complete', 'error'].includes(run.status))
      .filter((run) => now - run.updatedAt < STALE_RUN_THRESHOLD_MS)
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt ||
          b.createdAt - a.createdAt ||
          a.runId.localeCompare(b.runId),
      )

    const currentCanonicalRun = candidates.find(
      (run) => run.canonicalSegmentKey === normalizedCanonicalSegmentKey,
    )
    if (currentCanonicalRun) return currentCanonicalRun

    // A failed migration deliberately rolls back the successor clone, leaving
    // the source as the sole durable owner. The Card projection can already
    // have advanced by the time the browser reloads, so expose that one
    // unambiguous owner through the requested canonical identity while keeping
    // its physical sessionKey intact for subsequent recovery operations.
    if (candidates.length !== 1) return null
    const recoveryRun = candidates[0]
    const recoverySourceCanonicalSegmentKey =
      recoveryRun?.canonicalSegmentKey?.trim()
    if (
      !recoveryRun ||
      !recoverySourceCanonicalSegmentKey ||
      recoverySourceCanonicalSegmentKey === normalizedCanonicalSegmentKey
    ) {
      return null
    }
    return {
      ...recoveryRun,
      canonicalSegmentKey: normalizedCanonicalSegmentKey,
      recoverySourceCanonicalSegmentKey,
    }
  } catch {
    return null
  }
}

// Lists every non-complete/error run across all sessions, regardless of
// staleness. Powers the "Background runs" panel so users can inspect and
// abandon orphans that the staleness filter hides from the chat UI.
export async function listAllActiveRuns(): Promise<Array<PersistedRunState>> {
  try {
    const entries = await readdir(RUNS_ROOT, { withFileTypes: true })
    const sessionDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(RUNS_ROOT, entry.name))
    const runsBySession = await Promise.all(sessionDirs.map(readRunsInDir))
    return runsBySession
      .flat()
      .filter((run) => !['complete', 'error'].includes(run.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}
