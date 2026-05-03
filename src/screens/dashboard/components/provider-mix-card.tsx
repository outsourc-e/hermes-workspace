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
 * Provider mix donut.
 *
 * `analytics.topModels[]` is per-model. Operators usually care first
 * about *which provider family* is doing the work — anthropic vs
 * openai vs local — so this card collapses model ids by their leading
 * segment and renders the result as a CSS conic-gradient donut with
 * an inline legend.
 *
 * Heuristic rules for grouping (kept in the UI because the aggregator
 * doesn't currently expose provider as a field):
 *   - prefix matches like `claude-` → anthropic
 *   - `gpt-`, `o1`, `codex` → openai
 *   - `gemma`, `llama`, `qwen` → local
 *   - `gemini` → google
 *   - `grok` → xai
 *   - everything else is bucketed under its leading slug
 */
type Bucket = {
  key: string
  label: string
  tokens: number
  sessions: number
  tone: string
}

const FAMILY_TONES = [
  'var(--theme-accent)',
  'var(--theme-accent-secondary)',
  'var(--theme-success)',
  'var(--theme-warning)',
  'var(--theme-danger)',
  '#a78bfa',
  '#22d3ee',
  '#facc15',
]

function classify(modelId: string): { key: string; label: string } {
  const id = modelId.toLowerCase()
  if (id.startsWith('claude-') || id.includes('anthropic'))
    return { key: 'anthropic', label: 'anthropic' }
  if (
    id.startsWith('gpt-') ||
    id.startsWith('o1') ||
    id.startsWith('o3') ||
    id.includes('codex') ||
    id.includes('openai')
  )
    return { key: 'openai', label: 'openai' }
  if (id.includes('gemini') || id.includes('google'))
    return { key: 'google', label: 'google' }
  if (id.includes('grok') || id.includes('xai'))
    return { key: 'xai', label: 'xai' }
  if (
    id.startsWith('gemma') ||
    id.startsWith('llama') ||
    id.startsWith('qwen') ||
    id.startsWith('mistral') ||
    id.startsWith('mixtral') ||
    id.startsWith('deepseek') ||
    id.startsWith('phi')
  )
    return { key: 'local', label: 'local' }
  if (id.startsWith('minimax')) return { key: 'minimax', label: 'minimax' }
  // Fallback to leading slug before any dash.
  const slug = id.split(/[-/]/)[0] || 'other'
  return { key: slug, label: slug }
}

export function ProviderMixCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  const buckets: Array<Bucket> = useMemo(() => {
    if (!analytics || analytics.source !== 'analytics') return []
    const map = new Map<string, Bucket>()
    for (const m of analytics.topModels) {
      const klass = classify(m.id)
      const existing = map.get(klass.key)
      if (existing) {
        existing.tokens += m.tokens
        existing.sessions += m.sessions
      } else {
        map.set(klass.key, {
          key: klass.key,
          label: klass.label,
          tokens: m.tokens,
          sessions: m.sessions,
          tone: FAMILY_TONES[map.size % FAMILY_TONES.length],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.tokens - a.tokens)
  }, [analytics])

  if (buckets.length === 0) return null

  const totalTokens = buckets.reduce((a, b) => a + b.tokens, 0)
  if (totalTokens === 0) return null

  // Build a CSS conic-gradient donut. We accumulate angles as we
  // walk the sorted bucket list so each slice's start equals the
  // previous slice's end.
  let acc = 0
  const stops = buckets.map((b) => {
    const pct = (b.tokens / totalTokens) * 100
    const start = acc
    acc += pct
    return `${b.tone} ${start.toFixed(2)}% ${acc.toFixed(2)}%`
  })

  const conic = `conic-gradient(${stops.join(', ')})`
  const top = buckets[0]
  const topPct = (top.tokens / totalTokens) * 100

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
          Provider mix
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {analytics ? `${analytics.windowDays}d` : ''} · {buckets.length} fam
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Donut */}
        <div
          className="relative shrink-0"
          style={{ width: 64, height: 64 }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: conic }}
            aria-hidden
          />
          <div
            className="absolute inset-[10px] rounded-full"
            style={{ background: 'var(--theme-card)' }}
            aria-hidden
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
            <span
              className="font-mono text-[12px] font-bold tabular-nums"
              style={{ color: 'var(--theme-text)' }}
            >
              {topPct.toFixed(0)}%
            </span>
            <span
              className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.12em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              {top.label}
            </span>
          </div>
        </div>

        {/* Legend */}
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {buckets.slice(0, 4).map((b) => {
            const pct = (b.tokens / totalTokens) * 100
            return (
              <li
                key={b.key}
                className="flex items-center justify-between gap-2 text-[10px]"
                style={{ color: 'var(--theme-muted)' }}
                title={`${b.sessions} sessions \u00b7 ${formatTokens(b.tokens)} tokens`}
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <span
                    aria-hidden
                    className="inline-block size-1.5 shrink-0 rounded-full"
                    style={{ background: b.tone }}
                  />
                  <span
                    className="truncate font-mono uppercase tracking-[0.1em]"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {b.label}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {pct.toFixed(0)}%
                </span>
              </li>
            )
          })}
          {buckets.length > 4 ? (
            <li
              className="text-[9px] font-mono uppercase tracking-[0.1em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              +{buckets.length - 4} more
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
