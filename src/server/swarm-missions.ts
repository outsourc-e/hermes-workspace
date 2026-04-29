import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

export type SwarmMissionAssignmentState = 'queued' | 'dispatched' | 'checkpointed' | 'blocked' | 'needs_input' | 'reviewing' | 'done'
export type SwarmMissionState = 'planning' | 'dispatching' | 'executing' | 'reviewing' | 'blocked' | 'complete'

export type SwarmMissionAssignment = {
  id: string
  workerId: string
  task: string
  rationale: string | null
  dependsOn: Array<string>
  reviewRequired: boolean
  state: SwarmMissionAssignmentState
  dispatchedAt: number | null
  completedAt: number | null
  checkpoint: ParsedSwarmCheckpoint | null
}

export type SwarmMissionEvent = {
  id: string
  type: 'created' | 'assignment_dispatched' | 'checkpoint' | 'continuation' | 'review' | 'blocked'
  at: number
  workerId?: string
  assignmentId?: string
  message: string
}

export type SwarmMission = {
  id: string
  title: string
  state: SwarmMissionState
  createdAt: number
  updatedAt: number
  assignments: Array<SwarmMissionAssignment>
  events: Array<SwarmMissionEvent>
}

type SwarmMissionStore = {
  version: 1
  missions: Array<SwarmMission>
}

export const SWARM_MISSIONS_PATH = join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-missions.json')

function now(): number {
  return Date.now()
}

function shortId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readStore(): SwarmMissionStore {
  if (!existsSync(SWARM_MISSIONS_PATH)) return { version: 1, missions: [] }
  try {
    const parsed = JSON.parse(readFileSync(SWARM_MISSIONS_PATH, 'utf8')) as SwarmMissionStore
    return { version: 1, missions: Array.isArray(parsed.missions) ? parsed.missions : [] }
  } catch {
    return { version: 1, missions: [] }
  }
}

