import { useMemo } from 'react'

/**
 * Hour-of-day activity heatmap.
 *
 * Backend doesn't expose `activity.by_hour[]` from `/api/analytics/usage`
 * yet (the Hermes Agent confirmed it's computed internally but dropped
 * at the API boundary). We rebuild it locally from the session list
 * the dashboard already has — every session row has `startedAt`, so we
 * bucket those into 24 hour-of-day cells.
 *
 * Not a full date×hour heatmap; that's a true 7×24 grid we'll add when
 * the backend exposes it. This is the 1×24 strip rolled up across the
 * window which matches what InsightsEngine already returns server-side.
 */
export function HourOfDayCard({
  sessions,
}: {
  sessions: Array<{ startedAt: number | null; updatedAt: number | null }>
}) {
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

  const max = Math.max(...buckets, 1)
  const total = buckets.reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const peakHour = buckets.indexOf(max)
  const formatHour = (h: number): string => {
    if (h === 0) return '12a'
    if (h < 12) return `${h}a`
    if (h === 12) return '12p'
    return `${h - 12}p`
  }

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
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Hour of day
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          peak {formatHour(peakHour)} · {total} sessions
        </span>
      </div>

      <div className="flex items-end gap-[2px]" style={{ height: 56 }}>
        {buckets.map((count, hour) => {
          const heightPct = max > 0 ? (count / max) * 100 : 0
          const isPeak = count === max && count > 0
          return (
            <div
              key={hour}
              className="relative flex-1 rounded-sm"
              style={{
                background:
                  count === 0
                    ? 'color-mix(in srgb, var(--theme-border) 30%, transparent)'
                    : isPeak
                      ? 'var(--theme-accent)'
                      : `color-mix(in srgb, var(--theme-accent) ${Math.max(20, heightPct)}%, transparent)`,
                height: count === 0 ? 4 : `${Math.max(8, heightPct)}%`,
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
  )
}
