import { useMemo } from 'react'
import { cn } from '@/lib/utils'

export type MissionReportEntry = {
  id: string
  name?: string
  goal: string
  teamName: string
  agents: Array<{ id: string; name: string; modelId: string }>
  tokenCount: number
  costEstimate: number
  duration: number
  completedAt: number
  [key: string]: unknown
}

export type CostAnalyticsDashboardProps = {
  missionReports: MissionReportEntry[]
  compact?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateCost(tokens: number): number {
  return tokens * 0.000003 // ~$3/M tokens rough estimate
}

function dayKey(ts: number | string | undefined): string {
  if (!ts) return 'unknown'
  return new Date(ts).toISOString().slice(0, 10)
}

function relativeDay(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

type BarEntry = { label: string; value: number; pct: number }

function CSSBarChart({ entries, unit = '', color = 'bg-accent-500' }: { entries: BarEntry[]; unit?: string; color?: string }) {
  if (entries.length === 0) return <p className="text-xs text-neutral-400 italic">No data</p>
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div key={e.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-[11px] text-neutral-600 dark:text-neutral-400 text-right">{e.label}</span>
          <div className="flex-1 h-5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', color)}
              style={{ width: `${Math.max(e.pct, 2)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-[11px] font-mono text-neutral-500 dark:text-neutral-400 tabular-nums">
            {unit === '$' ? `$${e.value.toFixed(4)}` : e.value.toLocaleString()}{unit !== '$' ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CostAnalyticsDashboard({ missionReports, compact = false }: CostAnalyticsDashboardProps) {
  const stats = useMemo(() => {
    const now = Date.now()
    const todayStr = new Date().toISOString().slice(0, 10)
    const weekAgo = now - 7 * 86400000

    let totalTokens = 0
    let totalCost = 0
    let todayTokens = 0
    let todayCost = 0
    let weekTokens = 0
    let weekCost = 0

    const byAgent: Record<string, { tokens: number; cost: number }> = {}
    const byModel: Record<string, { tokens: number; cost: number }> = {}
    const byDay: Record<string, { tokens: number; cost: number }> = {}

    for (const r of missionReports) {
      const tokens = r.tokenCount ?? 0
      const cost = r.costEstimate ?? estimateCost(tokens)
      const ts = r.completedAt ?? 0
      const tsNum = typeof ts === 'string' ? new Date(ts).getTime() : ts
      const day = dayKey(ts)

      totalTokens += tokens
      totalCost += cost

      if (day === todayStr) { todayTokens += tokens; todayCost += cost }
      if (tsNum > weekAgo) { weekTokens += tokens; weekCost += cost }

      // By agent
      if (r.agents && r.agents.length > 0) {
        const perAgentTokens = tokens / r.agents.length
        const perAgentCost = cost / r.agents.length
        for (const m of r.agents) {
          const name = m.name || m.id || 'unknown'
          byAgent[name] = byAgent[name] ?? { tokens: 0, cost: 0 }
          byAgent[name].tokens += perAgentTokens
          byAgent[name].cost += perAgentCost

          const model = m.modelId || 'unknown'
          byModel[model] = byModel[model] ?? { tokens: 0, cost: 0 }
          byModel[model].tokens += perAgentTokens
          byModel[model].cost += perAgentCost
        }
      } else {
        byAgent['mission'] = byAgent['mission'] ?? { tokens: 0, cost: 0 }
        byAgent['mission'].tokens += tokens
        byAgent['mission'].cost += cost
      }

      // By day
      byDay[day] = byDay[day] ?? { tokens: 0, cost: 0 }
      byDay[day].tokens += tokens
      byDay[day].cost += cost
    }

    const avgCost = missionReports.length > 0 ? totalCost / missionReports.length : 0

    // Build bar entries
    const maxAgentCost = Math.max(...Object.values(byAgent).map((a) => a.cost), 0.0001)
    const agentBars: BarEntry[] = Object.entries(byAgent)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 10)
      .map(([label, v]) => ({ label, value: v.cost, pct: (v.cost / maxAgentCost) * 100 }))

    const maxModelCost = Math.max(...Object.values(byModel).map((m) => m.cost), 0.0001)
    const modelBars: BarEntry[] = Object.entries(byModel)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 10)
      .map(([label, v]) => ({ label: label.split('/').pop() ?? label, value: v.cost, pct: (v.cost / maxModelCost) * 100 }))

    // Last 7 days
    const days: string[] = []
    for (let i = 6; i >= 0; i--) {
      days.push(new Date(now - i * 86400000).toISOString().slice(0, 10))
    }
    const maxDayCost = Math.max(...days.map((d) => byDay[d]?.cost ?? 0), 0.0001)
    const dayBars: BarEntry[] = days.map((d) => ({
      label: relativeDay(d),
      value: byDay[d]?.cost ?? 0,
      pct: ((byDay[d]?.cost ?? 0) / maxDayCost) * 100,
    }))

    return { totalTokens, totalCost, todayTokens, todayCost, weekTokens, weekCost, avgCost, agentBars, modelBars, dayBars, missionCount: missionReports.length }
  }, [missionReports])

  const CARD = cn(
    'rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-slate-900 shadow-sm',
    compact ? 'p-3' : 'p-4',
  )
  const STAT_LABEL = cn(
    'uppercase tracking-wider text-neutral-500 dark:text-neutral-400',
    compact ? 'text-[9px]' : 'text-[10px]',
  )
  const STAT_VALUE = cn(
    'font-bold text-neutral-900 dark:text-white tabular-nums',
    compact ? 'text-base' : 'text-xl',
  )
  const summaryCards = compact
    ? [
        { label: 'Tot. Mis', value: String(stats.missionCount) },
        { label: 'Tot. Tok', value: stats.totalTokens.toLocaleString() },
        { label: 'Tot. Cost', value: `$${stats.totalCost.toFixed(4)}` },
        { label: 'Avg/Mis', value: `$${stats.avgCost.toFixed(4)}` },
        { label: 'Today', value: `$${stats.todayCost.toFixed(4)}`, detail: `${stats.todayTokens.toLocaleString()} tok` },
        { label: '7d', value: `$${stats.weekCost.toFixed(4)}`, detail: `${stats.weekTokens.toLocaleString()} tok` },
      ]
    : [
        { label: 'Total Missions', value: String(stats.missionCount) },
        { label: 'Total Tokens', value: stats.totalTokens.toLocaleString() },
        { label: 'Total Cost', value: `$${stats.totalCost.toFixed(4)}` },
        { label: 'Avg / Mission', value: `$${stats.avgCost.toFixed(4)}` },
        { label: 'Today', value: `$${stats.todayCost.toFixed(4)}`, detail: `${stats.todayTokens.toLocaleString()} tok` },
        { label: 'This Week', value: `$${stats.weekCost.toFixed(4)}`, detail: `${stats.weekTokens.toLocaleString()} tok` },
      ]
  const chartTitleClass = compact ? 'mb-2 text-xs font-semibold text-neutral-900 dark:text-white' : 'mb-3 text-sm font-semibold text-neutral-900 dark:text-white'

  return (
    <div className={cn('overflow-y-auto', compact ? 'space-y-3 p-3' : 'space-y-4 p-4')}>
      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
        {summaryCards.map((card) => (
          <div key={card.label} className={CARD}>
            <p className={STAT_LABEL}>{card.label}</p>
            <p className={STAT_VALUE}>{card.value}</p>
            {card.detail ? <p className="text-[10px] text-neutral-400">{card.detail}</p> : null}
          </div>
        ))}
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* By Agent */}
        <div className={CARD}>
          <h3 className={chartTitleClass}>Cost by Agent</h3>
          <CSSBarChart entries={stats.agentBars} unit="$" color="bg-violet-500" />
        </div>

        {/* By Model */}
        <div className={CARD}>
          <h3 className={chartTitleClass}>Cost by Model</h3>
          <CSSBarChart entries={stats.modelBars} unit="$" color="bg-sky-500" />
        </div>

        {/* Daily Timeline */}
        <div className={CARD}>
          <h3 className={chartTitleClass}>Daily Cost (7d)</h3>
          <CSSBarChart entries={stats.dayBars} unit="$" color="bg-emerald-500" />
        </div>
      </div>

      {stats.missionCount === 0 && (
        <div className="flex items-center justify-center py-12 text-sm text-neutral-400">
          No mission data yet. Complete some missions to see analytics.
        </div>
      )}
    </div>
  )
}
