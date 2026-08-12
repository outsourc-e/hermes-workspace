import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { newestCheckpointFromMessages, parseSwarmCheckpoint, readRuntimeJson, type ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { readWorkerMessages } from './swarm-chat-reader'
import { buildHandoff, writeHandoff } from './handoff'
import { getSwarmProfilePath } from './swarm-foundation'
import { harvestSwarmWorkerCheckpoint } from './swarm-harvest'
import { getSwarmMission, recordMissionCheckpoint, type SwarmMission } from './swarm-missions'
import {
  checkpointFromRuntimeSnapshot,
  readRuntimeCheckpointSnapshot,
} from '../routes/api/swarm-dispatch'

const TERMINAL_CHECKPOINT_LABELS = new Set<ParsedSwarmCheckpoint['stateLabel']>([
  'DONE',
  'BLOCKED',
  'HANDOFF',
  'NEEDS_INPUT',
])

function parseCheckpointFromRuntimeText(value: unknown): ParsedSwarmCheckpoint | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const stripped = value.replace(/```/g, '')
  const parsed = parseSwarmCheckpoint(stripped)
  if (!parsed || parsed.stateLabel === 'IN_PROGRESS') return null
  return parsed
}

function assignmentNeedsSync(assignment: SwarmMission['assignments'][number]): boolean {
  if (assignment.state === 'done' || assignment.state === 'cancelled') return false
  if (assignment.state === 'checkpointed' && !assignment.reviewRequired) return false
  return true
}

function readRuntimeRecord(profilePath: string): Record<string, unknown> {
  const runtimePath = join(profilePath, 'runtime.json')
  return existsSync(runtimePath) ? readRuntimeJson(runtimePath) : {}
}

async function writeHandoffForCheckpoint(workerId: string, checkpoint: ParsedSwarmCheckpoint): Promise<void> {
  const profilePath = getSwarmProfilePath(workerId)
  const current = readRuntimeRecord(profilePath)
  const handoff = await buildHandoff(workerId, checkpoint, current)
  await writeHandoff(handoff)
}

function resolveTerminalCheckpoint(input: {
  profilePath: string
  dispatchedAt: number
  snapshot: ReturnType<typeof readRuntimeCheckpointSnapshot>
}): ParsedSwarmCheckpoint | null {
  // Prefer the runtime snapshot's checkpoint if it was produced after this
  // assignment was dispatched.
  const checkpoint = checkpointFromRuntimeSnapshot(input.snapshot)
  if (
    checkpoint &&
    TERMINAL_CHECKPOINT_LABELS.has(checkpoint.stateLabel) &&
    input.snapshot.checkpointTimestamp >= input.dispatchedAt
  ) {
    return checkpoint
  }

  const chat = readWorkerMessages(input.profilePath, 80, input.dispatchedAt)
  if (chat.ok) {
    const postDispatch = chat.messages.filter(
      (message) =>
        message.role === 'assistant' &&
        typeof message.timestamp === 'number' &&
        message.timestamp * 1000 >= input.dispatchedAt - 5_000,
    )
    const fromChat = newestCheckpointFromMessages(postDispatch)
    if (fromChat && TERMINAL_CHECKPOINT_LABELS.has(fromChat.stateLabel)) {
      return fromChat
    }
  }

  return null
}

/**
 * Pull fresh worker checkpoints into the mission store (harvest + runtime/chat scan).
 * Used by Router Chat polling and GET /api/swarm-missions?sync=1.
 */
export async function syncSwarmMissionCheckpoints(missionId: string): Promise<{
  mission: SwarmMission | null
  synced: number
}> {
  const initial = getSwarmMission(missionId)
  if (!initial) return { mission: null, synced: 0 }

  let synced = 0
  for (const assignment of initial.assignments) {
    if (!assignmentNeedsSync(assignment)) continue
    const workerId = assignment.workerId
    if (!workerId) continue

    if (await harvestSwarmWorkerCheckpoint(workerId, 'mission-sync')) {
      synced += 1
      continue
    }

    const profilePath = getSwarmProfilePath(workerId)
    const snapshot = readRuntimeCheckpointSnapshot(profilePath)
    const checkpoint = resolveTerminalCheckpoint({
      profilePath,
      dispatchedAt: assignment.dispatchedAt ?? 0,
      snapshot,
    })
    if (!checkpoint || assignment.checkpoint?.raw === checkpoint.raw) continue

    recordMissionCheckpoint({
      missionId,
      assignmentId: assignment.id,
      workerId,
      checkpoint,
      source: 'mission-sync',
    })
    void writeHandoffForCheckpoint(workerId, checkpoint).catch((error) => {
      console.error(`[mission-sync] handoff failed for ${workerId}:`, error)
    })
    synced += 1
  }

  return { mission: getSwarmMission(missionId), synced }
}

export function missionAssignmentsSettled(mission: SwarmMission | null): boolean {
  if (!mission) return true
  if (mission.state === 'complete' || mission.state === 'cancelled') return true
  return mission.assignments.every((assignment) => !assignmentNeedsSync(assignment))
}
