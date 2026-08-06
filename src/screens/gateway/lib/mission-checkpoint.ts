import type {
  SessionCardChildWire,
  SessionCardListWire,
} from '@/screens/chat/chat-queries'
import { retainCompleteSessionCardProjections } from '@/screens/chat/chat-queries'

export type MissionCheckpointTeamMember = {
  id: string
  name: string
  modelId: string
  roleDescription: string
  goal: string
  backstory: string
}

export type MissionCheckpointTaskStatus =
  | 'inbox'
  | 'assigned'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'completed'
  | 'blocked'
  | 'failed'

export type MissionCheckpointTask = {
  id: string
  title: string
  status: MissionCheckpointTaskStatus
  assignedTo?: string
}

export type MissionCheckpoint = {
  version: number
  id: string
  label: string
  name?: string
  goal: string
  processType: 'sequential' | 'parallel' | 'hierarchical'
  startedAt: number
  updatedAt: number
  completedAt?: number
  status: 'running' | 'paused' | 'completed' | 'aborted'
  team: Array<MissionCheckpointTeamMember>
  tasks: Array<MissionCheckpointTask>
  agentCardIdMap: Record<string, string>
  agentParentCardIdMap: Record<string, string>
  agentCardTitleMap: Record<string, string>
  agentCardModelMap: Record<string, string>
  budgetLimit?: string
  /** Runtime reports are deliberately never serialized with checkpoints. */
  report?: string
}

export const MISSION_CHECKPOINT_VERSION = 3
const CHECKPOINT_KEY = 'clawsuite:mission-checkpoint'
const HISTORY_KEY = 'clawsuite:mission-history'
const MAX_HISTORY = 20
const RETIRED_CHECKPOINT_FIELDS = new Set([
  'agentSessionMap',
  'agentSessions',
  'agentSessionModelMap',
  'agentSessionStatus',
  'workerKey',
  'workerKeys',
  'workerLabels',
  'workerOutputs',
  'sessionKey',
  'canonicalSegmentKey',
  'report',
  'artifacts',
  'agentCardStatus',
])
const TASK_STATUSES = new Set<MissionCheckpointTaskStatus>([
  'inbox',
  'assigned',
  'in_progress',
  'review',
  'done',
  'completed',
  'blocked',
  'failed',
])
const MISSION_STATUSES = new Set<MissionCheckpoint['status']>([
  'running',
  'paused',
  'completed',
  'aborted',
])
const PROCESS_TYPES = new Set<MissionCheckpoint['processType']>([
  'sequential',
  'parallel',
  'hierarchical',
])

function removeStorageItem(key: string): void {
  try {
    globalThis.localStorage.removeItem(key)
  } catch {}
}

function containsRetiredCheckpointField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRetiredCheckpointField)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => RETIRED_CHECKPOINT_FIELDS.has(key))) {
    return true
  }
  return Object.values(record).some(containsRetiredCheckpointField)
}

function isCardId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('local:') || value.startsWith('remote:')) &&
    value.length > 'remote:'.length
  )
}

function parseCardIdMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result: Record<string, string> = {}
  for (const [agentId, cardId] of Object.entries(value)) {
    if (!agentId.trim() || !isCardId(cardId)) return null
    result[agentId] = cardId
  }
  return result
}

function parseStringMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!key.trim() || typeof entry !== 'string' || !entry.trim()) return null
    result[key] = entry.trim()
  }
  return result
}

function parseTeamMember(value: unknown): MissionCheckpointTeamMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const member = value as Record<string, unknown>
  const required = [
    'id',
    'name',
    'modelId',
    'roleDescription',
    'goal',
    'backstory',
  ] as const
  if (
    required.some((key) => typeof member[key] !== 'string') ||
    !(member.id as string).trim() ||
    !(member.name as string).trim()
  ) {
    return null
  }
  return {
    id: member.id as string,
    name: member.name as string,
    modelId: member.modelId as string,
    roleDescription: member.roleDescription as string,
    goal: member.goal as string,
    backstory: member.backstory as string,
  }
}

function parseTask(value: unknown): MissionCheckpointTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const task = value as Record<string, unknown>
  if (
    typeof task.id !== 'string' ||
    !task.id.trim() ||
    typeof task.title !== 'string' ||
    !TASK_STATUSES.has(task.status as MissionCheckpointTaskStatus) ||
    (task.assignedTo !== undefined && typeof task.assignedTo !== 'string')
  ) {
    return null
  }
  return {
    id: task.id,
    title: task.title,
    status: task.status as MissionCheckpointTaskStatus,
    ...(typeof task.assignedTo === 'string'
      ? { assignedTo: task.assignedTo }
      : {}),
  }
}

