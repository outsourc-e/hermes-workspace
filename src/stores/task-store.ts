/**
 * Task System Lite — Mission Control-inspired task management.
 * localStorage-backed, zero backend dependencies.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  project?: string
  missionId?: string
  assignedAgent?: string
  tags: string[]
  dueDate?: string
  reminder?: string
  createdAt: string
  updatedAt: string
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

export const STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'in_progress',
  'review',
  'done',
]

export const PRIORITY_ORDER: TaskPriority[] = ['P0', 'P1', 'P2', 'P3']

/** Seed data from real Mission Control tasks */
const SEED_TASKS: Task[] = []

function normalizeTaskList(payload: unknown): Task[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { tasks?: unknown }).tasks)
  ) {
    return []
  }

  const tasks = (payload as { tasks: unknown[] }).tasks
  return tasks.filter((task): task is Task => {
    if (!task || typeof task !== 'object') return false
    const maybeTask = task as Partial<Task>
    return (
      typeof maybeTask.id === 'string' &&
      typeof maybeTask.title === 'string' &&
      typeof maybeTask.description === 'string' &&
      typeof maybeTask.status === 'string' &&
      typeof maybeTask.priority === 'string' &&
      Array.isArray(maybeTask.tags) &&
      typeof maybeTask.createdAt === 'string' &&
      typeof maybeTask.updatedAt === 'string'
    )
  })
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const maybeTask = value as Partial<Task>
  return (
    typeof maybeTask.id === 'string' &&
    typeof maybeTask.title === 'string' &&
    typeof maybeTask.description === 'string' &&
    typeof maybeTask.status === 'string' &&
    typeof maybeTask.priority === 'string' &&
    Array.isArray(maybeTask.tags) &&
    typeof maybeTask.createdAt === 'string' &&
    typeof maybeTask.updatedAt === 'string'
  )
}

function createClientTaskId(): string {
  return `TASK-${Date.now().toString(36).toUpperCase()}`
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    return `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

type TaskStore = {
  tasks: Task[]
  afterSync: boolean
  syncFromApi: () => Promise<void>
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTask: (
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>,
  ) => Promise<void>
  moveTask: (id: string, status: TaskStatus) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  // Mission-scoped selectors + actions (CS-020)
  getTasksByMission: (missionId: string) => Task[]
  upsertMissionTasks: (tasks: Array<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>) => void
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: SEED_TASKS,
      afterSync: false,
      syncFromApi: async function syncFromApi() {
        if (typeof window === 'undefined') {
          set({ afterSync: true })
          return
        }

        try {
          const response = await fetch('/api/tasks', { method: 'GET' })
          if (!response.ok)
            throw new Error(`Failed to sync tasks (${response.status})`)
          const payload = await response.json().catch(() => ({}))
          set({
            tasks: normalizeTaskList(payload),
            afterSync: true,
          })
        } catch {
          set({ afterSync: true })
        }
      },
      addTask: async (taskData) => {
        const now = new Date().toISOString()
        const task: Task = {
          ...taskData,
          id: createClientTaskId(),
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ tasks: [task, ...state.tasks] }))

        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        }).catch(() => null)

        if (!response) {
          set((state) => ({ tasks: state.tasks.filter((t) => t.id !== task.id) }))
          throw new Error('Failed to create task')
        }

        if (!response.ok) {
          const message = await readApiError(response)
          set((state) => ({ tasks: state.tasks.filter((t) => t.id !== task.id) }))
          throw new Error(message)
        }

        const payload = (await response.json().catch(() => ({}))) as {
          task?: unknown
        }
        if (isTask(payload.task)) {
          const serverTask: Task = payload.task
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === task.id ? serverTask : t)),
          }))
        }
      },
      updateTask: async (id, updates) => {
        const previousTask = get().tasks.find((task) => task.id === id)
        if (!previousTask) {
          throw new Error('Task not found')
        }
        const optimisticTask: Task = {
          ...previousTask,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? optimisticTask : t)),
        }))

        const response = await fetch(`/api/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }).catch(() => null)

        if (!response) {
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? previousTask : t)),
          }))
          throw new Error('Failed to update task')
        }

        if (!response.ok) {
          const message =
            response.status === 404
              ? 'Task not found'
              : await readApiError(response)
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? previousTask : t)),
          }))
          throw new Error(message)
        }

        const payload = (await response.json().catch(() => ({}))) as {
          task?: unknown
        }
        if (isTask(payload.task)) {
          const serverTask: Task = payload.task
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? serverTask : t)),
          }))
        }
      },
      moveTask: async (id, status) => {
        await get().updateTask(id, { status })
      },
      deleteTask: async (id) => {
        const previousTask = get().tasks.find((task) => task.id === id)
        if (!previousTask) {
          throw new Error('Task not found')
        }
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))

        const response = await fetch(`/api/tasks/${id}`, {
          method: 'DELETE',
        }).catch(() => null)

        if (!response) {
          set((state) => ({ tasks: [previousTask, ...state.tasks] }))
          throw new Error('Failed to delete task')
        }

        if (!response.ok) {
          const message =
            response.status === 404
              ? 'Task not found'
              : await readApiError(response)
          set((state) => ({ tasks: [previousTask, ...state.tasks] }))
          throw new Error(message)
        }
      },
      // CS-020: Mission-scoped selectors
      getTasksByMission: (missionId: string) => {
        return get().tasks.filter((t) => t.missionId === missionId)
      },
      upsertMissionTasks: (tasks) => {
        const now = new Date().toISOString()
        const newTasks: Task[] = tasks.map((t) => ({
          ...t,
          id: `mission-${t.missionId ?? 'unknown'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: now,
          updatedAt: now,
        }))
        set((state) => ({
          tasks: [...state.tasks.filter((existing) => !newTasks.some((n) => n.title === existing.title && n.missionId === existing.missionId)), ...newTasks],
        }))
      },
      updateTaskStatus: (taskId, status) => {
        set((state) => ({
          tasks: state.tasks.map((t) => t.id === taskId ? { ...t, status, updatedAt: new Date().toISOString() } : t),
        }))
      },
    }),
    {
      name: 'clawsuite-tasks-v1',
    },
  ),
)
