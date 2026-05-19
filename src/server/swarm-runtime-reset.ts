import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { listSwarmWorkerIds } from './swarm-foundation'

export type SwarmRuntimeResetResult = {
  workerId: string
  ok: boolean
  error?: string
}

export function listResettableSwarmWorkerIds(): Array<string> {
  return listSwarmWorkerIds({ swarmOnly: true }).filter((workerId) => workerId !== 'workspace')
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
    return { ok: false, error: 'workerIds must include at least one non-empty worker id' }
  }

  const unknown = normalized.filter((workerId) => !available.has(workerId))
  if (unknown.length > 0) {
    return { ok: false, error: `unknown worker ids: ${unknown.join(', ')}` }
  }

  return { ok: true, workerIds: normalized }
}

export function resetSwarmWorkerRuntime(workerId: string, input: { actor: string; reason: string }): SwarmRuntimeResetResult {
  const available = new Set(listResettableSwarmWorkerIds())
  if (!available.has(workerId)) {
    return { workerId, ok: false, error: 'unknown worker id' }
  }

  const profilePath = join(getProfilesDir(), workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  let current: Record<string, unknown> = {}
  if (existsSync(runtimePath)) {
    try {
      current = JSON.parse(readFileSync(runtimePath, 'utf-8')) as Record<string, unknown>
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

export function resetSwarmWorkerRuntimes(workerIds: Array<string>, input: { actor: string; reason: string }): Array<SwarmRuntimeResetResult> {
  return workerIds.map((workerId) => resetSwarmWorkerRuntime(workerId, input))
}