export function parseMissionCheckpoint(
  value: unknown,
): MissionCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (containsRetiredCheckpointField(value)) return null
  const checkpoint = value as Record<string, unknown>
  if (
    checkpoint.version !== MISSION_CHECKPOINT_VERSION ||
    typeof checkpoint.id !== 'string' ||
    !checkpoint.id.trim() ||
    typeof checkpoint.label !== 'string' ||
    !checkpoint.label.trim() ||
    typeof checkpoint.goal !== 'string' ||
    !PROCESS_TYPES.has(
      checkpoint.processType as MissionCheckpoint['processType'],
    ) ||
    typeof checkpoint.startedAt !== 'number' ||
    !Number.isFinite(checkpoint.startedAt) ||
    typeof checkpoint.updatedAt !== 'number' ||
    !Number.isFinite(checkpoint.updatedAt) ||
    (checkpoint.completedAt !== undefined &&
      (typeof checkpoint.completedAt !== 'number' ||
        !Number.isFinite(checkpoint.completedAt))) ||
    !MISSION_STATUSES.has(checkpoint.status as MissionCheckpoint['status']) ||
    !Array.isArray(checkpoint.team) ||
    !Array.isArray(checkpoint.tasks) ||
    (checkpoint.name !== undefined && typeof checkpoint.name !== 'string') ||
    (checkpoint.budgetLimit !== undefined &&
      typeof checkpoint.budgetLimit !== 'string')
  ) {
    return null
  }

  const team = checkpoint.team.map(parseTeamMember)
  const tasks = checkpoint.tasks.map(parseTask)
  if (
    team.some((entry) => entry === null) ||
    tasks.some((entry) => entry === null)
  ) {
    return null
  }
  const teamIds = new Set(
    (team as Array<MissionCheckpointTeamMember>).map((member) => member.id),
  )
  if (teamIds.size !== team.length) return null

  const agentCardIdMap = parseCardIdMap(checkpoint.agentCardIdMap)
  const agentParentCardIdMap = parseCardIdMap(checkpoint.agentParentCardIdMap)
  const agentCardTitleMap = parseStringMap(checkpoint.agentCardTitleMap)
  const agentCardModelMap = parseStringMap(checkpoint.agentCardModelMap)
  if (
    !agentCardIdMap ||
    !agentParentCardIdMap ||
    !agentCardTitleMap ||
    !agentCardModelMap
  ) {
    return null
  }
  const ownerKeys = new Set(Object.keys(agentCardIdMap))
  if (
    [...ownerKeys].some((agentId) => !teamIds.has(agentId)) ||
    [agentParentCardIdMap, agentCardTitleMap, agentCardModelMap].some((map) =>
      Object.keys(map).some((agentId) => !ownerKeys.has(agentId)),
    ) ||
    Object.entries(agentParentCardIdMap).some(
      ([agentId, parentCardId]) => parentCardId === agentCardIdMap[agentId],
    )
  ) {
    return null
  }

  return {
    version: MISSION_CHECKPOINT_VERSION,
    id: checkpoint.id,
    label: checkpoint.label,
    ...(typeof checkpoint.name === 'string' ? { name: checkpoint.name } : {}),
    goal: checkpoint.goal,
    processType: checkpoint.processType as MissionCheckpoint['processType'],
    startedAt: checkpoint.startedAt,
    updatedAt: checkpoint.updatedAt,
    ...(typeof checkpoint.completedAt === 'number'
      ? { completedAt: checkpoint.completedAt }
      : {}),
    status: checkpoint.status as MissionCheckpoint['status'],
    team: team as Array<MissionCheckpointTeamMember>,
    tasks: tasks as Array<MissionCheckpointTask>,
    agentCardIdMap,
    agentParentCardIdMap,
    agentCardTitleMap,
    agentCardModelMap,
    ...(typeof checkpoint.budgetLimit === 'string'
      ? { budgetLimit: checkpoint.budgetLimit }
      : {}),
  }
}

function toPersistableCheckpoint(
  checkpoint: MissionCheckpoint,
  cardProjection?: SessionCardListWire,
): MissionCheckpoint | null {
  const { report: _runtimeReport, ...withoutRuntimeReport } = checkpoint
  const parsed = parseMissionCheckpoint({
    ...withoutRuntimeReport,
    version: MISSION_CHECKPOINT_VERSION,
  })
  if (!parsed) return null
  if (Object.keys(parsed.agentCardIdMap).length === 0) return parsed
  return cardProjection
    ? validateMissionCheckpointCardOwnership(parsed, cardProjection)
    : null
}

