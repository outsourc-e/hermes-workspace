import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function deltaText(curr: number, prev: number): {
  text: string
  tone: string
} {
  if (prev === 0) {
    return curr > 0
      ? { text: 'new', tone: 'var(--theme-success)' }
      : { text: 'flat', tone: 'var(--theme-muted)' }
  }
  const pct = ((curr - prev) / prev) * 100
  if (Math.abs(pct) < 1) return { text: 'flat', tone: 'var(--theme-muted)' }
  return {
    text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`,
    tone:
      pct > 0
        ? 'var(--theme-success)'
        : pct < -25
          ? 'var(--theme-warning)'
          : 'var(--theme-muted)',
  }
}

/**
 * Velocity tile — answers "how busy is this thing, day over day?"
 *
 * Three things in one card:
 *   1. Big number: sessions per day (averaged over the analytics
 *      window) so the tile reads as a *rate* rather than a snapshot.
 *   2. Delta vs the prior half of the window so the operator sees
 *      momentum direction, not just magnitude.
 *   3. Tiny sparkline of daily sessions to confirm the trend by eye.
 *
 * Pure derive from the existing analytics payload. Default-hidden
 * so it lives in the edit-mode menu rather than crowding the
 * default layout (Eric's iter 009 ask: more widgets in the menu).
 */
export function VelocityCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  if (!analytics || analytics.source !== 'analytics') return null
  if (analytics.daily.length === 0) return null

  const sessionsPerDay =
    analytics.totalSessions / Math.max(1, analytics.windowDays)
  const callsPerDay =
    analytics.totalApiCalls / Math.max(1, analytics.windowDays)

  // Period-over-period split for the delta chip.
  const dailySessions = analytics.daily.map((d) => d.sessions)
  const mid = Math.floor(dailySessions.length / 2)
  const recent = dailySessions.slice(mid).reduce((a, b) => a + b, 0)
  const prior = dailySessions.slice(0, mid).reduce((a, b) => a + b, 0)
  const delta = deltaText(recent, prior)

  const max = Math.max(...dailySessions, 1)

  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3"
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
            'linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 40%, transparent), transparent)',
        }}
      />

      <div className="flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Velocity
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {analytics.windowDays}d avg
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-2xl font-bold leading-none tabular-nums"
            style={{ color: 'var(--theme-text)' }}
          >
            {sessionsPerDay.toFixed(sessionsPerDay < 10 ? 1 : 0)}
          </span>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            sess/day
          </span>
        </div>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
          style={{
            background: `color-mix(in srgb, ${delta.tone} 14%, transparent)`,
            color: delta.tone,
          }}
        >
          {delta.text}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {formatNumber(callsPerDay)} calls/day
        </span>
        <div
          className="flex items-end gap-[2px]"
          style={{ height: 18, width: 96 }}
          aria-hidden
        >
          {dailySessions.map((c, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(8, (c / max) * 100)}%`,
                background:
                  c === 0
                    ? 'color-mix(in srgb, var(--theme-border) 35%, transparent)'
                    : `color-mix(in srgb, var(--theme-accent) ${Math.max(40, (c / max) * 100)}%, transparent)`,
              }}
              title={`day ${idx + 1}: ${c} session${c === 1 ? '' : 's'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
