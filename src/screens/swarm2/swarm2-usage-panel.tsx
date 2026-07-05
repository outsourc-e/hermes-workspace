'use client'

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type UsageWindow = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

type WorkerUsage = {
  workerId: string
  model: string | null
  today: UsageWindow
  last7d: UsageWindow
  sessions: number
}

type SwarmUsageResponse = {
  workers: Array<WorkerUsage>
  generatedAt: string
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

async function fetchSwarmUsage(): Promise<SwarmUsageResponse> {
  const res = await fetch('/api/swarm-usage')
  if (!res.ok) throw new Error(`swarm-usage HTTP ${res.status}`)
  return (await res.json()) as SwarmUsageResponse
}

export function Swarm2UsagePanel({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['swarm-usage'],
    queryFn: fetchSwarmUsage,
    refetchInterval: 60_000,
  })

  const workers = (data?.workers ?? []).filter(
    (w) => w.sessions > 0 || w.last7d.total > 0,
  )

  return (
    <div
      className={cn(
        'rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--theme-text)]">
          Worker usage
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
          tokens
        </span>
      </div>
      {isLoading ? (
        <div className="text-xs text-[var(--theme-muted)]">Loading usage…</div>
      ) : isError ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Usage unavailable.
        </div>
      ) : workers.length === 0 ? (
        <div className="text-xs text-[var(--theme-muted)]">
          No recent worker activity.
        </div>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              <th className="pb-2 pr-2 font-medium">Worker</th>
              <th className="pb-2 pr-2 font-medium">Model</th>
              <th className="pb-2 pr-2 text-right font-medium">Today</th>
              <th className="pb-2 pr-2 text-right font-medium">7d</th>
              <th className="pb-2 text-right font-medium">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr
                key={w.workerId}
                className="border-t border-[var(--theme-border)] text-[var(--theme-text)]"
              >
                <td className="py-1.5 pr-2 font-medium">{w.workerId}</td>
                <td className="py-1.5 pr-2 text-[var(--theme-muted)]">
                  {w.model ?? '—'}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatTokens(w.today.total)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatTokens(w.last7d.total)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--theme-muted)]">
                  {w.sessions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
