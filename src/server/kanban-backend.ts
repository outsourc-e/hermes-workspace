import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getClaudeRoot, getWorkspaceClaudeHome } from './claude-paths'
import {
  SWARM_KANBAN_FILE,
  type CreateSwarmKanbanCardInput,
  createSwarmKanbanCard,
  listSwarmKanbanCards,
  type SwarmKanbanCard,
  updateSwarmKanbanCard,
  type UpdateSwarmKanbanCardInput,
} from './swarm-kanban-store'
import { CLAUDE_DASHBOARD_URL, getCapabilities } from './gateway-capabilities'
import {
  fetchDashboardKanbanBoard,
  createDashboardKanbanTask,
  updateDashboardKanbanTask,
  type DashboardKanbanTask,
} from './kanban-dashboard-proxy'

export type KanbanBackendId = 'local' | 'claude' | 'hermes-proxy'

export type KanbanBackendMeta = {
  id: KanbanBackendId
  label: string
  detected: boolean
  writable: boolean
  details?: string | null
  path?: string | null
}

type KanbanBackend = {
  meta(): KanbanBackendMeta
  list(): SwarmKanbanCard[] | Promise<SwarmKanbanCard[]>
  create(input: CreateSwarmKanbanCardInput): SwarmKanbanCard | Promise<SwarmKanbanCard>
  update(
    cardId: string,
    updates: UpdateSwarmKanbanCardInput,
  ): SwarmKanbanCard | null | Promise<SwarmKanbanCard | null>
}

// Map upstream Hermes kanban statuses (triage/todo/ready/running/done/blocked
// and any custom user statuses) into our internal lane vocabulary. Mirrors
// mapClaudeStatus() but kept separate because the dashboard plugin sometimes
// returns slightly different status strings than direct SQL access.
function mapDashboardStatusToLane(
  status: string | null | undefined,
): SwarmKanbanCard['status'] {
  switch ((status ?? '').toLowerCase()) {
    case 'triage':
      return 'backlog'
    case 'todo':
      return 'todo'
    case 'queued':
      return 'backlog'
    case 'ready':
      return 'ready'
    case 'running':
    case 'claimed':
    case 'in_progress':
      return 'running'
    case 'review':
      return 'review'
    case 'blocked':
      return 'blocked'
    case 'done':
    case 'complete':
    case 'completed':
      return 'done'
    default:
      return 'backlog'
  }
}

function mapLaneToDashboardStatus(lane: SwarmKanbanCard['status']): string {
  switch (lane) {
    case 'backlog':
      return 'todo'
    case 'ready':
      return 'ready'
    case 'running':
      // The Hermes dashboard rejects direct writes of 'running' — only the
      // dispatcher's claim path may move a task into 'running'. Treat a
      // user dragging a card to the running lane as 'mark it ready, let
      // the dispatcher pick it up'. The card will flip to running on the
      // next dispatcher tick (default 60s).
      return 'ready'
    case 'review':
      // 'review' isn't a first-class Hermes status; map to 'ready' so the
      // task remains visible on the board until a worker is assigned.
      return 'ready'
    case 'blocked':
      return 'blocked'
    case 'done':
      return 'done'
    default:
      return 'todo'
  }
}

function dashboardTaskToCard(task: DashboardKanbanTask): SwarmKanbanCard {
  const createdAt = normalizeTimestamp(task.created_at)
  const updatedAt = normalizeTimestamp(
    task.started_at ?? task.completed_at ?? task.created_at,
  )
  return {
    id: task.id,
    title: task.title,
    spec: task.body ?? '',
    acceptanceCriteria: [],
    assignedWorker: task.assignee ?? null,
    reviewer: null,
    status: mapDashboardStatusToLane(task.status),
    missionId: null,
    reportPath: null,
    createdBy: task.created_by ?? 'hermes-kanban',
    createdAt,
    updatedAt,
  }
}

type ClaudeTaskRow = {
  id: string
  title: string
  body?: string | null
  status?: string | null
  assignee?: string | null
  created_at?: number | string | null
  updated_at?: number | string | null
  parents_json?: string | null
  children_json?: string | null
  latest_run_summary?: string | null
  latest_run_outcome?: string | null
  latest_run_status?: string | null
}

type ClaudeDetection = {
  available: boolean
  cliPath?: string | null
  dbPath: string
  workspacePath: string
  reason?: string
}

function env(name: string): string | null {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : null
}

