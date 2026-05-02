import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ChartLineData01Icon,
  CancelIcon,
} from '@hugeicons/core-free-icons'
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

function shortDay(day: string): string {
  // Native API gives `YYYY-MM-DD`. Render as `Apr 18` etc. for axis ticks.
  const ts = Date.parse(day)
  if (!Number.isFinite(ts)) return day
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

type ChartDatum = {
  day: string
  label: string
  tokens: number
  input: number
  output: number
  cache: number
  reasoning: number
  sessions: number
  cost: number
}

/**
 * Big analytics card. Anchors the bottom-of-fold of the dashboard
 * and replaces the old top-3 model bar list with a full daily area
 * chart + top-models breakdown table. Click "Expand" to open the
 * deep modal with cache/reasoning split, sessions overlay, and full
 * by-model + cost ranking.
 *
 * Hides itself when analytics is unavailable. Empty state (analytics
 * present but no usage) renders a quiet placeholder so the dashboard
 * layout doesn't reflow.
 */
export function AnalyticsHeroCard({
  analytics,
}: {
  analytics: DashboardOverview['analytics']
}) {
  const [showModal, setShowModal] = useState(false)

  const data: Array<ChartDatum> = useMemo(() => {
    if (!analytics) return []
    return analytics.daily.map((d) => ({
      day: d.day,
      label: shortDay(d.day),
      tokens: d.inputTokens + d.outputTokens,
      input: d.inputTokens,
      output: d.outputTokens,
      cache: d.cacheReadTokens,
      reasoning: d.reasoningTokens,
      sessions: d.sessions,
      cost: d.estimatedCost,
    }))
  }, [analytics])

  if (!analytics) return null
  const hasData = analytics.source === 'analytics' && data.length > 0

  return (
    <>
      <div
        className="relative flex flex-col gap-3 overflow-hidden rounded-xl border p-4"
        style={{
          background:
            'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 90%, transparent))',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--theme-accent)' }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={ChartLineData01Icon}
              size={16}
              strokeWidth={1.5}
              style={{ color: 'var(--theme-accent)' }}
            />
            <div>
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--theme-text)' }}
              >
                Analytics · {analytics.windowDays}d
              </h3>
              <p
                className="font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{ color: 'var(--theme-muted)' }}
              >
                {formatTokens(analytics.totalTokens)} tokens ·{' '}
                {analytics.totalApiCalls.toLocaleString()} calls ·{' '}
                {formatCost(analytics.estimatedCostUsd ?? 0)}
              </p>
            </div>
          </div>
          {hasData ? (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:bg-[var(--theme-card)]/80"
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-muted)',
              }}
            >
              Expand →
            </button>
          ) : null}
        </div>

        {hasData ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data}
                    margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gtok" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--theme-accent)"
                          stopOpacity={0.45}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--theme-accent)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient id="gcache" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--theme-accent-secondary)"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--theme-accent-secondary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="2 4"
                      stroke="var(--theme-border)"
                      opacity={0.4}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: 'var(--theme-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--theme-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      tickFormatter={(v: number) => formatTokens(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--theme-card)',
                        border: '1px solid var(--theme-border)',
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      labelStyle={{
                        color: 'var(--theme-muted)',
                        fontSize: 10,
                      }}
                      formatter={(value: number, name: string) => [
                        formatTokens(value),
                        name,
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cache"
                      name="cache"
                      stroke="var(--theme-accent-secondary)"
                      fill="url(#gcache)"
                      strokeWidth={1}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      name="tokens"
                      stroke="var(--theme-accent)"
                      fill="url(#gtok)"
                      strokeWidth={1.6}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex items-center gap-4 text-[10px]">
                <LegendDot
                  tone="var(--theme-accent)"
                  label="tokens (in+out)"
                />
                <LegendDot
                  tone="var(--theme-accent-secondary)"
                  label="cache reads"
                />
              </div>
            </div>
            <div className="space-y-1.5 lg:col-span-4">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                style={{ color: 'var(--theme-muted)' }}
              >
                By model · top 5
              </div>
              {analytics.topModels.map((m, i) => {
                const max = analytics.topModels[0]?.tokens || 1
                const widthPct = Math.max(2, Math.round((m.tokens / max) * 100))
                return (
                  <div key={m.id} className="text-[11px]">
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span
                        className="truncate font-mono"
                        style={{ color: 'var(--theme-text)' }}
                        title={m.id}
                      >
                        <span
                          className="mr-1.5 inline-block w-3 text-right tabular-nums"
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
                          background:
                            i === 0
                              ? 'var(--theme-accent)'
                              : i === 1
                                ? 'var(--theme-accent-secondary)'
                                : 'var(--theme-muted)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div
            className="flex h-[120px] items-center justify-center rounded-md border border-dashed text-[11px]"
            style={{
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-muted)',
            }}
          >
            No analytics usage in the last {analytics.windowDays}d.
          </div>
        )}
      </div>

      {showModal && hasData ? (
        <AnalyticsModal
          analytics={analytics}
          data={data}
          onClose={() => setShowModal(false)}
        />
      ) : null}
    </>
  )
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span
      className="flex items-center gap-1.5"
      style={{ color: 'var(--theme-muted)' }}
    >
      <span
        className="size-2 rounded-full"
        style={{ background: tone }}
        aria-hidden
      />
      {label}
    </span>
  )
}

