import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type BackgroundRun = {
  runId: string
  sessionKey: string
  friendlyId: string
  status: 'accepted' | 'active' | 'handoff' | 'stalled'
  createdAt: number
  updatedAt: number
  stalenessMs: number
  lastAssistantText: string
  lastToolName: string | null
  lifecycleEventCount: number
  lastLifecycleEvent: string | null
  errorMessage: string | null
}

const POLL_INTERVAL_MS = 10_000
const STALE_THRESHOLD_MS = 5 * 60 * 1000

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function statusColor(run: BackgroundRun): string {
  if (run.stalenessMs >= STALE_THRESHOLD_MS) return 'bg-amber-400'
  if (run.status === 'handoff') return 'bg-blue-400'
  if (run.status === 'stalled') return 'bg-orange-400'
  return 'bg-emerald-400 animate-pulse'
}

export function BackgroundRunsSection() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<Array<BackgroundRun>>([])
  const [expanded, setExpanded] = useState(false)
  const [busyRunId, setBusyRunId] = useState<string | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/runs/active', { signal })
      if (!res.ok) return
      const data = (await res.json()) as {
        ok?: boolean
        runs?: Array<BackgroundRun>
      }
      if (!data.ok || !data.runs) return
      setRuns(data.runs)
    } catch {
      /* abort or transient network — leave existing list in place */
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [refresh])

  const handleAbandon = useCallback(
    async (run: BackgroundRun) => {
      setBusyRunId(run.runId)
      try {
        await fetch(
          `/api/runs/${encodeURIComponent(run.sessionKey)}/${encodeURIComponent(run.runId)}/abandon`,
          { method: 'POST' },
        )
        // Optimistic removal — server poll will catch up.
        setRuns((prev) => prev.filter((r) => r.runId !== run.runId))
      } catch {
        /* surface via reload */
      } finally {
        setBusyRunId(null)
      }
    },
    [],
  )

  const handleOpen = useCallback(
    (run: BackgroundRun) => {
      void navigate({
        to: '/chat/$sessionKey',
        params: { sessionKey: run.friendlyId || run.sessionKey },
      })
    },
    [navigate],
  )

  if (runs.length === 0) return null

  const staleCount = runs.filter((r) => r.stalenessMs >= STALE_THRESHOLD_MS)
    .length

  return (
    <section className="rounded-2xl bg-primary-200/15 p-2">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="h-7 px-0 text-xs font-medium hover:bg-transparent">
            <HugeiconsIcon
              icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
              size={20}
              strokeWidth={1.5}
            />
            Background runs
          </CollapsibleTrigger>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] tabular-nums',
              staleCount > 0
                ? 'bg-amber-400/20 text-amber-700'
                : 'bg-primary-300/70 text-primary-800',
            )}
            title={
              staleCount > 0
                ? `${staleCount} stale (>5m silent)`
                : `${runs.length} running`
            }
          >
            {runs.length}
            {staleCount > 0 ? ` · ${staleCount} stale` : ''}
          </span>
        </div>
        <CollapsiblePanel contentClassName="pt-1">
          <div className="space-y-1">
            {runs.map((run) => {
              const isStale = run.stalenessMs >= STALE_THRESHOLD_MS
              const isBusy = busyRunId === run.runId
              const snippet =
                run.lastAssistantText.trim() ||
                run.lastLifecycleEvent ||
                (run.lastToolName ? `tool: ${run.lastToolName}` : '') ||
                'no output yet'
              return (
                <div
                  key={`${run.sessionKey}:${run.runId}`}
                  className="rounded-lg px-2 py-1.5 hover:bg-primary-200/50"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        statusColor(run),
                      )}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[11px] font-medium text-primary-800"
                      title={run.sessionKey}
                    >
                      {run.friendlyId || run.sessionKey}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] tabular-nums',
                        isStale ? 'text-amber-600' : 'text-primary-500',
                      )}
                    >
                      {formatAge(run.stalenessMs)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate pl-3 text-[10px] text-primary-500">
                    {run.status} · {snippet}
                  </p>
                  <div className="mt-1 flex justify-end gap-1 pl-3">
                    <button
                      type="button"
                      onClick={() => handleOpen(run)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-accent-600 hover:bg-accent-100 hover:text-accent-800"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAbandon(run)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                      title="Mark this run as failed and remove it from the active list"
                    >
                      {isBusy ? 'Killing…' : 'Mark dead'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </section>
  )
}
