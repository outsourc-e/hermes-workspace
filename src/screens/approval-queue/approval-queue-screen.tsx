'use client'

import { useCallback, useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  RefreshIcon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  COLUMN_COLORS,
  COLUMN_LABELS,
  fetchTasks,
  isOverdue,
  moveTask,
  PRIORITY_COLORS,
  type ClaudeTask,
  type TaskPriority,
} from '@/lib/tasks-api'

const QUERY_KEY = ['claude', 'tasks'] as const

type NotionApprovalTask = ClaudeTask & { notionRecordUrl?: string }

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

function ApprovalTaskCard({
  task,
  section,
  onApprove,
  onReject,
  isPending,
}: {
  task: NotionApprovalTask
  section: 'review' | 'blocked' | 'overdue'
  onApprove: (task: NotionApprovalTask) => void
  onReject: (task: NotionApprovalTask) => void
  isPending: boolean
}) {
  const overdue = isOverdue(task)
  const priorityColor = PRIORITY_COLORS[task.priority]

  const dueDateLabel = task.due_date
    ? (() => {
        const [y, m, d] = task.due_date.split('-').map(Number)
        return new Date(y, m - 1, d).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      })()
    : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'rounded-xl border bg-[var(--theme-card)] p-4 transition-all',
        'border-[var(--theme-border)] hover:border-[var(--theme-accent)]',
        'hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)]',
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: priorityColor }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: priorityColor }}
              title={`Priority: ${task.priority}`}
            />
            <h3 className="text-sm font-medium text-[var(--theme-text)] truncate">
              {task.title}
            </h3>
          </div>

          {task.description && (
            <p className="text-xs text-[var(--theme-muted)] line-clamp-2 mb-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* Column badge */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{
                background: `${COLUMN_COLORS[task.column]}20`,
                color: COLUMN_COLORS[task.column],
              }}
            >
              {COLUMN_LABELS[task.column]}
            </span>

            {/* Assignee */}
            {task.assignee && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--theme-hover)] text-[var(--theme-muted)]">
                {task.assignee}
              </span>
            )}

            {/* Tags */}
            {task.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--theme-hover)] text-[var(--theme-muted)]"
              >
                {tag}
              </span>
            ))}

            {/* Due date */}
            {dueDateLabel && (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  overdue ? 'text-red-400 font-semibold' : 'text-[var(--theme-muted)]',
                )}
              >
                {overdue && '⚠ '}
                {dueDateLabel}
              </span>
            )}

            {task.notionRecordUrl && (
              <a
                href={task.notionRecordUrl}
                className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
              >
                <HugeiconsIcon icon={LinkSquare02Icon} size={12} />
                View record
              </a>
            )}
          </div>
        </div>

        {/* Approve / Reject actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onApprove(task)}
            disabled={isPending}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
              'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="Approve — move to Done"
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
            Approve
          </button>
          <button
            onClick={() => onReject(task)}
            disabled={isPending}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
              'bg-red-500/15 text-red-400 hover:bg-red-500/25',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="Reject — move back to Ready"
          >
            <HugeiconsIcon icon={CancelCircleIcon} size={14} />
            Reject
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function SectionHeader({
  icon,
  iconColor,
  title,
  count,
  isEmpty,
}: {
  icon: typeof Clock01Icon
  iconColor: string
  title: string
  count: number
  isEmpty: boolean
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <HugeiconsIcon icon={icon} size={18} style={{ color: iconColor }} />
      <h2 className="text-sm font-semibold text-[var(--theme-text)]">{title}</h2>
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded-md',
          isEmpty
            ? 'bg-[var(--theme-hover)] text-[var(--theme-muted)]'
            : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]',
        )}
      >
        {count}
      </span>
    </div>
  )
}

export function ApprovalQueueScreen() {
  const queryClient = useQueryClient()

  const tasksQuery = useQuery({
    queryKey: [...QUERY_KEY, 'approval-queue'],
    queryFn: () => fetchTasks({ include_done: true }),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })

  // Fetch Notion Human Approval Queue items
  const notionApprovalsQuery = useQuery({
    queryKey: ['notion', 'approvals'],
    queryFn: async () => {
      const res = await fetch('/api/notion/approvals')
      if (!res.ok) throw new Error('Failed to fetch Notion approvals')
      return res.json() as Promise<{
        items: Array<{
          id: string
          title: string
          category: string
          priority: string
          status: string
          requester: string
          description: string
          dueDate: string
          relatedLeadIds: string[]
          relatedDealIds: string[]
          recordUrl: string
        }>
      }>
    },
    staleTime: 60_000,
  })

  const tasks = tasksQuery.data ?? []

  // Merge Notion approval items into task list as ClaudeTask-shaped entries
  const notionTasks = useMemo<NotionApprovalTask[]>(() => {
    const items = notionApprovalsQuery.data?.items ?? []
    return items.map((item) => ({
      id: `notion-${item.id}`,
      title: item.title,
      description: item.description || `${item.category} — Requested by ${item.requester}`,
      column: 'review' as const,
      priority: (item.priority.toLowerCase() === 'high' ? 'high' : item.priority.toLowerCase() === 'low' ? 'low' : 'medium') as TaskPriority,
      assignee: item.requester || null,
      tags: ['notion', item.category],
      due_date: item.dueDate || null,
      position: 0,
      created_by: item.requester,
      created_at: item.dueDate || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_id: null,
      notionRecordUrl: item.recordUrl,
    }))
  }, [notionApprovalsQuery.data])

  // Combine Hermes tasks + Notion approval tasks
  const allTasks = useMemo(() => [...tasks, ...notionTasks], [tasks, notionTasks])

  // Pending Review: tasks in 'review' column (includes Notion approvals), sorted by priority then due date
  const pendingReview = useMemo(() => {
    return allTasks
      .filter((t) => t.column === 'review')
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 1
        const pb = PRIORITY_ORDER[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date) return -1
        if (b.due_date) return 1
        return 0
      })
  }, [allTasks])

  // Blocked: tasks in 'blocked' column
  const blockedItems = useMemo(() => {
    return allTasks
      .filter((t) => t.column === 'blocked')
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 1
        const pb = PRIORITY_ORDER[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        return 0
      })
  }, [allTasks])

  // Overdue: all overdue tasks not in 'done' column
  const overdueItems = useMemo(() => {
    return allTasks
      .filter((t) => isOverdue(t) && t.column !== 'done')
      .sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date) return -1
        if (b.due_date) return 1
        return 0
      })
  }, [allTasks])

  const totalItems = pendingReview.length + blockedItems.length + overdueItems.length

  const isNotionTask = (id: string) => id.startsWith('notion-')

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['notion', 'approvals'] })
  }, [queryClient])

  const approveMutation = useMutation({
    mutationFn: (task: ClaudeTask) => {
      if (isNotionTask(task.id)) return Promise.resolve()
      return moveTask(task.id, 'done', 'user').then(() => undefined)
    },
    onSuccess: (_, task) => {
      invalidate()
      if (isNotionTask(task.id)) {
        toast(`Notion item "${task.title}" noted as approved — complete it in Notion`, { type: 'info' })
      } else {
        toast(`Approved: ${task.title}`, { type: 'success' })
      }
    },
    onError: (e, task) => {
      toast(e instanceof Error ? e.message : `Failed to approve: ${task.title}`, { type: 'error' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (task: ClaudeTask) => {
      if (isNotionTask(task.id)) return Promise.resolve()
      return moveTask(task.id, 'todo', 'user').then(() => undefined)
    },
    onSuccess: (_, task) => {
      invalidate()
      if (isNotionTask(task.id)) {
        toast(`Notion item "${task.title}" noted as rejected — handle in Notion`, { type: 'info' })
      } else {
        toast(`Rejected: ${task.title}`, { type: 'warning' })
      }
    },
    onError: (e, task) => {
      toast(e instanceof Error ? e.message : `Failed to reject: ${task.title}`, { type: 'error' })
    },
  })

  const isMutating = approveMutation.isPending || rejectMutation.isPending

  return (
    <div className="min-h-full overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        {/* Header */}
        <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl font-medium text-[var(--theme-text)]">Approval Queue</h1>
              <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
                <span>{totalItems} items need attention</span>
                {notionApprovalsQuery.data && notionApprovalsQuery.data.items.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-green-400">{notionApprovalsQuery.data.items.length} from Notion</span>
                  </>
                )}
                {pendingReview.length > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: COLUMN_COLORS.review }}>{pendingReview.length} in review</span>
                  </>
                )}
                {blockedItems.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-red-400">{blockedItems.length} blocked</span>
                  </>
                )}
                {overdueItems.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-red-400">{overdueItems.length} overdue</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={invalidate}
              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)]"
              title="Refresh"
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                size={16}
                className={cn(
                  'text-[var(--theme-muted)]',
                  tasksQuery.isFetching && 'animate-spin',
                )}
              />
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--theme-muted)]">
            Review and approve or reject tasks that need your attention. Includes items from Notion Human Approval Queue.
          </p>
        </header>

        {/* Loading state */}
        {tasksQuery.isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <HugeiconsIcon icon={Clock01Icon} size={32} className="text-[var(--theme-muted)] animate-pulse" />
            <p className="text-sm text-[var(--theme-muted)]">Loading approval queue…</p>
          </div>
        )}

        {/* Error state */}
        {tasksQuery.isError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-3"
          >
            <HugeiconsIcon icon={AlertCircleIcon} size={32} className="text-red-400" />
            <p className="text-sm text-red-400 font-medium">Failed to load approval queue</p>
            <button
              onClick={() => tasksQuery.refetch()}
              className="text-xs text-[var(--theme-accent)] hover:underline"
            >
              Retry
            </button>
          </motion.div>
        )}

        {/* Content */}
        {tasksQuery.data && (
          <>
            {/* Empty state */}
            {totalItems === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 gap-3"
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={40} className="text-emerald-400" />
                <p className="text-sm font-medium text-[var(--theme-text)]">All clear!</p>
                <p className="text-xs text-[var(--theme-muted)]">
                  No tasks need your approval right now.
                </p>
              </motion.div>
            )}

            {/* Pending Review */}
            {pendingReview.length > 0 && (
              <section>
                <SectionHeader
                  icon={Clock01Icon}
                  iconColor={COLUMN_COLORS.review}
                  title="Pending Review"
                  count={pendingReview.length}
                  isEmpty={false}
                />
                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {pendingReview.map((task) => (
                      <ApprovalTaskCard
                        key={task.id}
                        task={task}
                        section="review"
                        onApprove={(t) => approveMutation.mutate(t)}
                        onReject={(t) => rejectMutation.mutate(t)}
                        isPending={isMutating}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* Blocked Items */}
            {blockedItems.length > 0 && (
              <section>
                <SectionHeader
                  icon={AlertCircleIcon}
                  iconColor={COLUMN_COLORS.blocked}
                  title="Blocked Items"
                  count={blockedItems.length}
                  isEmpty={false}
                />
                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {blockedItems.map((task) => (
                      <ApprovalTaskCard
                        key={task.id}
                        task={task}
                        section="blocked"
                        onApprove={(t) => approveMutation.mutate(t)}
                        onReject={(t) => rejectMutation.mutate(t)}
                        isPending={isMutating}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* Overdue Items */}
            {overdueItems.length > 0 && (
              <section>
                <SectionHeader
                  icon={AlertCircleIcon}
                  iconColor="#ef4444"
                  title="Overdue Items"
                  count={overdueItems.length}
                  isEmpty={false}
                />
                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {overdueItems.map((task) => (
                      <ApprovalTaskCard
                        key={task.id}
                        task={task}
                        section="overdue"
                        onApprove={(t) => approveMutation.mutate(t)}
                        onReject={(t) => rejectMutation.mutate(t)}
                        isPending={isMutating}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