type ProjectedCheckpointCardOwner = {
  cardId: string
  parentCardId?: string
  title: string
}

function collectProjectedChildOwners(
  children: ReadonlyArray<SessionCardChildWire>,
  parentCardId: string,
  owners: Map<string, ProjectedCheckpointCardOwner>,
): void {
  for (const child of children) {
    owners.set(child.cardId, {
      cardId: child.cardId,
      parentCardId,
      title: child.title,
    })
    collectProjectedChildOwners(child.childNodes ?? [], child.cardId, owners)
  }
}

/**
 * Converts structurally valid persisted ownership into trusted Card ownership.
 * Source-qualified strings are not Card IDs merely because they look like one:
 * every owner must match an exact complete projected Card and exact parent.
 */
export function validateMissionCheckpointCardOwnership(
  checkpoint: MissionCheckpoint,
  response: SessionCardListWire | undefined,
): MissionCheckpoint | null {
  const projection = retainCompleteSessionCardProjections(response)
  if (!projection) return null

  const owners = new Map<string, ProjectedCheckpointCardOwner>()
  for (const card of projection.cards) {
    owners.set(card.cardId, {
      cardId: card.cardId,
      title: card.title,
    })
    collectProjectedChildOwners(card.childNodes, card.cardId, owners)
  }

  const agentCardTitleMap = { ...checkpoint.agentCardTitleMap }
  for (const [agentId, cardId] of Object.entries(checkpoint.agentCardIdMap)) {
    const owner = owners.get(cardId)
    const persistedParent = checkpoint.agentParentCardIdMap[agentId]
    if (!owner || owner.parentCardId !== persistedParent) return null
    agentCardTitleMap[agentId] = owner.title
  }

  return {
    ...checkpoint,
    agentCardIdMap: { ...checkpoint.agentCardIdMap },
    agentParentCardIdMap: { ...checkpoint.agentParentCardIdMap },
    agentCardTitleMap,
    agentCardModelMap: { ...checkpoint.agentCardModelMap },
  }
}

export function saveMissionCheckpoint(
  checkpoint: MissionCheckpoint,
  cardProjection?: SessionCardListWire,
): void {
  const safe = toPersistableCheckpoint(checkpoint, cardProjection)
  if (!safe) {
    removeStorageItem(CHECKPOINT_KEY)
    return
  }
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(safe))
  } catch {
    // Ignore storage failures; the in-memory mission continues to run.
  }
}

export function loadMissionCheckpoint(
  cardProjection?: SessionCardListWire,
): MissionCheckpoint | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY)
    if (!raw) return null
    const parsed = parseMissionCheckpoint(JSON.parse(raw))
    const safe =
      parsed && Object.keys(parsed.agentCardIdMap).length === 0
        ? parsed
        : parsed && cardProjection
          ? validateMissionCheckpointCardOwnership(parsed, cardProjection)
          : null
    removeStorageItem(CHECKPOINT_KEY)
    return safe
  } catch {
    removeStorageItem(CHECKPOINT_KEY)
    return null
  }
}

export function clearMissionCheckpoint(): void {
  removeStorageItem(CHECKPOINT_KEY)
}

export function archiveMissionToHistory(
  checkpoint: MissionCheckpoint,
  cardProjection?: SessionCardListWire,
): void {
  const safe = toPersistableCheckpoint(checkpoint, cardProjection)
  if (!safe) return
  const history = loadMissionHistory().filter((entry) => entry.id !== safe.id)
  history.unshift(safe)
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY)),
    )
  } catch {
    // Ignore storage failures.
  }
}

export function loadMissionHistory(): Array<MissionCheckpoint> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      removeStorageItem(HISTORY_KEY)
      return []
    }
    const checkpoints = parsed
      .map(parseMissionCheckpoint)
      .filter((entry): entry is MissionCheckpoint => Boolean(entry))
      .slice(0, MAX_HISTORY)
    if (checkpoints.length !== parsed.length) {
      if (checkpoints.length === 0) removeStorageItem(HISTORY_KEY)
      else localStorage.setItem(HISTORY_KEY, JSON.stringify(checkpoints))
    }
    return checkpoints
  } catch {
    removeStorageItem(HISTORY_KEY)
    return []
  }
}
