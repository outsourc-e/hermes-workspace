import { useMemo } from 'react'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Cache efficiency tile.
 *
 * Cache reads on this stack are several times the size of fresh
 * input — a signal worth surfacing because cache-hit-rate is the
 * single biggest cost lever once you control which model you call.
 *
 * Renders three pieces:
 *   1. Big % stat: cache_read / (cache_read + input). Higher = better.
 *   2. Sub-stat: total cache tokens / total input tokens.
 *   3. Tiny daily sparkline of the rate over the analytics window so
 *      operators see if cache hit-rate is trending up or down.
 *
 * Pure derive-from-aggregator. Works against the existing payload.
 */
export function CacheEfficiencyCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  if (!analytics || analytics.source !== 'analytics') return null

  const cache = analytics.cacheReadTokens
  const input = analytics.inputTokens
  const denom = cache + input

  const dailyRates = useMemo(() => {
    return analytics.daily.map((d) => {
      const sum = d.cacheReadTokens + d.inputTokens
      return sum > 0 ? (d.cacheReadTokens / sum) * 100 : 0
    })
  }, [analytics.daily])

  if (denom === 0) return null

  const ratePct = (cache / denom) * 100
  const max = Math.max(...dailyRates, 1)

  const ratio = input > 0 ? cache / input : 0

  return (
    <div
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-success), color-mix(in srgb, var(--theme-success) 40%, transparent), transparent)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ background: 'var(--theme-success)' }}
      />

      <div className="flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Cache efficiency
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {analytics.windowDays}d
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-2xl font-bold leading-none tracking-tight tabular-nums"
          style={{ color: 'var(--theme-text)' }}
        >
          {ratePct.toFixed(1)}%
        </span>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.1em]"
          style={{ color: 'var(--theme-muted)' }}
          title="Cache reads divided by (cache reads + first-pass input)."
        >
          hit rate
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div
          className="font-mono text-[10px] leading-snug"
          style={{ color: 'var(--theme-muted)' }}
        >
          <span style={{ color: 'var(--theme-text)' }}>
            {formatTokens(cache)}
          </span>{' '}
          cache /{' '}
          <span style={{ color: 'var(--theme-text)' }}>
            {formatTokens(input)}
          </span>{' '}
          input
          <br />
          <span
            className="font-mono"
            title="How many cache tokens per fresh input token."
          >
            {ratio.toFixed(1)}× ratio
          </span>
        </div>

        {/* Daily hit-rate sparkline — bars rather than a line so a
            single zero day is obvious rather than buried in a slope. */}
        <div
          className="flex items-end gap-[2px]"
          style={{ height: 28, width: 96 }}
          aria-hidden
        >
          {dailyRates.map((rate, idx) => {
            const heightPct =
              max > 0 ? Math.max(6, (rate / max) * 100) : 6
            return (
              <div
                key={idx}
                className="flex-1 rounded-sm"
                style={{
                  height: `${heightPct}%`,
                  background:
                    rate === 0
                      ? 'color-mix(in srgb, var(--theme-border) 35%, transparent)'
                      : `color-mix(in srgb, var(--theme-success) ${Math.max(35, heightPct)}%, transparent)`,
                }}
                title={`${analytics.daily[idx]?.day ?? ''} \u00b7 ${rate.toFixed(1)}%`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
