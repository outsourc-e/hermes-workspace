import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  useTaskStore,
  STATUS_ORDER,
  STATUS_LABELS,
  PRIORITY_ORDER,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/stores/task-store'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

type TaskViewMode = 'list' | 'kanban'

type StatusFilter = TaskStatus | 'all'
type PriorityFilter = TaskPriority | 'all'

const TASK_VIEW_STORAGE_KEY = 'hermes-task-view-mode'

/* Helpers */

function priorityColor(p: string): string {
  if (p === 'P0') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'P1') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  if (p === 'P2') return 'bg-primary-200/60 text-primary-700 dark:text-primary-300'
  return 'bg-primary-100 text-primary-500 dark:bg-primary-200/60 dark:text-primary-400'
}

function statusDotColor(s: TaskStatus): string {
  if (s === 'in_progress') return 'bg-emerald-500'
  if (s === 'review') return 'bg-blue-500'
  if (s === 'done') return 'bg-slate-500'
  return 'bg-gray-400'
}

function statusColumnAccent(s: TaskStatus): string {
  if (s === 'in_progress') return 'border-emerald-300 dark:border-emerald-700'
  if (s === 'review') return 'border-blue-300 dark:border-blue-700'
  if (s === 'done') return 'border-slate-300 dark:border-slate-600'
  return 'border-gray-300 dark:border-gray-600'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(d)
}

/* Add Task Dialog */

function AddTaskDialog({
  onAdd,
  onClose,
  initialStatus = 'backlog',
}: {
  onAdd: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
  initialStatus?: TaskStatus
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('P1')
  const [status, setStatus] = useState<TaskStatus>(initialStatus)
  const [dueDate, setDueDate] = useState('')
  const [reminder, setReminder] = useState('')

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim()) return
      void onAdd({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        tags: [],
        ...(dueDate ? { dueDate } : {}),
        ...(reminder ? { reminder } : {}),
      })
      onClose()
    },
    [title, description, priority, status, dueDate, reminder, onAdd, onClose],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-2xl dark:bg-primary-100"
      >
        <h2 className="mb-4 text-sm font-semibold text-ink">New Task</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-primary-500">
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none focus:border-primary-400 dark:bg-primary-50"
            autoFocus
            placeholder="Task title..."
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-primary-500">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none focus:border-primary-400 dark:bg-primary-50"
            placeholder="Optional details..."
          />
        </label>

        <div className="mb-3 flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-primary-500">
              Priority
            </span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none dark:bg-primary-50"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-primary-500">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none dark:bg-primary-50"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-4 flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-primary-500">
              Due Date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none dark:bg-primary-50"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-primary-500">
              Reminder
            </span>
            <input
              type="datetime-local"
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none dark:bg-primary-50"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[13px] text-primary-500 hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded-lg bg-accent-500 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-500/90 disabled:opacity-40"
          >
            Add Task
          </button>
        </div>
      </form>
    </div>
  )
}

/* List Item */

function ListTaskItem({
  task,
  onMove,
  onDelete,
  onSelect,
}: {
  task: Task
  onMove: (id: string, status: TaskStatus) => void
  onDelete: (id: string) => void
  onSelect: (task: Task) => void
}) {
  return (
    <article
      className="group flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3 transition-colors hover:border-primary-300 dark:bg-primary-100"
      onClick={() => onSelect(task)}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn('size-2 rounded-full', statusDotColor(task.status))}
          />
          <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-medium tabular-nums',
              priorityColor(task.priority),
            )}
          >
            {task.priority}
          </span>
          <span className="rounded bg-primary-100 px-1.5 py-0.5 text-primary-600 dark:bg-primary-200/70 dark:text-primary-300">
            {STATUS_LABELS[task.status]}
          </span>
          {task.project ? (
            <span className="rounded bg-primary-100 px-1.5 py-0.5 text-primary-500 dark:bg-primary-200/70 dark:text-primary-300">
              {task.project}
            </span>
          ) : null}
          {task.dueDate ? (
            <span className="rounded bg-primary-100 px-1.5 py-0.5 text-primary-500 dark:bg-primary-200/70 dark:text-primary-300">
              Due {formatDate(task.dueDate)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {task.status !== 'in_progress' && task.status !== 'done' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMove(task.id, 'in_progress')
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-primary-500 hover:bg-primary-100 hover:text-ink"
          >
            Start
          </button>
        ) : null}
        {task.status === 'in_progress' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMove(task.id, 'review')
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-primary-500 hover:bg-primary-100 hover:text-ink"
          >
            Review
          </button>
        ) : null}
        {task.status === 'review' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMove(task.id, 'done')
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
          >
            Done
          </button>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task.id)
          }}
          className="rounded p-0.5 text-primary-300 hover:text-red-500"
          title="Delete"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>
    </article>
  )
}

