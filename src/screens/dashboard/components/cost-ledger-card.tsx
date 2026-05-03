import { useMemo } from 'react'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

const SUBSCRIPTION_PATTERNS: Array<RegExp> = [
  /(^|[\s\-:/])codex(\b|[-/])/i,
  /anthropic[-_]?oauth/i,
  /^claude-(opus|sonnet|haiku)/i,
  /minimax/i,
  /ollama/i,
  /lmstudio/i,
  /^pc1-/i,
  /^pc2-/i,
  /^gemma/i,
  /^llama/i,
  /^qwen/i,
]

function isSubscription(modelId: string): boolean {
  return SUBSCRIPTION_PATTERNS.some((re) => re.test(modelId))
}

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCostUsd(usd: number): string {
  if (usd <= 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  if (usd < 1) return `$${usd.toFixed(3)}`
  if (usd < 100) return `$${usd.toFixed(2)}`
  return `$${Math.round(usd).toLocaleString()}`
}

/**
 * Per-model cost ledger.
 *
 * The retired Cost KPI tile failed because it averaged paid + free
 * providers and produced a meaningless single number. This card
 * recovers the underlying signal *without* lying:
 *
 *   - Splits each row into 'paid' (real $$) vs 'included'
 *     (subscription / local / oauth) categories.
 *   - Sorts paid rows by cost descending so the operator sees what
 *     is actually burning money first.
 *   - Falls back to tokens for the included rows so they still get
 *     a comparable magnitude to eyeball.
 *
 * Default-hidden so we don't reintroduce the noise on the main
 * layout; lives in the edit-mode menu for users who want to track
 * spend explicitly.
 */
export function CostLedgerCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  const rows = useMemo(() => {
    if (!analytics || analytics.source !== 'analytics') return []
    return analytics.topModels
      .map((m) => ({
        ...m,
        included: isSubscription(m.id),
      }))
      .sort((a, b) => {
        // Paid first (sorted by descending cost), then included by
        // descending tokens.
        if (a.included !== b.included) return a.included ? 1 : -1
        if (!a.included && !b.included) return b.cost - a.cost
        return b.tokens - a.tokens
      })
  }, [analytics])

  if (rows.length === 0) return null

  const paidTotal = rows
    .filter((r) => !r.included)
    .reduce((a, r) => a + r.cost, 0)

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
            'linear-gradient(90deg, var(--theme-warning), color-mix(in srgb, var(--theme-warning) 40%, transparent), transparent)',
        }}
      />

      <div className="flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Cost ledger
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
          title="Total billed across non-subscription rows."
        >
          {formatCostUsd(paidTotal)} paid
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.slice(0, 6).map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 text-[10px]"
            style={{ color: 'var(--theme-muted)' }}
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span
                aria-hidden
                className="inline-block size-1.5 shrink-0 rounded-full"
                style={{
                  background: row.included
                    ? 'var(--theme-success)'
                    : 'var(--theme-warning)',
                }}
              />
              <span
                className="truncate font-mono uppercase tracking-[0.08em]"
                style={{ color: 'var(--theme-text)' }}
                title={row.id}
              >
                {row.id}
              </span>
            </span>
            <span
              className="shrink-0 font-mono tabular-nums"
              style={{ color: 'var(--theme-text)' }}
            >
              {row.included ? (
                <span title={`${row.sessions} sessions`}>
                  {formatTokens(row.tokens)}
                  <span
                    className="ml-1"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    incl
                  </span>
                </span>
              ) : (
                <span title={`${row.sessions} sessions \u00b7 ${row.tokens.toLocaleString()} tokens`}>
                  {formatCostUsd(row.cost)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
