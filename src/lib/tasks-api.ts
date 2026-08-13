/**
 * Tasks API client with automatic backend detection.
 *
 * Two backend routes exist for task storage:
 *   /api/hermes-tasks  — flat-file store at ~/.hermes/tasks.json (used by agents/cron)
 *   /api/claude-tasks  — kanban-backend abstraction (local JSON, or Hermes Dashboard proxy)
 *
 * On first fetch this module probes both in parallel and selects the backend that has
 * data. If both have data, hermes-tasks wins (it is the canonical agent task store).
 * The decision is cached for the page session so subsequent calls never re-probe.
 *
 * All mutations (create, update, move, delete, launch) route through the same resolved
 * backend so reads and writes are always consistent.
 */

const HERMES_BASE = '/api/hermes-tasks'
const CLAUDE_BASE = '/api/claude-tasks'

export type TasksBackend = 'hermes' | 'claude'

// --- Backend resolution -------------------------------------------------

type BackendResolution = {
  base: string
  assigneesBase: string
  backend: TasksBackend
}

let _resolved: BackendResolution | null = null
let _resolving: Promise<BackendResolution> | null = null

async function probeBackend(base: string): Promise<number> {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return 0
    // Guard against HTML catch-all responses (route not found returns 200 HTML)
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return -1
    const data = await res.json()
    return Array.isArray(data.tasks) ? data.tasks.length : 0
  } catch {
    return 0
  }
}

async function resolveBackend(): Promise<BackendResolution> {
  // NOTE: resolution is intentionally NOT cached across calls. Caching caused
  // the board to "lose" tasks: after a transient 500/timeout on the hermes
  // probe, the page stayed pinned to the claude backend (which holds 1 task)
  // for the whole session. Re-probing each call lets a later successful hermes
  // probe win. The double-probe cost is negligible for a kanban board.
  const [hermesCount, claudeCount] = await Promise.all([
    probeBackend(HERMES_BASE),
    probeBackend(CLAUDE_BASE),
  ])

  // Prefer hermes whenever it holds real data. It is the canonical agent task
  // store (~/.hermes/tasks.json) and holds the NEXUM tasks. Only fall back to
  // claude when hermes is empty (0) or unreachable (-1 for non-JSON / 404).
  const useHermes = hermesCount > 0
  _resolved = {
    base: useHermes ? HERMES_BASE : CLAUDE_BASE,
    assigneesBase: useHermes ? '/api/hermes-tasks-assignees' : '/api/claude-tasks-assignees',
    backend: (useHermes ? 'hermes' : 'claude') as TasksBackend,
  }
  return _resolved
}

/** Returns the currently resolved backend id, or null if not yet probed. */
export function getActiveBackend(): TasksBackend | null {
  return _resolved?.backend ?? null
}

/** Force a fresh re-probe on the next fetchTasks() call (e.g. after backend config changes). */
export function resetBackendResolution(): void {
  _resolved = null
  _resolving = null
}

// --- Types --------------------------------------------------------------

export type TaskColumn = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'deleted'
export type TaskPriority = 'high' | 'medium' | 'low'

export type ClaudeTask = {
  id: string
  title: string
  description: string
  column: TaskColumn
  priority: TaskPriority
  assignee: string | null
  tags: Array<string>
  due_date: string | null
  position: number
  created_by: string
  created_at: string
  updated_at: string
  session_id?: string | null
}