function claudeProfileRoot(): string {
  return getWorkspaceClaudeHome()
}

function claudeDbPath(): string {
  return path.join(getClaudeRoot(), 'kanban.db')
}

function claudeWorkspacePath(): string {
  return path.join(getClaudeRoot(), 'kanban')
}

function claudeCliPath(): string | null {
  try {
    const output = execFileSync('which', ['claude'], { encoding: 'utf8', timeout: 5_000 }).trim()
    return output || null
  } catch {
    return null
  }
}

function checkClaudeCli(): { ok: boolean; path?: string | null; reason?: string } {
  const cli = claudeCliPath()
  if (!cli) return { ok: false, reason: 'claude CLI not found on PATH' }
  try {
    execFileSync(cli, ['--version'], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, CLAUDE_HOME: claudeProfileRoot() } })
    return { ok: true, path: cli }
  } catch (error) {
    return { ok: false, path: cli, reason: error instanceof Error ? error.message : String(error) }
  }
}

function detectClaudeKanban(): ClaudeDetection {
  const dbPath = claudeDbPath()
  const workspacePath = claudeWorkspacePath()
  const hasDb = fs.existsSync(dbPath)
  const hasWorkspace = fs.existsSync(workspacePath)

  if (!hasDb && !hasWorkspace) {
    return {
      available: false,
      cliPath: null,
      dbPath,
      workspacePath,
      reason: 'Hermes Kanban storage not found; using the local Swarm Board fallback.',
    }
  }

  const cli = checkClaudeCli()
  return {
    available: true,
    cliPath: cli.ok ? cli.path ?? null : null,
    dbPath,
    workspacePath,
    reason: cli.ok ? undefined : 'Hermes Kanban storage detected; CLI unavailable, using direct local storage access.',
  }
}

function sqliteQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function runSqlite(dbPath: string, sql: string): string {
  return execFileSync('sqlite3', [dbPath, '-json', sql], {
    encoding: 'utf8',
    timeout: 15_000,
  }).trim()
}

function claudeTaskProjection(): string {
  return [
    'tasks.id,',
    'tasks.title,',
    'tasks.body,',
    'tasks.status,',
    'tasks.assignee,',
    'tasks.created_at,',
    'coalesce(tasks.last_heartbeat_at, tasks.completed_at, tasks.started_at, tasks.created_at) as updated_at,',
    "coalesce((select json_group_array(parent_id) from task_links where child_id = tasks.id), '[]') as parents_json,",
    "coalesce((select json_group_array(child_id) from task_links where parent_id = tasks.id), '[]') as children_json,",
    '(select summary from task_runs where task_id = tasks.id order by started_at desc, id desc limit 1) as latest_run_summary,',
    '(select outcome from task_runs where task_id = tasks.id order by started_at desc, id desc limit 1) as latest_run_outcome,',
    '(select status from task_runs where task_id = tasks.id order by started_at desc, id desc limit 1) as latest_run_status',
  ].join(' ')
}

function readClaudeTasks(): ClaudeTaskRow[] {
  const detection = detectClaudeKanban()
  if (!detection.available) return []
  const query = [
    'select',
    claudeTaskProjection(),
    'from tasks',
    'order by tasks.created_at desc, tasks.id desc;',
  ].join(' ')
  const raw = runSqlite(detection.dbPath, query)
  const parsed = raw ? (JSON.parse(raw) as ClaudeTaskRow[]) : []
  return Array.isArray(parsed) ? parsed : []
}

function readClaudeTask(taskId: string): ClaudeTaskRow | null {
  const detection = detectClaudeKanban()
  if (!detection.available) return null
  const raw = runSqlite(
    detection.dbPath,
    `select ${claudeTaskProjection()} from tasks where id = ${sqliteQuote(taskId)} limit 1;`,
  )
  const parsed = raw ? (JSON.parse(raw) as ClaudeTaskRow[]) : []
  return Array.isArray(parsed) && parsed[0] ? parsed[0] : null
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : Math.round(value * 1000)
  }
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value)
    if (Number.isFinite(asNum)) return normalizeTimestamp(asNum)
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : []
  } catch {
    return []
  }
}

function mapClaudeStatus(status: string | null | undefined): SwarmKanbanCard['status'] {
  const normalized = (status ?? '').toLowerCase()
  switch (normalized) {
    case 'queued':
    case 'triage':
      return 'backlog'
    case 'todo':
      return 'todo'
    case 'ready':
      return 'ready'
    case 'running':
    case 'claimed':
    case 'in_progress':
      return 'running'
    case 'review':
      return 'review'
    case 'blocked':
      return 'blocked'
    case 'done':
    case 'complete':
    case 'completed':
      return 'done'
    default:
      return 'backlog'
  }
}