function writeStore(store: SwarmMissionStore): void {
  mkdirSync(dirname(SWARM_MISSIONS_PATH), { recursive: true })
  const tmp = `${SWARM_MISSIONS_PATH}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n')
  renameSync(tmp, SWARM_MISSIONS_PATH)
}

function event(type: SwarmMissionEvent['type'], message: string, extra?: Partial<SwarmMissionEvent>): SwarmMissionEvent {
  return { id: shortId('evt'), type, at: now(), message, ...extra }
}

function deriveMissionState(assignments: Array<SwarmMissionAssignment>): SwarmMissionState {
  if (assignments.some((item) => item.state === 'blocked' || item.state === 'needs_input')) return 'blocked'
  if (assignments.length > 0 && assignments.every((item) => item.state === 'done' || (item.state === 'checkpointed' && !item.reviewRequired))) return 'complete'
  if (assignments.some((item) => item.state === 'reviewing' || (item.state === 'checkpointed' && item.reviewRequired))) return 'reviewing'
  if (assignments.some((item) => item.state === 'dispatched' || item.state === 'checkpointed')) return 'executing'
  return 'planning'
}

export function listSwarmMissions(limit = 20): Array<SwarmMission> {
  return readStore().missions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(100, limit)))
}

export function getSwarmMission(missionId: string): SwarmMission | null {
  return readStore().missions.find((mission) => mission.id === missionId) ?? null
}

export type CreateOrUpdateMissionResult = SwarmMission & { _created?: boolean }

export function createOrUpdateMission(input: {
  missionId?: string | null
  title: string
  assignments: Array<{ workerId: string; task: string; rationale?: string | null; dependsOn?: Array<string>; reviewRequired?: boolean }>
}): CreateOrUpdateMissionResult {
  const store = readStore()
  const createdAt = now()
  const missionId = input.missionId?.trim() || shortId('mission')
  let mission = store.missions.find((item) => item.id === missionId)
  let createdMission = false
  if (!mission) {
    mission = {
      id: missionId,
      title: input.title || 'Untitled swarm mission',
      state: 'planning',
      createdAt,
      updatedAt: createdAt,
      assignments: [],
      events: [event('created', `Mission created: ${input.title || missionId}`)],
    }
    store.missions.push(mission)
    createdMission = true
  }

  mission.title = input.title || mission.title
  for (const assignment of input.assignments) {
    const existing = mission.assignments.find((item) => item.workerId === assignment.workerId && item.task === assignment.task)
    if (existing) continue
    const id = shortId('assign')
    mission.assignments.push({
      id,
      workerId: assignment.workerId,
      task: assignment.task,
      rationale: assignment.rationale ?? null,
      dependsOn: assignment.dependsOn ?? [],
      reviewRequired: assignment.reviewRequired ?? /code|patch|implement|pr|benchmark/i.test(`${assignment.task} ${assignment.rationale ?? ''}`),
      state: 'queued',
      dispatchedAt: null,
      completedAt: null,
      checkpoint: null,
    })
  }
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission.assignments)
  writeStore(store)
  return Object.assign(mission, { _created: createdMission })
}

export function markMissionAssignmentDispatched(input: {
  missionId: string
  workerId: string
  task: string
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = mission.assignments.find((item) => item.workerId === input.workerId && item.task === input.task)
  if (!assignment) return null
  assignment.state = 'dispatched'
  assignment.dispatchedAt = now()
  mission.events.push(event('assignment_dispatched', `Dispatched ${assignment.id} to ${input.workerId}`, { workerId: input.workerId, assignmentId: assignment.id }))
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission.assignments)
  writeStore(store)
  return mission
}

export type RecordCheckpointResult = (SwarmMission & { _completed?: boolean }) | null

export function recordMissionCheckpoint(input: {
  missionId?: string | null
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
}): RecordCheckpointResult {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = [...mission.assignments].reverse().find((item) => item.workerId === input.workerId && item.state !== 'done')
    ?? [...mission.assignments].reverse().find((item) => item.workerId === input.workerId)
  if (!assignment) return null
  assignment.checkpoint = input.checkpoint
  assignment.completedAt = now()
  assignment.state = input.checkpoint.stateLabel === 'BLOCKED'
    ? 'blocked'
    : input.checkpoint.stateLabel === 'NEEDS_INPUT'
      ? 'needs_input'
      : input.checkpoint.stateLabel === 'IN_PROGRESS'
        ? 'dispatched'
        : 'checkpointed'
  mission.events.push(event('checkpoint', `${input.workerId} checkpointed: ${input.checkpoint.stateLabel}`, { workerId: input.workerId, assignmentId: assignment.id }))
  mission.updatedAt = now()
  const previousState = mission.state
  mission.state = deriveMissionState(mission.assignments)
  const completed = mission.state === 'complete' && previousState !== 'complete'
  writeStore(store)
  return Object.assign(mission, { _completed: completed })
}

export function appendMissionContinuation(input: {
  missionId?: string | null
  workerId: string
  task: string
  rationale: string
}): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const id = shortId('assign')
  mission.assignments.push({
    id,
    workerId: input.workerId,
    task: input.task,
    rationale: input.rationale,
    state: 'queued',
    dispatchedAt: null,
    completedAt: null,
    checkpoint: null,
  })
  mission.events.push(event('continuation', `Queued continuation ${id} for ${input.workerId}`, { workerId: input.workerId, assignmentId: id }))
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission.assignments)
  writeStore(store)
  return mission
}


export function readyQueuedAssignments(missionId: string): Array<SwarmMissionAssignment> {
  const mission = getSwarmMission(missionId)
  if (!mission) return []
  const doneIds = new Set(mission.assignments.filter((item) => ['checkpointed', 'done'].includes(item.state)).map((item) => item.id))
  return mission.assignments.filter((item) => item.state === 'queued' && item.dependsOn.every((id) => doneIds.has(id)))
}

export function markMissionAssignmentReviewed(input: { missionId?: string | null; assignmentId: string; reviewerId?: string }): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = mission.assignments.find((item) => item.id === input.assignmentId)
  if (!assignment) return null
  assignment.state = 'done'
  mission.events.push(event('review', `Reviewed ${assignment.id}${input.reviewerId ? ` by ${input.reviewerId}` : ''}`, { workerId: input.reviewerId, assignmentId: assignment.id }))
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission.assignments)
  writeStore(store)
  return mission
}
