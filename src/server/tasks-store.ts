import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type TaskColumn = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'deleted'
export type TaskPriority = 'high' | 'medium' | 'low'

export type TaskRecord = {
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

type TaskFile = { tasks: TaskRecord[] }

type TaskFilters = {
  column?: string | null
  assignee?: string | null
  priority?: string | null
  includeDone?: boolean
}

type CreateTaskInput = Partial<TaskRecord> & { title: string }
type UpdateTaskInput = Partial<Omit<TaskRecord, 'id' | 'created_at' | 'created_by'>>

const CLAUDE_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
const TASKS_FILE = path.join(CLAUDE_HOME, 'tasks.json')

function ensureTasksFile(): void {
  fs.mkdirSync(CLAUDE_HOME, { recursive: true })
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify({ tasks: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readTaskFile(): TaskFile {
  ensureTasksFile()
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf-8').trim()
    if (!raw) return { tasks: [] }
    const parsed = JSON.parse(raw) as Partial<TaskFile>
    return { tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] }
  } catch {
    return { tasks: [] }
  }
}

function writeTaskFile(data: TaskFile): void {
  ensureTasksFile()
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function normalizeTask(task: Partial<TaskRecord> & Pick<TaskRecord, 'id' | 'title' | 'created_at' | 'updated_at' | 'created_by'>): TaskRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    column: (task.column as TaskColumn) ?? 'backlog',
    priority: (task.priority as TaskPriority) ?? 'medium',
    assignee: task.assignee ?? null,
    tags: Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    due_date: task.due_date ?? null,
    position: typeof task.position === 'number' ? task.position : 0,
    created_by: task.created_by,
    created_at: task.created_at,
    updated_at: task.updated_at,
    session_id: task.session_id ?? null,
  }
}

export function listTasks(filters: TaskFilters = {}): TaskRecord[] {
  let tasks = readTaskFile().tasks.map(normalizeTask)
  if (!filters.includeDone) {
    tasks = tasks.filter((task) => task.column !== 'done')
  }
  if (filters.column) {
    tasks = tasks.filter((task) => task.column === filters.column)
  }
  if (filters.assignee) {
    tasks = tasks.filter((task) => task.assignee === filters.assignee)
  }
  if (filters.priority) {
    tasks = tasks.filter((task) => task.priority === filters.priority)
  }
  return tasks.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
}

export function getTask(taskId: string): TaskRecord | null {
  return readTaskFile().tasks.map(normalizeTask).find((task) => task.id === taskId) ?? null
}

export function createTask(input: CreateTaskInput): TaskRecord {
  const file = readTaskFile()
  const now = new Date().toISOString()
  const task = normalizeTask({
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    title: input.title,
    description: input.description,
    column: input.column,
    priority: input.priority,
    assignee: input.assignee,
    tags: input.tags,
    due_date: input.due_date,
    position: typeof input.position === 'number' ? input.position : 0,
    created_by: typeof input.created_by === 'string' && input.created_by ? input.created_by : 'user',
    created_at: now,
    updated_at: now,
  })
  file.tasks.push(task)
  writeTaskFile({ tasks: file.tasks.map(normalizeTask) })
  return task
}

export function updateTask(taskId: string, updates: UpdateTaskInput): TaskRecord | null {
  const file = readTaskFile()
  const index = file.tasks.findIndex((task) => task.id === taskId)
  if (index === -1) return null

  const current = normalizeTask(file.tasks[index] as TaskRecord)
  const next = normalizeTask({
    ...current,
    ...updates,
    id: current.id,
    created_by: current.created_by,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
    title: typeof updates.title === 'string' ? updates.title : current.title,
  })

  file.tasks[index] = next
  writeTaskFile({ tasks: file.tasks.map(normalizeTask) })
  return next
}

export function moveTask(taskId: string, column: TaskColumn): TaskRecord | null {
  return updateTask(taskId, { column })
}

export function deleteTask(taskId: string): boolean {
  const file = readTaskFile()
  const nextTasks = file.tasks.filter((task) => task.id !== taskId)
  if (nextTasks.length === file.tasks.length) return false
  writeTaskFile({ tasks: nextTasks.map((task) => normalizeTask(task as TaskRecord)) })
  return true
}

export function linkTaskSession(taskId: string, sessionId: string | null): TaskRecord | null {
  return updateTask(taskId, { session_id: sessionId })
}
