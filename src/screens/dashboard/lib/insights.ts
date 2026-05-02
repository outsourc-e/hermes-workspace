/**
 * Lightweight client-side insights derived from the analytics payload.
 *
 * The native dashboard doesn't (yet) emit precomputed callouts, so we
 * compute them here from `analytics.daily` + `analytics.topModels`. The
 * goal is "command summary, not chart wall" — three short sentences
 * the operator can read in two seconds before scanning the chart.
 *
 * We deliberately keep these defensive — if there isn't enough data we
 * return fewer lines instead of producing nonsense.
 */
import type { DashboardOverview } from '@/server/dashboard-aggregator'
import { formatModelName } from '@/screens/dashboard/lib/formatters'

export type Insight = {
  text: string
  tone: 'info' | 'positive' | 'warn'
}

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortDate(day: string): string {
  const ts = Date.parse(day)
  if (!Number.isFinite(ts)) return day
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function buildInsights(
  analytics: DashboardOverview['analytics'],
  cron: DashboardOverview['cron'],
  status: DashboardOverview['status'],
): Array<Insight> {
  const out: Array<Insight> = []
  if (!analytics || analytics.source !== 'analytics') return out

  // 1. Peak day
  const daily = analytics.daily
  if (daily.length >= 3) {
    let peakIdx = 0
    let peakVal = 0
    for (let i = 0; i < daily.length; i += 1) {
      const total = daily[i].inputTokens + daily[i].outputTokens
      if (total > peakVal) {
        peakVal = total
        peakIdx = i
      }
    }
    if (peakVal > 0) {
      const top = analytics.topModels[0]
      const driver = top ? `, driven by ${formatModelName(top.id)}` : ''
      out.push({
        tone: 'info',
        text: `Usage peaked ${shortDate(daily[peakIdx].day)} (${formatTokens(peakVal)} tokens)${driver}.`,
      })
    }
  }

  // 2. Cache vs prior period (if window is at least 14 days)
  if (daily.length >= 14) {
    const mid = Math.floor(daily.length / 2)
    let priorCache = 0
    let recentCache = 0
    for (let i = 0; i < mid; i += 1) priorCache += daily[i].cacheReadTokens
    for (let i = mid; i < daily.length; i += 1) recentCache += daily[i].cacheReadTokens
    if (priorCache > 0) {
      const delta = ((recentCache - priorCache) / priorCache) * 100
      if (Math.abs(delta) >= 5) {
        out.push({
          tone: delta > 0 ? 'positive' : 'warn',
          text: `Cache reads ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)}% vs prior period.`,
        })
      }
    }
  }

  // 3. Operational signal: stale cron + active runs + restart pending
  const ops: Array<string> = []
  if (cron && cron.nextRunAt) {
    const nextMs = Date.parse(cron.nextRunAt)
    if (Number.isFinite(nextMs) && nextMs - Date.now() < -7 * 86_400_000) {
      ops.push(
        `${cron.total} stale cron job${cron.total === 1 ? '' : 's'}`,
      )
    }
  }
  if (status && status.gatewayState === 'running' && status.activeAgents === 0) {
    ops.push('no active runs')
  }
  if (status?.restartRequested) ops.push('restart pending')
  if (ops.length > 0) {
    out.push({
      tone: ops.length >= 2 ? 'warn' : 'info',
      text: ops.join(' · ') + '.',
    })
  }

  return out
}
