import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

type Slice = {
  label: string
  value: number
  tone: string
  hint: string
}

/**
 * Token mix card. Pure derive-from-aggregator: shows the input vs
 * output vs cache vs reasoning split as a stacked horizontal bar plus
 * a tiny legend table. The Hermes Agent confirmed this is chartable
 * today from `daily[].input_tokens / output_tokens / cache_read_tokens
 * / reasoning_tokens` (no backend change required).
 *
 * Surfaces the cache reads -- which on this stack are several times
 * larger than input -- so the operator can see "the agent is reading
 * a lot more than it's writing" at a glance.
 */
export function TokenMixCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  if (!analytics || analytics.source !== 'analytics') return null

  const total =
    analytics.inputTokens +
    analytics.outputTokens +
    analytics.cacheReadTokens +
    analytics.reasoningTokens
  if (total === 0) return null

  const slices: Array<Slice> = [
    {
      label: 'cache',
      value: analytics.cacheReadTokens,
      tone: 'var(--theme-accent-secondary)',
      hint: 'Cache read tokens. Free vs first-pass input on most providers.',
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
      hint: 'Completion tokens emitted by the model.',
    },
    {
      label: 'reasoning',
      value: analytics.reasoningTokens,
      tone: 'var(--theme-warning)',
      hint: 'Thinking/reasoning tokens (when supported).',
    },
  ]

  const ratio =
    analytics.inputTokens > 0
      ? (analytics.outputTokens / analytics.inputTokens) * 100
      : 0

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
          Token mix · {analytics.windowDays}d
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
          title="Output as % of input — proxy for how chatty the model is."
        >
          out/in {ratio.toFixed(1)}%
        </span>
      </div>

      {/* Stacked bar */}
      <div
        className="flex h-2 w-full overflow-hidden rounded-full"
        style={{
          background:
            'color-mix(in srgb, var(--theme-border) 40%, transparent)',
        }}
      >
        {slices.map((s) => {
          const widthPct = Math.max(0, (s.value / total) * 100)
          if (widthPct < 0.5) return null
          return (
            <div
              key={s.label}
              style={{
                width: `${widthPct}%`,
                background: s.tone,
              }}
              title={`${s.label}: ${formatTokens(s.value)} (${widthPct.toFixed(1)}%)`}
            />
          )
        })}
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {slices.map((s) => {
          const widthPct = total > 0 ? (s.value / total) * 100 : 0
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
  )
}
