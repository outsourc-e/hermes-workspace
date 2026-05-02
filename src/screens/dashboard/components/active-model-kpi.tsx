import { formatModelName } from '@/screens/dashboard/lib/formatters'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatCount(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/**
 * Hero-row tile showing the *active* model. Replaces the Cost tile
 * the operator was finding misleading (the gateway runs codex / OAuth
 * which structurally read \$0). This tile answers a more decision-
 * relevant question: "what is Hermes routing through right now and
 * how much of the load is it carrying?"
 *
 * Wireframe-equivalent to the other Hero tiles (matching gradient
 * accent + connection pulse) so the row stays balanced.
 */
export function ActiveModelKpi({
  modelInfo,
  analytics,
}: {
  modelInfo: DashboardOverview['modelInfo']
  analytics: DashboardOverview['analytics']
}) {
  const connected = !!modelInfo
  const display = modelInfo ? formatModelName(modelInfo.model) : '—'
  const provider = modelInfo?.provider ?? '—'

  // Routing share (proxy): % of calls in the analytics window that hit
  // the active model. Hermes Agent confirmed this is the closest
  // available metric without a dedicated routing-decisions endpoint.
  const share = ((): number | null => {
    if (!modelInfo || !analytics) return null
    if (analytics.totalApiCalls <= 0) return null
    const match = analytics.topModels.find((m) => m.id === modelInfo.model)
    if (!match) return null
    return Math.round((match.calls / analytics.totalApiCalls) * 100)
  })()

  const sessionsForModel = ((): number | null => {
    if (!modelInfo || !analytics) return null
    const match = analytics.topModels.find((m) => m.id === modelInfo.model)
    return match?.sessions ?? null
  })()

  const tone = connected ? 'var(--theme-success)' : 'var(--theme-danger)'

  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border px-4 pb-3 pt-4"
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
          background: `linear-gradient(90deg, ${tone}, ${tone}55, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ background: tone }}
      />

      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          Active Model
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: connected
              ? 'color-mix(in srgb, var(--theme-success) 14%, transparent)'
              : 'color-mix(in srgb, var(--theme-danger) 14%, transparent)',
            color: tone,
          }}
        >
          <span className="size-1.5 rounded-full" style={{ background: tone }} />
          {connected ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <span
          className="font-mono text-2xl font-bold leading-none tracking-tight"
          style={{ color: 'var(--theme-text)' }}
          title={modelInfo?.model}
        >
          {display}
        </span>
        {share !== null ? (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{
              background: 'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
              color: 'var(--theme-accent)',
            }}
            title="Share of API calls in the analytics window."
          >
            {share}% calls
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span
          className="truncate font-mono uppercase tracking-[0.12em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {provider}
          {sessionsForModel !== null
            ? ` · ${formatCount(sessionsForModel)} sessions`
            : ''}
        </span>
        {modelInfo?.effectiveContextLength ? (
          <span
            className="font-mono uppercase tracking-[0.12em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            ctx {formatCount(modelInfo.effectiveContextLength)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
