import { checkHealth, getConfig, listSessions } from './claude-api'
import { normalizeCron } from './dashboard-aggregator'
import { dashboardFetch } from './gateway-capabilities'
import { getNovaFabricSnapshot } from './nova-fabric-store'
import { listAllActiveRuns } from './run-store'
import { getTaylorApprovalQueue } from './taylor-approval-queue'

// Structural input types so the pure builder never imports live I/O shapes.

export type BridgeSessionInput = {
  id: string
  title?: string | null
  model?: string | null
  started_at?: number
  last_active?: number | null
  message_count?: number
  input_tokens?: number
  output_tokens?: number
}

export type BridgeRunInput = {
  runId: string
  sessionKey: string
  friendlyId: string
  status: string
  updatedAt: number
  toolCalls: Array<{ id: string; name: string; phase: string }>
}

export type BridgeCronInput = {
  total: number
  failed: number
  paused: number
  nextRunAt: string | null
}

export type BridgeApprovalsInput = {
  pending: number
  actionable: number
  degraded: boolean
}

export type BridgeEventInput = {
  title: string
  eventKind: string
  createdAt: string
  verificationState: string
}

export type NovaSessionBridgeInput = {
  now: string
  gatewayReachable: boolean
  config: { model?: string; provider?: string } | null
  sessions: Array<BridgeSessionInput> | null
  activeRuns: Array<BridgeRunInput> | null
  cron: BridgeCronInput | null
  approvals: BridgeApprovalsInput | null
  recentEvents: Array<BridgeEventInput> | null
}

export type SessionBridgeSourceState = 'ok' | 'degraded' | 'unavailable'

export type NovaSessionBridge = {
  generatedAt: string
  route: { provider: string | null; model: string | null; source: string }
  session: {
    key: string
    title: string | null
    model: string | null
    lastActiveAt: string | null
    messageCount: number | null
    inputTokens: number | null
    outputTokens: number | null
  } | null
  activeTask: {
    runId: string
    friendlyId: string
    sessionKey: string
    status: string
    lastTool: string | null
    lastEventAt: string | null
  } | null
  backgroundJobs: BridgeCronInput | null
  needsTaylor: BridgeApprovalsInput | null
  receipts: Array<{ title: string; kind: string; at: string; verified: boolean }>
  blockers: Array<string>
  sources: Array<{ label: string; state: SessionBridgeSourceState; detail: string }>
}

/** Gateway timestamps arrive as epoch seconds; run-store uses milliseconds. */
function epochToIso(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  const ms = value < 1_000_000_000_000 ? value * 1000 : value
  return new Date(ms).toISOString()
}

const RECEIPT_KINDS = new Set(['work-receipt', 'approval', 'boundary', 'correction'])
const ACTIVE_RUN_STATUSES = new Set(['accepted', 'active', 'handoff', 'stalled'])