export type CreateTaskInput = {
  title: string
  description?: string
  column?: TaskColumn
  priority?: TaskPriority
  assignee?: string | null
  tags?: Array<string>
  due_date?: string | null
  created_by?: string
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'created_by'>>

export type TaskAssignee = {
  id: string
  label: string
  isHuman: boolean
}

export type AssigneesResponse = {
  assignees: Array<TaskAssignee>
  humanReviewer: string | null
}

// --- API functions -------------------------------------------------------

export async function fetchAssignees(): Promise<AssigneesResponse> {
  const { assigneesBase } = await resolveBackend()
  const res = await fetch(assigneesBase)
  if (!res.ok) return { assignees: [], humanReviewer: null }
  return res.json()
}

export async function fetchTasks(params?: {
  column?: TaskColumn
  assignee?: string
  priority?: TaskPriority
  include_done?: boolean
}): Promise<Array<ClaudeTask>> {
  const { base } = await resolveBackend()
  const q = new URLSearchParams()
  if (params?.column) q.set('column', params.column)
  if (params?.assignee) q.set('assignee', params.assignee)
  if (params?.priority) q.set('priority', params.priority)
  if (params?.include_done) q.set('include_done', 'true')
  const url = q.toString() ? `${base}?${q}` : base
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`)
  const data = await res.json()
  return data.tasks ?? []
}

export async function createTask(input: CreateTaskInput): Promise<ClaudeTask> {
  const { base } = await resolveBackend()
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail || `Failed to create task: ${res.status}`)
  }
  return (await res.json()).task
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<ClaudeTask> {
  const { base } = await resolveBackend()
  const res = await fetch(`${base}/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`)
  return (await res.json()).task
}

export async function deleteTask(taskId: string): Promise<void> {
  const { base } = await resolveBackend()
  const res = await fetch(`${base}/${taskId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
}

export async function linkSession(taskId: string, sessionId: string | null): Promise<ClaudeTask> {
  const { base } = await resolveBackend()
  const res = await fetch(`${base}/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!res.ok) throw new Error(`Failed to link session: ${res.status}`)
  return (await res.json()).task
}

export async function launchSession(taskId: string): Promise<{ sessionId: string; briefing: string; task: ClaudeTask }> {
  const { base } = await resolveBackend()
  const res = await fetch(`${base}/${taskId}?action=launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`Failed to launch session: ${res.status}`)
  return res.json()
}

export async function moveTask(taskId: string, column: TaskColumn, movedBy = 'user'): Promise<ClaudeTask> {
  const { base } = await resolveBackend()
  const res = await fetch(`${base}/${taskId}?action=move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column, moved_by: movedBy }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail || `Failed to move task: ${res.status}`)
  }
  return (await res.json()).task
}

// --- Display constants ---------------------------------------------------

export const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: 'Triage',
  todo: 'Ready',
  in_progress: 'Running',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  deleted: 'Deleted',
}

export const COLUMN_ORDER: Array<TaskColumn> = ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done']

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#6b7280',
}

export const COLUMN_COLORS: Record<TaskColumn, string> = {
  backlog: '#6b7280',
  todo: '#3b82f6',
  in_progress: '#f97316',
  review: '#a855f7',
  blocked: '#ef4444',
  done: '#22c55e',
  deleted: '#374151',
}

export function isOverdue(task: ClaudeTask): boolean {
  if (!task.due_date) return false
  // Parse YYYY-MM-DD manually to avoid UTC-vs-local offset issues.
  // new Date("2026-04-02") parses as UTC midnight, which in EST is the
  // previous evening — causing everything to appear one day early.
  const [year, month, day] = task.due_date.split('-').map(Number)
  const due = new Date(year, month - 1, day) // local midnight
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

// --- Swarm dispatch integration -------------------------------------------

/** Map a task assignee id to a swarm workerId. Unknown owners fall back to null. */
export const SWARM_WORKER_BY_ASSIGNEE: Record<string, string> = {
  builder: 'builder',
  'km-agent': 'km-agent',
  'ops-watch': 'ops-watch',
  orchestrator: 'orchestrator',
  reviewer: 'reviewer',
  workspace: 'workspace',
}

export function resolveSwarmWorker(assignee: string | null | undefined): string | null {
  if (!assignee) return null
  return SWARM_WORKER_BY_ASSIGNEE[assignee] ?? null
}

export type DispatchResult = { ok: boolean; missionId?: string; error?: string }

/**
 * Dispatch a task to the swarm. The task's assignee (if any) becomes the
 * workerId; otherwise it is sent to the orchestrator for routing. Returns the
 * new mission id so callers can link the task and move it to Running.
 */
export async function dispatchTaskToSwarm(task: ClaudeTask): Promise<DispatchResult> {
  const { base: tasksBase } = await resolveBackend()
  const workerId = resolveSwarmWorker(task.assignee)
  const assignments = [
    {
      workerId: workerId ?? 'orchestrator',
      task: `${task.title}${task.description ? `\n\n${task.description}` : ''}`,
      rationale: `Dispatched from Tasks board (task ${task.id})`,
      reviewRequired: task.column === 'review',
    },
  ]
  // swarm-dispatch lives under the same origin as the tasks API.
  const swarmUrl = tasksBase.replace(/\/api\/hermes-tasks$/, '') + '/api/swarm-dispatch'
  const res = await fetch(swarmUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignments,
      missionTitle: `Tasks board: ${task.title}`.slice(0, 120),
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` }
  }
  const data = (await res.json()) as { missionId?: string }
  return { ok: true, missionId: data.missionId }
}

/**
 * Auto-classify every Nexum task on the board: dispatch the KM agent to read
 * nexum-tasks.json, decide owner/due_date/priority per task, and apply the
 * result via PATCH. Returns the mission id so the caller can track progress.
 */
export async function autoClassifyTasks(tasks: Array<ClaudeTask>): Promise<DispatchResult> {
  const nexum = tasks.filter((t) => (t.tags as Array<string> | undefined)?.includes('nexum') ?? false)
  if (nexum.length === 0) {
    return { ok: false, error: 'No Nexum tasks on the board to classify' }
  }
  const { base: tasksBase } = await resolveBackend()
  const swarmUrl = tasksBase.replace(/\/api\/hermes-tasks$/, '') + '/api/swarm-dispatch'
  const assignment = {
    workerId: 'km-agent',
    task:
      'Read /tmp/nexum-tasks.json (Nexum project tasks). For EVERY task decide ' +
      '(a) owner/assignee from {builder, km-agent, ops-watch, orchestrator, reviewer, workspace} ' +
      'by task type; (b) priority (high F0/F1, medium F2-F4, low F5/F6); (c) due_date YYYY-MM-DD ' +
      'from the Nexum timeline. Then PATCH each task at ' +
      `${tasksBase}/{id} with {assignee, priority, due_date}. Report counts by owner.`,
    rationale: 'Auto-classify Nexum tasks from the Tasks board',
    reviewRequired: false,
  }
  const res = await fetch(swarmUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments: [assignment], missionTitle: 'Auto-classify Nexum tasks' }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` }
  }
  const data = (await res.json()) as { missionId?: string }
  return { ok: true, missionId: data.missionId }
}