function AnalyticsModal({
  analytics,
  data,
  onClose,
}: {
  analytics: NonNullable<DashboardOverview['analytics']>
  data: Array<ChartDatum>
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-[var(--theme-card)]"
        style={{ borderColor: 'var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div>
            <h2
              className="text-sm font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--theme-text)' }}
            >
              Analytics · last {analytics.windowDays}d
            </h2>
            <p
              className="font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              {formatTokens(analytics.totalTokens)} tokens ·{' '}
              {analytics.totalSessions.toLocaleString()} sessions ·{' '}
              {analytics.totalApiCalls.toLocaleString()} calls ·{' '}
              {formatCost(analytics.estimatedCostUsd ?? 0)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 hover:bg-[var(--theme-card)]/80"
          >
            <HugeiconsIcon
              icon={CancelIcon}
              size={18}
              strokeWidth={1.5}
              style={{ color: 'var(--theme-muted)' }}
            />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <h3
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              Daily token mix
            </h3>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="var(--theme-border)"
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--theme-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--theme-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v: number) => formatTokens(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--theme-card)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(value: number, name: string) => [
                      formatTokens(value),
                      name,
                    ]}
                  />
                  <Bar
                    dataKey="input"
                    name="input"
                    stackId="t"
                    fill="var(--theme-accent)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="output"
                    name="output"
                    stackId="t"
                    fill="var(--theme-success)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="reasoning"
                    name="reasoning"
                    stackId="t"
                    fill="var(--theme-warning)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px]">
              <LegendDot tone="var(--theme-accent)" label="input" />
              <LegendDot tone="var(--theme-success)" label="output" />
              <LegendDot tone="var(--theme-warning)" label="reasoning" />
            </div>
          </div>

          <div className="lg:col-span-4">
            <h3
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              Models · ranked by tokens
            </h3>
            <div className="space-y-2">
              {analytics.topModels.map((m, i) => (
                <div
                  key={m.id}
                  className="rounded border px-3 py-2"
                  style={{ borderColor: 'var(--theme-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-mono text-[12px] font-semibold"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      <span
                        className="mr-1.5 inline-block w-4 text-right tabular-nums"
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
                    className="mt-1 truncate font-mono text-[10px]"
                    style={{ color: 'var(--theme-muted)' }}
                    title={m.id}
                  >
                    {m.id}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px]">
                    <span style={{ color: 'var(--theme-muted)' }}>
                      sessions{' '}
                      <span style={{ color: 'var(--theme-text)' }}>
                        {m.sessions.toLocaleString()}
                      </span>
                    </span>
                    <span style={{ color: 'var(--theme-muted)' }}>
                      calls{' '}
                      <span style={{ color: 'var(--theme-text)' }}>
                        {m.calls.toLocaleString()}
                      </span>
                    </span>
                    <span style={{ color: 'var(--theme-muted)' }}>
                      cost{' '}
                      <span style={{ color: 'var(--theme-text)' }}>
                        {formatCost(m.cost)}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
              {analytics.topModels.length === 0 ? (
                <div
                  className="rounded border border-dashed py-4 text-center text-[11px]"
                  style={{
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-muted)',
                  }}
                >
                  No model data.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
