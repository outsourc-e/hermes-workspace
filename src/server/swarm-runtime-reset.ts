import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import { listSwarmWorkerIds } from './swarm-foundation'

export type SwarmRuntimeResetResult = {
  workerId: string
  ok: boolean
  error?: string
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
  const runtimePath = join(profilePath, 'runtime.json')
  let current: Record<string, unknown> = {}
  if (existsSync(runtimePath)) {
    try {
      current = JSON.parse(readFileSync(runtimePath, 'utf-8')) as Record<
        string,
        unknown
      >
    } catch {
      current = {}
    }
  }

  try {
    mkdirSync(profilePath, { recursive: true })
    const now = new Date().toISOString()
    const next = {
      ...current,
      workerId,
      state: 'idle',
      phase: 'cancelled',
      currentTask: null,
      currentMissionId: null,
      currentAssignmentId: null,
      checkpointStatus: 'none',
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
    }
    const tmp = `${runtimePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
    renameSync(tmp, runtimePath)
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

// ---------------------------------------------------------------------------
// Hard stop: tmux kill + zombie reaping + post-clear dispatch pause
// ---------------------------------------------------------------------------

function tmuxBin(): string {
  for (const c of [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
    join(homedir(), '.local', 'bin', 'tmux'),
  ]) {
    if (existsSync(c)) return c
  }
  return 'tmux'
}

/** Kill a worker's live tmux session. Best-effort, sync (fast). */
export function killWorkerTmuxSession(workerId: string): boolean {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)) return false
  try {
    execFileSync(tmuxBin(), ['kill-session', '-t', `swarm-${workerId}`], {
      stdio: 'ignore',
      timeout: 5000,
    })
    return true
  } catch {
    return false // no session — fine
  }
}

function hasWorkerTmuxSession(workerId: string): boolean {
  try {
    execFileSync(tmuxBin(), ['has-session', '-t', `swarm-${workerId}`], {
      stdio: 'ignore',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

const BUSY_STATES = new Set([
  'executing',
  'dispatching',
  'planning',
  'reviewing',
])

/**
 * Zombie reaper: a worker whose runtime says busy, whose tmux session is
 * gone, and who has produced no output for `staleMinutes` is not working —
 * its process died without a terminal checkpoint. Reset it to idle so the
 * board reflects reality and the queue can reuse the slot. Called by the
 * lifecycle sweep every 10 minutes.
 */
export function reapZombieSwarmRuntimes(staleMinutes = 30): Array<string> {
  const reaped: Array<string> = []
  const staleMs = staleMinutes * 60 * 1000
  for (const workerId of listResettableSwarmWorkerIds()) {
    try {
      const runtimePath = join(getProfilesDir(), workerId, 'runtime.json')
      if (!existsSync(runtimePath)) continue
      const runtime = JSON.parse(readFileSync(runtimePath, 'utf8')) as {
        state?: string
        lastOutputAt?: number
        lastDispatchAt?: number
      }
      if (!BUSY_STATES.has(runtime.state ?? 'idle')) continue
      const lastActivity =
        runtime.lastOutputAt ?? runtime.lastDispatchAt ?? 0
      if (Date.now() - lastActivity < staleMs) continue
      if (hasWorkerTmuxSession(workerId)) continue // genuinely running
      const result = resetSwarmWorkerRuntime(workerId, {
        actor: 'zombie-reaper',
        reason: `Busy state with no tmux session and no output for ${staleMinutes}+ min`,
      })
      if (result.ok) reaped.push(workerId)
    } catch {
      /* per-worker best-effort */
    }
  }
  return reaped
}

const DISPATCH_PAUSE_PATH = join(
  SWARM_CANONICAL_REPO,
  '.runtime',
  'dispatch-pause-until',
)

/**
 * Post-Clear-All dispatch pause. Automated dispatchers (queue drain,
 * scheduled missions) honor this so a freshly cleared board stays clear
 * instead of refilling seconds later. Manual dispatches are NOT paused.
 */
export function pauseAutomatedDispatch(minutes = 10): void {
  try {
    mkdirSync(join(SWARM_CANONICAL_REPO, '.runtime'), { recursive: true })
    writeFileSync(DISPATCH_PAUSE_PATH, String(Date.now() + minutes * 60_000))
  } catch {
    /* best-effort */
  }
}

export function automatedDispatchPausedUntil(): number | null {
  try {
    if (!existsSync(DISPATCH_PAUSE_PATH)) return null
    const until = Number(readFileSync(DISPATCH_PAUSE_PATH, 'utf8').trim())
    return Number.isFinite(until) && until > Date.now() ? until : null
  } catch {
    return null
  }
}
