import { useMemo } from 'react'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatHour(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

type Slice = {
  label: string
  value: number
  tone: string
  hint: string
}

/**
 * Token mix + hour-of-day fused card.
 *
 * Per Eric's iteration-005 feedback, the side rail had two adjacent
 * single-purpose cards (token mix + hour of day) that could be tied
 * together visually. This component shares one card chrome, one
 * header, and one set of typography rules — token split on top,
 * hourly activity strip on bottom — so the rail reads as a single
 * "rhythm" insight instead of two unrelated widgets.
 *
 * Both halves are still independent: if analytics is unavailable the
 * top half hides; if there are no sessions the bottom half hides.
 */
export function TokenMixHourCard({
  analytics,
  sessions,
}: {
  analytics: DashboardOverview['analytics']
  sessions: Array<{ startedAt: number | null; updatedAt: number | null }>
}) {
  const slices: Array<Slice> = useMemo(() => {
    if (!analytics || analytics.source !== 'analytics') return []
    return [
      {
        label: 'cache',
        value: analytics.cacheReadTokens,
        tone: 'var(--theme-accent-secondary)',
        hint: 'Cache read tokens.',
      },
      {
        label: 'input',
        value: analytics.inputTokens,
        tone: 'var(--theme-accent)',
        hint: 'Prompt tokens sent to the model.',
      },
      {
        label: 'output',
        value: analytics.outputTokens,
        tone: 'var(--theme-success)',
        hint: 'Completion tokens emitted.',
      },
      {
        label: 'reasoning',
        value: analytics.reasoningTokens,
        tone: 'var(--theme-warning)',
        hint: 'Thinking tokens (when supported).',
      },
    ]
  }, [analytics])

  const totalTokens = slices.reduce((a, s) => a + s.value, 0)
  const ratio =
    analytics && analytics.inputTokens > 0
      ? (analytics.outputTokens / analytics.inputTokens) * 100
      : 0

  const buckets = useMemo(() => {
    const counts = Array.from({ length: 24 }, () => 0)
    for (const s of sessions) {
      const ts = s.startedAt ?? s.updatedAt
      if (!ts) continue
      const date = new Date(ts)
      const hour = date.getHours()
      if (hour >= 0 && hour < 24) counts[hour] += 1
    }
    return counts
  }, [sessions])

  const totalSessions = buckets.reduce((a, b) => a + b, 0)
  const maxBucket = Math.max(...buckets, 1)
  const peakHour = buckets.indexOf(maxBucket)

  // If there's nothing to show in either half, render nothing so the
  // side rail stays tidy on fresh installs.
  if (totalTokens === 0 && totalSessions === 0) return null

  return (
    <div
      className="relative flex h-full flex-1 flex-col justify-between gap-3 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Mix &amp; rhythm
          {analytics ? ` · ${analytics.windowDays}d` : ''}
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {totalTokens > 0 ? `out/in ${ratio.toFixed(1)}%` : ''}
          {totalTokens > 0 && totalSessions > 0 ? ' · ' : ''}
          {totalSessions > 0
            ? `peak ${formatHour(peakHour)} · ${totalSessions} sess`
            : ''}
        </span>
      </div>

      {/* Token split */}
      {totalTokens > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div
            className="flex h-2 w-full overflow-hidden rounded-full"
            style={{
              background:
                'color-mix(in srgb, var(--theme-border) 40%, transparent)',
            }}
          >
            {slices.map((s) => {
              const widthPct = Math.max(0, (s.value / totalTokens) * 100)
              if (widthPct < 0.5) return null
              return (
                <div
                  key={s.label}
                  style={{ width: `${widthPct}%`, background: s.tone }}
                  title={`${s.label}: ${formatTokens(s.value)} (${widthPct.toFixed(1)}%)`}
                />
              )
            })}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {slices.map((s) => {
              const widthPct = (s.value / totalTokens) * 100
              return (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-2"
                  style={{ color: 'var(--theme-muted)' }}
                  title={s.hint}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="inline-block size-1.5 shrink-0 rounded-full"
                      style={{ background: s.tone }}
                      aria-hidden
                    />
                    <span className="font-mono uppercase tracking-[0.1em]">
                      {s.label}
                    </span>
                  </span>
                  <span
                    className="shrink-0 font-mono tabular-nums"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {formatTokens(s.value)}
                    <span
                      className="ml-1"
                      style={{ color: 'var(--theme-muted)' }}
                    >
                      · {widthPct.toFixed(0)}%
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* Hour-of-day strip */}
      {totalSessions > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-end gap-[2px]" style={{ height: 38 }}>
            {buckets.map((count, hour) => {
              const heightPct = maxBucket > 0 ? (count / maxBucket) * 100 : 0
              const isPeak = count === maxBucket && count > 0
              return (
                <div
                  key={hour}
                  className="flex-1 rounded-sm"
                  style={{
                    background:
                      count === 0
                        ? 'color-mix(in srgb, var(--theme-border) 30%, transparent)'
                        : isPeak
                          ? 'var(--theme-accent)'
                          : `color-mix(in srgb, var(--theme-accent) ${Math.max(20, heightPct)}%, transparent)`,
                    height:
                      count === 0 ? 4 : `${Math.max(8, heightPct)}%`,
                    minHeight: 4,
                  }}
                  title={`${formatHour(hour)} · ${count} session${count === 1 ? '' : 's'}`}
                />
              )
            })}
          </div>
          <div
            className="flex justify-between font-mono text-[8px] uppercase tracking-[0.1em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            <span>12a</span>
            <span>6a</span>
            <span>12p</span>
            <span>6p</span>
            <span>12a</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
