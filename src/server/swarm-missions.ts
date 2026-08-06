import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'
import type { SessionCardOperationBinding } from './session-card-operation-binding'

export type SwarmMissionAssignmentState =
  | 'queued'
  | 'dispatched'
  | 'checkpointed'
  | 'blocked'
  | 'needs_input'
  | 'reviewing'
  | 'done'
  | 'cancelled'
export type SwarmMissionState =
  | 'planning'
  | 'dispatching'
  | 'executing'
  | 'reviewing'
  | 'blocked'
  | 'complete'
  | 'cancelled'

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
  reviewedAt: number | null
  reviewedBy: string | null
  checkpoint: ParsedSwarmCheckpoint | null
}

export type SwarmMissionEvent = {
  id: string
  type:
    | 'created'
    | 'assignment_dispatched'
    | 'checkpoint'
    | 'continuation'
    | 'review'
    | 'blocked'
    | 'assignment_cancelled'
    | 'mission_cancelled'
  at: number
  workerId?: string
  assignmentId?: string
  message: string
  data?: Record<string, unknown>
}

export type SwarmCheckpointReport = {
  missionId: string
  assignmentId: string
  workerId: string
  recordedAt: number
  stateLabel: ParsedSwarmCheckpoint['stateLabel']
  checkpointStatus: ParsedSwarmCheckpoint['checkpointStatus']
  runtimeState: ParsedSwarmCheckpoint['runtimeState']
  filesChanged: string | null
  commandsRun: string | null
  result: string | null
  blocker: string | null
  nextAction: string | null
  source: string
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
  missionCardAuthorities: Array<SwarmMissionCardAuthority>
}

export type SwarmMissionCardAuthority = {
  missionId: string
  anchors: Array<{
    source: 'local' | 'remote'
    key: string
    binding: SessionCardOperationBinding
    boundAt: number
  }>
}

export const SWARM_MISSIONS_PATH = join(
  SWARM_CANONICAL_REPO,
  '.runtime',
  'swarm-missions.json',
)

const SWARM_MISSIONS_LOCK_PATH = `${SWARM_MISSIONS_PATH}.lock`
const SWARM_MISSIONS_LOCK_WAIT_MS = 5_000
const SWARM_MISSIONS_LOCK_POLL_MS = 10
const LOCK_SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4))

function now(): number {
  return Date.now()
}

function shortId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createSwarmMissionId(): string {
  return shortId('mission')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const STORED_MISSION_STATES = new Set<SwarmMissionState>([
  'planning',
  'dispatching',
  'executing',
  'reviewing',
  'blocked',
  'complete',
  'cancelled',
])
const STORED_ASSIGNMENT_STATES = new Set<SwarmMissionAssignmentState>([
  'queued',
  'dispatched',
  'checkpointed',
  'blocked',
  'needs_input',
  'reviewing',
  'done',
  'cancelled',
])
const STORED_EVENT_TYPES = new Set<SwarmMissionEvent['type']>([
  'created',
  'assignment_dispatched',
  'checkpoint',
  'continuation',
  'review',
  'blocked',
  'assignment_cancelled',
  'mission_cancelled',
])
const STORED_CHECKPOINT_LABELS = new Set<ParsedSwarmCheckpoint['stateLabel']>([
  'DONE',
  'BLOCKED',
  'NEEDS_INPUT',
  'HANDOFF',
  'IN_PROGRESS',
])
const STORED_RUNTIME_STATES = new Set<ParsedSwarmCheckpoint['runtimeState']>([
  'idle',
  'blocked',
  'waiting',
  'executing',
])
const STORED_CHECKPOINT_STATUSES = new Set<
  ParsedSwarmCheckpoint['checkpointStatus']
>(['done', 'blocked', 'needs_input', 'handoff', 'in_progress'])

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isStoredCheckpoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    STORED_CHECKPOINT_LABELS.has(
      value.stateLabel as ParsedSwarmCheckpoint['stateLabel'],
    ) &&
    STORED_RUNTIME_STATES.has(
      value.runtimeState as ParsedSwarmCheckpoint['runtimeState'],
    ) &&
    STORED_CHECKPOINT_STATUSES.has(
      value.checkpointStatus as ParsedSwarmCheckpoint['checkpointStatus'],
    ) &&
    isNullableString(value.filesChanged) &&
    isNullableString(value.commandsRun) &&
    isNullableString(value.result) &&
    isNullableString(value.blocker) &&
    isNullableString(value.nextAction) &&
    typeof value.raw === 'string'
  )
}

function isStoredEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    STORED_EVENT_TYPES.has(value.type as SwarmMissionEvent['type']) &&
    typeof value.at === 'number' &&
    Number.isFinite(value.at) &&
    typeof value.message === 'string' &&
    (value.workerId === undefined || typeof value.workerId === 'string') &&
    (value.assignmentId === undefined ||
      typeof value.assignmentId === 'string') &&
    (value.data === undefined || isRecord(value.data))
  )
}

