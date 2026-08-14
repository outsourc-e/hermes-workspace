// Bridge between the Tasks board UI (which expects ClaudeTaskRecord) and the
// canonical task store used by the swarm runner (tasks-store -> ~/.hermes/tasks.json).
//
// Historically this file routed through kanban-backend, which auto-detected a
// Claude `kanban.db`/`kanban/` directory that does not exist in this deployment.
// That detection failed, so the board silently fell back to an empty local
// swarm2-kanban.json while the real 198 tasks lived in tasks.json — the board
// showed 0 tasks even though tasks-swarm-run could dispatch them. We now read
// straight from tasks-store (the same source tasks-swarm-run uses) so the board
// and the swarm runner are always in sync.

import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  type TaskRecord,
  type TaskColumn,
  type TaskPriority,
} from './tasks-store'

export type { TaskColumn, TaskPriority }

export type ClaudeTaskRecord = {
  id: string
  title: string
  description: string
  column: TaskColumn
  priority: TaskPriority
  assignee: string | null
  tags: string[]
  due_date: string | null
  position: number
  created_by: string
  created_at: string
  updated_at: string
  session_id?: string | null
}

type TaskFilters = {
  column?: string | null
  assignee?: string | null
  priority?: string | null
  includeDone?: boolean
}

type CreateTaskInput = {
  title: string
  description?: string
  column?: TaskColumn
  priority?: TaskPriority
  assignee?: string | null
  tags?: string[]
  due_date?: string | null
  created_by?: string
}

type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'created_by'>>

// tasks-store TaskRecord and ClaudeTaskRecord are structurally identical; this
// is a thin identity mapper so the rest of the app keeps using ClaudeTaskRecord.
function toClaudeTask(task: TaskRecord): ClaudeTaskRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    column: task.column,
    priority: task.priority,
    assignee: task.assignee,
    tags: task.tags,
    due_date: task.due_date,
    position: task.position,
    created_by: task.created_by,
    created_at: task.created_at,
    updated_at: task.updated_at,
    session_id: task.session_id ?? null,
  }
}

export function getClaudeTasksBackendMeta() {
  return {
    id: 'tasks-store' as const,
    label: 'Hermes Tasks (tasks.json)',
    detected: true,
    writable: true,
    details: 'Canonical task store shared with the swarm runner.',
    path: null,
  }
}

export async function listClaudeTasks(filters: TaskFilters = {}): Promise<ClaudeTaskRecord[]> {
  const storeFilters: TaskFilters = {
    column: filters.column,
    assignee: filters.assignee,
    priority: filters.priority,
    includeDone: filters.includeDone,
  }
  return listTasks(storeFilters).map(toClaudeTask)
}

export async function getClaudeTask(taskId: string): Promise<ClaudeTaskRecord | null> {
  const task = getTask(taskId)
  return task ? toClaudeTask(task) : null
}

export async function createClaudeTask(input: CreateTaskInput): Promise<ClaudeTaskRecord> {
  const task = createTask({
    title: input.title,
    description: input.description ?? '',
    column: input.column ?? 'backlog',
    priority: input.priority ?? 'medium',
    assignee: input.assignee ?? null,
    tags: input.tags ?? [],
    due_date: input.due_date ?? null,
    created_by: input.created_by ?? 'user',
  })
  return toClaudeTask(task)
}

export async function updateClaudeTask(
  taskId: string,
  updates: UpdateTaskInput,
): Promise<ClaudeTaskRecord | null> {
  const task = updateTask(taskId, updates)
  return task ? toClaudeTask(task) : null
}

export async function moveClaudeTask(
  taskId: string,
  column: TaskColumn,
): Promise<ClaudeTaskRecord | null> {
  const task = moveTask(taskId, column)
  return task ? toClaudeTask(task) : null
}

export async function deleteClaudeTask(taskId: string): Promise<boolean> {
  return deleteTask(taskId)
}
