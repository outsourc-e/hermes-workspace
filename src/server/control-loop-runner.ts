import { evaluateGovernedAction } from './approval-governance'
import {
  buildRouteCostAnomalies,
  normalizeCron,
  readJobBoardModel,
} from './dashboard-aggregator'
import { dashboardFetch } from './gateway-capabilities'
import { appendNovaFabricEvent } from './nova-fabric-store'
import { getTaylorApprovalQueue } from './taylor-approval-queue'
import type { NovaFabricEventRecord } from './nova-fabric-store'
import type { DashboardAnalyticsSection } from './dashboard-aggregator'

export const RUNNABLE_CONTROL_LOOPS = [
  'cost-route-watch',
  'morning-command-center',
  'jobboard-caretaker',
] as const

export type RunnableControlLoopId = (typeof RUNNABLE_CONTROL_LOOPS)[number]

export type ControlLoopRunResult = {
  loopId: RunnableControlLoopId
  dryRun: true
  ok: boolean
  summary: string
  findings: Array<string>
  refusals: Array<string>
  sources: Array<{ label: string; state: 'ok' | 'unavailable'; detail: string }>
}

// Minimal structural inputs so the per-loop builders stay pure and testable.

type AnalyticsInput = {
  windowDays: number
  totalTokens: number
  topModels: Array<{
    id: string
    tokens: number
    calls: number
    cost: number
    sessions: number
  }>
  estimatedCostUsd: number | null
  costLabel: string
} | null

type JobBoardInput = {
  online: boolean
  version: string | null
  stateKeys: number
  events: number
  taylorKanbanItems: number
  taylorKanban: {
    items: number
    open: number
    stale: number
    blockers: number
    topTitles: Array<string>
  } | null
}

function refusalFor(
  category: Parameters<typeof evaluateGovernedAction>[0]['category'],
  action: string,
): string {
  const verdict = evaluateGovernedAction({ category, action })
  return `Refused without approval: ${action} — ${verdict.reason}`
}

export function buildCostRouteWatchResult(input: {
  analytics: AnalyticsInput
}): ControlLoopRunResult {
  const refusals = [
    refusalFor('provider-config', 'change model routing'),
    refusalFor('spending', 'buy additional credits'),
  ]
  if (!input.analytics) {
    return {
      loopId: 'cost-route-watch',
      dryRun: true,
      ok: false,
      summary: 'Analytics source unavailable — no cost data to watch',
      findings: [],
      refusals,
      sources: [
        { label: 'analytics', state: 'unavailable', detail: '/api/analytics/usage failed' },
      ],
    }
  }
  const anomalies = buildRouteCostAnomalies(
    input.analytics as unknown as DashboardAnalyticsSection,
  )
  const findings =
    anomalies.length > 0
      ? anomalies
      : [
          `No route leaks: ${input.analytics.totalTokens} tokens across ${input.analytics.topModels.length} model${input.analytics.topModels.length === 1 ? '' : 's'} in ${input.analytics.windowDays}d, cost ${input.analytics.estimatedCostUsd === null ? input.analytics.costLabel : `$${input.analytics.estimatedCostUsd.toFixed(2)}`}`,
        ]
  return {
    loopId: 'cost-route-watch',
    dryRun: true,
    ok: true,
    summary:
      anomalies.length > 0
        ? `${anomalies.length} route anomal${anomalies.length === 1 ? 'y' : 'ies'} found`
        : 'Routes clean',
    findings,
    refusals,
    sources: [
      {
        label: 'analytics',
        state: 'ok',
        detail: `/api/analytics/usage · ${input.analytics.windowDays}d window`,
      },
    ],
  }
}

export function buildJobboardCaretakerResult(input: {
  jobBoard: JobBoardInput
}): ControlLoopRunResult {
  const refusals = [
    refusalFor('jobboard-write', 'mutate job board state (state.json is never edited directly)'),
    refusalFor('customer-vendor', 'notify a customer about an order'),
  ]
  if (!input.jobBoard.online) {
    return {
      loopId: 'jobboard-caretaker',
      dryRun: true,
      ok: false,
      summary: 'Job board unreachable over HTTP',
      findings: [],
      refusals,
      sources: [
        { label: 'job board', state: 'unavailable', detail: '/ping failed' },
      ],
    }
  }
  const kanban = input.jobBoard.taylorKanban
  const findings: Array<string> = []
  if (kanban) {
    findings.push(
      `${kanban.open} open card${kanban.open === 1 ? '' : 's'}; ${kanban.stale} stale (>7d); ${kanban.blockers} blocked`,
    )
    for (const title of kanban.topTitles.slice(0, 3)) {
      findings.push(`Top card: ${title}`)
    }
  } else {
    findings.push('Board answered but the Taylor kanban could not be parsed')
  }
  return {
    loopId: 'jobboard-caretaker',
    dryRun: true,
    ok: true,
    summary: kanban
      ? `${kanban.items} kanban item${kanban.items === 1 ? '' : 's'} triaged read-only`
      : 'Board reachable; kanban unparsed',
    findings,
    refusals,
    sources: [
      {
        label: 'job board',
        state: 'ok',
        detail: `HTTP /ping + /state · v${input.jobBoard.version ?? 'unknown'}`,
      },
    ],
  }
}

