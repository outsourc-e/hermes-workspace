import { HugeiconsIcon } from '@hugeicons/react'
import { ChartBarLineIcon } from '@hugeicons/core-free-icons'
import { formatModelName } from '@/screens/dashboard/lib/formatters'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(usd: number): string {
  if (!usd || usd <= 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  if (usd < 1) return `$${usd.toFixed(3)}`
  if (usd < 100) return `$${usd.toFixed(2)}`
  return `$${Math.round(usd).toLocaleString()}`
}

/**
 * Standalone top-models card. Previously this was the right column
 * inside the analytics hero card and felt cramped. Hoisting it out
 * gives each model row enough room to show its share of API calls
 * (proxy for routing share) plus tokens, and lets the chart breathe.
 */
export function TopModelsCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  if (!analytics || analytics.topModels.length === 0) return null
  const totalCalls = analytics.totalApiCalls || 0
  const maxTokens = analytics.topModels[0]?.tokens || 1

  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={ChartBarLineIcon}
            size={14}
            strokeWidth={1.5}
            style={{ color: 'var(--theme-accent-secondary)' }}
          />
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--theme-text)' }}
          >
            Top models · {analytics.windowDays}d
          </h3>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {analytics.topModels.length} ranked
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {analytics.topModels.map((m, i) => {
          const widthPct = Math.max(2, Math.round((m.tokens / maxTokens) * 100))
          const sharePct =
            totalCalls > 0 ? Math.round((m.calls / totalCalls) * 100) : 0
          const tone =
            i === 0
              ? 'var(--theme-accent)'
              : i === 1
                ? 'var(--theme-accent-secondary)'
                : 'var(--theme-muted)'
          return (
            <li key={m.id}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span
                  className="flex min-w-0 items-center gap-1.5 truncate font-mono"
                  style={{ color: 'var(--theme-text)' }}
                  title={m.id}
                >
                  <span
                    className="inline-block w-3 text-right tabular-nums"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    {i + 1}
                  </span>
                  {formatModelName(m.id)}
                </span>
                <span
                  className="font-mono text-[10px] tabular-nums"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  {formatTokens(m.tokens)}
                </span>
              </div>
              <div
                className="mt-0.5 h-1 w-full overflow-hidden rounded-full"
                style={{
                  background:
                    'color-mix(in srgb, var(--theme-border) 50%, transparent)',
                }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${widthPct}%`,
                    background: tone,
                  }}
                />
              </div>
              <div
                className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.1em]"
                style={{ color: 'var(--theme-muted)' }}
              >
                <span>
                  {sharePct}% of calls · {m.sessions.toLocaleString()} sessions
                </span>
                <span>{formatCost(m.cost)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
