import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { newestCheckpointFromMessages, readRuntimeJson, type ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { readWorkerMessages } from './swarm-chat-reader'
import { getSwarmProfilePath } from './swarm-foundation'
import { appendSwarmMemoryEvent } from './swarm-memory'
import { recordMissionCheckpoint } from './swarm-missions'
import { publishSwarmCheckpointNotification } from './swarm-notifications'
import { buildHandoff, writeHandoff } from './handoff'

function runtimePatchFromCheckpoint(workerId: string, checkpoint: ParsedSwarmCheckpoint): Record<string, unknown> {
  return {
    workerId,
    state: checkpoint.runtimeState,
    phase: checkpoint.stateLabel.toLowerCase(),
    checkpointStatus: checkpoint.checkpointStatus,
    lastCheckIn: new Date().toISOString(),
    lastOutputAt: Date.now(),
    lastSummary: checkpoint.result,
    lastResult: checkpoint.result,
    lastRealSummary: checkpoint.result,
    lastRealResult: checkpoint.result,
    lastControlMessage: null,
    nextAction: checkpoint.nextAction,
    blockedReason: checkpoint.stateLabel === 'BLOCKED' || checkpoint.stateLabel === 'NEEDS_INPUT'
      ? checkpoint.blocker
      : null,
    needsHuman: checkpoint.stateLabel === 'NEEDS_INPUT',
    checkpointRaw: checkpoint.raw,
    orchestratorProcessedRaw: checkpoint.raw,
    checkpointFilesChanged: checkpoint.filesChanged,
    checkpointCommandsRun: checkpoint.commandsRun,
  }
}

function writeRuntimePatch(workerId: string, patch: Record<string, unknown>): string {
  const profilePath = getSwarmProfilePath(workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  mkdirSync(profilePath, { recursive: true })
  const current = readRuntimeJson(runtimePath)
  writeFileSync(runtimePath, JSON.stringify({ ...current, ...patch }, null, 2) + '\n')
  return runtimePath
}

function runtimeString(current: Record<string, unknown>, key: string): string | null {
  const value = current[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function recordHarvestedCheckpoint(
  workerId: string,
  checkpoint: ParsedSwarmCheckpoint,
  current: Record<string, unknown>,
  source: string,
): Promise<void> {
  const missionId = runtimeString(current, 'currentMissionId')
  const assignmentId = runtimeString(current, 'currentAssignmentId')
  const notifySessionKey = runtimeString(current, 'notifySessionKey')

  recordMissionCheckpoint({
    missionId,
    assignmentId,
    workerId,
    checkpoint,
    source,
  })

  appendSwarmMemoryEvent({
    workerId,
    missionId,
    assignmentId,
    type: checkpoint.checkpointStatus === 'blocked' ? 'blocked' : 'checkpoint',
    summary: checkpoint.result ?? checkpoint.blocker ?? checkpoint.nextAction ?? 'Worker checkpoint harvested',
    checkpoint,
    event: {
      state: checkpoint.stateLabel,
      filesChanged: checkpoint.filesChanged,
      commandsRun: checkpoint.commandsRun,
      nextAction: checkpoint.nextAction,
      source,
    },
  })

  try {
    const handoff = await buildHandoff(workerId, checkpoint, current)
    await writeHandoff(handoff)
  } catch (err) {
    console.error(`[harvest] handoff failed for ${workerId}:`, err)
  }

  publishSwarmCheckpointNotification({
    workerId,
    checkpoint,
    missionId,
    assignmentId,
    notifySessionKey,
  })
}

/** Harvest the newest parseable checkpoint from a worker's chat history into mission store. */
export async function harvestSwarmWorkerCheckpoint(
  workerId: string,
  source = 'swarm-dispatch-harvest',
): Promise<boolean> {
  const profilePath = join(getProfilesDir(), workerId)
  const runtimePath = join(profilePath, 'runtime.json')
  const current = readRuntimeJson(runtimePath)
  const chat = readWorkerMessages(profilePath, 50, typeof current.lastDispatchAt === 'number' ? current.lastDispatchAt : 0)
  if (!chat.ok) return false

  const checkpoint = newestCheckpointFromMessages(chat.messages)
  if (!checkpoint) return false
  if (current.orchestratorProcessedRaw === checkpoint.raw) return false

  writeRuntimePatch(workerId, runtimePatchFromCheckpoint(workerId, checkpoint))
  await recordHarvestedCheckpoint(workerId, checkpoint, current, source)
  return true
}

export async function harvestSwarmWorkers(
  workerIds: Array<string>,
  source = 'swarm-dispatch-harvest',
): Promise<number> {
  let harvested = 0
  for (const workerId of workerIds) {
    if (await harvestSwarmWorkerCheckpoint(workerId, source)) harvested += 1
  }
  return harvested
}