export function buildNovaSessionBridge(
  input: NovaSessionBridgeInput,
): NovaSessionBridge {
  const blockers: Array<string> = []
  const sources: NovaSessionBridge['sources'] = []

  if (!input.gatewayReachable) {
    blockers.push('Hermes gateway unreachable — session and route data unavailable')
  }
  sources.push({
    label: 'Hermes gateway',
    state: input.gatewayReachable ? 'ok' : 'unavailable',
    detail: input.gatewayReachable ? 'health probe answered' : 'health probe failed',
  })

  const route = {
    provider: input.config?.provider ?? null,
    model: input.config?.model ?? null,
    source: 'gateway /api/config',
  }
  sources.push({
    label: 'Model route',
    state: input.config ? 'ok' : 'unavailable',
    detail: input.config
      ? `${route.provider ?? 'unknown'} / ${route.model ?? 'unknown'}`
      : 'gateway config unreadable',
  })

  let session: NovaSessionBridge['session'] = null
  if (input.sessions && input.sessions.length > 0) {
    const newest = [...input.sessions].sort(
      (a, b) =>
        (b.last_active ?? b.started_at ?? 0) - (a.last_active ?? a.started_at ?? 0),
    )[0]
    session = {
      key: newest.id,
      title: newest.title ?? null,
      model: newest.model ?? null,
      lastActiveAt: epochToIso(newest.last_active ?? newest.started_at ?? null),
      messageCount: newest.message_count ?? null,
      inputTokens: newest.input_tokens ?? null,
      outputTokens: newest.output_tokens ?? null,
    }
  }
  sources.push({
    label: 'Sessions',
    state: input.sessions ? 'ok' : 'unavailable',
    detail: input.sessions
      ? `${input.sessions.length} recent session${input.sessions.length === 1 ? '' : 's'}`
      : 'sessions API unreadable',
  })

  let activeTask: NovaSessionBridge['activeTask'] = null
  if (input.activeRuns && input.activeRuns.length > 0) {
    const running = input.activeRuns
      .filter((run) => ACTIVE_RUN_STATUSES.has(run.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    if (running.length > 0) {
      const newest = running[0]
      const lastTool =
        newest.toolCalls.length > 0
          ? newest.toolCalls[newest.toolCalls.length - 1].name
          : null
      activeTask = {
        runId: newest.runId,
        friendlyId: newest.friendlyId,
        sessionKey: newest.sessionKey,
        status: newest.status,
        lastTool,
        lastEventAt: epochToIso(newest.updatedAt),
      }
      if (newest.status === 'stalled') {
        blockers.push(`Run ${newest.friendlyId} is stalled in ${newest.sessionKey}`)
      }
    }
  }
  sources.push({
    label: 'Active runs',
    state: input.activeRuns ? 'ok' : 'unavailable',
    detail: input.activeRuns
      ? `${input.activeRuns.length} tracked run${input.activeRuns.length === 1 ? '' : 's'}`
      : 'run store unreadable',
  })

  if (input.cron && input.cron.failed > 0) {
    blockers.push(
      `${input.cron.failed} cron job${input.cron.failed === 1 ? '' : 's'} failing`,
    )
  }
  sources.push({
    label: 'Cron/background',
    state: input.cron ? 'ok' : 'unavailable',
    detail: input.cron
      ? `${input.cron.total} jobs, ${input.cron.failed} failed`
      : 'cron endpoint unreadable',
  })

  if (input.approvals?.degraded) {
    blockers.push('Approval queue degraded — fabric store unreadable')
  }
  sources.push({
    label: 'Taylor approvals',
    state: input.approvals ? (input.approvals.degraded ? 'degraded' : 'ok') : 'unavailable',
    detail: input.approvals
      ? `${input.approvals.pending} pending`
      : 'approval queue unreadable',
  })

  const receipts = (input.recentEvents ?? [])
    .filter((event) => RECEIPT_KINDS.has(event.eventKind))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5)
    .map((event) => ({
      title: event.title,
      kind: event.eventKind,
      at: event.createdAt,
      verified: event.verificationState === 'tool-verified',
    }))
  sources.push({
    label: 'Work receipts',
    state: input.recentEvents ? 'ok' : 'unavailable',
    detail: input.recentEvents
      ? `${receipts.length} recent receipt${receipts.length === 1 ? '' : 's'}`
      : 'fabric store unreadable',
  })

  return {
    generatedAt: input.now,
    route,
    session,
    activeTask,
    backgroundJobs: input.cron,
    needsTaylor: input.approvals,
    receipts,
    blockers,
    sources,
  }
}

async function tryOrNull<T>(fn: () => Promise<T> | T): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/** Gathers every bridge source from the real local systems; never throws. */
export async function gatherNovaSessionBridge(): Promise<NovaSessionBridge> {
  const [health, config, sessions, activeRuns, cronRaw] = await Promise.all([
    tryOrNull(() => checkHealth()),
    tryOrNull(() => getConfig()),
    tryOrNull(() => listSessions(10, 0)),
    tryOrNull(() => listAllActiveRuns()),
    tryOrNull(async () => {
      const res = await dashboardFetch('/api/cron/jobs')
      if (!res.ok) throw new Error(`cron ${res.status}`)
      return res.json() as Promise<unknown>
    }),
  ])
  const cronSection = cronRaw === null ? null : normalizeCron(cronRaw)

  const approvals = await tryOrNull(() => {
    const queue = getTaylorApprovalQueue()
    return {
      pending: queue.counts.total,
      actionable: queue.counts.actionable,
      degraded: queue.degraded,
    }
  })

  const recentEvents = await tryOrNull(() =>
    getNovaFabricSnapshot().fabric.events.map((event) => ({
      title: event.title,
      eventKind: event.eventKind,
      createdAt: event.createdAt,
      verificationState: event.verificationState,
    })),
  )

  return buildNovaSessionBridge({
    now: new Date().toISOString(),
    gatewayReachable: health !== null,
    config: config
      ? { model: config.model, provider: config.provider }
      : null,
    sessions: sessions as Array<BridgeSessionInput> | null,
    activeRuns: activeRuns
      ? activeRuns.map((run) => ({
          runId: run.runId,
          sessionKey: run.sessionKey,
          friendlyId: run.friendlyId,
          status: run.status,
          updatedAt: run.updatedAt,
          toolCalls: run.toolCalls.map((call) => ({
            id: call.id,
            name: call.name,
            phase: call.phase,
          })),
        }))
      : null,
    cron: cronSection
      ? {
          total: cronSection.total,
          failed: cronSection.failed,
          paused: cronSection.paused,
          nextRunAt: cronSection.nextRunAt,
        }
      : null,
    approvals,
    recentEvents,
  })
}
