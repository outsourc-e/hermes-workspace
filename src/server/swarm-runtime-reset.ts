import { randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { listSwarmWorkerIds } from './swarm-foundation'

export type SwarmRuntimeResetResult = {
  workerId: string
  ok: boolean
  error?: string
}

type RuntimeMutation<T> = {
  next: Record<string, unknown> | null
  value: T
  afterWrite?: () => void
}

const RUNTIME_LOCK_TIMEOUT_MS = 5_000

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeJsonAtomic(path: string, value: Record<string, unknown>): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tmp, path)
}

type RuntimeLockOwner = {
  token: string
  pid: number
  processIdentity?: string
}

type RuntimeLock = RuntimeLockOwner & {
  dev: bigint | number
  ino: bigint | number
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readProcessIdentity(pid: number): string | null {
  if (process.platform !== 'linux') return null
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ')
    const startTime = fields[19]
    return startTime && /^\d+$/u.test(startTime) ? `linux:${startTime}` : null
  } catch {
    return null
  }
}

function readRuntimeLockOwner(lockPath: string): RuntimeLockOwner | null {
  try {
    const owner = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<
      string,
      unknown
    >
    if (
      typeof owner.token !== 'string' ||
      !Number.isSafeInteger(owner.pid) ||
      Number(owner.pid) < 1 ||
      (owner.processIdentity !== undefined &&
        typeof owner.processIdentity !== 'string')
    ) {
      return null
    }
    return {
      token: owner.token,
      pid: Number(owner.pid),
      ...(typeof owner.processIdentity === 'string'
        ? { processIdentity: owner.processIdentity }
        : {}),
    }
  } catch {
    return null
  }
}

function runtimeLockIsRecoverable(owner: RuntimeLockOwner | null): boolean {
  // Malformed metadata is unknown authority. Atomic publication below means it
  // cannot be a legitimate half-written acquisition, so fail closed.
  if (!owner) return false
  if (!processIsAlive(owner.pid)) return true
  if (!owner.processIdentity) return false
  const currentIdentity = readProcessIdentity(owner.pid)
  return currentIdentity !== null && currentIdentity !== owner.processIdentity
}

function recoverDeadRuntimeLock(lockPath: string, ownerToken: string): void {
  const claimPath = `${lockPath}.reclaim.${process.pid}.${randomUUID()}`
  try {
    linkSync(lockPath, claimPath)
    const claimedOwner = readRuntimeLockOwner(claimPath)
    if (claimedOwner?.token !== ownerToken) return
    const claimedStat = lstatSync(claimPath)
    const currentStat = lstatSync(lockPath)
    if (
      claimedStat.dev === currentStat.dev &&
      claimedStat.ino === currentStat.ino
    ) {
      unlinkSync(lockPath)
    }
  } catch {
    // A competing recovery or successor publication won the race.
  } finally {
    try {
      unlinkSync(claimPath)
    } catch {}
  }
}

