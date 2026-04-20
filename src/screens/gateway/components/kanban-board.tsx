import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HubTask, TaskStatus, TaskPriority } from './task-board'
import { useTaskStore, type Task as StoreTask, type TaskStatus as StoreTaskStatus } from '@/stores/task-store'
import { addApproval } from '../lib/approvals-store'

type AgentOption = { id: string; name: string }

type KanbanColumnStatus = 'backlog' | 'in_progress' | 'review' | 'done'

type KanbanColumn = {
  key: KanbanColumnStatus
  label: string
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

const COMPACT_COLUMNS: KanbanColumn[] = [
  { key: 'backlog', label: 'Todo' },
  { key: 'in_progress', label: 'WIP' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
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
  return DEFAULT_COLUMNS.some((column) => column.key === value)
}

function mapTaskStatusToColumn(status: TaskStatus): KanbanColumnStatus {
  if (isKanbanColumnStatus(status as string)) return status as unknown as KanbanColumnStatus
  if (status === 'inbox') return 'backlog'
  if (status === 'assigned') return 'in_progress'
  return status === 'done' ? 'done' : status
}

function mapColumnToTaskStatus(status: KanbanColumnStatus): TaskStatus {
  if (status === 'backlog') return 'inbox'
  return status as unknown as TaskStatus
}

function mapColumnToStoreTaskStatus(status: KanbanColumnStatus): StoreTaskStatus {
  return status
}

function mapStoreTaskPriority(priority: StoreTask['priority']): TaskPriority {
  if (priority === 'P0') return 'urgent'
  if (priority === 'P1') return 'high'
  if (priority === 'P2') return 'normal'
  return 'low'
}

function mapStoreTaskToHubTask(task: StoreTask): HubTask {
  const createdAt = Number.isFinite(Date.parse(task.createdAt)) ? Date.parse(task.createdAt) : Date.now()
  const updatedAt = Number.isFinite(Date.parse(task.updatedAt)) ? Date.parse(task.updatedAt) : createdAt
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status as unknown as TaskStatus,
    priority: mapStoreTaskPriority(task.priority),
    agentId: task.assignedAgent,
    missionId: task.missionId,
    createdAt,
    updatedAt,
  }
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

function truncateCompactTitle(title: string): string {
  if (title.length <= 40) return title
  return `${title.slice(0, 37).trimEnd()}...`
}

export type KanbanBoardProps = {
  tasks: HubTask[]
  onUpdateTask: (task: HubTask) => void
  onDeleteTask: (taskId: string) => void
  agents: AgentOption[]
  missionId?: string
  onAssignAgent?: (taskId: string, agentId: string) => void
  compact?: boolean
}

export function KanbanBoard({
  tasks,
  onUpdateTask,
  onDeleteTask,
  agents,
  missionId,
  onAssignAgent,
  compact = false,
}: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<KanbanColumnStatus | null>(null)
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [noteDraft, setNoteDraft] = useState('')
  const columns = compact ? COMPACT_COLUMNS : DEFAULT_COLUMNS
  const updateTaskStatus = useTaskStore((state) => state.updateTaskStatus)
  const allStoreTasks = useTaskStore((state) => state.tasks)
  const missionTasks = useMemo(() => {
    if (!missionId) return []
    return allStoreTasks.filter((t) => t.missionId === missionId)
  }, [allStoreTasks, missionId])

  const mergedTasks = useMemo(() => {
    if (!missionId) return tasks

    const merged = new Map<string, HubTask>()
    tasks.forEach((task) => merged.set(task.id, task))
    missionTasks.forEach((task) => {
      merged.set(task.id, mapStoreTaskToHubTask(task))
    })

    return Array.from(merged.values())
  }, [missionId, missionTasks, tasks])

  const agentNameById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])

  const tasksByColumn = useMemo(() => {
    const grouped: Record<KanbanColumnStatus, HubTask[]> = {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
    }

    mergedTasks.forEach((task) => {
      const key = mapTaskStatusToColumn(task.status)
      grouped[key].push(task)
    })

    ;(Object.keys(grouped) as KanbanColumnStatus[]).forEach((status) => {
      grouped[status].sort((left, right) => right.updatedAt - left.updatedAt)
    })

    return grouped
  }, [mergedTasks])

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
    const task = mergedTasks.find((entry) => entry.id === taskId)
    if (!task) return
    onUpdateTask(updater(task))
  }

  function moveTask(taskId: string, nextColumn: KanbanColumnStatus) {
    const nextStoreStatus = mapColumnToStoreTaskStatus(nextColumn)
    updateTask(taskId, (task) => ({
      ...task,
      status: mapColumnToTaskStatus(nextColumn),
      updatedAt: Date.now(),
    }))
    updateTaskStatus(taskId, nextStoreStatus)

    // Review gate: when a task is moved to Review, create a pending approval entry
    if (nextColumn === 'review') {
      const task = mergedTasks.find((t) => t.id === taskId)
      if (task) {
        const agentName = task.agentId ? (agentNameById.get(task.agentId) ?? task.agentId) : 'Unassigned'
        addApproval({
          agentId: task.agentId ?? 'unassigned',
          agentName,
          action: `Review task: ${task.title}`,
          context: task.description || `Task "${task.title}" has been moved to Review and is awaiting approval.`,
          source: 'agent',
        })
      }
    }
  }

  return (
    <div className="h-full min-h-0 bg-[var(--theme-bg)]">
      <div className="h-full min-h-0 overflow-x-auto pb-2">
        <div className="grid min-h-full w-full min-w-[52rem] grid-cols-4 gap-3 px-3 py-3 lg:min-w-0">
          {columns.map((column) => {
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
                        className={cn(
                          'cursor-grab rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] active:cursor-grabbing',
                          compact ? 'p-2' : 'p-3',
                        )}
                      >
                        <h4
                          title={task.title}
                          className={cn(
                            'font-semibold text-[var(--theme-text)]',
                            compact ? 'truncate text-[12px] leading-4' : 'line-clamp-2 text-sm',
                          )}
                        >
                          {compact ? truncateCompactTitle(task.title) : task.title}
                        </h4>

                        <div className={cn('flex items-center justify-between gap-2', compact ? 'mt-1.5' : 'mt-2')}>
                          <span
                            className={cn(
                              'rounded-full border font-semibold uppercase tracking-wide',
                              PRIORITY_BADGES[task.priority],
                              compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
                            )}
                          >
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                          <span className={cn('truncate text-[var(--theme-muted)]', compact ? 'max-w-[84px] text-[10px]' : 'text-[11px]')}>
                            {assignee}
                          </span>
                        </div>

                        {onAssignAgent ? (
                          <div className={cn(compact ? 'mt-1.5' : 'mt-2')}>
                            <label className={cn('mb-1 block font-medium uppercase tracking-wide text-[var(--theme-muted)]', compact ? 'text-[9px]' : 'text-[10px]')}>Assign</label>
                            <select
                              value={task.agentId ?? ''}
                              onChange={(event) => {
                                const nextAgentId = event.target.value
                                if (!nextAgentId) return
                                onAssignAgent(task.id, nextAgentId)
                                updateTask(task.id, (currentTask) => ({
                                  ...currentTask,
                                  agentId: nextAgentId,
                                  updatedAt: Date.now(),
                                }))
                              }}
                              className={cn(
                                'w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 text-[var(--theme-text)] outline-none',
                                compact ? 'py-1 text-[10px]' : 'py-1 text-[11px]',
                              )}
                            >
                              <option value="">Unassigned</option>
                              {agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        <p className={cn('text-[var(--theme-muted)]', compact ? 'mt-1.5 text-[10px]' : 'mt-2 text-[11px]')}>
                          {formatTimeInColumn(task.updatedAt)}
                        </p>
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
