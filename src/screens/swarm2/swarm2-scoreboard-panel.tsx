'use client'

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type WorkerScore = {
  workerId: string
  attempts: number
  ok: number
  blocked: number
  successRate: number
  avgDurationMs: number
  lastAt: number | null
  lastBlockReason: string | null
}

type ScoreboardResponse = {
  ok: boolean
  workers: Array<WorkerScore>
  totalRecords: number
  generatedAt: string
}

async function fetchScoreboard(): Promise<ScoreboardResponse> {
  const res = await fetch('/api/swarm-scoreboard')
  if (!res.ok) throw new Error(`swarm-scoreboard HTTP ${res.status}`)
  return (await res.json()) as ScoreboardResponse
}

function rateColor(rate: number): string {
  if (rate >= 0.8) return 'text-emerald-500'
  if (rate >= 0.5) return 'text-amber-500'
  return 'text-red-500'
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(0)}s`
  return `${ms}ms`
}

export function Swarm2ScoreboardPanel({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['swarm-scoreboard'],
    queryFn: fetchScoreboard,
    refetchInterval: 60_000,
  })

  const workers = (data?.workers ?? []).filter((w) => w.attempts > 0)

  return (
    <div
      className={cn(
        'rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--theme-text)]">
          Worker scoreboard
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
          {data?.totalRecords ?? 0} outcomes
        </span>
      </div>
      {isLoading ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Loading scoreboard…
        </div>
      ) : isError ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Scoreboard unavailable.
        </div>
      ) : workers.length === 0 ? (
        <div className="text-xs text-[var(--theme-muted)]">
          No dispatch outcomes recorded yet — scores appear after the next
          tasks run.
        </div>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              <th className="pb-2 pr-2 font-medium">Worker</th>
              <th className="pb-2 pr-2 text-right font-medium">Tasks</th>
              <th className="pb-2 pr-2 text-right font-medium">Success</th>
              <th className="pb-2 pr-2 text-right font-medium">Blocked</th>
              <th className="pb-2 text-right font-medium">Avg time</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr
                key={w.workerId}
                className="border-t border-[var(--theme-border)] text-[var(--theme-text)]"
              >
                <td className="py-1.5 pr-2 font-medium">{w.workerId}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {w.attempts}
                </td>
                <td
                  className={cn(
                    'py-1.5 pr-2 text-right font-semibold tabular-nums',
                    rateColor(w.successRate),
                  )}
                >
                  {Math.round(w.successRate * 100)}%
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--theme-muted)]">
                  {w.blocked}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--theme-muted)]">
                  {formatDuration(w.avgDurationMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
