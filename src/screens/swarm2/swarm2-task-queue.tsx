'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type WorkerTask = {
  id: string
  title?: string | null
  description?: string | null
  column?: string | null
  status?: string | null
  assignee?: string | null
  priority?: 'high' | 'medium' | 'low' | string | null
  createdAt?: number | null
  updatedAt?: number | null
}

type TasksResponse = {
  tasks?: Array<WorkerTask>
  ok?: boolean
}

type Swarm2TaskQueueProps = {
  workerId: string
  className?: string
  limit?: number
  doneLimit?: number
  summaryTask?: string | null
  showHeader?: boolean
  composerOpen?: boolean
  onComposerOpenChange?: (open: boolean) => void
  centered?: boolean
}

const POLL_MS = 30_000

async function fetchAssignedTasks(workerId: string): Promise<Array<WorkerTask>> {
  const url = `/api/hermes-tasks?assignee=${encodeURIComponent(workerId)}&include_done=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tasks HTTP ${res.status}`)
  const data = (await res.json()) as TasksResponse
  return Array.isArray(data.tasks) ? data.tasks : []
}

async function createWorkerTask(workerId: string, title: string, description = ''): Promise<WorkerTask> {
  const res = await fetch('/api/hermes-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      description,
      assignee: workerId,
      column: 'todo',
      priority: 'medium',
      created_by: 'swarm2-card',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `task create HTTP ${res.status}`)
  }
  const data = (await res.json()) as { task?: WorkerTask }
  if (!data.task) throw new Error('task create returned no task')
  return data.task
}

function statusTone(column?: string | null): {
  dot: string
  rank: number
} {
  const c = (column ?? '').toLowerCase()
  if (c === 'blocked') return { dot: 'bg-red-500', rank: 0 }
  if (c === 'in_progress' || c === 'doing' || c === 'progress')
    return { dot: 'bg-emerald-500', rank: 1 }
  if (c === 'review' || c === 'reviewing')
    return { dot: 'bg-violet-500', rank: 2 }
  return { dot: 'bg-amber-500', rank: 3 }
}

function priorityTone(priority?: string | null) {
  const p = (priority ?? '').toLowerCase()
  if (p === 'high') {
    return 'border-red-400/40 bg-red-500/10 text-red-200'
  }
  if (p === 'medium') {
    return 'border-amber-400/40 bg-amber-500/10 text-amber-200'
  }
  if (p === 'low') {
    return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
  }
  return null
}

