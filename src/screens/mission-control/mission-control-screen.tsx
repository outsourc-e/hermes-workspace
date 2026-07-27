'use client'

import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
  Chat01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Mail01Icon,
  Rocket01Icon,
  RefreshIcon,
  Target01Icon,
  Time04Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import {
  COLUMN_COLORS,
  COLUMN_LABELS,
  createTask,
  fetchTasks,
  isOverdue,
  type ClaudeTask,
  type TaskColumn,
} from '@/lib/tasks-api'
import { TaskDialog } from '@/screens/tasks/task-dialog'
import { toast } from '@/components/ui/toast'

// ── Query key ──────────────────────────────────────────────────────
const MC_QUERY_KEY = ['mission-control', 'tasks'] as const

// ── Helpers ────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDueDate(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ── Business Overview Strip ─────────────────────────────────────────

function BusinessOverviewStrip({
  tasks,
  isLoading,
}: {
  tasks: ClaudeTask[]
  isLoading: boolean
}) {
  const stats = useMemo(() => {
    const total = tasks.length
    const inProgress = tasks.filter((t) => t.column === 'in_progress').length
    const blocked = tasks.filter((t) => t.column === 'blocked').length
    const overdue = tasks.filter(
      (t) => isOverdue(t) && t.column !== 'done' && t.column !== 'deleted',
    ).length
    const done = tasks.filter((t) => t.column === 'done').length
    const completion = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, inProgress, blocked, overdue, done, completion }
  }, [tasks])

  const cards = [
    {
      label: 'Total',
      value: stats.total,
      icon: CheckListIcon,
      color: 'var(--theme-text)',
    },
    {
      label: 'Running',
      value: stats.inProgress,
      icon: Rocket01Icon,
      color: '#f97316',
    },
    {
      label: 'Blocked',
      value: stats.blocked,
      icon: AlertCircleIcon,
      color: '#ef4444',
    },
    {
      label: 'Overdue',
      value: stats.overdue,
      icon: Time04Icon,
      color: '#ef4444',
    },
    {
      label: 'Complete',
      value: `${stats.completion}%`,
      icon: Target01Icon,
      color: '#22c55e',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="flex items-center gap-3 rounded-xl border p-3"
          style={{
            background: 'var(--theme-card)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: `color-mix(in srgb, ${c.color} 12%, transparent)`,
            }}
          >
            <HugeiconsIcon icon={c.icon} size={16} style={{ color: c.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-[var(--theme-text)]">
              {isLoading ? '…' : c.value}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">
              {c.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function NotionOperationsStrip({
  crmCount,
  outreachCount,
  approvalCount,
  isLoading,
  hasError,
  onOpenSource,
}: {
  crmCount: number
  outreachCount: number
  approvalCount: number
  isLoading: boolean
  hasError: boolean
  onOpenSource: (source: string) => void
}) {
  const cards = [
    {
      label: 'CRM Leads',
      source: 'CRM / Leads',
      value: crmCount,
      icon: Target01Icon,
      color: '#3b82f6',
    },
    {
      label: 'Outreach Touches',
      source: 'Outreach / Interactions',
      value: outreachCount,
      icon: Mail01Icon,
      color: '#f59e0b',
    },
    {
      label: 'Approvals',
      source: 'Human Approval Queue',
      value: approvalCount,
      icon: CheckmarkCircle02Icon,
      color: approvalCount > 0 ? '#f97316' : '#22c55e',
    },
    {
      label: 'Notion Link',
      source: 'CRM / Leads',
      value: hasError ? 'Check' : 'Live',
      icon: Rocket01Icon,
      color: hasError ? '#ef4444' : '#22c55e',
    },
  ]

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text)]">
            Notion Operations
          </h2>
          <p className="text-[11px] text-[var(--theme-muted)]">
            CRM, outreach, and approvals are pulled through the server-side Notion proxy.
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
            hasError
              ? 'border-red-500/50 text-red-400'
              : 'border-green-500/50 text-green-400',
          )}
        >
          {isLoading ? 'Loading' : hasError ? 'Needs check' : 'Live'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            type="button"
            key={card.label}
            onClick={() => onOpenSource(card.source)}
            className="flex items-center gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 text-left transition-colors hover:bg-[var(--theme-hover)]"
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${card.color} 14%, transparent)` }}
            >
              <HugeiconsIcon icon={card.icon} size={15} style={{ color: card.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight text-[var(--theme-text)]">
                {isLoading ? '…' : card.value}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">
                {card.label}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function statusTone(status: string): { label: string; className: string } {
  if (status === 'live') return { label: 'Live', className: 'border-green-500/50 text-green-400' }
  if (status === 'degraded') return { label: 'Degraded', className: 'border-amber-500/50 text-amber-300' }
  if (status === 'blocked') return { label: 'Blocked', className: 'border-red-500/50 text-red-400' }
  return { label: 'Not configured', className: 'border-[var(--theme-border)] text-[var(--theme-muted)]' }
}

function SystemOperationsPanel({
  system,
  isLoading,
  hasError,
}: {
  system: MissionControlSystemSnapshot | undefined
  isLoading: boolean
  hasError: boolean
}) {
  const integrations = system?.integrations ?? []
  const warnings = system?.hermes.modelWarnings ?? []
  const approvals = system?.approvals ?? []

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text)]">
            Live Systems + Security
          </h2>
          <p className="text-[11px] text-[var(--theme-muted)]">
            Local-only snapshot. Secrets are status-only; data is timestamped.
          </p>
        </div>
        <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-[10px] text-[var(--theme-muted)]">
          {isLoading ? 'Refreshing…' : system?.generatedAt ? `Updated ${timeAgo(system.generatedAt)}` : hasError ? 'Needs check' : 'No data'}
        </span>
      </div>

      {hasError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-300">
          Mission Control system snapshot failed. Check the Workspace server logs.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {integrations.map((item) => {
                const tone = statusTone(item.status)
                return (
                  <div key={item.id} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-[var(--theme-text)]">{item.label}</p>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]', tone.className)}>
                        {tone.label}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-[10px] leading-relaxed text-[var(--theme-muted)]">{item.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text)]">Today</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-lg font-semibold text-[var(--theme-text)]">{system?.apple.calendar.todayCount ?? '—'}</p>
                  <p className="text-[var(--theme-muted)]">calendar events</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-[var(--theme-text)]">{system?.apple.reminders.overdueCount ?? '—'}</p>
                  <p className="text-[var(--theme-muted)]">overdue reminders</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text)]">Hermes routing</p>
              <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
                {system?.hermes.version ?? 'Hermes version unavailable'} · {system?.hermes.cron.active ?? 0}/{system?.hermes.cron.total ?? 0} schedules active
              </p>
              {warnings.slice(0, 3).map((warning) => (
                <p key={warning.detail} className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-200">
                  {warning.detail}
                </p>
              ))}
            </div>

            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text)]">Approval gates</p>
              <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
                {approvals.length} consequential action(s) blocked until Ryan approves.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Needs Attention Panel ───────────────────────────────────────────

function NeedsAttentionPanel({
  tasks,
  isLoading,
  onTaskClick,
}: {
  tasks: ClaudeTask[]
  isLoading: boolean
  onTaskClick: (task: ClaudeTask) => void
}) {
  const attentionTasks = useMemo(() => {
    return tasks
      .filter((t) => t.column === 'review' || t.column === 'blocked')
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
      .slice(0, 8)
  }, [tasks])

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 90%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={14}
            strokeWidth={1.5}
            style={{ color: attentionTasks.length > 0 ? 'var(--theme-warning)' : 'var(--theme-success)' }}
          />
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--theme-text)' }}
          >
            Needs Attention
          </h3>
        </div>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{
            background:
              attentionTasks.length > 0
                ? 'color-mix(in srgb, var(--theme-warning) 14%, transparent)'
                : 'color-mix(in srgb, var(--theme-success) 14%, transparent)',
            color:
              attentionTasks.length > 0 ? 'var(--theme-warning)' : 'var(--theme-success)',
          }}
        >
          {isLoading ? '…' : attentionTasks.length}
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-[var(--theme-hover)]"
            />
          ))}
        </div>
      ) : attentionTasks.length === 0 ? (
        <p className="py-2 text-[11px] text-[var(--theme-muted)]">
          Nothing needs attention. All clear.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attentionTasks.map((task) => {
            const overdue = isOverdue(task)
            const colColor = COLUMN_COLORS[task.column]
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className="w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-[var(--theme-hover)]"
                  style={{ borderColor: 'var(--theme-border)' }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: colColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[11px] font-semibold text-[var(--theme-text)]">
                          {task.title}
                        </p>
                        {overdue && (
                          <span className="shrink-0 rounded bg-red-500/15 px-1 py-0.5 text-[9px] font-semibold text-red-400">
                            OVERDUE
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--theme-muted)]">
                        {task.assignee && (
                          <span className="truncate">{task.assignee}</span>
                        )}
                        {task.due_date && (
                          <>
                            {task.assignee && <span>·</span>}
                            <span
                              className={overdue ? 'font-semibold text-red-400' : ''}
                            >
                              {formatDueDate(task.due_date)}
                            </span>
                          </>
                        )}
                        <span
                          className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                          style={{
                            background: `color-mix(in srgb, ${colColor} 14%, transparent)`,
                            color: colColor,
                          }}
                        >
                          {COLUMN_LABELS[task.column]}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Compact Kanban ──────────────────────────────────────────────────

const COMPACT_COLUMNS: TaskColumn[] = ['todo', 'in_progress', 'review']

function CompactKanban({
  tasks,
  isLoading,
  onTaskClick,
}: {
  tasks: ClaudeTask[]
  isLoading: boolean
  onTaskClick: (task: ClaudeTask) => void
}) {
  const tasksByColumn = useMemo(() => {
    const map: Record<TaskColumn, ClaudeTask[]> = {
      todo: [],
      in_progress: [],
      review: [],
      backlog: [],
      blocked: [],
      done: [],
      deleted: [],
    }
    for (const t of tasks) {
      if (map[t.column]) {
        map[t.column].push(t)
      }
    }
    // Sort by position
    for (const col of COMPACT_COLUMNS) {
      map[col].sort((a, b) => a.position - b.position)
    }
    return map
  }, [tasks])

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3"
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={CheckListIcon}
          size={14}
          strokeWidth={1.5}
          style={{ color: 'var(--theme-accent)' }}
        />
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Active Tasks
        </h3>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {COMPACT_COLUMNS.map((col) => (
            <div
              key={col}
              className="flex flex-col gap-1.5 rounded-lg border p-2"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--theme-hover)]" />
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded bg-[var(--theme-hover)]"
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {COMPACT_COLUMNS.map((col) => {
            const colTasks = tasksByColumn[col]
            const colColor = COLUMN_COLORS[col]
            return (
              <div
                key={col}
                className="flex flex-col gap-1.5 rounded-lg border p-2"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colColor }}
                  />
                  <span className="text-[10px] font-semibold text-[var(--theme-text)]">
                    {COLUMN_LABELS[col]}
                  </span>
                  <span className="text-[10px] text-[var(--theme-muted)]">
                    ({colTasks.length})
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {colTasks.length === 0 ? (
                    <p className="py-3 text-center text-[10px] text-[var(--theme-muted)] opacity-60">
                      Empty
                    </p>
                  ) : (
                    colTasks.slice(0, 5).map((task) => {
                      const overdue = isOverdue(task)
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onTaskClick(task)}
                          className="rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-[var(--theme-hover)]"
                          style={{
                            borderColor: 'var(--theme-border)',
                            borderLeftWidth: 2,
                            borderLeftColor: colColor,
                          }}
                        >
                          <p className="truncate text-[11px] font-medium text-[var(--theme-text)]">
                            {task.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {task.assignee && (
                              <span className="text-[9px] text-[var(--theme-muted)]">
                                {task.assignee}
                              </span>
                            )}
                            {task.due_date && (
                              <span
                                className={cn(
                                  'text-[9px]',
                                  overdue ? 'font-semibold text-red-400' : 'text-[var(--theme-muted)]',
                                )}
                              >
                                {formatDueDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                  {colTasks.length > 5 && (
                    <p className="text-center text-[9px] text-[var(--theme-muted)]">
                      +{colTasks.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Quick Actions ───────────────────────────────────────────────────

function QuickActions() {
  const navigate = useNavigate()

  const actions = [
    {
      label: 'New Task',
      icon: Add01Icon,
      onClick: () => {
        // Dispatch a custom event that the task dialog listens for
        // For now, navigate to tasks page
        navigate({ to: '/tasks' })
      },
    },
    {
      label: 'Approvals',
      icon: CheckmarkCircle02Icon,
      onClick: () => navigate({ to: '/approval-queue' }),
    },
    {
      label: 'Outreach Pipeline',
      icon: Mail01Icon,
      onClick: () => navigate({ to: '/outreach' }),
    },
    {
      label: 'New Chat',
      icon: Chat01Icon,
      onClick: () => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } }),
    },
    {
      label: 'View All Tasks',
      icon: ArrowRight01Icon,
      onClick: () => navigate({ to: '/tasks' }),
    },
  ]

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3"
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={Rocket01Icon}
          size={14}
          strokeWidth={1.5}
          style={{ color: 'var(--theme-accent)' }}
        />
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Quick Actions
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--theme-hover)]"
            style={{
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text)',
            }}
          >
            <HugeiconsIcon icon={a.icon} size={14} />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Recent Activity ─────────────────────────────────────────────────

function RecentActivity({
  tasks,
  isLoading,
  onTaskClick,
}: {
  tasks: ClaudeTask[]
  isLoading: boolean
  onTaskClick: (task: ClaudeTask) => void
}) {
  const recentTasks = useMemo(() => {
    return [...tasks]
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
      .slice(0, 10)
  }, [tasks])

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3"
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={Clock01Icon}
          size={14}
          strokeWidth={1.5}
          style={{ color: 'var(--theme-accent)' }}
        />
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Recent Activity
        </h3>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-8 animate-pulse rounded bg-[var(--theme-hover)]"
            />
          ))}
        </div>
      ) : recentTasks.length === 0 ? (
        <p className="py-2 text-[11px] text-[var(--theme-muted)]">
          No recent activity.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {recentTasks.map((task) => {
            const colColor = COLUMN_COLORS[task.column]
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--theme-hover)]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: colColor }}
                  />
                  <p className="min-w-0 flex-1 truncate text-[11px] text-[var(--theme-text)]">
                    {task.title}
                  </p>
                  <span
                    className="shrink-0 rounded px-1 py-0.5 text-[8px] font-medium uppercase"
                    style={{
                      background: `color-mix(in srgb, ${colColor} 14%, transparent)`,
                      color: colColor,
                    }}
                  >
                    {COLUMN_LABELS[task.column]}
                  </span>
                  <span className="shrink-0 text-[9px] text-[var(--theme-muted)]">
                    {timeAgo(task.updated_at)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type MissionControlSummary = {
  ok: boolean
  generatedAt: string
  counts: {
    crmLeads: number
    outreachInteractions: number
    humanApprovals: number
    deals: number
    activeProjects: number
    openTasks: number
    followUpsDue: number
  }
  health: {
    notion: string
    secretBoundary: string
    zoho: string
    reminders: string
  }
}

type MissionControlSystemSnapshot = {
  ok: boolean
  generatedAt: string
  integrations: Array<{ id: string; label: string; status: string; detail: string; lastCheckedAt: string }>
  apple: {
    calendar: { status: string; todayCount: number | null; detail: string; lastCheckedAt: string }
    reminders: { status: string; openCount: number | null; overdueCount: number | null; detail: string; lastCheckedAt: string }
  }
  hermes: {
    version: string | null
    cron: { total: number; active: number; failed: number; nextRunAt: string | null }
    modelWarnings: Array<{ severity: string; detail: string; evidence: string }>
  }
  approvals: Array<{ action: string; reason: string; required: true }>
}

// ── Main Screen ─────────────────────────────────────────────────────

export function MissionControlScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingTask, setEditingTask] = useState<ClaudeTask | null>(null)

  const tasksQuery = useQuery({
    queryKey: MC_QUERY_KEY,
    queryFn: () => fetchTasks({ include_done: true }),
    refetchInterval: 30_000,
  })

  const summaryQuery = useQuery({
    queryKey: ['mission-control', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/mission-control/summary')
      if (!res.ok) throw new Error('Failed to fetch Mission Control summary')
      return res.json() as Promise<MissionControlSummary>
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const systemQuery = useQuery({
    queryKey: ['mission-control', 'system'],
    queryFn: async () => {
      const res = await fetch('/api/mission-control/system')
      if (!res.ok) throw new Error('Failed to fetch Mission Control system snapshot')
      return res.json() as Promise<MissionControlSystemSnapshot>
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const tasks = tasksQuery.data ?? []
  const notionLoading = summaryQuery.isLoading
  const notionHasError = Boolean(summaryQuery.error)
  const crmCount = summaryQuery.data?.counts.crmLeads ?? 0
  const outreachCount = summaryQuery.data?.counts.outreachInteractions ?? 0
  const approvalCount = summaryQuery.data?.counts.humanApprovals ?? 0

  const handleTaskClick = (task: ClaudeTask) => {
    setEditingTask(task)
  }

  const handleCreateTask = async (input: Parameters<typeof createTask>[0]) => {
    try {
      await createTask(input)
      toast('Task created')
      void queryClient.invalidateQueries({ queryKey: MC_QUERY_KEY })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create task', { type: 'error' })
    }
  }

  return (
    <div className="min-h-full overflow-y-auto bg-[var(--theme-bg)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 20%, transparent), color-mix(in srgb, var(--theme-accent) 8%, transparent))',
              }}
            >
              <HugeiconsIcon
                icon={Target01Icon}
                size={20}
                strokeWidth={1.5}
                style={{ color: 'var(--theme-accent)' }}
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--theme-text)]">
                Mission Control
              </h1>
              <p className="text-xs text-[var(--theme-muted)]">
                SEO / AEO Business Command Center
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => tasksQuery.refetch()}
            className="rounded-lg p-2 transition-colors hover:bg-[var(--theme-hover)]"
            title="Refresh"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              size={16}
              className="text-[var(--theme-muted)]"
            />
          </button>
        </header>

        {/* 1. Business Overview Strip */}
        <BusinessOverviewStrip tasks={tasks} isLoading={tasksQuery.isLoading} />

        {/* 1b. Live Notion Operations Strip */}
        <NotionOperationsStrip
          crmCount={crmCount}
          outreachCount={outreachCount}
          approvalCount={approvalCount}
          isLoading={notionLoading}
          hasError={notionHasError}
          onOpenSource={(source) => navigate({ to: '/notion', search: { source } })}
        />

        <SystemOperationsPanel
          system={systemQuery.data}
          isLoading={systemQuery.isLoading}
          hasError={Boolean(systemQuery.error)}
        />

        {/* 2. Main content grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left column: Needs Attention + Quick Actions */}
          <div className="flex flex-col gap-4">
            <NeedsAttentionPanel
              tasks={tasks}
              isLoading={tasksQuery.isLoading}
              onTaskClick={handleTaskClick}
            />
            <QuickActions />
          </div>

          {/* Center + Right: Active Tasks Kanban */}
          <div className="lg:col-span-2">
            <CompactKanban
              tasks={tasks}
              isLoading={tasksQuery.isLoading}
              onTaskClick={handleTaskClick}
            />
          </div>
        </div>

        {/* 3. Recent Activity */}
        <RecentActivity
          tasks={tasks}
          isLoading={tasksQuery.isLoading}
          onTaskClick={handleTaskClick}
        />

        {/* Task Edit Dialog */}
        <TaskDialog
          open={editingTask !== null}
          onOpenChange={(open) => {
            if (!open) setEditingTask(null)
          }}
          task={editingTask}
          isSubmitting={false}
          onSubmit={async () => {
            // Read-only view for now — could add update mutation
            setEditingTask(null)
          }}
        />
      </div>
    </div>
  )
}
