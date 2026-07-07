'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type QueueItem = {
  id: string
  task: string
  worker: string | null
  priority: 1 | 2 | 3
  status: 'queued' | 'dispatched' | 'done' | 'failed' | 'cancelled'
  createdAt: number
}

type QueueResponse = { ok: boolean; items: Array<QueueItem> }

const PRIORITY_LABEL: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
}

async function fetchQueue(): Promise<QueueResponse> {
  const res = await fetch('/api/swarm-queue')
  if (!res.ok) throw new Error(`swarm-queue HTTP ${res.status}`)
  return (await res.json()) as QueueResponse
}

export function Swarm2QueuePanel({ className }: { className?: string }) {
  const queryClient = useQueryClient()
  const [task, setTask] = useState('')
  const [priority, setPriority] = useState<1 | 2 | 3>(2)
  const { data, isLoading } = useQuery({
    queryKey: ['swarm-queue'],
    queryFn: fetchQueue,
    refetchInterval: 30_000,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['swarm-queue'] })

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/swarm-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, priority }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => {
      setTask('')
      void invalidate()
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch('/api/swarm-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id }),
      })
    },
    onSuccess: () => void invalidate(),
  })

  const open = (data?.items ?? []).filter(
    (i) => i.status === 'queued' || i.status === 'dispatched',
  )

  return (
    <div
      className={cn(
        'rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--theme-text)]">
          Task Queue
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
          {open.length} open
        </span>
      </div>
      <form
        className="mb-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (task.trim()) addMutation.mutate()
        }}
      >
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Queue a task for the next idle worker…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-xs text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)]"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
          className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1.5 text-xs text-[var(--theme-text)]"
        >
          <option value={1}>P1</option>
          <option value={2}>P2</option>
          <option value={3}>P3</option>
        </select>
        <button
          type="submit"
          disabled={!task.trim() || addMutation.isPending}
          className="rounded-lg border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] disabled:opacity-50"
        >
          Queue
        </button>
      </form>
      {isLoading ? (
        <div className="text-xs text-[var(--theme-muted)]">Loading…</div>
      ) : open.length === 0 ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Queue empty — dispatched by the sweep every 10 minutes.
        </div>
      ) : (
        <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
          {open.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 text-xs text-[var(--theme-text)]"
            >
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  item.priority === 1
                    ? 'bg-red-500/15 text-red-500'
                    : item.priority === 2
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-slate-500/15 text-[var(--theme-muted)]',
                )}
              >
                {PRIORITY_LABEL[item.priority]}
              </span>
              <span className="shrink-0 text-[var(--theme-muted)]">
                {item.status}
                {item.worker ? ` → ${item.worker}` : ''}
              </span>
              <span className="min-w-0 flex-1 truncate" title={item.task}>
                {item.task}
              </span>
              {item.status === 'queued' ? (
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate(item.id)}
                  className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)] hover:text-red-500"
                >
                  Cancel
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