/* Kanban Card */

function KanbanTaskCard({
  task,
  onDelete,
  onSelect,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task
  onDelete: (id: string) => void
  onSelect: (task: Task) => void
  onDragStart: (taskId: string, event: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(task.id, event)}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-pointer rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 transition-colors hover:border-primary-300 dark:bg-primary-100',
        isDragging && 'opacity-50',
      )}
      onClick={() => onSelect(task)}
    >
      <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
            priorityColor(task.priority),
          )}
        >
          {task.priority}
        </span>
        {task.project ? (
          <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[11px] text-primary-500 dark:bg-primary-200/70 dark:text-primary-300">
            {task.project}
          </span>
        ) : null}
      </div>

      {task.dueDate ? (
        <p className="mt-1 text-[11px] text-primary-400">Due {formatDate(task.dueDate)}</p>
      ) : null}

      <div className="mt-2 flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task.id)
          }}
          className="rounded p-0.5 text-primary-300 hover:text-red-500"
          title="Delete"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>
    </article>
  )
}

/* Task Detail Panel */

function TaskDetailPanel({
  task,
  onClose,
  onMove,
  onUpdate,
}: {
  task: Task
  onClose: () => void
  onMove: (id: string, status: TaskStatus) => void
  onUpdate: (
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>,
  ) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDesc, setEditDesc] = useState(task.description)

  const handleSave = () => {
    onUpdate(task.id, { title: editTitle.trim(), description: editDesc.trim() })
    setEditing(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-2xl dark:bg-primary-100"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          {editing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-primary-400"
              autoFocus
            />
          ) : (
            <h2 className="flex-1 text-sm font-semibold text-ink">{task.title}</h2>
          )}
          <span className="shrink-0 text-[11px] text-primary-400 tabular-nums">
            {task.id}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium',
              priorityColor(task.priority),
            )}
          >
            {task.priority}
          </span>
          <span className="flex items-center gap-1 rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-600">
            <span className={cn('size-1.5 rounded-full', statusDotColor(task.status))} />
            {STATUS_LABELS[task.status]}
          </span>
          {task.project ? (
            <span className="rounded bg-primary-100 px-2 py-0.5 text-[11px] text-primary-500">
              {task.project}
            </span>
          ) : null}
        </div>

        {editing ? (
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={4}
            className="mb-4 w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[13px] text-ink outline-none focus:border-primary-400"
          />
        ) : (
          <p className="mb-4 whitespace-pre-wrap text-[13px] text-primary-600">
            {task.description || 'No description'}
          </p>
        )}

        <div className="mb-4 flex gap-2 text-[11px] text-primary-400">
          <span>Created {formatDate(task.createdAt)}</span>
          <span>·</span>
          <span>Updated {formatDate(task.updatedAt)}</span>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {STATUS_ORDER.filter((s) => s !== task.status).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onMove(task.id, s)}
              className="rounded-lg border border-primary-200 px-2.5 py-1 text-[11px] font-medium text-primary-600 transition-colors hover:border-primary-300 hover:text-ink"
            >
              Move to {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-primary-500 hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-accent-500 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-500/90"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-primary-500 hover:text-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-accent-500 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-500/90"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* Main Screen */

export function TasksScreen() {
  const { tasks, addTask, moveTask, updateTask, deleteTask, syncFromApi } =
    useTaskStore()
  const [showAdd, setShowAdd] = useState(false)
  const [addStatus, setAddStatus] = useState<TaskStatus>('backlog')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [viewMode, setViewMode] = useState<TaskViewMode>('list')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)

  useEffect(() => {
    void syncFromApi()
  }, [syncFromApi])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedMode = window.localStorage.getItem(TASK_VIEW_STORAGE_KEY)
    if (savedMode === 'list' || savedMode === 'kanban') {
      setViewMode(savedMode)
    }
  }, [])

  const setAndPersistViewMode = useCallback((mode: TaskViewMode) => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TASK_VIEW_STORAGE_KEY, mode)
    }
  }, [])

  const handleOpenAddTask = useCallback((status: TaskStatus = 'backlog') => {
    setAddStatus(status)
    setShowAdd(true)
  }, [])

  const handleAddTask = useCallback(
    (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
      void addTask(task).catch((error) => {
        toast(error instanceof Error ? error.message : 'Failed to create task', {
          type: 'error',
        })
      })
    },
    [addTask],
  )

  const handleMoveTask = useCallback(
    (id: string, status: TaskStatus) => {
      void moveTask(id, status).catch((error) => {
        toast(error instanceof Error ? error.message : 'Failed to move task', {
          type: 'error',
        })
      })
    },
    [moveTask],
  )

  const handleUpdateTask = useCallback(
    (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
      void updateTask(id, updates).catch((error) => {
        toast(error instanceof Error ? error.message : 'Failed to update task', {
          type: 'error',
        })
      })
    },
    [updateTask],
  )

  const handleDeleteTask = useCallback(
    (id: string) => {
      void deleteTask(id).catch((error) => {
        toast(error instanceof Error ? error.message : 'Failed to delete task', {
          type: 'error',
        })
      })
    },
    [deleteTask],
  )

  const filteredTasks = useMemo(
    () =>
      tasks
        .filter((task) => (statusFilter === 'all' ? true : task.status === statusFilter))
        .filter((task) =>
          priorityFilter === 'all' ? true : task.priority === priorityFilter,
        )
        .sort((a, b) => {
          const pOrder = ['P0', 'P1', 'P2', 'P3']
          const priorityDiff = pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority)
          if (priorityDiff !== 0) return priorityDiff
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
        }),
    [tasks, statusFilter, priorityFilter],
  )

  const columns = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        label: STATUS_LABELS[status],
        tasks: tasks
          .filter((task) => task.status === status)
          .sort((a, b) => {
            const pOrder = ['P0', 'P1', 'P2', 'P3']
            return pOrder.indexOf(a.priority) - pOrder.indexOf(b.priority)
          }),
      })),
    [tasks],
  )

  const handleDragStart = useCallback(
    (taskId: string, event: React.DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', taskId)
      setDraggingTaskId(taskId)
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null)
    setDragOverStatus(null)
  }, [])

  const handleDropOnColumn = useCallback(
    (status: TaskStatus, event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      const droppedTaskId =
        event.dataTransfer.getData('text/plain') || draggingTaskId
      const droppedTask = tasks.find((task) => task.id === droppedTaskId)

      if (droppedTaskId && droppedTask && droppedTask.status !== status) {
        handleMoveTask(droppedTaskId, status)
      }

      setDraggingTaskId(null)
      setDragOverStatus(null)
    },
    [draggingTaskId, handleMoveTask, tasks],
  )

  return (
    <main className="min-h-full bg-surface px-4 pt-5 pb-24 md:px-6 md:pt-8 text-primary-900 dark:text-neutral-100">
      <section className="mx-auto w-full max-w-[1200px]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60 md:mb-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-semibold text-primary-900 dark:text-neutral-100">Tasks</h1>
              <p className="text-xs text-primary-500 dark:text-neutral-400">
                {tasks.filter((task) => task.status !== 'done').length} active ·{' '}
                {tasks.filter((task) => task.status === 'done').length} completed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-primary-200 bg-primary-50 p-0.5 dark:bg-primary-100">
              <button
                type="button"
                onClick={() => setAndPersistViewMode('list')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                  viewMode === 'list'
                    ? 'bg-primary-900 text-primary-50 dark:bg-primary-200 dark:text-primary-900'
                    : 'text-primary-500 hover:text-ink',
                )}
              >
                ≡ List
              </button>
              <button
                type="button"
                onClick={() => setAndPersistViewMode('kanban')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                  viewMode === 'kanban'
                    ? 'bg-primary-900 text-primary-50 dark:bg-primary-200 dark:text-primary-900'
                    : 'text-primary-500 hover:text-ink',
                )}
              >
                ⊞ Kanban
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleOpenAddTask('backlog')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-500/90 md:text-[13px]"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
              New Task
            </button>
          </div>
        </header>

        {viewMode === 'list' ? (
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-[11px] text-ink outline-none dark:bg-primary-100"
              >
                <option value="all">All Statuses</option>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>

              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as PriorityFilter)
                }
                className="rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-[11px] text-ink outline-none dark:bg-primary-100"
              >
                <option value="all">All Priorities</option>
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-primary-200 py-10 text-center text-[11px] text-primary-400">
                  No tasks match current filters
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <ListTaskItem
                    key={task.id}
                    task={task}
                    onMove={handleMoveTask}
                    onDelete={handleDeleteTask}
                    onSelect={setSelectedTask}
                  />
                ))
              )}
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {columns.map((column) => (
              <section
                key={column.status}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOverStatus(column.status)
                }}
                onDragEnter={() => setDragOverStatus(column.status)}
                onDragLeave={(event) => {
                  const relatedNode = event.relatedTarget as Node | null
                  if (!event.currentTarget.contains(relatedNode)) {
                    setDragOverStatus(null)
                  }
                }}
                onDrop={(event) => handleDropOnColumn(column.status, event)}
                className={cn(
                  'flex min-h-[320px] flex-col rounded-xl border border-primary-200 bg-primary-50/60 p-3 dark:bg-primary-100/60',
                  dragOverStatus === column.status && [
                    'border-2',
                    statusColumnAccent(column.status),
                  ],
                )}
              >
                <header className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        statusDotColor(column.status),
                      )}
                    />
                    <h2 className="text-[13px] font-medium text-ink">{column.label}</h2>
                  </div>
                  <span className="rounded-full border border-primary-200 bg-primary-50/80 px-2 py-0.5 text-[11px] font-medium text-primary-600 tabular-nums dark:bg-primary-100">
                    {column.tasks.length}
                  </span>
                </header>

                <div className="flex-1 space-y-2 overflow-y-auto">
                  {column.tasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-primary-200 py-8 text-center text-[11px] text-primary-400">
                      Drop tasks here
                    </div>
                  ) : (
                    column.tasks.map((task) => (
                      <KanbanTaskCard
                        key={task.id}
                        task={task}
                        onDelete={handleDeleteTask}
                        onSelect={setSelectedTask}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        isDragging={draggingTaskId === task.id}
                      />
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddTask(column.status)}
                  className="mt-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-[11px] font-medium text-accent-500 transition-colors hover:border-accent-500/40 hover:bg-accent-500/10 dark:bg-primary-100"
                >
                  + Add
                </button>
              </section>
            ))}
          </div>
        )}
      </section>

      {showAdd ? (
        <AddTaskDialog
          onAdd={handleAddTask}
          onClose={() => setShowAdd(false)}
          initialStatus={addStatus}
        />
      ) : null}

      {selectedTask ? (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onMove={(id, status) => {
            handleMoveTask(id, status)
            setSelectedTask(null)
          }}
          onUpdate={handleUpdateTask}
        />
      ) : null}
    </main>
  )
}