export function buildMorningCommandResult(input: {
  gatewayReachable: boolean
  approvals: { pending: number; actionable: number; degraded: boolean } | null
  cron: { total: number; failed: number; paused: number; nextRunAt: string | null } | null
  jobBoard: JobBoardInput | null
  googleConnected: boolean
}): ControlLoopRunResult {
  const refusals = [
    refusalFor('external-message', 'send the morning email digest'),
    refusalFor('jobboard-write', 'auto-triage kanban cards'),
  ]
  const findings: Array<string> = []
  const sources: ControlLoopRunResult['sources'] = []

  findings.push(
    input.gatewayReachable ? 'Hermes gateway up' : 'Hermes gateway DOWN',
  )
  sources.push({
    label: 'gateway',
    state: input.gatewayReachable ? 'ok' : 'unavailable',
    detail: 'health probe',
  })

  if (input.approvals) {
    findings.push(
      `${input.approvals.pending} item${input.approvals.pending === 1 ? '' : 's'} waiting on Taylor (${input.approvals.actionable} actionable in Mission Control)`,
    )
  }
  sources.push({
    label: 'approvals',
    state: input.approvals ? 'ok' : 'unavailable',
    detail: '/api/taylor-approvals',
  })

  if (input.cron) {
    findings.push(
      input.cron.failed > 0
        ? `${input.cron.failed} cron job${input.cron.failed === 1 ? '' : 's'} failing of ${input.cron.total}`
        : `${input.cron.total} cron jobs healthy`,
    )
  }
  sources.push({
    label: 'cron',
    state: input.cron ? 'ok' : 'unavailable',
    detail: '/api/cron/jobs',
  })

  if (input.jobBoard?.online && input.jobBoard.taylorKanban) {
    findings.push(
      `Job board: ${input.jobBoard.taylorKanban.open} open, ${input.jobBoard.taylorKanban.blockers} blocked`,
    )
  }
  sources.push({
    label: 'job board',
    state: input.jobBoard?.online ? 'ok' : 'unavailable',
    detail: 'HTTP endpoints',
  })

  findings.push(
    input.googleConnected
      ? 'Google Workspace connected (reads only; sends gated)'
      : 'Google Workspace not connected — inbox/calendar unavailable for the brief',
  )

  const ok = input.gatewayReachable
  return {
    loopId: 'morning-command-center',
    dryRun: true,
    ok,
    summary: ok
      ? `Morning brief assembled from ${sources.filter((s) => s.state === 'ok').length}/${sources.length} sources`
      : 'Morning brief degraded — gateway down',
    findings,
    refusals,
    sources,
  }
}

/** Every dry run leaves a verifiable work receipt in the fabric. */
export function recordControlLoopRun(
  loopId: RunnableControlLoopId,
  result: ControlLoopRunResult,
): NovaFabricEventRecord {
  return appendNovaFabricEvent({
    title: `Control loop dry run: ${loopId}`,
    summary: `${result.summary}. Findings: ${result.findings.slice(0, 3).join(' | ') || 'none'}. Refused ${result.refusals.length} external write${result.refusals.length === 1 ? '' : 's'} pending approval.`,
    eventKind: 'work-receipt',
    provenance: 'Mission Control /api/control-loops/run (server-side dry run)',
    riskLevel: 'low',
    verificationState: 'tool-verified',
    receiptLinks: [
      { label: 'loop', value: loopId, kind: 'receipt' },
    ],
  })
}

async function tryOrNull<T>(fn: () => Promise<T> | T): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/** Gathers real sources and executes one loop as a server-side dry run. */
export async function runControlLoopDry(
  loopId: RunnableControlLoopId,
): Promise<{ result: ControlLoopRunResult; receiptId: string | null }> {
  let result: ControlLoopRunResult
  if (loopId === 'cost-route-watch') {
    const analytics = await tryOrNull(async () => {
      const res = await dashboardFetch('/api/analytics/usage?days=7')
      if (!res.ok) throw new Error(`analytics ${res.status}`)
      return res.json() as Promise<AnalyticsInput>
    })
    result = buildCostRouteWatchResult({
      analytics: analytics && typeof analytics === 'object' ? analytics : null,
    })
  } else if (loopId === 'jobboard-caretaker') {
    const jobBoard = await readJobBoardModel()
    result = buildJobboardCaretakerResult({ jobBoard })
  } else {
    const [health, cronRaw, jobBoard] = await Promise.all([
      tryOrNull(async () => {
        const res = await dashboardFetch('/api/status')
        return res.ok
      }),
      tryOrNull(async () => {
        const res = await dashboardFetch('/api/cron/jobs')
        if (!res.ok) throw new Error(`cron ${res.status}`)
        return res.json() as Promise<unknown>
      }),
      tryOrNull(() => readJobBoardModel()),
    ])
    const approvals = await tryOrNull(() => {
      const queue = getTaylorApprovalQueue()
      return {
        pending: queue.counts.total,
        actionable: queue.counts.actionable,
        degraded: queue.degraded,
      }
    })
    const cron = cronRaw === null ? null : normalizeCron(cronRaw)
    result = buildMorningCommandResult({
      gatewayReachable: health === true,
      approvals,
      cron: cron
        ? {
            total: cron.total,
            failed: cron.failed,
            paused: cron.paused,
            nextRunAt: cron.nextRunAt,
          }
        : null,
      jobBoard,
      googleConnected: false,
    })
  }

  const receipt = await tryOrNull(() => recordControlLoopRun(loopId, result))
  return { result, receiptId: receipt?.id ?? null }
}
