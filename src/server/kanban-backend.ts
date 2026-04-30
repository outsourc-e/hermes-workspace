import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getHermesRoot, getWorkspaceHermesHome } from './hermes-paths'
import {
  SWARM_KANBAN_FILE,
  type CreateSwarmKanbanCardInput,
  createSwarmKanbanCard,
  listSwarmKanbanCards,
  type SwarmKanbanCard,
  updateSwarmKanbanCard,
  type UpdateSwarmKanbanCardInput,
} from './swarm-kanban-store'

export type KanbanBackendId = 'local' | 'hermes'

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
  list(): SwarmKanbanCard[]
  create(input: CreateSwarmKanbanCardInput): SwarmKanbanCard
  update(cardId: string, updates: UpdateSwarmKanbanCardInput): SwarmKanbanCard | null
}

type HermesTaskRow = {
  id: string
  title: string
  body?: string | null
  status?: string | null
  assignee?: string | null
  created_at?: number | string | null
  updated_at?: number | string | null
}

type HermesDetection = {
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

function hermesProfileRoot(): string {
  return getWorkspaceHermesHome()
}

function hermesDbPath(): string {
  return path.join(getHermesRoot(), 'kanban.db')
}

function hermesWorkspacePath(): string {
  return path.join(getHermesRoot(), 'kanban')
}

function hermesCliPath(): string | null {
  try {
    const output = execFileSync('which', ['hermes'], { encoding: 'utf8', timeout: 5_000 }).trim()
    return output || null
  } catch {
    return null
  }
}

function checkHermesCli(): { ok: boolean; path?: string | null; reason?: string } {
  const cli = hermesCliPath()
  if (!cli) return { ok: false, reason: 'hermes CLI not found on PATH' }
  try {
    execFileSync(cli, ['--version'], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, HERMES_HOME: hermesProfileRoot() } })
    return { ok: true, path: cli }
  } catch (error) {
    return { ok: false, path: cli, reason: error instanceof Error ? error.message : String(error) }
  }
}

function detectHermesKanban(): HermesDetection {
  const dbPath = hermesDbPath()
  const workspacePath = hermesWorkspacePath()
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

  const cli = checkHermesCli()
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

function readHermesTasks(): HermesTaskRow[] {
  const detection = detectHermesKanban()
  if (!detection.available) return []
  const query = [
    'select',
    'id,',
    'title,',
    'body,',
    'status,',
    'assignee,',
    'created_at,',
    'coalesce(last_heartbeat_at, completed_at, started_at, created_at) as updated_at',
    'from tasks',
    'order by created_at desc, id desc;',
  ].join(' ')
  const raw = runSqlite(detection.dbPath, query)
  const parsed = raw ? (JSON.parse(raw) as HermesTaskRow[]) : []
  return Array.isArray(parsed) ? parsed : []
}

function readHermesTask(taskId: string): HermesTaskRow | null {
  const detection = detectHermesKanban()
  if (!detection.available) return null
  const raw = runSqlite(
    detection.dbPath,
    `select id, title, body, status, assignee, created_at, coalesce(last_heartbeat_at, completed_at, started_at, created_at) as updated_at from tasks where id = ${sqliteQuote(taskId)} limit 1;`,
  )
  const parsed = raw ? (JSON.parse(raw) as HermesTaskRow[]) : []
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

function mapHermesStatus(status: string | null | undefined): SwarmKanbanCard['status'] {
  switch ((status ?? '').toLowerCase()) {
    case 'queued':
    case 'todo':
    case 'triage':
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

function mapBoardStatus(status: SwarmKanbanCard['status'] | null | undefined): string {
  switch (status) {
    case 'backlog':
      return 'queued'
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

function hermesTaskToCard(task: HermesTaskRow): SwarmKanbanCard {
  const createdAt = normalizeTimestamp(task.created_at)
  const updatedAt = normalizeTimestamp(task.updated_at ?? task.created_at)
  return {
    id: task.id,
    title: task.title,
    spec: task.body ?? '',
    acceptanceCriteria: [],
    assignedWorker: task.assignee ?? null,
    reviewer: null,
    status: mapHermesStatus(task.status),
    missionId: null,
    reportPath: null,
    createdBy: 'hermes-kanban',
    createdAt,
    updatedAt,
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

const hermesBackend: KanbanBackend = {
  meta() {
    const detection = detectHermesKanban()
    return {
      id: 'hermes',
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
    return readHermesTasks().map(hermesTaskToCard)
  },
  create(input) {
    const detection = detectHermesKanban()
    if (!detection.available) throw new Error(detection.reason ?? 'Hermes Kanban not detected')
    const nowSeconds = Math.floor(Date.now() / 1000)
    const taskId = `t_${randomUUID().replace(/-/g, '').slice(0, 8)}`
    const status = mapBoardStatus(input.status ?? 'backlog')
    const statements = [
      'insert into tasks (',
      'id, title, body, assignee, status, priority, created_by, created_at, workspace_kind, workspace_path',
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
      ].join(', '),
      ');',
    ].join(' ')
    runSqlite(detection.dbPath, statements)
    const created = readHermesTask(taskId)
    if (!created) throw new Error(`Created Hermes task ${taskId} but could not read it back`)
    return hermesTaskToCard(created)
  },
  update(cardId, updates) {
    const detection = detectHermesKanban()
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
      const current = readHermesTask(cardId)
      return current ? hermesTaskToCard(current) : null
    }
    runSqlite(detection.dbPath, `update tasks set ${assignments.join(', ')} where id = ${sqliteQuote(cardId)};`)
    const updated = readHermesTask(cardId)
    return updated ? hermesTaskToCard(updated) : null
  },
}

export function resolveKanbanBackend(): KanbanBackend {
  const preference = (env('HERMES_KANBAN_BACKEND') ?? 'auto').toLowerCase()
  if (preference === 'local') return localBackend
  const hermesMeta = hermesBackend.meta()
  if (preference === 'hermes') return hermesMeta.detected ? hermesBackend : localBackend
  return hermesMeta.detected ? hermesBackend : localBackend
}

export function getKanbanBackendMeta(): KanbanBackendMeta {
  return resolveKanbanBackend().meta()
}

export function listKanbanCards(): SwarmKanbanCard[] {
  return resolveKanbanBackend().list()
}

export function createKanbanCard(input: CreateSwarmKanbanCardInput): SwarmKanbanCard {
  return resolveKanbanBackend().create(input)
}

export function updateKanbanCard(cardId: string, updates: UpdateSwarmKanbanCardInput): SwarmKanbanCard | null {
  return resolveKanbanBackend().update(cardId, updates)
}
