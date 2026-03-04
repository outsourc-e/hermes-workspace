import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HubTask, TaskStatus, TaskPriority } from './task-board'

type AgentOption = { id: string; name: string }

type KanbanColumnStatus = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

type KanbanColumn = {
  key: KanbanColumnStatus
  label: string
}

const COLUMNS: KanbanColumn[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'Todo' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
]

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
}

const PRIORITY_BADGES: Record<TaskPriority, string> = {
  urgent: 'bg-red-500/15 text-red-300 border-red-400/40',
  high: 'bg-orange-500/15 text-orange-300 border-orange-400/40',
  normal: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
}

function isKanbanColumnStatus(value: string): value is KanbanColumnStatus {
  return COLUMNS.some((column) => column.key === value)
}

function mapTaskStatusToColumn(status: TaskStatus): KanbanColumnStatus {
  if (isKanbanColumnStatus(status as string)) return status as unknown as KanbanColumnStatus
  if (status === 'inbox') return 'backlog'
  if (status === 'assigned') return 'todo'
  if (status === 'review') return 'blocked'
  return status === 'done' ? 'done' : 'in_progress'
}

function mapColumnToTaskStatus(status: KanbanColumnStatus): TaskStatus {
  if (status === 'backlog') return 'inbox'
  if (status === 'todo') return 'assigned'
  if (status === 'blocked') return 'review'
  if (status === 'cancelled') return 'done'
  return status as unknown as TaskStatus
}

