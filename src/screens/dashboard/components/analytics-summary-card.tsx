import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon } from '@hugeicons/core-free-icons'
import { formatModelName } from '@/screens/dashboard/lib/formatters'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(usd: number | null): string {
  if (usd === null) return '—'
  if (usd < 0.01) return '<$0.01'
  if (usd < 1) return `$${usd.toFixed(2)}`
  if (usd < 100) return `$${usd.toFixed(1)}`
  return `$${Math.round(usd)}`
}

/**
 * Replaces the old hardcoded `~$X` cost estimate with real
 * dashboard-sourced analytics: total tokens over the window, top 3
 * models with relative bars, and a cost figure when the dashboard
 * provides one. Hides itself when the analytics surface is unavailable
 * (vanilla install with auth disabled, or zero traffic).
 */
export function AnalyticsSummaryCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  if (!analytics || analytics.topModels.length === 0) return null
  const top = analytics.topModels[0]
  const max = top?.tokens || 1
  return (
    <div
      className="rounded-md border bg-[var(--theme-card)]/40 p-3"
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={ChartLineData01Icon}
            size={14}
            strokeWidth={1.5}
            style={{ color: 'var(--theme-muted)' }}
          />
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            Top Models · {analytics.windowDays}d
          </h3>
        </div>
        <div className="text-right">
          <div
            className="text-[11px] font-mono"
            style={{ color: 'var(--theme-text)' }}
          >
            {formatTokens(analytics.totalTokens)} tok
          </div>
          {analytics.estimatedCostUsd !== null ? (
            <div
              className="text-[9px] font-mono uppercase tracking-[0.1em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              {formatCost(analytics.estimatedCostUsd)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        {analytics.topModels.map((m) => {
          const widthPct = Math.max(2, Math.round((m.tokens / max) * 100))
          return (
            <div key={m.id} className="text-[11px]">
              <div className="mb-0.5 flex items-center justify-between">
                <span
                  className="truncate font-mono"
                  style={{ color: 'var(--theme-text)' }}
                >
                  {formatModelName(m.id)}
                </span>
                <span
                  className="font-mono text-[10px]"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  {formatTokens(m.tokens)} · {m.calls.toLocaleString()} calls
                </span>
              </div>
              <div
                className="h-1 w-full overflow-hidden rounded-full"
                style={{
                  background:
                    'color-mix(in srgb, var(--theme-border) 50%, transparent)',
                }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${widthPct}%`,
                    background: 'var(--theme-accent)',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