function mapBoardStatus(status: SwarmKanbanCard['status'] | null | undefined): string {
  switch (status) {
    case 'backlog':
      return 'queued'
    case 'todo':
      return 'todo'
    case 'ready':
      return 'ready'
    case 'running':
      return 'running'
    case 'review':
      return 'review'
    case 'blocked':
      return 'blocked'
    case 'done':
      return 'done'
    default:
      return 'queued'
  }
}

function validateNativeParents(dbPath: string, parentIds: string[]): Map<string, string> {
  const uniqueParentIds = [...new Set(parentIds.map((parentId) => parentId.trim()).filter(Boolean))]
  if (uniqueParentIds.length === 0) return new Map()
  const raw = runSqlite(
    dbPath,
    `select id, status from tasks where id in (${uniqueParentIds.map(sqliteQuote).join(', ')});`,
  )
  const parsed = raw ? (JSON.parse(raw) as Array<{ id?: string; status?: string | null }>) : []
  const statuses = new Map<string, string>()
  for (const row of parsed) {
    if (typeof row.id === 'string') statuses.set(row.id, row.status ?? '')
  }
  const missing = uniqueParentIds.filter((parentId) => !statuses.has(parentId))
  if (missing.length > 0) throw new Error(`Cannot create Hermes task with missing parent(s): ${missing.join(', ')}`)
  return statuses
}

function deriveNativeCreateStatus(
  requestedStatus: SwarmKanbanCard['status'] | null | undefined,
  parentStatuses: Map<string, string>,
): string {
  const requested = mapBoardStatus(requestedStatus ?? 'backlog')
  if (parentStatuses.size === 0) return requested === 'queued' ? 'todo' : requested
  const allParentsDone = [...parentStatuses.values()].every((status) => ['done', 'complete', 'completed'].includes(status.toLowerCase()))
  if (!allParentsDone && ['queued', 'todo', 'ready'].includes(requested)) return 'todo'
  if (allParentsDone && requested === 'queued') return 'ready'
  return requested
}

function claudeTaskToCard(task: ClaudeTaskRow): SwarmKanbanCard {
  const createdAt = normalizeTimestamp(task.created_at)
  const updatedAt = normalizeTimestamp(task.updated_at ?? task.created_at)
  const latestRun = task.latest_run_summary || task.latest_run_outcome || task.latest_run_status
    ? {
        summary: task.latest_run_summary ?? undefined,
        outcome: task.latest_run_outcome ?? undefined,
        status: task.latest_run_status ?? undefined,
      }
    : undefined
  return {
    id: task.id,
    title: task.title,
    spec: task.body ?? '',
    acceptanceCriteria: [],
    assignedWorker: task.assignee ?? null,
    reviewer: null,
    status: mapClaudeStatus(task.status),
    missionId: null,
    reportPath: null,
    createdBy: 'claude-kanban',
    createdAt,
    updatedAt,
    parents: parseJsonStringArray(task.parents_json),
    children: parseJsonStringArray(task.children_json),
    latestRun,
    source: 'native-kanban',
  }
}

const localBackend: KanbanBackend = {
  meta() {
    return {
      id: 'local',
      label: 'Local board',
      detected: true,
      writable: true,
      path: SWARM_KANBAN_FILE,
      details: 'Using local Swarm board JSON store.',
    }
  },
  list() {
    return listSwarmKanbanCards()
  },
  create(input) {
    return createSwarmKanbanCard(input)
  },
  update(cardId, updates) {
    return updateSwarmKanbanCard(cardId, updates)
  },
}