export function Swarm2TaskQueue({
  workerId,
  className,
  limit = 3,
  doneLimit = 2,
  summaryTask = null,
  showHeader = true,
  composerOpen: composerOpenProp,
  onComposerOpenChange,
  centered = false,
}: Swarm2TaskQueueProps) {
  const queryClient = useQueryClient()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [internalComposerOpen, setInternalComposerOpen] = useState(false)
  const composerOpen = composerOpenProp ?? internalComposerOpen
  const setComposerOpen = (next: boolean | ((value: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(composerOpen) : next
    if (onComposerOpenChange) onComposerOpenChange(resolved)
    if (composerOpenProp === undefined) setInternalComposerOpen(resolved)
  }
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')

  const query = useQuery({
    queryKey: ['swarm2', 'tasks', workerId],
    queryFn: () => fetchAssignedTasks(workerId),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    enabled: Boolean(workerId),
  })

  const createMutation = useMutation({
    mutationFn: async () => createWorkerTask(workerId, draftTitle.trim(), draftDescription.trim()),
    onSuccess: async () => {
      setDraftTitle('')
      setDraftDescription('')
      setComposerOpen(false)
      setDetailsOpen(true)
      await queryClient.invalidateQueries({ queryKey: ['swarm2', 'tasks', workerId] })
    },
  })

  const tasks = query.data ?? []
  const activeTasks = useMemo(() => {
    return [...tasks]
      .filter((task) => (task.column ?? task.status ?? '').toLowerCase() !== 'done')
      .sort((a, b) => {
        const ra = statusTone(a.column ?? a.status).rank
        const rb = statusTone(b.column ?? b.status).rank
        if (ra !== rb) return ra - rb
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      })
  }, [tasks])
  const doneTasks = useMemo(() => {
    return [...tasks]
      .filter((task) => (task.column ?? task.status ?? '').toLowerCase() === 'done')
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
  }, [tasks])

  const visibleActive = useMemo(
    () => (detailsOpen ? activeTasks : activeTasks.slice(0, limit)),
    [activeTasks, detailsOpen, limit],
  )
  const visibleDone = useMemo(
    () => (detailsOpen ? doneTasks : doneTasks.slice(0, doneLimit)),
    [doneTasks, detailsOpen, doneLimit],
  )

  const doneCount = doneTasks.length + (summaryTask ? 1 : 0)
  const hasOverflow = activeTasks.length > limit || doneTasks.length > doneLimit
  const totalVisible = activeTasks.length + doneTasks.length + (summaryTask ? 1 : 0)

  return (
    <section className={cn('flex min-h-[4.25rem] flex-col px-0 py-0', className)} onClick={(event) => event.stopPropagation()}>
      {showHeader ? (
        <div className="mb-2">
          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.02em] text-[var(--theme-muted)]">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--theme-muted)]/80">
              Tasks
            </span>
            <span className="text-[10px] normal-case tracking-normal text-[var(--theme-muted)]/80">
              {activeTasks.length} active · {doneCount} done
            </span>
            <button
              type="button"
              aria-label={composerOpen ? 'Close add task' : 'Add task'}
              title={composerOpen ? 'Close add task' : 'Add task'}
              onClick={() => setComposerOpen((value) => !value)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
            >
              <HugeiconsIcon icon={Add01Icon} size={10} />
            </button>
            {hasOverflow ? (
              <button
                type="button"
                aria-label={detailsOpen ? 'Collapse task details' : 'Expand task details'}
                title={detailsOpen ? 'Collapse task details' : 'Expand task details'}
                onClick={() => setDetailsOpen((value) => !value)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
              >
                <HugeiconsIcon icon={ViewIcon} size={10} />
              </button>
            ) : null}
          </div>
          <div className="mt-1 border-b border-[var(--theme-border)]/70" />
        </div>
      ) : null}

      {composerOpen ? (
        <div className={cn('mb-2 mx-auto max-w-xl space-y-2 rounded-lg border border-[var(--theme-border)] bg-[color:rgba(255,255,255,0.02)] p-2 text-left', centered && 'w-full')}>
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Add a task for this agent…"
            className="w-full rounded-md border border-[var(--theme-border)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--theme-text)] outline-none"
          />
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            rows={2}
            placeholder="Optional notes"
            className="w-full resize-none rounded-md border border-[var(--theme-border)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--theme-text)] outline-none"
          />
          <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--theme-muted)]">
            <span>Assigns directly to {workerId}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-md border border-[var(--theme-border)] px-2 py-1 hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draftTitle.trim() || createMutation.isPending}
                onClick={() => void createMutation.mutateAsync()}
                className="rounded-md bg-[var(--theme-accent)] px-2 py-1 font-semibold text-primary-950 disabled:opacity-40"
              >
                {createMutation.isPending ? 'Adding…' : 'Add task'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn('flex-1', centered && 'flex flex-col justify-center')}>
      {query.isPending ? (
        <p className="pt-2 text-[11px] text-[var(--theme-muted)] text-center">Loading…</p>
      ) : totalVisible === 0 ? (
        <p className="pt-2 text-[11px] text-[var(--theme-muted)] text-center">No tracked tasks yet.</p>
      ) : (
        <div className="mx-auto max-w-xl space-y-1 text-center">
          {summaryTask ? (
            <div className="flex w-full items-center justify-center gap-2 px-0 py-0.5">
              <span className="inline-flex w-4 shrink-0 justify-center">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} className="text-emerald-400" />
              </span>
              <span className="max-w-full truncate text-[11px] text-[var(--theme-muted)] line-through decoration-[var(--theme-muted)]/60" title={summaryTask}>
                {summaryTask}
              </span>
            </div>
          ) : null}

          {visibleActive.length > 0 ? (
            <ul className="space-y-1">
              {visibleActive.map((task) => {
                const tone = statusTone(task.column ?? task.status)
                const prioCls = priorityTone(task.priority)
                return (
                  <li key={task.id}>
                    <div className="flex w-full items-center justify-center gap-2 px-0 py-0.5 text-center">
                      <span className="inline-flex w-4 shrink-0 justify-center">
                        <span className={cn('size-2 rounded-full', tone.dot)} />
                      </span>
                      {prioCls ? (
                        <span className={cn('shrink-0 rounded-full border px-1 text-[9px] font-semibold uppercase tracking-[0.16em]', prioCls)}>
                          {String(task.priority).toUpperCase() === 'HIGH' ? 'P0' : String(task.priority).toUpperCase() === 'MEDIUM' ? 'P1' : 'P2'}
                        </span>
                      ) : null}
                      <span className="max-w-full truncate text-[11px] text-[var(--theme-text)]" title={task.title || task.description || task.id}>
                        {task.title || task.description || task.id}
                      </span>
                    </div>
                    {detailsOpen && task.description ? (
                      <p className="mt-1 max-w-xl text-center text-[10px] leading-relaxed text-[var(--theme-muted)]">
                        {task.description}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}

          {visibleDone.length > 0 ? (
            <ul className="space-y-1 border-t border-[var(--theme-border)]/50 pt-1.5">
              {visibleDone.map((task) => (
                <li key={task.id}>
                  <div className="flex w-full items-center justify-center gap-2 px-0 py-0.5">
                    <span className="inline-flex w-4 shrink-0 justify-center">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} className="text-emerald-400" />
                    </span>
                    <span className="max-w-full truncate text-[11px] text-[var(--theme-muted)] line-through decoration-[var(--theme-muted)]/60" title={task.title || task.description || task.id}>
                      {task.title || task.description || task.id}
                    </span>
                  </div>
                  {detailsOpen && task.description ? (
                    <p className="mt-1 max-w-xl text-center text-[10px] leading-relaxed text-[var(--theme-muted)]/85 line-through decoration-[var(--theme-muted)]/50">
                      {task.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {hasOverflow ? (
            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              className="w-full rounded-md border border-dashed border-[var(--theme-border)]/70 bg-transparent px-2 py-1 text-center text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)] hover:bg-[color:rgba(255,255,255,0.03)] hover:text-[var(--theme-text)]"
            >
              {detailsOpen ? 'Less' : 'More'}
            </button>
          ) : null}
        </div>
      )}
      </div>
    </section>
  )
}