function isNullableTimestamp(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isStoredCardBinding(value: unknown): boolean {
  if (!isRecord(value)) return false
  const source = value.canonicalSource
  const transport = value.canonicalTransport
  return (
    value.kind === 'session-card-owner' &&
    typeof value.cardId === 'string' &&
    value.cardId.length > 0 &&
    (value.parentCardId === null || typeof value.parentCardId === 'string') &&
    (source === 'local' || source === 'remote') &&
    typeof value.canonicalSegmentKey === 'string' &&
    value.canonicalSegmentKey.length > 0 &&
    ((source === 'local' && transport === 'tmux') ||
      (source === 'remote' && transport === 'gateway'))
  )
}

function isStoredAssignment(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.workerId === 'string' &&
    typeof value.task === 'string' &&
    (value.rationale === null || typeof value.rationale === 'string') &&
    Array.isArray(value.dependsOn) &&
    value.dependsOn.every((candidate) => typeof candidate === 'string') &&
    typeof value.reviewRequired === 'boolean' &&
    STORED_ASSIGNMENT_STATES.has(value.state as SwarmMissionAssignmentState) &&
    isNullableTimestamp(value.dispatchedAt) &&
    isNullableTimestamp(value.completedAt) &&
    isNullableTimestamp(value.reviewedAt) &&
    (value.reviewedBy === null || typeof value.reviewedBy === 'string') &&
    (value.checkpoint === null || isStoredCheckpoint(value.checkpoint))
  )
}

function validateStore(value: unknown): SwarmMissionStore {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.missions) ||
    (value.missionCardAuthorities !== undefined &&
      !Array.isArray(value.missionCardAuthorities))
  ) {
    throw new Error('Malformed swarm mission store')
  }
  const missionCardAuthorities = value.missionCardAuthorities ?? []
  const missionIds = new Set<string>()
  for (const mission of value.missions) {
    if (
      !isRecord(mission) ||
      typeof mission.id !== 'string' ||
      mission.id.length === 0 ||
      typeof mission.title !== 'string' ||
      !STORED_MISSION_STATES.has(mission.state as SwarmMissionState) ||
      typeof mission.createdAt !== 'number' ||
      !Number.isFinite(mission.createdAt) ||
      typeof mission.updatedAt !== 'number' ||
      !Number.isFinite(mission.updatedAt) ||
      !Array.isArray(mission.assignments) ||
      !mission.assignments.every(isStoredAssignment) ||
      !Array.isArray(mission.events) ||
      !mission.events.every(isStoredEvent)
    ) {
      throw new Error('Malformed swarm mission store mission')
    }
    if (missionIds.has(mission.id)) {
      throw new Error('Malformed swarm mission store duplicate mission')
    }
    missionIds.add(mission.id)
    const assignmentIds = new Set<string>()
    for (const assignment of mission.assignments) {
      const assignmentId = (assignment as SwarmMissionAssignment).id
      if (assignmentIds.has(assignmentId)) {
        throw new Error('Malformed swarm mission store duplicate assignment')
      }
      assignmentIds.add(assignmentId)
    }
  }
  const authorityMissionIds = new Set<string>()
  for (const authority of missionCardAuthorities) {
    if (
      !isRecord(authority) ||
      typeof authority.missionId !== 'string' ||
      authority.missionId.length === 0 ||
      !Array.isArray(authority.anchors) ||
      !authority.anchors.every(
        (anchor) =>
          isRecord(anchor) &&
          (anchor.source === 'local' || anchor.source === 'remote') &&
          typeof anchor.key === 'string' &&
          anchor.key.length > 0 &&
          typeof anchor.boundAt === 'number' &&
          Number.isFinite(anchor.boundAt) &&
          isStoredCardBinding(anchor.binding) &&
          (anchor.binding as SessionCardOperationBinding).canonicalSource ===
            anchor.source,
      )
    ) {
      throw new Error('Malformed swarm mission store authority')
    }
    if (authorityMissionIds.has(authority.missionId)) {
      throw new Error('Malformed swarm mission store duplicate authority')
    }
    authorityMissionIds.add(authority.missionId)
    const anchorKeys = new Set<string>()
    for (const anchor of authority.anchors) {
      const storedAnchor =
        anchor as SwarmMissionCardAuthority['anchors'][number]
      const anchorKey = `${storedAnchor.source}\u0000${storedAnchor.key}`
      if (anchorKeys.has(anchorKey)) {
        throw new Error('Malformed swarm mission store duplicate anchor')
      }
      anchorKeys.add(anchorKey)
    }
  }
  return {
    version: 1,
    missions: value.missions as Array<SwarmMission>,
    missionCardAuthorities:
      missionCardAuthorities as Array<SwarmMissionCardAuthority>,
  }
}

function readStore(): SwarmMissionStore {
  let raw: string
  try {
    raw = readFileSync(SWARM_MISSIONS_PATH, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, missions: [], missionCardAuthorities: [] }
    }
    throw error
  }
  return validateStore(JSON.parse(raw) as unknown)
}

