import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

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
  hermesTaskId?: string | null
  repositoryPath?: string | null
  worktreePath?: string | null
  attemptId?: string | null
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
    | 'external'
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

export type SwarmMissionApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'

export type SwarmMissionApproval = {
  approvalId: string
  missionId: string
  actionId: string
  risk: string
  target: string
  parameters: Record<string, unknown>
  status: SwarmMissionApprovalStatus
  requestedBy: string
  decidedBy: string | null
  requestedAt: number
  expiresAt: number
  decidedAt: number | null
  reason: string | null
}

type SwarmMissionStore = {
  version: 1
  missions: Array<SwarmMission>
}

export const SWARM_MISSIONS_PATH = join(
  SWARM_CANONICAL_REPO,
  '.runtime',
  'swarm-missions.json',
)
export const SWARM_MISSIONS_DB_PATH = join(
  SWARM_CANONICAL_REPO,
  '.runtime',
  'swarm-missions.db',
)

function now(): number {
  return Date.now()
}

function shortId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function openLedger(): DatabaseSync {
  mkdirSync(dirname(SWARM_MISSIONS_DB_PATH), { recursive: true })
  const db = new DatabaseSync(SWARM_MISSIONS_DB_PATH)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS mission_snapshots (
      mission_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mission_events (
      event_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      occurred_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mission_events_mission_time
      ON mission_events (mission_id, occurred_at);
    CREATE TABLE IF NOT EXISTS mission_approvals (
      approval_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      risk TEXT NOT NULL,
      target TEXT NOT NULL,
      parameters TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      decided_by TEXT,
      requested_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      decided_at INTEGER,
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mission_approvals_mission
      ON mission_approvals (mission_id, status, expires_at);
  `)
  return db
}

function parseStorePayload(payload: unknown): SwarmMissionStore {
  if (!payload || typeof payload !== 'object')
    return { version: 1, missions: [] }
  const value = payload as Partial<SwarmMissionStore>
  return {
    version: 1,
    missions: Array.isArray(value.missions) ? value.missions : [],
  }
}

function readLegacyStore(): SwarmMissionStore {
  if (!existsSync(SWARM_MISSIONS_PATH)) return { version: 1, missions: [] }
  try {
    return parseStorePayload(
      JSON.parse(readFileSync(SWARM_MISSIONS_PATH, 'utf8')),
    )
  } catch {
    return { version: 1, missions: [] }
  }
}

function persistLedger(store: SwarmMissionStore): void {
  const db = openLedger()
  try {
    db.exec('BEGIN IMMEDIATE;')
    const snapshot = db.prepare(`
      INSERT INTO mission_snapshots (mission_id, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(mission_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `)
    const eventInsert = db.prepare(`
      INSERT OR IGNORE INTO mission_events (event_id, mission_id, event_type, payload, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const mission of store.missions) {
      snapshot.run(mission.id, JSON.stringify(mission), mission.updatedAt)
      for (const missionEvent of mission.events) {
        eventInsert.run(
          missionEvent.id,
          mission.id,
          missionEvent.type,
          JSON.stringify(missionEvent),
          missionEvent.at,
        )
      }
    }
    db.exec('COMMIT;')
  } catch (error) {
    try {
      db.exec('ROLLBACK;')
    } catch {
      /* best effort */
    }
    throw error
  } finally {
    db.close()
  }
}

function readStore(): SwarmMissionStore {
  const db = openLedger()
  try {
    const rows = db
      .prepare('SELECT payload FROM mission_snapshots ORDER BY updated_at DESC')
      .all() as Array<{ payload?: string }>
    if (rows.length > 0) {
      return {
        version: 1,
        missions: rows.flatMap((row) => {
          try {
            const mission = JSON.parse(row.payload ?? '') as SwarmMission
            return mission?.id ? [mission] : []
          } catch {
            return []
          }
        }),
      }
    }
  } finally {
    db.close()
  }

  const legacy = readLegacyStore()
  if (legacy.missions.length > 0) persistLedger(legacy)
  return legacy
}

function writeStore(store: SwarmMissionStore): void {
  persistLedger(store)
  // Transitional read-only compatibility projection for older Workspace views.
  mkdirSync(dirname(SWARM_MISSIONS_PATH), { recursive: true })
  const tmp = `${SWARM_MISSIONS_PATH}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n')
  renameSync(tmp, SWARM_MISSIONS_PATH)
}

function approvalFromRow(row: Record<string, unknown>): SwarmMissionApproval {
  let parameters: Record<string, unknown> = {}
  try {
    parameters = JSON.parse(String(row.parameters ?? '{}')) as Record<
      string,
      unknown
    >
  } catch {
    /* preserve empty parameters */
  }
  return {
    approvalId: String(row.approval_id),
    missionId: String(row.mission_id),
    actionId: String(row.action_id),
    risk: String(row.risk),
    target: String(row.target),
    parameters,
    status: String(row.status) as SwarmMissionApprovalStatus,
    requestedBy: String(row.requested_by),
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    requestedAt: Number(row.requested_at),
    expiresAt: Number(row.expires_at),
    decidedAt: row.decided_at ? Number(row.decided_at) : null,
    reason: row.reason ? String(row.reason) : null,
  }
}

export function createMissionApproval(input: {
  missionId: string
  actionId: string
  risk: string
  target: string
  parameters?: Record<string, unknown>
  requestedBy?: string
  expiresAt: number
}): SwarmMissionApproval {
  if (!getSwarmMission(input.missionId))
    throw new Error(`Mission not found: ${input.missionId}`)
  if (input.expiresAt <= Date.now())
    throw new Error('Approval expiry must be in the future')
  const approvalId = shortId('approval')
  const requestedAt = Date.now()
  const approval: SwarmMissionApproval = {
    approvalId,
    missionId: input.missionId,
    actionId: input.actionId,
    risk: input.risk,
    target: input.target,
    parameters: input.parameters ?? {},
    status: 'pending',
    requestedBy: input.requestedBy ?? 'workspace',
    decidedBy: null,
    requestedAt,
    expiresAt: input.expiresAt,
    decidedAt: null,
    reason: null,
  }
  const db = openLedger()
  try {
    db.prepare(
      `INSERT INTO mission_approvals
      (approval_id, mission_id, action_id, risk, target, parameters, status, requested_by, requested_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      approval.approvalId,
      approval.missionId,
      approval.actionId,
      approval.risk,
      approval.target,
      JSON.stringify(approval.parameters),
      approval.status,
      approval.requestedBy,
      approval.requestedAt,
      approval.expiresAt,
    )
  } finally {
    db.close()
  }
  return approval
}

export function listMissionApprovals(
  missionId?: string,
): Array<SwarmMissionApproval> {
  const db = openLedger()
  try {
    const nowMs = Date.now()
    db.prepare(
      `UPDATE mission_approvals SET status = 'expired', decided_at = ? WHERE status = 'pending' AND expires_at <= ?`,
    ).run(nowMs, nowMs)
    const rows = missionId
      ? db
          .prepare(
            'SELECT * FROM mission_approvals WHERE mission_id = ? ORDER BY requested_at DESC',
          )
          .all(missionId)
      : db
          .prepare('SELECT * FROM mission_approvals ORDER BY requested_at DESC')
          .all()
    return (rows as Array<Record<string, unknown>>).map(approvalFromRow)
  } finally {
    db.close()
  }
}

export function decideMissionApproval(input: {
  approvalId: string
  status: 'approved' | 'rejected'
  decidedBy: string
  reason?: string | null
}): SwarmMissionApproval | null {
  const db = openLedger()
  try {
    const nowMs = Date.now()
    const current = db
      .prepare('SELECT * FROM mission_approvals WHERE approval_id = ?')
      .get(input.approvalId) as Record<string, unknown> | undefined
    if (!current) return null
    if (
      String(current.status) !== 'pending' ||
      Number(current.expires_at) <= nowMs
    ) {
      if (String(current.status) === 'pending')
        db.prepare(
          "UPDATE mission_approvals SET status = 'expired', decided_at = ? WHERE approval_id = ?",
        ).run(nowMs, input.approvalId)
      return approvalFromRow({
        ...current,
        status:
          Number(current.expires_at) <= nowMs ? 'expired' : current.status,
        decided_at: nowMs,
      })
    }
    db.prepare(
      'UPDATE mission_approvals SET status = ?, decided_by = ?, decided_at = ?, reason = ? WHERE approval_id = ?',
    ).run(
      input.status,
      input.decidedBy,
      nowMs,
      input.reason ?? null,
      input.approvalId,
    )
    const updated = db
      .prepare('SELECT * FROM mission_approvals WHERE approval_id = ?')
      .get(input.approvalId) as Record<string, unknown>
    return approvalFromRow(updated)
  } finally {
    db.close()
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

function isTerminalAssignment(assignment: SwarmMissionAssignment): boolean {
  return TERMINAL_ASSIGNMENT_STATES.has(assignment.state)
}

function isArchiveTerminal(assignment: SwarmMissionAssignment): boolean {
  return (
    TERMINAL_ASSIGNMENT_STATES.has(assignment.state) ||
    (assignment.state === 'checkpointed' && !assignment.reviewRequired)
  )
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

export function archiveStaleMissions(staleMs: number = 6 * 60 * 60 * 1000): {
  archivedIds: Array<string>
  count: number
} {
  const store = readStore()
  const now = Date.now()
  const archivedIds: Array<string> = []
  for (const mission of store.missions) {
    if (mission.state !== 'executing' && mission.state !== 'planning') continue
    if (now - mission.updatedAt < staleMs) continue
    if (!mission.assignments.every(isArchiveTerminal)) continue
    mission.state = 'complete'
    mission.events.push(
      event(
        'continuation',
        `Archived as stale (>${Math.round(staleMs / 3600000)}h, all assignments terminal)`,
      ),
    )
    archivedIds.push(mission.id)
  }
  if (archivedIds.length) {
    writeStore(store)
  }
  return { archivedIds, count: archivedIds.length }
}

export type CreateOrUpdateMissionResult = SwarmMission & { _created?: boolean }

export function createOrUpdateMission(input: {
  missionId?: string | null
  title: string
  assignments: Array<{
    workerId: string
    task: string
    rationale?: string | null
    dependsOn?: Array<string>
    reviewRequired?: boolean
  }>
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
      events: [
        event('created', `Mission created: ${input.title || missionId}`),
      ],
    }
    store.missions.push(mission)
    createdMission = true
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
  writeStore(store)
  return Object.assign(mission, { _created: createdMission })
}

export function markMissionAssignmentDispatched(input: {
  missionId: string
  workerId: string
  task: string
  source?: string | null
  author?: string | null
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled' || mission.state === 'complete')
    return mission
  const assignment = mission.assignments.find(
    (item) => item.workerId === input.workerId && item.task === input.task,
  )
  if (!assignment) return null
  if (isTerminalAssignment(assignment)) return mission
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
  writeStore(store)
  return mission
}

export function recordMissionHermesTask(input: {
  missionId: string
  assignmentId: string
  hermesTaskId: string
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = mission.assignments.find(
    (item) => item.id === input.assignmentId,
  )
  if (!assignment) return null
  assignment.hermesTaskId = input.hermesTaskId
  mission.events.push(
    event(
      'assignment_dispatched',
      `Linked Hermes task ${input.hermesTaskId} to ${assignment.id}`,
      {
        workerId: assignment.workerId,
        assignmentId: assignment.id,
        data: { hermesTaskId: input.hermesTaskId, source: 'hermes-kanban' },
      },
    ),
  )
  mission.updatedAt = now()
  writeStore(store)
  return mission
}

export function recordMissionExternalEvent(input: {
  missionId: string
  eventType: string
  payload: Record<string, unknown>
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  mission.events.push(
    event('external', `Hermes event: ${input.eventType}`, {
      data: { eventType: input.eventType, ...input.payload },
    }),
  )
  mission.updatedAt = now()
  writeStore(store)
  return mission
}

export function recordMissionAttempt(input: {
  missionId: string
  assignmentId: string
  attemptId: string
  repositoryPath: string
  worktreePath: string
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  const assignment = mission?.assignments.find(
    (item) => item.id === input.assignmentId,
  )
  if (!mission || !assignment) return null
  assignment.attemptId = input.attemptId
  assignment.repositoryPath = input.repositoryPath
  assignment.worktreePath = input.worktreePath
  mission.events.push(
    event('assignment_dispatched', `Prepared worktree ${input.worktreePath}`, {
      workerId: assignment.workerId,
      assignmentId: assignment.id,
      data: {
        attemptId: input.attemptId,
        repositoryPath: input.repositoryPath,
        worktreePath: input.worktreePath,
        source: 'workspace-worktree',
      },
    }),
  )
  mission.updatedAt = now()
  writeStore(store)
  return mission
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
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled')
    return Object.assign(mission, { _ignoredReason: 'mission cancelled' })
  const assignment =
    (input.assignmentId
      ? mission.assignments.find((item) => item.id === input.assignmentId)
      : null) ??
    [...mission.assignments]
      .reverse()
      .find(
        (item) => item.workerId === input.workerId && item.state !== 'done',
      ) ??
    [...mission.assignments]
      .reverse()
      .find((item) => item.workerId === input.workerId)
  if (!assignment) return null
  if (assignment.state === 'cancelled')
    return Object.assign(mission, { _ignoredReason: 'assignment cancelled' })
  if (assignment.state === 'done')
    return Object.assign(mission, { _ignoredReason: 'assignment done' })
  if (assignment.checkpoint?.raw === input.checkpoint.raw) {
    return Object.assign(mission, { _completed: mission.state === 'complete' })
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
  const completed = mission.state === 'complete' && previousState !== 'complete'
  writeStore(store)
  return Object.assign(mission, { _completed: completed })
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
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  if (mission.state === 'cancelled' || mission.state === 'complete') return null
  const assignment =
    (input.assignmentId
      ? mission.assignments.find((item) => item.id === input.assignmentId)
      : null) ??
    [...mission.assignments]
      .reverse()
      .find(
        (item) =>
          item.workerId === input.workerId && !isTerminalAssignment(item),
      ) ??
    [...mission.assignments]
      .reverse()
      .find((item) => item.workerId === input.workerId)
  if (!assignment) return null
  if (assignment.state === 'cancelled' || assignment.state === 'done')
    return { mission, assignment, changed: false }

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
  writeStore(store)
  return { mission, assignment, changed }
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
  if (mission.state === 'cancelled') return null
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
  writeStore(store)
  return mission
}

export function appendSwarmMissionOrchestratorEvent(input: {
  missionId: string
  message: string
  data?: Record<string, unknown>
}): SwarmMission | null {
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  mission.events.push(event('continuation', input.message, {
    data: {
      source: 'langgraph-orchestrator',
      ...(input.data ?? {}),
    },
  }))
  mission.updatedAt = now()
  writeStore(store)
  return mission
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
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
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
  if (!assignment) return null
  if (assignment.state === 'cancelled')
    return { mission, assignment, changed: false }
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
  writeStore(store)
  return { mission, assignment, changed: true }
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
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
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
  writeStore(store)
  return {
    mission,
    cancelledAssignmentIds,
    changed: cancelledAssignmentIds.length > 0,
  }
}

export function markMissionAssignmentReviewed(input: {
  missionId?: string | null
  assignmentId: string
  reviewerId?: string
}): SwarmMission | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null
  const assignment = mission.assignments.find(
    (item) => item.id === input.assignmentId,
  )
  if (!assignment) return null
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
  writeStore(store)
  return mission
}

export function markMissionAssignmentsReviewedByWorker(input: {
  missionId?: string | null
  reviewerId: string
  excludeAssignmentId?: string | null
}): { mission: SwarmMission; reviewedAssignmentIds: Array<string> } | null {
  if (!input.missionId) return null
  const store = readStore()
  const mission = store.missions.find((item) => item.id === input.missionId)
  if (!mission) return null

  const reviewedAt = now()
  const reviewed = mission.assignments.filter(
    (assignment) =>
      assignment.id !== input.excludeAssignmentId &&
      assignment.workerId !== input.reviewerId &&
      assignment.reviewRequired &&
      assignment.state === 'checkpointed',
  )

  if (reviewed.length === 0) return { mission, reviewedAssignmentIds: [] }

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
  writeStore(store)
  return {
    mission,
    reviewedAssignmentIds: reviewed.map((assignment) => assignment.id),
  }
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
    .filter((event) => event.type === 'checkpoint' && event.data)
    .map((event) => event.data as SwarmCheckpointReport)
    .filter((report) => !input?.workerId || report.workerId === input.workerId)
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .slice(0, limit)
}