const claudeBackend: KanbanBackend = {
  meta() {
    const detection = detectClaudeKanban()
    return {
      id: 'claude',
      label: 'Hermes Kanban',
      detected: detection.available,
      writable: detection.available,
      path: fs.existsSync(detection.dbPath) ? detection.dbPath : null,
      details: detection.available
        ? detection.reason ?? `Hermes Kanban storage detected (${detection.cliPath ?? 'direct sqlite'}, ${detection.dbPath})`
        : detection.reason ?? 'Hermes Kanban not detected.',
    }
  },
  list() {
    return readClaudeTasks().map(claudeTaskToCard)
  },
  create(input) {
    const detection = detectClaudeKanban()
    if (!detection.available) throw new Error(detection.reason ?? 'Hermes Kanban not detected')
    const nowSeconds = Math.floor(Date.now() / 1000)
    const parentIds = Array.isArray(input.parents)
      ? input.parents.filter((parentId): parentId is string => typeof parentId === 'string' && parentId.trim().length > 0)
      : []
    const idempotencyKey = typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim().length > 0
      ? input.idempotencyKey.trim()
      : null
    if (idempotencyKey) {
      const existing = runSqlite(
        detection.dbPath,
        `select ${claudeTaskProjection()} from tasks where idempotency_key = ${sqliteQuote(idempotencyKey)} and status != 'archived' order by created_at desc, id desc limit 1;`,
      )
      const parsed = existing ? (JSON.parse(existing) as ClaudeTaskRow[]) : []
      if (Array.isArray(parsed) && parsed[0]) return claudeTaskToCard(parsed[0])
    }
    const parentStatuses = validateNativeParents(detection.dbPath, parentIds)
    const taskId = `t_${randomUUID().replace(/-/g, '').slice(0, 8)}`
    const status = deriveNativeCreateStatus(input.status ?? 'backlog', parentStatuses)
    const linkStatements = parentIds.map(
      (parentId) => `insert or ignore into task_links (parent_id, child_id) values (${sqliteQuote(parentId.trim())}, ${sqliteQuote(taskId)});`,
    )
    const statements = [
      'begin immediate;',
      'insert into tasks (',
      'id, title, body, assignee, status, priority, created_by, created_at, workspace_kind, workspace_path, idempotency_key',
      ') values (',
      [
        sqliteQuote(taskId),
        sqliteQuote(input.title.trim()),
        sqliteQuote((input.spec ?? '').trim()),
        input.assignedWorker?.trim() ? sqliteQuote(input.assignedWorker.trim()) : 'NULL',
        sqliteQuote(status),
        '0',
        sqliteQuote(input.createdBy?.trim() || 'swarm2-kanban'),
        String(nowSeconds),
        sqliteQuote('scratch'),
        sqliteQuote(path.join(detection.workspacePath, 'workspaces', taskId)),
        idempotencyKey ? sqliteQuote(idempotencyKey) : 'NULL',
      ].join(', '),
      ');',
      ...linkStatements,
      'commit;',
    ].join(' ')
    runSqlite(detection.dbPath, statements)
    const created = readClaudeTask(taskId)
    if (!created) throw new Error(`Created Hermes task ${taskId} but could not read it back`)
    return claudeTaskToCard(created)
  },
  update(cardId, updates) {
    const detection = detectClaudeKanban()
    if (!detection.available) return null
    const assignments: string[] = []
    if (typeof updates.title === 'string' && updates.title.trim()) assignments.push(`title = ${sqliteQuote(updates.title.trim())}`)
    if (typeof updates.spec === 'string') assignments.push(`body = ${sqliteQuote(updates.spec)}`)
    if (updates.assignedWorker !== undefined) assignments.push(`assignee = ${updates.assignedWorker?.trim() ? sqliteQuote(updates.assignedWorker.trim()) : 'NULL'}`)
    if (updates.status) {
      const status = mapBoardStatus(updates.status)
      assignments.push(`status = ${sqliteQuote(status)}`)
      if (status === 'running') assignments.push(`started_at = coalesce(started_at, ${Math.floor(Date.now() / 1000)})`)
      if (status === 'done') assignments.push(`completed_at = ${Math.floor(Date.now() / 1000)}`)
      if (status !== 'done') assignments.push('completed_at = NULL')
    }
    if (assignments.length === 0) {
      const current = readClaudeTask(cardId)
      return current ? claudeTaskToCard(current) : null
    }
    runSqlite(detection.dbPath, `update tasks set ${assignments.join(', ')} where id = ${sqliteQuote(cardId)};`)
    const updated = readClaudeTask(cardId)
    return updated ? claudeTaskToCard(updated) : null
  },
}

