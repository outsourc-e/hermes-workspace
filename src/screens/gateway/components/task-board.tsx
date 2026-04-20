import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { emitFeedEvent } from './feed-event-bus'
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done'
export type HubTask = {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  agentId?: string
  /** ID of the mission that created this task. Used to filter stale tasks. */
  missionId?: string
  createdAt: number
  updatedAt: number
}
export type TaskBoardRef = {
  addTasks: (tasks: Array<HubTask>) => void
  moveTasks: (taskIds: Array<string>, status: TaskStatus) => void
}
type TaskBoardProps = {
  agents: Array<{ id: string; name: string }>
  initialTasks?: Array<HubTask>
  selectedAgentId?: string
  onRef?: (ref: TaskBoardRef) => void
  onTasksChange?: (tasks: Array<HubTask>) => void
  /** When set, board defaults to showing only tasks with this missionId */
  activeMissionId?: string
}
const STORAGE_KEY = 'clawsuite:hub-tasks'
const COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]
const PRIORITIES: Array<{
  key: TaskPriority
  label: string
  badge: string
}> = [
  { key: 'urgent', label: 'Urgent', badge: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  { key: 'high', label: 'High', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'normal', label: 'Normal', badge: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200' },
  { key: 'low', label: 'Low', badge: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200' },
]
function isTaskStatus(value: unknown): value is TaskStatus {
  return COLUMNS.some((column) => column.key === value)
}
function isTaskPriority(value: unknown): value is TaskPriority {
  return PRIORITIES.some((priority) => priority.key === value)
}
function normalizeTask(task: HubTask): HubTask {
  if (task.agentId && task.status === 'inbox') {
    return { ...task, status: 'assigned' }
  }
  return task
}
function toTask(value: unknown): HubTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const description = typeof row.description === 'string' ? row.description.trim() : ''
  const createdAt = typeof row.createdAt === 'number' ? row.createdAt : Date.now()
  const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : createdAt
  const agentId = typeof row.agentId === 'string' ? row.agentId : undefined
  const missionId = typeof row.missionId === 'string' ? row.missionId : undefined
  if (!id || !title || !isTaskPriority(row.priority) || !isTaskStatus(row.status)) return null
  return normalizeTask({
    id,
    title,
    description,
    priority: row.priority,
    status: row.status,
    agentId,
    missionId,
    createdAt,
    updatedAt,
  })
}
function loadTasks(): Array<HubTask> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toTask(entry))
      .filter((entry): entry is HubTask => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}
function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
function statusLabel(status: TaskStatus): string {
  return COLUMNS.find((column) => column.key === status)?.label ?? status
}

type TaskEditDraft = {
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
}

export function TaskBoard({ agents, initialTasks, selectedAgentId, onRef, onTasksChange, activeMissionId }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Array<HubTask>>([])
  const [hydrated, setHydrated] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal' as TaskPriority, agentId: selectedAgentId ?? '' })
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskEditDraft, setTaskEditDraft] = useState<TaskEditDraft | null>(null)
  const [showAllTasks, setShowAllTasks] = useState(false)
  const tasksRef = useRef<Array<HubTask>>([])
  // Prevent click from firing right after a drag interaction
  const dragHappenedRef = useRef(false)

  useEffect(() => {
    const storedTasks = loadTasks()
    tasksRef.current = storedTasks
    setTasks(storedTasks)
    setHydrated(true)
  }, [])
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks, hydrated])
  const onTasksChangeRef = useRef(onTasksChange)
  onTasksChangeRef.current = onTasksChange
  useEffect(() => {
    onTasksChangeRef.current?.(tasks)
  }, [tasks])
  const agentNameById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])

  // Filter tasks by activeMissionId (unless showAllTasks is on)
  const visibleTasks = useMemo(() => {
    if (!activeMissionId || showAllTasks) return tasks
    return tasks.filter((t) => t.missionId === activeMissionId)
  }, [tasks, activeMissionId, showAllTasks])
  const addTasks = useCallback((incomingTasks: Array<HubTask>) => {
    if (incomingTasks.length === 0) return
    const normalizedIncomingTasks = incomingTasks.map(normalizeTask)
    const existingIds = new Set(tasksRef.current.map((task) => task.id))
    const nextTasks = normalizedIncomingTasks.filter((task) => !existingIds.has(task.id))
    if (nextTasks.length === 0) return
    tasksRef.current = [...nextTasks, ...tasksRef.current]
    setTasks((previous) => [...nextTasks, ...previous])
    nextTasks.forEach((task) => {
      emitFeedEvent({
        type: 'task_created',
        message: `Task created: ${task.title}`,
        taskTitle: task.title,
        agentName: task.agentId ? agentNameById.get(task.agentId) : undefined,
      })
      if (task.agentId) {
        const agentName = agentNameById.get(task.agentId) ?? task.agentId
        emitFeedEvent({
          type: 'task_assigned',
          message: `Assigned to ${agentName}`,
          taskTitle: task.title,
          agentName,
        })
      }
    })
  }, [agentNameById])
  const moveTasks = useCallback((taskIds: Array<string>, nextStatus: TaskStatus) => {
    if (taskIds.length === 0) return
    const ids = new Set(taskIds)
    const existingTasks = tasksRef.current
    const now = Date.now()
    const movedTasks: Array<HubTask> = []

    const nextTasks = existingTasks.map((task) => {
      if (!ids.has(task.id) || task.status === nextStatus) return task
      movedTasks.push(task)
      return { ...task, status: nextStatus, updatedAt: now }
    })

    if (movedTasks.length === 0) return
    tasksRef.current = nextTasks
    setTasks(nextTasks)

    movedTasks.forEach((task) => {
      const agentName = task.agentId ? agentNameById.get(task.agentId) : undefined
      emitFeedEvent({
        type: 'task_moved',
        message: `${task.title} moved ${statusLabel(task.status)} -> ${statusLabel(nextStatus)}`,
        taskTitle: task.title,
        agentName,
      })
      if (nextStatus === 'done') {
        emitFeedEvent({
          type: 'task_completed',
          message: `Task completed: ${task.title}`,
          taskTitle: task.title,
          agentName,
        })
      }
    })
  }, [agentNameById])
  useEffect(() => {
    if (!initialTasks || initialTasks.length === 0) return
    addTasks(initialTasks)
  }, [addTasks, initialTasks])
  const onRefRef = useRef(onRef)
  onRefRef.current = onRef
  useEffect(() => {
    onRefRef.current?.({ addTasks, moveTasks })
  }, [addTasks, moveTasks])

  function openTaskDetail(task: HubTask) {
    setExpandedTaskId(task.id)
    setTaskEditDraft({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
    })
  }

  function closeTaskDetail() {
    setExpandedTaskId(null)
    setTaskEditDraft(null)
  }

  function saveTaskDetail(taskId: string) {
    if (!taskEditDraft) return
    const now = Date.now()
    setTasks((previous) =>
      previous.map((t) =>
        t.id === taskId ? { ...t, ...taskEditDraft, updatedAt: now } : t,
      ),
    )
    closeTaskDetail()
  }

  const selectedAgentName = selectedAgentId ? agentNameById.get(selectedAgentId) ?? selectedAgentId : undefined
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Array<HubTask>> = { inbox: [], assigned: [], in_progress: [], review: [], done: [] }
    visibleTasks.forEach((task) => grouped[task.status].push(task))
    ;(Object.keys(grouped) as Array<TaskStatus>).forEach((status) => grouped[status].sort((a, b) => b.updatedAt - a.updatedAt))
    return grouped
  }, [visibleTasks])
  function closeCreateForm() {
    setIsCreating(false)
    setForm((previous) => ({ ...previous, title: '', description: '' }))
  }
  function openCreateForm() {
    setForm({ title: '', description: '', priority: 'normal', agentId: selectedAgentId ?? '' })
    setIsCreating(true)
  }
  function handleCreateTask() {
    const title = form.title.trim()
    if (!title) return
    const now = Date.now()
    const agentId = form.agentId || undefined
    const nextTask: HubTask = {
      id: createTaskId(),
      title,
      description: form.description.trim(),
      priority: form.priority,
      status: agentId ? 'assigned' : 'inbox',
      agentId,
      createdAt: now,
      updatedAt: now,
    }
    setTasks((previous) => [nextTask, ...previous])
    emitFeedEvent({
      type: 'task_created',
      message: `Task created: ${nextTask.title}`,
      taskTitle: nextTask.title,
      agentName: agentId ? agentNameById.get(agentId) : undefined,
    })
    if (agentId) {
      emitFeedEvent({
        type: 'task_assigned',
        message: `Task assigned: ${nextTask.title}`,
        taskTitle: nextTask.title,
        agentName: agentNameById.get(agentId),
      })
    }
    closeCreateForm()
  }
  function moveTask(taskId: string, nextStatus: TaskStatus) {
    moveTasks([taskId], nextStatus)
  }
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-100">Tasks</h2>
            <p className="truncate text-[11px] text-neutral-400">
              {selectedAgentName ? `Focused agent: ${selectedAgentName}` : 'Showing all agents'}
            </p>
          </div>
          {activeMissionId ? (
            <button
              type="button"
              onClick={() => setShowAllTasks((p) => !p)}
              className={cn(
                'shrink-0 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors',
                showAllTasks
                  ? 'border-neutral-700 bg-neutral-800 text-neutral-300'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300',
              )}
              title={showAllTasks ? 'Show only current mission tasks' : 'Show tasks from all missions'}
            >
              {showAllTasks ? 'Mission only' : 'Show all'}
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto bg-white dark:bg-neutral-950 px-4 py-3">
        <div className="flex h-full w-full gap-3">
          {COLUMNS.map((column) => {
            const columnTasks = tasksByColumn[column.key]
            return (
              <div key={column.key} className="min-w-[200px] max-w-[240px] flex-1 rounded-xl border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{column.label}</h3>
                  <div className="flex items-center gap-1.5">
                    {column.key === 'inbox' ? (
                      <button
                        type="button"
                        onClick={() => (isCreating ? closeCreateForm() : openCreateForm())}
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors',
                          isCreating
                            ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500',
                        )}
                      >
                        {isCreating ? 'Cancel' : '+ New Task'}
                      </button>
                    ) : null}
                    <span className="rounded-full bg-neutral-800 px-1.5 text-[10px] text-neutral-300">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (dragOverStatus !== column.key) setDragOverStatus(column.key)
                  }}
                  onDragLeave={() => {
                    if (dragOverStatus === column.key) setDragOverStatus(null)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId
                    if (taskId) moveTask(taskId, column.key)
                    setDraggedTaskId(null)
                    setDragOverStatus(null)
                  }}
                  className={cn(
                    'min-h-[240px] space-y-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 p-2 transition-colors',
                    dragOverStatus === column.key && 'border-emerald-500 bg-emerald-50 dark:bg-neutral-900',
                  )}
                >
                  {column.key === 'inbox' && isCreating ? (
                    <form
                      className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                      onSubmit={(event) => {
                        event.preventDefault()
                        handleCreateTask()
                      }}
                    >
                      <input
                        type="text"
                        value={form.title}
                        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Task title"
                        className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                        required
                      />
                      <textarea
                        value={form.description}
                        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Description (optional)"
                        rows={3}
                        className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      />
                      <div className="flex flex-wrap gap-1">
                        {PRIORITIES.map((priority) => (
                          <button
                            key={priority.key}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, priority: priority.key }))}
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
                              form.priority === priority.key
                                ? priority.badge
                                : 'bg-primary-100 text-primary-500 hover:bg-primary-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
                            )}
                          >
                            {priority.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={form.agentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, agentId: event.target.value }))}
                        className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      >
                        <option value="">Unassigned</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeCreateForm}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-primary-500 hover:bg-primary-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!form.title.trim()}
                          className="rounded-md bg-accent-500 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Create
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {columnTasks.length === 0 ? (
                    <p className="py-8 text-center text-[11px] text-neutral-500">Drop tasks here</p>
                  ) : null}
                  {columnTasks.map((task) => {
                    const priority = PRIORITIES.find((item) => item.key === task.priority)
                    const assignee = task.agentId ? agentNameById.get(task.agentId) ?? task.agentId : 'Unassigned'
                    const dimmed = Boolean(selectedAgentId && task.agentId !== selectedAgentId)
                    const isExpanded = expandedTaskId === task.id
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(event) => {
                          dragHappenedRef.current = true
                          setDraggedTaskId(task.id)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', task.id)
                        }}
                        onDragEnd={() => {
                          window.setTimeout(() => {
                            dragHappenedRef.current = false
                          }, 100)
                          setDraggedTaskId(null)
                          setDragOverStatus(null)
                        }}
                        onClick={() => {
                          if (dragHappenedRef.current) return
                          if (isExpanded) {
                            closeTaskDetail()
                          } else {
                            openTaskDetail(task)
                          }
                        }}
                        className={cn(
                          'cursor-pointer rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 transition-colors active:cursor-grabbing',
                          dimmed && 'opacity-50',
                          isExpanded && 'border-emerald-700',
                        )}
                      >
                        <p className="text-xs font-semibold text-neutral-100">{task.title}</p>
                        {task.description && !isExpanded ? (
                          <p className="mt-1 line-clamp-3 text-[11px] text-neutral-400">{task.description}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', priority?.badge)}>
                            {priority?.label ?? 'Normal'}
                          </span>
                          <span className="truncate text-[10px] text-neutral-400">{assignee}</span>
                        </div>

                        {/* Inline slide-down task detail panel */}
                        {isExpanded && taskEditDraft ? (
                          <div
                            className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div>
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                Title
                              </label>
                              <input
                                type="text"
                                value={taskEditDraft.title}
                                onChange={(e) =>
                                  setTaskEditDraft((prev) =>
                                    prev ? { ...prev, title: e.target.value } : prev,
                                  )
                                }
                                className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                Description
                              </label>
                              <textarea
                                value={taskEditDraft.description}
                                onChange={(e) =>
                                  setTaskEditDraft((prev) =>
                                    prev ? { ...prev, description: e.target.value } : prev,
                                  )
                                }
                                rows={2}
                                placeholder="Add a description…"
                                className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                              />
                            </div>
                            <p className="text-[11px] text-neutral-400">
                              <span className="font-semibold uppercase tracking-wide">Agent:</span>{' '}
                              {assignee}
                            </p>
                            <div>
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                Priority
                              </label>
                              <select
                                value={taskEditDraft.priority}
                                onChange={(e) =>
                                  setTaskEditDraft((prev) =>
                                    prev
                                      ? { ...prev, priority: e.target.value as TaskPriority }
                                      : prev,
                                  )
                                }
                                className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                              >
                                {PRIORITIES.map((p) => (
                                  <option key={p.key} value={p.key}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                Status
                              </label>
                              <select
                                value={taskEditDraft.status}
                                onChange={(e) =>
                                  setTaskEditDraft((prev) =>
                                    prev
                                      ? { ...prev, status: e.target.value as TaskStatus }
                                      : prev,
                                  )
                                }
                                className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                              >
                                {COLUMNS.map((col) => (
                                  <option key={col.key} value={col.key}>
                                    {col.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => saveTaskDetail(task.id)}
                                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={closeTaskDetail}
                                className="rounded-md px-2 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
