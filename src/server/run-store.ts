import {
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { getHermesRoot } from './claude-paths'

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

const RUNS_ROOT = path.join(getHermesRoot(), 'webui-mvp', 'runs')
const runUpdateQueues = new Map<string, Promise<void>>()

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey || 'main')
}

function sessionDir(sessionKey: string): string {
  return path.join(RUNS_ROOT, encodeSessionKey(sessionKey))
}

function runPath(sessionKey: string, runId: string): string {
  return path.join(sessionDir(sessionKey), `${runId}.json`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function writeRun(run: PersistedRunState): Promise<void> {
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
  sessionKey: string
  friendlyId?: string
  cardId?: string
  canonicalSegmentKey?: string
}): Promise<PersistedRunState> {
  const now = Date.now()
  const run: PersistedRunState = {
    runId: input.runId,
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
  await writeRun(run)
  return run
}

export async function getPersistedRun(
  sessionKey: string,
  runId: string,
): Promise<PersistedRunState | null> {
  try {
    const raw = await readFile(runPath(sessionKey, runId), 'utf8')
    return JSON.parse(raw) as PersistedRunState
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
  const normalizedRunId = runId.trim()
  if (!normalizedFrom || !normalizedTo || !normalizedRunId) return null
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

  return enqueueRunUpdate(normalizedFrom, normalizedRunId, async () => {
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
      friendlyId: isCardMigration ? normalizedFriendlyId : current.friendlyId,
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
      friendlyId: normalizedFriendlyId || current.friendlyId || normalizedTo,
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
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return migrated

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
  })
}

export async function updatePersistedRun(
  sessionKey: string,
  runId: string,
  updater: (run: PersistedRunState) => PersistedRunState,
): Promise<PersistedRunState | null> {
  return enqueueRunUpdate(sessionKey, runId, async () => {
    const current = await getPersistedRun(sessionKey, runId)
    if (!current) return null
    const next = updater(current)
    next.updatedAt = Date.now()
    await writeRun(next)
    return next
  })
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
    const nextToolCalls = [...run.toolCalls]
    const idx = nextToolCalls.findIndex((entry) => entry.id === toolCall.id)
    if (idx >= 0) nextToolCalls[idx] = { ...nextToolCalls[idx], ...toolCall }
    else nextToolCalls.push(toolCall)
    return {
      ...run,
      status: toolCall.phase === 'error' ? 'error' : 'active',
      lastEventAt: Date.now(),
      toolCalls: nextToolCalls,
      ...(toolCall.phase === 'error' && toolCall.result
        ? { errorMessage: toolCall.result }
        : {}),
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
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  if (files.length === 0) return []
  const runs = await Promise.all(
    files.map(async (name) => {
      try {
        const raw = await readFile(path.join(dir, name), 'utf8')
        return JSON.parse(raw) as PersistedRunState
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