function formatTimeInColumn(updatedAt: number): string {
  const elapsedMs = Math.max(0, Date.now() - updatedAt)
  const totalMinutes = Math.floor(elapsedMs / 60000)
  if (totalMinutes < 1) return 'Just now'
  if (totalMinutes < 60) return `${totalMinutes}m in column`
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 24) {
    const minutes = totalMinutes % 60
    return minutes > 0 ? `${hours}h ${minutes}m in column` : `${hours}h in column`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h in column` : `${days}d in column`
}

function appendNote(description: string, note: string): string {
  const trimmedNote = note.trim()
  if (!trimmedNote) return description
  const timestamp = new Date().toLocaleString()
  const entry = `[Note ${timestamp}] ${trimmedNote}`
  return description.trim() ? `${description.trim()}\n\n${entry}` : entry
}

export type KanbanBoardProps = {
  tasks: HubTask[]
  onUpdateTask: (task: HubTask) => void
  onDeleteTask: (taskId: string) => void
  agents: AgentOption[]
}

export function KanbanBoard({ tasks, onUpdateTask, onDeleteTask, agents }: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<KanbanColumnStatus | null>(null)
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [noteDraft, setNoteDraft] = useState('')

  const agentNameById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])

  const tasksByColumn = useMemo(() => {
    const grouped: Record<KanbanColumnStatus, HubTask[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    }

    tasks.forEach((task) => {
      const key = mapTaskStatusToColumn(task.status)
      grouped[key].push(task)
    })

    ;(Object.keys(grouped) as KanbanColumnStatus[]).forEach((status) => {
      grouped[status].sort((left, right) => right.updatedAt - left.updatedAt)
    })

    return grouped
  }, [tasks])

  useEffect(() => {
    function handleCloseMenu() {
      setMenuTaskId(null)
      setNoteDraft('')
    }

    if (!menuTaskId) return
    window.addEventListener('click', handleCloseMenu)
    return () => window.removeEventListener('click', handleCloseMenu)
  }, [menuTaskId])

  function updateTask(taskId: string, updater: (task: HubTask) => HubTask) {
    const task = tasks.find((entry) => entry.id === taskId)
    if (!task) return
    onUpdateTask(updater(task))
  }

  function moveTask(taskId: string, nextColumn: KanbanColumnStatus) {
    updateTask(taskId, (task) => ({
      ...task,
      status: mapColumnToTaskStatus(nextColumn),
      updatedAt: Date.now(),
    }))
  }

  return (
    <div className="h-full min-h-0 bg-[var(--theme-bg)]">
      <div className="h-full min-h-0 overflow-x-auto pb-2">
        <div className="grid min-h-full w-full min-w-[72rem] grid-cols-6 gap-3 px-3 py-3 lg:min-w-0">
          {COLUMNS.map((column) => {
            const columnTasks = tasksByColumn[column.key]

            return (
              <section
                key={column.key}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragOverColumn !== column.key) setDragOverColumn(column.key)
                }}
                onDragLeave={() => {
                  if (dragOverColumn === column.key) setDragOverColumn(null)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId
                  if (taskId) moveTask(taskId, column.key)
                  setDraggedTaskId(null)
                  setDragOverColumn(null)
                }}
                className={cn(
                  'flex min-h-0 min-w-0 flex-col rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]',
                  'max-h-[calc(100vh-15rem)] lg:max-h-[calc(100vh-13rem)]',
                  dragOverColumn === column.key && 'border-orange-400/70 bg-[var(--theme-card2)]',
                )}
              >
                <header className="flex items-center justify-between border-b border-[var(--theme-border)] px-3 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text)]">
                    {column.label}
                  </h3>
                  <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 text-[11px] font-medium text-[var(--theme-muted)]">
                    {columnTasks.length}
                  </span>
                </header>

                <div className="min-h-[12rem] flex-1 space-y-2 overflow-y-auto p-2.5">
                  {columnTasks.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[var(--theme-border)] px-3 py-6 text-center text-xs text-[var(--theme-muted)]">
                      Drop tasks here
                    </p>
                  ) : null}

                  {columnTasks.map((task) => {
                    const assignee = task.agentId ? agentNameById.get(task.agentId) ?? task.agentId : 'Unassigned'

                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(event) => {
                          setDraggedTaskId(task.id)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', task.id)
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId(null)
                          setDragOverColumn(null)
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setMenuTaskId(task.id)
                          setMenuPosition({ x: event.clientX, y: event.clientY })
                          setNoteDraft('')
                        }}
                        className="cursor-grab rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3 active:cursor-grabbing"
                      >
                        <h4 className="line-clamp-2 text-sm font-semibold text-[var(--theme-text)]">{task.title}</h4>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', PRIORITY_BADGES[task.priority])}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                          <span className="truncate text-[11px] text-[var(--theme-muted)]">{assignee}</span>
                        </div>

                        <p className="mt-2 text-[11px] text-[var(--theme-muted)]">{formatTimeInColumn(task.updatedAt)}</p>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {menuTaskId ? (
        <div
          className="fixed z-50 w-64 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 shadow-2xl"
          style={{
            left: `${Math.max(8, Math.min(menuPosition.x, window.innerWidth - 272))}px`,
            top: `${Math.max(8, Math.min(menuPosition.y, window.innerHeight - 260))}px`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-muted)]">Task Actions</p>

          <label className="mb-1 block text-[11px] text-[var(--theme-muted)]">Change priority</label>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => {
                  updateTask(menuTaskId, (task) => ({ ...task, priority, updatedAt: Date.now() }))
                  setMenuTaskId(null)
                }}
                className={cn('rounded-md border px-2 py-1 text-left text-[11px] font-medium transition-colors', PRIORITY_BADGES[priority], 'hover:brightness-110')}
              >
                {PRIORITY_LABELS[priority]}
              </button>
            ))}
          </div>

          <label className="mb-1 block text-[11px] text-[var(--theme-muted)]">Reassign agent</label>
          <select
            className="mb-3 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-1.5 text-xs text-[var(--theme-text)] outline-none"
            defaultValue=""
            onChange={(event) => {
              const nextAgentId = event.target.value
              updateTask(menuTaskId, (task) => ({
                ...task,
                agentId: nextAgentId || undefined,
                updatedAt: Date.now(),
              }))
              setMenuTaskId(null)
            }}
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <label className="mb-1 block text-[11px] text-[var(--theme-muted)]">Add note</label>
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={3}
            className="mb-2 w-full resize-none rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-1.5 text-xs text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)]"
            placeholder="Leave a note for this task"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onDeleteTask(menuTaskId)
                setMenuTaskId(null)
              }}
              className="rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/20"
            >
              Delete
            </button>
            <button
              type="button"
              disabled={!noteDraft.trim()}
              onClick={() => {
                updateTask(menuTaskId, (task) => ({
                  ...task,
                  description: appendNote(task.description, noteDraft),
                  updatedAt: Date.now(),
                }))
                setMenuTaskId(null)
                setNoteDraft('')
              }}
              className="rounded-md bg-accent-500 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save note
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