function acquireRuntimeLock(runtimePath: string): RuntimeLock {
  const lockPath = `${runtimePath}.lock`
  const token = randomUUID()
  const processIdentity = readProcessIdentity(process.pid)
  const owner: RuntimeLockOwner = {
    token,
    pid: process.pid,
    ...(processIdentity ? { processIdentity } : {}),
  }
  const candidatePath = `${lockPath}.owner.${process.pid}.${token}`
  const startedAt = Date.now()
  const sleeper = new Int32Array(new SharedArrayBuffer(4))
  let descriptor: number | null = null
  try {
    // The discoverable lock path is created only after the complete owner record
    // is durable. A creator crash can therefore leave only an undiscoverable
    // candidate, never an empty lock inode that wedges reset forever.
    descriptor = openSync(candidatePath, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null

    while (Date.now() - startedAt < RUNTIME_LOCK_TIMEOUT_MS) {
      try {
        linkSync(candidatePath, lockPath)
        const acquired = lstatSync(lockPath)
        return { ...owner, dev: acquired.dev, ino: acquired.ino }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const currentOwner = readRuntimeLockOwner(lockPath)
        if (runtimeLockIsRecoverable(currentOwner)) {
          recoverDeadRuntimeLock(lockPath, currentOwner!.token)
          continue
        }
        Atomics.wait(sleeper, 0, 0, 10)
      }
    }
    throw new Error(`Timed out acquiring worker runtime lock: ${runtimePath}`)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    try {
      unlinkSync(candidatePath)
    } catch {}
  }
}

function releaseRuntimeLock(runtimePath: string, lock: RuntimeLock): void {
  const lockPath = `${runtimePath}.lock`
  try {
    const owner = readRuntimeLockOwner(lockPath)
    const current = lstatSync(lockPath)
    if (
      owner?.token === lock.token &&
      current.dev === lock.dev &&
      current.ino === lock.ino
    ) {
      unlinkSync(lockPath)
    }
  } catch {
    // Never unlink a lock whose generation cannot be proven.
  }
}

/**
 * Serialize every worker runtime read/modify/write. `afterWrite` runs while the
 * same lock is held so reset cannot land between a checkpoint commit and its
 * durable side effects.
 */
export function mutateSwarmWorkerRuntime<T>(
  profilePath: string,
  mutate: (current: Record<string, unknown>) => RuntimeMutation<T>,
): T {
  mkdirSync(profilePath, { recursive: true })
  const runtimePath = join(profilePath, 'runtime.json')
  const lock = acquireRuntimeLock(runtimePath)
  try {
    const mutation = mutate(readJson(runtimePath))
    if (mutation.next) {
      writeJsonAtomic(runtimePath, mutation.next)
      mutation.afterWrite?.()
    }
    return mutation.value
  } finally {
    releaseRuntimeLock(runtimePath, lock)
  }
}

export function listResettableSwarmWorkerIds(): Array<string> {
  return listSwarmWorkerIds({ swarmOnly: true }).filter(
    (workerId) => workerId !== 'workspace',
  )
}

export function resolveResetTargetWorkerIds(workerIds?: Array<string> | null): {
  ok: boolean
  workerIds?: Array<string>
  error?: string
} {
  const available = new Set(listResettableSwarmWorkerIds())
  if (!workerIds || workerIds.length === 0) {
    return { ok: true, workerIds: Array.from(available).sort() }
  }

  const normalized = Array.from(
    new Set(
      workerIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  )

  if (normalized.length === 0) {
    return {
      ok: false,
      error: 'workerIds must include at least one non-empty worker id',
    }
  }

  const unknown = normalized.filter((workerId) => !available.has(workerId))
  if (unknown.length > 0) {
    return { ok: false, error: `unknown worker ids: ${unknown.join(', ')}` }
  }

  return { ok: true, workerIds: normalized }
}

export function resetSwarmWorkerRuntime(
  workerId: string,
  input: { actor: string; reason: string },
): SwarmRuntimeResetResult {
  const available = new Set(listResettableSwarmWorkerIds())
  if (!available.has(workerId)) {
    return { workerId, ok: false, error: 'unknown worker id' }
  }

  const profilePath = join(getProfilesDir(), workerId)
  try {
    const now = new Date().toISOString()
    mutateSwarmWorkerRuntime(profilePath, (current) => ({
      next: {
        ...current,
        workerId,
        state: 'idle',
        phase: 'cancelled',
        currentTask: null,
        currentMissionId: null,
        currentAssignmentId: null,
        checkpointStatus: 'none',
        acceptsCheckpoints: false,
        needsHuman: false,
        blockedReason: null,
        activeTool: null,
        checkpointRaw: null,
        orchestratorProcessedRaw: null,
        lastCheckIn: now,
        lastSummary: `Reset by ${input.actor}: ${input.reason}`,
        lastControlMessage: `Reset by ${input.actor}: ${input.reason}`,
        nextAction: 'Idle. Ready for the next Swarm or Conductor dispatch.',
        cancelledAt: now,
        cancellationReason: input.reason,
        cancelledBy: input.actor,
      },
      value: undefined,
    }))
    return { workerId, ok: true }
  } catch (error) {
    return {
      workerId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function resetSwarmWorkerRuntimes(
  workerIds: Array<string>,
  input: { actor: string; reason: string },
): Array<SwarmRuntimeResetResult> {
  return workerIds.map((workerId) => resetSwarmWorkerRuntime(workerId, input))
}
