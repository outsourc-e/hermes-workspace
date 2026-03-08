import { Task01Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { WidgetShell } from './widget-shell'
import type { CronJob } from '@/components/cron-manager/cron-types'
import type { TaskPriority, TaskStatus } from '@/stores/task-store'
import { fetchCronJobs } from '@/lib/cron-api'
import { cn } from '@/lib/utils'

type TasksWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

type DashboardTask = {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
}

const PRIORITY_ORDER: Array<TaskPriority> = ['P0', 'P1', 'P2', 'P3']

function toTaskStatus(job: CronJob): TaskStatus {
  if (!job.enabled) return 'backlog'
  const status = job.lastRun?.status
  if (status === 'running' || status === 'queued') return 'in_progress'
  if (status === 'error') return 'review'
  if (status === 'success') return 'done'
  return 'backlog'
}

function toTaskPriority(job: CronJob): TaskPriority {
  const status = job.lastRun?.status
  if (status === 'error') return 'P0'
  if (status === 'running' || status === 'queued') return 'P1'
  if (!job.enabled) return 'P3'
  return 'P2'
}

function priorityBadgeClass(priority: TaskPriority): string {
  if (priority === 'P0') return 'bg-red-950/70 text-red-300'
  if (priority === 'P1') return 'bg-orange-950/70 text-orange-300'
  if (priority === 'P2') return 'bg-blue-950/70 text-blue-300'
  return 'bg-primary-100 dark:bg-neutral-800 text-primary-700 dark:text-neutral-300'
}

function mobilePriorityBadgeClass(priority: TaskPriority): string {
  if (priority === 'P0') return 'bg-red-950/70 text-red-300'
  if (priority === 'P1') return 'bg-orange-950/70 text-orange-300'
  if (priority === 'P2') return 'bg-blue-950/70 text-blue-300'
  return 'bg-primary-100 dark:bg-neutral-800 text-primary-700 dark:text-neutral-300'
}

function statusDotClass(status: TaskStatus): string {
  if (status === 'in_progress' || status === 'review') return 'bg-orange-400'
  if (status === 'done') return 'bg-emerald-500'
  return 'bg-neutral-400'
}

function truncateTaskTitle(title: string): string {
  if (title.length <= 30) return title
  return `${title.slice(0, 29)}…`
}

function toDashboardTask(job: CronJob): DashboardTask {
  return {
    id: job.id,
    title: job.name,
    status: toTaskStatus(job),
    priority: toTaskPriority(job),
  }
}

function mobileStatusRank(status: TaskStatus): number {
  if (status === 'in_progress') return 0
  if (status === 'backlog') return 1
  if (status === 'review') return 2
  return 3
}

export function TasksWidget({ draggable = false, onRemove }: TasksWidgetProps) {
  const navigate = useNavigate()

  const cronJobsQuery = useQuery({
    queryKey: ['cron', 'jobs'],
    queryFn: fetchCronJobs,
    retry: false,
    refetchInterval: 30_000,
  })

  const tasks = useMemo(
    function buildTaskRows() {
      const jobs = Array.isArray(cronJobsQuery.data) ? cronJobsQuery.data : []
      return jobs.map(toDashboardTask)
    },
    [cronJobsQuery.data],
  )

  const sortedTasks = useMemo(
    function sortTasksByPriority() {
      return [...tasks].sort(function sortByPriority(left, right) {
        const leftOrder = PRIORITY_ORDER.indexOf(left.priority)
        const rightOrder = PRIORITY_ORDER.indexOf(right.priority)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return left.title.localeCompare(right.title)
      })
    },
    [tasks],
  )

  const mobilePreviewTasks = useMemo(
    function buildMobilePreviewTasks() {
      return [...tasks]
        .sort(function sortForMobile(left, right) {
          const statusDelta = mobileStatusRank(left.status) - mobileStatusRank(right.status)
          if (statusDelta !== 0) return statusDelta

          const leftPriority = PRIORITY_ORDER.indexOf(left.priority)
          const rightPriority = PRIORITY_ORDER.indexOf(right.priority)
          if (leftPriority !== rightPriority) return leftPriority - rightPriority

          return left.title.localeCompare(right.title)
        })
        .slice(0, 3)
    },
    [tasks],
  )

  const visibleTasks = sortedTasks.slice(0, 4)
  const remainingCount = Math.max(0, sortedTasks.length - visibleTasks.length)
  const activeCount = tasks.filter((task) => task.status !== 'done').length
  const backlogCount = tasks.filter((task) => task.status === 'backlog').length
  const inProgressCount = tasks.filter((task) => task.status === 'in_progress').length
  const doneCount = tasks.filter((task) => task.status === 'done').length
  const errorMessage =
    cronJobsQuery.error instanceof Error ? cronJobsQuery.error.message : null

  return (
    <>
      <WidgetShell
        size="medium"
        title="Tasks"
        icon={Task01Icon}
        action={
          <span className="inline-flex items-center rounded-full border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:text-neutral-300">
            Backlog {backlogCount} • In progress {inProgressCount} • Done {doneCount}
          </span>
        }
        className="h-full rounded-xl border border-neutral-200 dark:border-neutral-700 border-l-4 border-l-orange-500 bg-white dark:bg-neutral-900 p-4 sm:p-5 md:hidden [&_svg]:text-orange-500"
      >
        {cronJobsQuery.isLoading && tasks.length === 0 ? (
          <div className="rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-3 py-3 text-sm text-primary-500 dark:text-neutral-400">
            Loading tasks…
          </div>
        ) : cronJobsQuery.isError ? (
          <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-3 text-sm text-red-300">
            {errorMessage ?? 'Unable to load tasks.'}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-3 py-3 text-sm text-primary-500 dark:text-neutral-400">
            No tasks yet. Create one to track follow-ups here.
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              {mobilePreviewTasks.map(function renderMobileTask(task) {
                return (
                  <article
                    key={task.id}
                    className="flex items-center gap-2 rounded-xl border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-3 py-2"
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        mobilePriorityBadgeClass(task.priority),
                      )}
                    >
                      {task.priority}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary-900 dark:text-neutral-100">
                      {task.title}
                    </span>
                    <span
                      className={cn('size-2 shrink-0 rounded-full', statusDotClass(task.status))}
                    />
                  </article>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void navigate({ to: '/cron' })}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-500 dark:text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            View all ›
          </button>
        </div>
      </WidgetShell>

      <div className="hidden h-full md:block">
        <DashboardGlassCard
          title="Tasks"
          titleAccessory={
            <span className="inline-flex items-center rounded-full border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-2 py-0.5 font-mono text-[11px] font-medium text-primary-800 dark:text-neutral-200 tabular-nums">
              {activeCount}
            </span>
          }
          tier="tertiary"
          description=""
          icon={Task01Icon}
          draggable={draggable}
          onRemove={onRemove}
          className="h-full rounded-xl border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] [&_h2]:text-[11px] [&_h2]:font-medium [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-primary-400 dark:[&_h2]:text-neutral-500 [&_svg]:text-primary-400 dark:[&_svg]:text-neutral-500"
        >
          {cronJobsQuery.isLoading && tasks.length === 0 ? (
            <div className="rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-3 py-3 text-sm text-primary-500 dark:text-neutral-400">
              Loading tasks…
            </div>
          ) : cronJobsQuery.isError ? (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-3 text-sm text-red-300">
              {errorMessage ?? 'Unable to load tasks.'}
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-lg border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 px-3 py-3 text-sm text-primary-500 dark:text-neutral-400">
              No tasks yet
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleTasks.map(function renderTask(task, index) {
                return (
                  <article
                    key={task.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-primary-200 dark:border-neutral-800 px-2.5 py-2',
                      index % 2 === 0 ? 'bg-primary-50 dark:bg-neutral-950' : 'bg-primary-50 dark:bg-neutral-950/80',
                    )}
                  >
                    <span
                      className={cn('size-2 shrink-0 rounded-full', statusDotClass(task.status))}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-primary-900 dark:text-neutral-100">
                      {truncateTaskTitle(task.title)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        priorityBadgeClass(task.priority),
                      )}
                    >
                      {task.priority}
                    </span>
                  </article>
                )
              })}

              {remainingCount > 0 ? (
                <p className="px-1 text-xs text-primary-500 dark:text-neutral-400">+{remainingCount} more</p>
              ) : null}
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void navigate({ to: '/cron' })}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-500 dark:text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              View all →
            </button>
          </div>
        </DashboardGlassCard>
      </div>
    </>
  )
}