// Hermes Dashboard kanban plugin backend (HTTP proxy).
//
// Used when the upstream Hermes Agent dashboard exposes the kanban plugin
// (caps.kanban === true). Goes through HTTP rather than direct SQLite so
// remote workspaces (Docker, VPS, separate machines) can use the same
// kanban DB the agent is using. See kanban-dashboard-proxy.ts.
const dashboardProxyBackend: KanbanBackend = {
  meta() {
    const caps = getCapabilities()
    return {
      id: 'hermes-proxy',
      label: 'Hermes Dashboard kanban',
      detected: caps.kanban,
      writable: caps.kanban,
      path: caps.dashboard.url || CLAUDE_DASHBOARD_URL,
      details: caps.kanban
        ? `Synced with the Hermes Dashboard kanban plugin at ${caps.dashboard.url}/kanban (single SQLite source of truth, dispatcher-aware).`
        : 'Hermes Dashboard kanban plugin not detected.',
    }
  },
  async list() {
    const board = await fetchDashboardKanbanBoard()
    const cards: SwarmKanbanCard[] = []
    for (const column of board.columns) {
      for (const task of column.tasks) {
        cards.push(dashboardTaskToCard(task))
      }
    }
    return cards.sort(
      (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
    )
  },
  async create(input) {
    const task = await createDashboardKanbanTask({
      title: input.title.trim(),
      body: (input.spec ?? '').trim() || undefined,
      assignee: input.assignedWorker?.trim() || undefined,
      status: mapLaneToDashboardStatus(input.status ?? 'backlog'),
      created_by: input.createdBy?.trim() || 'hermes-workspace',
    })
    return dashboardTaskToCard(task)
  },
  async update(cardId, updates) {
    const patch: Parameters<typeof updateDashboardKanbanTask>[1] = {}
    if (typeof updates.title === 'string' && updates.title.trim())
      patch.title = updates.title.trim()
    if (typeof updates.spec === 'string') patch.body = updates.spec
    if (updates.assignedWorker !== undefined)
      patch.assignee = updates.assignedWorker?.trim() || null
    if (updates.status) patch.status = mapLaneToDashboardStatus(updates.status)
    if (Object.keys(patch).length === 0) {
      // No-op patches: just refetch.
      const board = await fetchDashboardKanbanBoard()
      for (const column of board.columns) {
        for (const task of column.tasks) {
          if (task.id === cardId) return dashboardTaskToCard(task)
        }
      }
      return null
    }
    try {
      const updated = await updateDashboardKanbanTask(cardId, patch)
      return dashboardTaskToCard(updated)
    } catch (err) {
      if (err instanceof Error && err.message.includes('→ 404')) return null
      throw err
    }
  },
}

/**
 * Resolve which backend to use.
 *
 * Precedence (highest first):
 *   1. CLAUDE_KANBAN_BACKEND env var (local | claude | hermes-proxy | auto)
 *   2. caps.kanban (Hermes Dashboard plugin available) → hermes-proxy
 *   3. legacy claudeBackend (direct sqlite to ~/.hermes/kanban.db) when DB exists
 *   4. localBackend (file-backed swarm2-kanban.json) as last resort
 *
 * The 'auto' default deliberately prefers hermes-proxy over the legacy direct
 * SQLite path so dispatchers + transactional helpers stay in charge of writes.
 * Set CLAUDE_KANBAN_BACKEND=claude to force the direct-SQLite path during
 * troubleshooting.
 */
export function resolveKanbanBackend(): KanbanBackend {
  const preference = (env('CLAUDE_KANBAN_BACKEND') ?? 'auto').toLowerCase()
  if (preference === 'local') return localBackend
  if (preference === 'hermes-proxy' || preference === 'proxy') {
    return getCapabilities().kanban ? dashboardProxyBackend : localBackend
  }
  if (preference === 'claude') {
    const claudeMeta = claudeBackend.meta()
    return claudeMeta.detected ? claudeBackend : localBackend
  }
  // auto
  if (getCapabilities().kanban) return dashboardProxyBackend
  const claudeMeta = claudeBackend.meta()
  if (claudeMeta.detected) return claudeBackend
  return localBackend
}

export function getKanbanBackendMeta(): KanbanBackendMeta {
  return resolveKanbanBackend().meta()
}

export async function listKanbanCards(): Promise<SwarmKanbanCard[]> {
  return Promise.resolve(resolveKanbanBackend().list())
}

export async function createKanbanCard(
  input: CreateSwarmKanbanCardInput,
): Promise<SwarmKanbanCard> {
  return Promise.resolve(resolveKanbanBackend().create(input))
}

export async function updateKanbanCard(
  cardId: string,
  updates: UpdateSwarmKanbanCardInput,
): Promise<SwarmKanbanCard | null> {
  return Promise.resolve(resolveKanbanBackend().update(cardId, updates))
}
