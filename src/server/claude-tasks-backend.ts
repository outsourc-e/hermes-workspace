import {
  createKanbanCard,
  listKanbanCards,
  type KanbanBackendMeta,
  getKanbanBackendMeta,
  updateKanbanCard,
} from './kanban-backend'

export type TaskColumn = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

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

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function mapKanbanStatusToTaskColumn(status: string): TaskColumn {
  switch (status) {
    case 'ready':
      return 'todo'
    case 'running':
      return 'in_progress'
    case 'review':
      return 'review'
    case 'blocked':
      return 'blocked'
    case 'done':
      return 'done'
    case 'backlog':
    default:
      return 'backlog'
  }
}

function mapTaskColumnToKanbanStatus(column: TaskColumn): 'backlog' | 'ready' | 'running' | 'review' | 'blocked' | 'done' {
  switch (column) {
    case 'todo':
      return 'ready'
    case 'in_progress':
      return 'running'
    case 'review':
      return 'review'
    case 'blocked':
      return 'blocked'
    case 'done':
      return 'done'
    case 'backlog':
    default:
      return 'backlog'
  }
}

function mapCardToTask(card: {
  id: string
  title: string
  spec: string
  assignedWorker: string | null
  status: string
  createdBy: string
  createdAt: number
  updatedAt: number
}): ClaudeTaskRecord {
  return {
    id: card.id,
    title: card.title,
    description: card.spec,
    column: mapKanbanStatusToTaskColumn(card.status),
    priority: 'medium',
    assignee: card.assignedWorker,
    tags: [],
    due_date: null,
    position: card.updatedAt,
    created_by: card.createdBy,
    created_at: toIso(card.createdAt),
    updated_at: toIso(card.updatedAt),
  }
}

export function getClaudeTasksBackendMeta(): KanbanBackendMeta {
  return getKanbanBackendMeta()
}

export async function listClaudeTasks(filters: TaskFilters = {}): Promise<ClaudeTaskRecord[]> {
  let tasks = (await listKanbanCards()).map(mapCardToTask)
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
  return tasks.sort((a, b) => b.position - a.position || a.title.localeCompare(b.title))
}

export async function getClaudeTask(taskId: string): Promise<ClaudeTaskRecord | null> {
  const tasks = await listKanbanCards()
  const card = tasks.find((entry) => entry.id === taskId)
  return card ? mapCardToTask(card) : null
}

export async function createClaudeTask(input: CreateTaskInput): Promise<ClaudeTaskRecord> {
  const card = await createKanbanCard({
    title: input.title,
    spec: input.description ?? '',
    assignedWorker: input.assignee ?? null,
    status: mapTaskColumnToKanbanStatus(input.column ?? 'backlog'),
    createdBy: input.created_by ?? 'user',
  })
  return mapCardToTask(card)
}

export async function updateClaudeTask(taskId: string, updates: UpdateTaskInput): Promise<ClaudeTaskRecord | null> {
  const card = await updateKanbanCard(taskId, {
    title: typeof updates.title === 'string' ? updates.title : undefined,
    spec: typeof updates.description === 'string' ? updates.description : undefined,
    assignedWorker:
      updates.assignee === null || typeof updates.assignee === 'string'
        ? updates.assignee
        : undefined,
    status: updates.column ? mapTaskColumnToKanbanStatus(updates.column) : undefined,
  })
  return card ? mapCardToTask(card) : null
}

export async function moveClaudeTask(taskId: string, column: TaskColumn): Promise<ClaudeTaskRecord | null> {
  return updateClaudeTask(taskId, { column })
}