function writeStore(store: SwarmMissionStore): void {
  const serialized =
    JSON.stringify(
      store,
      (key, value) => (key.startsWith('_') ? undefined : value),
      2,
    ) + '\n'
  mkdirSync(dirname(SWARM_MISSIONS_PATH), { recursive: true })
  const tmp = `${SWARM_MISSIONS_PATH}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  let descriptor: number | null = null
  try {
    descriptor = openSync(tmp, 'wx', 0o600)
    writeFileSync(descriptor, serialized, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    renameSync(tmp, SWARM_MISSIONS_PATH)
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor)
      } catch {
        // Preserve the commit error.
      }
    }
    try {
      rmSync(tmp, { force: true })
    } catch {
      // Preserve the commit failure; a best-effort temp cleanup must not mask it.
    }
    throw error
  }
}

type MissionStoreLockMetadata = {
  token: string
  pid: number
  processIdentity?: string
}
type MissionStoreLock = { release: () => void }

function readMissionStoreLockMetadata(): MissionStoreLockMetadata | null {
  try {
    const value = JSON.parse(
      readFileSync(SWARM_MISSIONS_LOCK_PATH, 'utf8'),
    ) as unknown
    if (
      !isRecord(value) ||
      typeof value.token !== 'string' ||
      !Number.isSafeInteger(value.pid) ||
      Number(value.pid) < 1 ||
      (value.processIdentity !== undefined &&
        typeof value.processIdentity !== 'string')
    ) {
      return null
    }
    return {
      token: value.token,
      pid: Number(value.pid),
      ...(typeof value.processIdentity === 'string'
        ? { processIdentity: value.processIdentity }
        : {}),
    }
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

function missionStoreLockIsRecoverable(
  metadata: MissionStoreLockMetadata | null,
): boolean {
  // A malformed owner is unknown authority. Atomic lock publication means it is
  // never a legitimate half-written acquisition, so fail closed instead of
  // evicting it by age and risking a paused writer's late publication.
  if (!metadata) return false
  if (!processIsAlive(metadata.pid)) return true
  if (!metadata.processIdentity) return false
  const currentIdentity = readProcessIdentity(metadata.pid)
  return (
    currentIdentity !== null && currentIdentity !== metadata.processIdentity
  )
}

function recoverAbandonedMissionStoreLock(): boolean {
  let observed: ReturnType<typeof lstatSync>
  let metadata: MissionStoreLockMetadata | null
  try {
    observed = lstatSync(SWARM_MISSIONS_LOCK_PATH)
    metadata = readMissionStoreLockMetadata()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
  if (!missionStoreLockIsRecoverable(metadata)) return false

  const claimPath = `${SWARM_MISSIONS_LOCK_PATH}.claim.${process.pid}.${randomBytes(8).toString('hex')}`
  try {
    linkSync(SWARM_MISSIONS_LOCK_PATH, claimPath)
    const current = lstatSync(SWARM_MISSIONS_LOCK_PATH)
    const claim = lstatSync(claimPath)
    if (
      current.dev === claim.dev &&
      current.ino === claim.ino &&
      observed.dev === claim.dev &&
      observed.ino === claim.ino
    ) {
      unlinkSync(SWARM_MISSIONS_LOCK_PATH)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  } finally {
    try {
      rmSync(claimPath, { force: true })
    } catch {
      // A failed claim cleanup cannot authorize deleting another lock instance.
    }
  }
}

function acquireMissionStoreLock(): MissionStoreLock {
  mkdirSync(dirname(SWARM_MISSIONS_PATH), { recursive: true })
  const token = randomBytes(16).toString('hex')
  const ownerIdentity = readProcessIdentity(process.pid)
  const metadata: MissionStoreLockMetadata = {
    token,
    pid: process.pid,
    ...(ownerIdentity ? { processIdentity: ownerIdentity } : {}),
  }
  const candidatePath = `${SWARM_MISSIONS_LOCK_PATH}.owner.${process.pid}.${token}`
  const startedAt = process.hrtime.bigint()
  let descriptor: number | null = null
  try {
    descriptor = openSync(candidatePath, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(metadata)}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null

    for (;;) {
      try {
        // Publish a fully-written owner record with a no-replace primitive.
        // Direct `open(..., 'wx')` exposes an empty inode before metadata lands.
        linkSync(candidatePath, SWARM_MISSIONS_LOCK_PATH)
        const acquired = lstatSync(SWARM_MISSIONS_LOCK_PATH)
        return {
          release: () => {
            try {
              const currentStat = lstatSync(SWARM_MISSIONS_LOCK_PATH)
              const current = readMissionStoreLockMetadata()
              if (
                current?.token === token &&
                currentStat.dev === acquired.dev &&
                currentStat.ino === acquired.ino
              ) {
                unlinkSync(SWARM_MISSIONS_LOCK_PATH)
              }
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error
            }
          },
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (recoverAbandonedMissionStoreLock()) continue
        const elapsedMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000
        if (elapsedMs >= SWARM_MISSIONS_LOCK_WAIT_MS) {
          throw new Error('Swarm mission store is busy')
        }
        Atomics.wait(LOCK_SLEEP_ARRAY, 0, 0, SWARM_MISSIONS_LOCK_POLL_MS)
      }
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    rmSync(candidatePath, { force: true })
  }
}

type StoreMutation<T> = { result: T; write: boolean }

function mutateStore<T>(
  mutation: (store: SwarmMissionStore) => StoreMutation<T>,
): T {
  const lock = acquireMissionStoreLock()
  try {
    const store = readStore()
    const outcome = mutation(store)
    if (outcome.write) writeStore(store)
    return outcome.result
  } finally {
    lock.release()
  }
}

function event(
  type: SwarmMissionEvent['type'],
  message: string,
  extra?: Partial<SwarmMissionEvent>,
): SwarmMissionEvent {
  return { id: shortId('evt'), type, at: now(), message, ...extra }
}

function reportFromCheckpoint(input: {
  missionId: string
  assignmentId: string
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  source?: string | null
}): SwarmCheckpointReport {
  return {
    missionId: input.missionId,
    assignmentId: input.assignmentId,
    workerId: input.workerId,
    recordedAt: now(),
    stateLabel: input.checkpoint.stateLabel,
    checkpointStatus: input.checkpoint.checkpointStatus,
    runtimeState: input.checkpoint.runtimeState,
    filesChanged: input.checkpoint.filesChanged,
    commandsRun: input.checkpoint.commandsRun,
    result: input.checkpoint.result,
    blocker: input.checkpoint.blocker,
    nextAction: input.checkpoint.nextAction,
    source: input.source?.trim() || 'unknown',
  }
}

function deriveMissionState(
  assignments: Array<SwarmMissionAssignment>,
): SwarmMissionState {
  if (
    assignments.length > 0 &&
    assignments.every((item) => item.state === 'cancelled')
  )
    return 'cancelled'
  if (
    assignments.some(
      (item) => item.state === 'blocked' || item.state === 'needs_input',
    )
  )
    return 'blocked'
  if (
    assignments.length > 0 &&
    assignments.every(
      (item) =>
        item.state === 'done' ||
        item.state === 'cancelled' ||
        (item.state === 'checkpointed' && !item.reviewRequired),
    )
  )
    return 'complete'
  if (
    assignments.some(
      (item) =>
        item.state === 'reviewing' ||
        (item.state === 'checkpointed' && item.reviewRequired),
    )
  )
    return 'reviewing'
  if (
    assignments.some(
      (item) => item.state === 'dispatched' || item.state === 'checkpointed',
    )
  )
    return 'executing'
  return 'planning'
}

function inferReviewRequired(task: string, rationale?: string | null): boolean {
  // Match intent-bearing task terms only. The previous loose alternation matched
  // substrings such as "patch" inside "dispatch" and left simple smoke runs in
  // review forever.
  return /\b(code|patch(?:es|ed|ing)?|implement(?:ation|ed|ing)?|pr|benchmarks?)\b/i.test(
    `${task} ${rationale ?? ''}`,
  )
}

const TERMINAL_ASSIGNMENT_STATES = new Set<SwarmMissionAssignmentState>([
  'done',
  'cancelled',
])
const DISPATCHABLE_ASSIGNMENT_STATES = new Set<SwarmMissionAssignmentState>([
  'queued',
  'blocked',
  'needs_input',
])

function isTerminalAssignment(assignment: SwarmMissionAssignment): boolean {
  return TERMINAL_ASSIGNMENT_STATES.has(assignment.state)
}

export function listSwarmMissions(limit = 20): Array<SwarmMission> {
  return readStore()
    .missions.sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(100, limit)))
}

export function getSwarmMission(missionId: string): SwarmMission | null {
  return (
    readStore().missions.find((mission) => mission.id === missionId) ?? null
  )
}

function sameCardOwner(
  left: SessionCardOperationBinding,
  right: SessionCardOperationBinding,
): boolean {
  return (
    left.cardId === right.cardId &&
    left.parentCardId === right.parentCardId &&
    left.canonicalSource === right.canonicalSource &&
    left.canonicalTransport === right.canonicalTransport
  )
}

function sameExactCardBinding(
  left: SessionCardOperationBinding,
  right: SessionCardOperationBinding,
): boolean {
  return (
    sameCardOwner(left, right) &&
    left.canonicalSegmentKey === right.canonicalSegmentKey
  )
}

function storeHasExactCardAuthority(
  store: SwarmMissionStore,
  missionId: string,
  binding: SessionCardOperationBinding,
): boolean {
  return Boolean(
    store.missionCardAuthorities
      .find((authority) => authority.missionId === missionId)
      ?.anchors.some((anchor) => sameExactCardBinding(anchor.binding, binding)),
  )
}

export type SwarmMissionCardAuthorityInput = {
  missionId: string
  anchorSource: 'local' | 'remote'
  anchorKey: string
  binding: SessionCardOperationBinding
}

function bindSwarmMissionCardAuthorityInStore(
  store: SwarmMissionStore,
  input: SwarmMissionCardAuthorityInput,
): { bound: boolean; changed: boolean } {
  const missionId = input.missionId.trim()
  const anchorKey = input.anchorKey.trim()
  if (
    !missionId ||
    !anchorKey ||
    input.binding.canonicalSource !== input.anchorSource
  ) {
    return { bound: false, changed: false }
  }

  let authority = store.missionCardAuthorities.find(
    (candidate) => candidate.missionId === missionId,
  )
  if (!authority) {
    authority = { missionId, anchors: [] }
    store.missionCardAuthorities.push(authority)
  }
  const existing = authority.anchors.find(
    (candidate) =>
      candidate.source === input.anchorSource && candidate.key === anchorKey,
  )
  if (existing && !sameCardOwner(existing.binding, input.binding)) {
    return { bound: false, changed: false }
  }
  if (existing && sameExactCardBinding(existing.binding, input.binding)) {
    return { bound: true, changed: false }
  }

  const boundAt = now()
  if (existing) {
    existing.binding = input.binding
    existing.boundAt = boundAt
  } else {
    authority.anchors.push({
      source: input.anchorSource,
      key: anchorKey,
      binding: input.binding,
      boundAt,
    })
  }
  return { bound: true, changed: true }
}

/**
 * Persist a server-resolved mission/Card association. An upstream anchor may
 * advance within the same durable Card, but it can never be reassigned to a
 * different Card owner. That makes a recycled worker/session alias fail closed.
 */
export function bindSwarmMissionCardAuthority(
  input: SwarmMissionCardAuthorityInput,
): boolean {
  return mutateStore((store) => {
    const outcome = bindSwarmMissionCardAuthorityInStore(store, input)
    return { result: outcome.bound, write: outcome.changed }
  })
}

export function getSwarmMissionCardAuthorityBindings(
  missionId: string,
): Array<SessionCardOperationBinding> {
  const authority = readStore().missionCardAuthorities.find(
    (candidate) => candidate.missionId === missionId,
  )
  if (!authority) return []
  const bindings: Array<SessionCardOperationBinding> = []
  for (const anchor of authority.anchors) {
    if (
      !bindings.some((candidate) =>
        sameExactCardBinding(candidate, anchor.binding),
      )
    ) {
      bindings.push(anchor.binding)
    }
  }
  return bindings
}

export function swarmMissionHasExactCardAuthority(
  missionId: string,
  binding: SessionCardOperationBinding,
): boolean {
  return getSwarmMissionCardAuthorityBindings(missionId).some((candidate) =>
    sameExactCardBinding(candidate, binding),
  )
}

export function swarmMissionAssignmentAcceptsRuntimeMutation(input: {
  missionId: string
  assignmentId: string
  workerId: string
  binding: SessionCardOperationBinding
}): boolean {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (
    !mission ||
    mission.state === 'cancelled' ||
    mission.state === 'complete' ||
    !storeHasExactCardAuthority(store, input.missionId, input.binding)
  ) {
    return false
  }
  const assignment = mission.assignments.find(
    (item) =>
      item.id === input.assignmentId && item.workerId === input.workerId,
  )
  return Boolean(assignment && !isTerminalAssignment(assignment))
}

export function archiveStaleMissions(staleMs: number = 6 * 60 * 60 * 1000): {
  archivedIds: Array<string>
  count: number
} {
  return mutateStore((store) => {
    const currentTime = Date.now()
    const archivedIds: Array<string> = []
    for (const mission of store.missions) {
      if (mission.state !== 'executing' && mission.state !== 'planning')
        continue
      if (currentTime - mission.updatedAt < staleMs) continue
      if (
        !mission.assignments.every((a) =>
          ['done', 'checkpointed', 'blocked', 'needs_input'].includes(a.state),
        )
      )
        continue
      mission.state = 'complete'
      mission.events.push(
        event(
          'continuation',
          `Archived as stale (>${Math.round(staleMs / 3600000)}h, all assignments terminal)`,
        ),
      )
      archivedIds.push(mission.id)
    }
    return {
      result: { archivedIds, count: archivedIds.length },
      write: archivedIds.length > 0,
    }
  })
}

export type CreateOrUpdateMissionResult = SwarmMission & { _created?: boolean }

type CreateOrUpdateMissionInput = {
  missionId?: string | null
  title: string
  assignments: Array<{
    workerId: string
    task: string
    rationale?: string | null
    dependsOn?: Array<string>
    reviewRequired?: boolean
  }>
}

function createOrUpdateMissionInStore(
  store: SwarmMissionStore,
  input: CreateOrUpdateMissionInput,
): { mission: SwarmMission; created: boolean } {
  const createdAt = now()
  const missionId = input.missionId?.trim() || createSwarmMissionId()
  let mission = store.missions.find((item) => item.id === missionId)
  let created = false
  if (!mission) {
    mission = {
      id: missionId,
      title: input.title || 'Untitled swarm mission',
      state: 'planning',
      createdAt,
      updatedAt: createdAt,
      assignments: [],
      events: [
        event('created', `Mission created: ${input.title || missionId}`),
      ],
    }
    store.missions.push(mission)
    created = true
  }

  mission.title = input.title || mission.title
  for (const assignment of input.assignments) {
    const existing = mission.assignments.find(
      (item) =>
        item.workerId === assignment.workerId && item.task === assignment.task,
    )
    if (existing) continue
    const id = shortId('assign')
    mission.assignments.push({
      id,
      workerId: assignment.workerId,
      task: assignment.task,
      rationale: assignment.rationale ?? null,
      dependsOn: assignment.dependsOn ?? [],
      reviewRequired:
        assignment.reviewRequired ??
        inferReviewRequired(assignment.task, assignment.rationale),
      state: 'queued',
      dispatchedAt: null,
      completedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      checkpoint: null,
    })
  }
  mission.updatedAt = now()
  mission.state = deriveMissionState(mission.assignments)
  return { mission, created }
}

export function createOrUpdateMission(
  input: CreateOrUpdateMissionInput,
): CreateOrUpdateMissionResult {
  return mutateStore((store) => {
    const result = createOrUpdateMissionInStore(store, input)
    return {
      result: Object.assign(result.mission, { _created: result.created }),
      write: true,
    }
  })
}

/**
 * Create a mission and its complete authority set in one durable store commit.
 * Validation happens against an in-memory snapshot first, so a rejected later
 * anchor or a failed store write cannot leave newly persisted partial bindings.
 */
export function createSwarmMissionWithCardAuthorities(
  input: CreateOrUpdateMissionInput & {
    missionId: string
    authorities: Array<Omit<SwarmMissionCardAuthorityInput, 'missionId'>>
  },
): CreateOrUpdateMissionResult | null {
  const missionId = input.missionId.trim()
  if (!missionId || input.authorities.length === 0) return null

  return mutateStore((store) => {
    if (
      store.missions.some((mission) => mission.id === missionId) ||
      store.missionCardAuthorities.some(
        (authority) => authority.missionId === missionId,
      )
    ) {
      return { result: null, write: false }
    }
    for (const authority of input.authorities) {
      if (
        !bindSwarmMissionCardAuthorityInStore(store, {
          ...authority,
          missionId,
        }).bound
      ) {
        return { result: null, write: false }
      }
    }

    const result = createOrUpdateMissionInStore(store, { ...input, missionId })
    if (!result.created) return { result: null, write: false }
    return {
      result: Object.assign(result.mission, { _created: true }),
      write: true,
    }
  })
}

export function markMissionAssignmentDispatched(input: {
  missionId: string
  assignmentId?: string | null
  workerId: string
  task: string
  binding?: SessionCardOperationBinding | null
  source?: string | null
  author?: string | null
}): SwarmMission | null {
  return mutateStore((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }
    if (mission.state === 'cancelled' || mission.state === 'complete') {
      return { result: null, write: false }
    }
    if (
      (input.assignmentId || input.binding) &&
      (!input.assignmentId ||
        !input.binding ||
        !storeHasExactCardAuthority(store, input.missionId, input.binding))
    ) {
      return { result: null, write: false }
    }
    const assignment = input.assignmentId
      ? mission.assignments.find(
          (item) =>
            item.id === input.assignmentId &&
            item.workerId === input.workerId &&
            item.task === input.task,
        )
      : mission.assignments.find(
          (item) =>
            item.workerId === input.workerId && item.task === input.task,
        )
    if (!assignment) return { result: null, write: false }
    if (!DISPATCHABLE_ASSIGNMENT_STATES.has(assignment.state)) {
      return { result: null, write: false }
    }
    assignment.state = 'dispatched'
    assignment.dispatchedAt = now()
    mission.events.push(
      event(
        'assignment_dispatched',
        `Dispatched ${assignment.id} to ${input.workerId}`,
        {
          workerId: input.workerId,
          assignmentId: assignment.id,
          data: {
            task: assignment.task,
            source: input.source?.trim() || 'swarm-dispatch',
            author: input.author?.trim() || 'aurora',
          },
        },
      ),
    )
    mission.updatedAt = now()
    mission.state = deriveMissionState(mission.assignments)
    return { result: mission, write: true }
  })
}

export type RecordCheckpointResult =
  | (SwarmMission & { _completed?: boolean; _ignoredReason?: string })
  | null

export function recordMissionCheckpoint(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId: string
  checkpoint: ParsedSwarmCheckpoint
  source?: string | null
}): RecordCheckpointResult {
  if (!input.missionId) return null
  return mutateStore<RecordCheckpointResult>((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }
    if (mission.state === 'cancelled') {
      return {
        result: Object.assign(mission, {
          _ignoredReason: 'mission cancelled',
        }),
        write: false,
      }
    }
    const assignment = input.assignmentId
      ? mission.assignments.find(
          (item) =>
            item.id === input.assignmentId && item.workerId === input.workerId,
        )
      : ([...mission.assignments]
          .reverse()
          .find(
            (item) => item.workerId === input.workerId && item.state !== 'done',
          ) ??
        [...mission.assignments]
          .reverse()
          .find((item) => item.workerId === input.workerId))
    if (!assignment) return { result: null, write: false }
    if (assignment.state === 'cancelled') {
      return {
        result: Object.assign(mission, {
          _ignoredReason: 'assignment cancelled',
        }),
        write: false,
      }
    }
    if (assignment.state === 'done') {
      return {
        result: Object.assign(mission, { _ignoredReason: 'assignment done' }),
        write: false,
      }
    }
    if (assignment.checkpoint?.raw === input.checkpoint.raw) {
      return {
        result: Object.assign(mission, {
          _completed: mission.state === 'complete',
        }),
        write: false,
      }
    }
    assignment.checkpoint = input.checkpoint
    assignment.completedAt = now()
    assignment.state =
      input.checkpoint.stateLabel === 'BLOCKED'
        ? 'blocked'
        : input.checkpoint.stateLabel === 'NEEDS_INPUT'
          ? 'needs_input'
          : input.checkpoint.stateLabel === 'IN_PROGRESS'
            ? 'dispatched'
            : 'checkpointed'
    const report = reportFromCheckpoint({
      missionId: mission.id,
      assignmentId: assignment.id,
      workerId: input.workerId,
      checkpoint: input.checkpoint,
      source: input.source,
    })
    mission.events.push(
      event(
        'checkpoint',
        `${input.workerId} checkpointed: ${input.checkpoint.stateLabel}`,
        {
          workerId: input.workerId,
          assignmentId: assignment.id,
          data: report,
        },
      ),
    )
    mission.updatedAt = now()
    const previousState = mission.state
    mission.state = deriveMissionState(mission.assignments)
    const completed =
      mission.state === 'complete' && previousState !== 'complete'
    return {
      result: Object.assign(mission, { _completed: completed }),
      write: true,
    }
  })
}

export function recordMissionAssignmentBlocked(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId: string
  reason?: string | null
  source?: string | null
}): {
  mission: SwarmMission
  assignment: SwarmMissionAssignment
  changed: boolean
} | null {
  if (!input.missionId) return null
  return mutateStore((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }
    if (mission.state === 'cancelled' || mission.state === 'complete') {
      return { result: null, write: false }
    }
    const assignment = input.assignmentId
      ? mission.assignments.find(
          (item) =>
            item.id === input.assignmentId && item.workerId === input.workerId,
        )
      : ([...mission.assignments]
          .reverse()
          .find(
            (item) =>
              item.workerId === input.workerId && !isTerminalAssignment(item),
          ) ??
        [...mission.assignments]
          .reverse()
          .find((item) => item.workerId === input.workerId))
    if (!assignment) return { result: null, write: false }
    if (assignment.state === 'cancelled' || assignment.state === 'done') {
      return {
        result: { mission, assignment, changed: false },
        write: false,
      }
    }

    const reason =
      input.reason?.trim() ||
      'Dispatch failed before a worker checkpoint was recorded.'
    const blockedAt = now()
    const checkpoint: ParsedSwarmCheckpoint = {
      stateLabel: 'BLOCKED',
      runtimeState: 'blocked',
      checkpointStatus: 'blocked',
      filesChanged: 'none',
      commandsRun: 'none',
      result: null,
      blocker: reason,
      nextAction: 'Fix blocker and retry dispatch.',
      raw: `STATE: BLOCKED\nFILES_CHANGED: none\nCOMMANDS_RUN: none\nRESULT: none\nBLOCKER: ${reason}\nNEXT_ACTION: Fix blocker and retry dispatch.`,
    }
    const changed =
      assignment.state !== 'blocked' ||
      assignment.checkpoint?.raw !== checkpoint.raw
    assignment.state = 'blocked'
    assignment.completedAt = blockedAt
    assignment.checkpoint = checkpoint
    const report = reportFromCheckpoint({
      missionId: mission.id,
      assignmentId: assignment.id,
      workerId: input.workerId,
      checkpoint,
      source: input.source,
    })
    if (changed) {
      mission.events.push(
        event('blocked', `${input.workerId} blocked: ${reason}`, {
          workerId: input.workerId,
          assignmentId: assignment.id,
          data: report,
        }),
      )
    }
    mission.updatedAt = blockedAt
    mission.state = deriveMissionState(mission.assignments)
    return { result: { mission, assignment, changed }, write: true }
  })
}

export function appendMissionContinuation(input: {
  missionId?: string | null
  workerId: string
  task: string
  rationale: string
}): SwarmMission | null {
  if (!input.missionId) return null
  return mutateStore<SwarmMission | null>((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission || mission.state === 'cancelled') {
      return { result: null, write: false }
    }
    const id = shortId('assign')
    mission.assignments.push({
      id,
      workerId: input.workerId,
      task: input.task,
      rationale: input.rationale,
      dependsOn: [],
      reviewRequired: false,
      state: 'queued',
      dispatchedAt: null,
      completedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      checkpoint: null,
    })
    mission.events.push(
      event('continuation', `Queued continuation ${id} for ${input.workerId}`, {
        workerId: input.workerId,
        assignmentId: id,
      }),
    )
    mission.updatedAt = now()
    mission.state = deriveMissionState(mission.assignments)
    return { result: mission, write: true }
  })
}

export function readyQueuedAssignments(
  missionId: string,
): Array<SwarmMissionAssignment> {
  const mission = getSwarmMission(missionId)
  if (!mission) return []
  const doneIds = new Set(
    mission.assignments
      .filter((item) => ['checkpointed', 'done'].includes(item.state))
      .map((item) => item.id),
  )
  return mission.assignments.filter(
    (item) =>
      item.state === 'queued' && item.dependsOn.every((id) => doneIds.has(id)),
  )
}

export function cancelSwarmAssignment(input: {
  missionId?: string | null
  assignmentId?: string | null
  workerId?: string | null
  actor?: string | null
  reason?: string | null
}): {
  mission: SwarmMission
  assignment: SwarmMissionAssignment
  changed: boolean
} | null {
  if (!input.missionId) return null
  return mutateStore<{
    mission: SwarmMission
    assignment: SwarmMissionAssignment
    changed: boolean
  } | null>((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }
    const assignment =
      (input.assignmentId
        ? mission.assignments.find((item) => item.id === input.assignmentId)
        : null) ??
      (input.workerId
        ? [...mission.assignments]
            .reverse()
            .find(
              (item) =>
                item.workerId === input.workerId && !isTerminalAssignment(item),
            )
        : null) ??
      null
    if (!assignment) return { result: null, write: false }
    if (assignment.state === 'cancelled') {
      return {
        result: { mission, assignment, changed: false },
        write: false,
      }
    }
    const cancelledAt = now()
    assignment.state = 'cancelled'
    assignment.completedAt = cancelledAt
    assignment.reviewedAt = cancelledAt
    assignment.reviewedBy = input.actor?.trim() || 'system-cancel'
    mission.events.push(
      event(
        'assignment_cancelled',
        `Cancelled ${assignment.id}${input.reason ? `: ${input.reason}` : ''}`,
        {
          workerId: assignment.workerId,
          assignmentId: assignment.id,
          data: {
            actor: input.actor?.trim() || 'system-cancel',
            reason: input.reason?.trim() || null,
          },
        },
      ),
    )
    mission.updatedAt = cancelledAt
    mission.state = deriveMissionState(mission.assignments)
    return { result: { mission, assignment, changed: true }, write: true }
  })
}

export function cancelSwarmMission(input: {
  missionId?: string | null
  actor?: string | null
  reason?: string | null
}): {
  mission: SwarmMission
  cancelledAssignmentIds: Array<string>
  changed: boolean
} | null {
  if (!input.missionId) return null
  return mutateStore<{
    mission: SwarmMission
    cancelledAssignmentIds: Array<string>
    changed: boolean
  } | null>((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }
    const cancelledAt = now()
    const cancelledAssignmentIds: Array<string> = []
    for (const assignment of mission.assignments) {
      if (isTerminalAssignment(assignment)) continue
      assignment.state = 'cancelled'
      assignment.completedAt = cancelledAt
      assignment.reviewedAt = cancelledAt
      assignment.reviewedBy = input.actor?.trim() || 'system-cancel'
      cancelledAssignmentIds.push(assignment.id)
    }
    mission.state = 'cancelled'
    mission.updatedAt = cancelledAt
    mission.events.push(
      event(
        'mission_cancelled',
        `Cancelled mission${input.reason ? `: ${input.reason}` : ''}`,
        {
          data: {
            actor: input.actor?.trim() || 'system-cancel',
            reason: input.reason?.trim() || null,
            cancelledAssignmentIds,
          },
        },
      ),
    )
    return {
      result: {
        mission,
        cancelledAssignmentIds,
        changed: cancelledAssignmentIds.length > 0,
      },
      write: true,
    }
  })
}

export function markMissionAssignmentReviewed(input: {
  missionId?: string | null
  assignmentId: string
  reviewerId?: string
}): SwarmMission | null {
  if (!input.missionId) return null
  return mutateStore<SwarmMission | null>((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }
    const assignment = mission.assignments.find(
      (item) => item.id === input.assignmentId,
    )
    if (!assignment) return { result: null, write: false }
    assignment.state = 'done'
    assignment.reviewedAt = now()
    assignment.reviewedBy = input.reviewerId ?? null
    mission.events.push(
      event(
        'review',
        `Reviewed ${assignment.id}${input.reviewerId ? ` by ${input.reviewerId}` : ''}`,
        { workerId: input.reviewerId, assignmentId: assignment.id },
      ),
    )
    mission.updatedAt = now()
    mission.state = deriveMissionState(mission.assignments)
    return { result: mission, write: true }
  })
}

export function markMissionAssignmentsReviewedByWorker(input: {
  missionId?: string | null
  reviewerId: string
  excludeAssignmentId?: string | null
}): { mission: SwarmMission; reviewedAssignmentIds: Array<string> } | null {
  if (!input.missionId) return null
  return mutateStore<{
    mission: SwarmMission
    reviewedAssignmentIds: Array<string>
  } | null>((store) => {
    const mission = store.missions.find((item) => item.id === input.missionId)
    if (!mission) return { result: null, write: false }

    const reviewedAt = now()
    const reviewed = mission.assignments.filter(
      (assignment) =>
        assignment.id !== input.excludeAssignmentId &&
        assignment.workerId !== input.reviewerId &&
        assignment.reviewRequired &&
        assignment.state === 'checkpointed',
    )

    if (reviewed.length === 0) {
      return {
        result: { mission, reviewedAssignmentIds: [] },
        write: false,
      }
    }

    for (const assignment of reviewed) {
      assignment.state = 'done'
      assignment.reviewedAt = reviewedAt
      assignment.reviewedBy = input.reviewerId
      mission.events.push(
        event('review', `Reviewed ${assignment.id} by ${input.reviewerId}`, {
          workerId: input.reviewerId,
          assignmentId: assignment.id,
        }),
      )
    }

    mission.updatedAt = reviewedAt
    mission.state = deriveMissionState(mission.assignments)
    return {
      result: {
        mission,
        reviewedAssignmentIds: reviewed.map((assignment) => assignment.id),
      },
      write: true,
    }
  })
}

export function listSwarmReports(input?: {
  missionId?: string | null
  workerId?: string | null
  limit?: number
}): Array<SwarmCheckpointReport> {
  const limit = Math.max(1, Math.min(500, input?.limit ?? 100))
  const mission = input?.missionId ? getSwarmMission(input.missionId) : null
  const missions = mission ? [mission] : readStore().missions

  return missions
    .flatMap((entry) => entry.events)
    .filter(
      (checkpointEvent) =>
        checkpointEvent.type === 'checkpoint' && checkpointEvent.data,
    )
    .map((checkpointEvent) => checkpointEvent.data as SwarmCheckpointReport)
    .filter((report) => !input?.workerId || report.workerId === input.workerId)
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .slice(0, limit)
}
