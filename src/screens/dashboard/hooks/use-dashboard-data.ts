/**
 * useDashboardData — single source of truth for all dashboard data.
 *
 * Wraps all existing queries, centralizes derived computations,
 * and returns a single normalized view model consumed by the
 * dashboard screen and its widgets.
 */
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchInstalledSkills } from '../components/skills-widget'
import { fetchUsage } from '../components/usage-meter-widget'
import { formatModelName, formatMoney, formatRelativeTime, formatTokens, formatUptime } from '../lib/formatters'
import { chatQueryKeys, fetchGatewayStatus, fetchSessions } from '@/screens/chat/chat-queries'
import { fetchCronJobs } from '@/lib/cron-api'

// ─── Internal helpers ────────────────────────────────────────────────────────

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const asNum = Number(value)
    if (Number.isFinite(asNum)) {
      return asNum > 1_000_000_000_000 ? asNum : asNum * 1000
    }
  }
  return 0
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toSessionDisplayName(session: Record<string, unknown>): string {
  const label = readString(session.label)
  if (label && !/^a new session was started/i.test(label)) return label
  const derived = readString(session.derivedTitle)
  if (derived && !/^a new session was started/i.test(derived)) return derived
  const title = readString(session.title)
  if (title && !/^a new session was started/i.test(title)) return title
  const friendlyId = readString(session.friendlyId) || readString(session.key)
  return friendlyId === 'main' ? 'Main Session' : (friendlyId || 'Session')
}

/** Returns true if the session is a spawned subagent or Agent Hub mission session (exclude from hero counts). */
function isSubagentSession(session: Record<string, unknown>): boolean {
  const key = readString(session.key ?? session.sessionKey ?? '')
  const label = readString(session.label ?? '')
  return (
    key.startsWith('agent:main:subagent:') ||
    key.includes('subagent') ||
    label.toLowerCase().includes('subagent') ||
    label.startsWith('Mission:') ||
    key.includes('hub-')
  )
}

function getSessionActivityTimestamp(session: SessionStatusSession): number {
  return normalizeTimestamp(session.updatedAt ?? session.usage?.lastActivity ?? 0)
}

// ─── API fetch functions ─────────────────────────────────────────────────────

type SessionStatusSession = {
  key?: string
  agentId?: string
  label?: string
  model?: string
  updatedAt?: number
  usage?: {
    firstActivity?: number
    lastActivity?: number
    totalCost?: number
    dailyBreakdown?: Array<{
      date: string
      tokens?: number
      totalTokens?: number
      inputTokens?: number
      outputTokens?: number
      cost?: number
    }>
    dailyMessageCounts?: Array<{
      date: string
      total: number
      user: number
      assistant: number
      toolCalls: number
    }>
    dailyLatency?: Array<{
      date: string
      count: number
      avgMs: number
      p95Ms: number
    }>
    dailyModelUsage?: Array<{
      date: string
      provider: string
      model: string
      tokens: number
      cost: number
      count: number
    }>
    [key: string]: unknown
  }
  [key: string]: unknown
}

type SessionStatusPayload = {
  ok?: boolean
  payload?: {
    updatedAt?: number
    model?: string
    currentModel?: string
    modelAlias?: string
    startDate?: string
    sessions?: Array<SessionStatusSession>
    [key: string]: unknown
  }
}

async function fetchSessionStatus(): Promise<SessionStatusPayload> {
  const res = await fetch('/api/session-status')
  if (!res.ok) {
    throw new Error(`Failed to fetch session status (HTTP ${res.status})`)
  }
  return res.json() as Promise<SessionStatusPayload>
}

type CostPoint = { date: string; amount: number }

async function fetchCostTimeseries(): Promise<Array<CostPoint>> {
  try {
    const res = await fetch('/api/cost')
    if (!res.ok) throw new Error('Unable to load cost summary')
    const payload = (await res.json()) as Record<string, unknown>
    if (!payload.ok) throw new Error('Unable to load cost summary')
    const costObj = payload.cost as Record<string, unknown> | undefined
    const rows = Array.isArray(costObj?.timeseries) ? costObj.timeseries : []
    return (rows as Array<Record<string, unknown>>)
      .map((p) => ({
        date: readString(p.date),
        amount: readNumber(p.amount),
      }))
      .filter((p) => p.date.length > 0)
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unable to load cost summary')
  }
}

// ─── Public types ────────────────────────────────────────────────────────────

export type SessionInfo = {
  key: string
  friendlyId: string
  label: string
  model: string
  updatedAt: number
}

export type AgentInfo = {
  id: string
  name: string
  status: 'active' | 'idle' | 'available'
  model: string
  modelFormatted: string
  updatedAt: number
}

export type DashboardAlert = {
  id: string
  text: string
  severity: 'amber' | 'red'
  dismissable: boolean
}

export type DashboardData = {
  /** Overall load state */
  status: 'loading' | 'ready' | 'error'
  /** Usage-specific load state (separate from overall status) */
  usageStatus: 'idle' | 'loading' | 'ready' | 'timeout' | 'error'
  /** Today's total spend in USD — null while loading, 0 after all sources exhausted */
  todayCostUsd: number | null
  connection: { connected: boolean; syncing: boolean }
  /** Last update timestamp from session-status payload (ms) */
  updatedAt: number
  sessions: {
    /** Count of sessions active in last 24h */
    total: number
    /** Count of sessions active in last 5 minutes */
    active: number
    /** Recent session list for widget */
    list: SessionInfo[]
  }
  agents: {
    total: number
    active: number
    idle: number
    /** Name of the most-stalled agent (30+ min idle), null if none */
    stalled: string | null
    roster: AgentInfo[]
  }
  cost: {
    /** Today's total spend in USD */
    today: number
    /** Billing period total spend in USD */
    total: number
    /** % change vs previous day, null if unknown */
    trend: number | null
    byProvider: Array<{ name: string; cost: number; tokens: number }>
    byModel: Array<{ model: string; cost: number; tokens: number; count: number }>
  }
  usage: {
    /** Today's total tokens */
    tokens: number
    inputTokens: number
    outputTokens: number
    cacheRead: number
    /** Context window usage % for the main session, null if unknown */
    contextPercent: number | null
    messages: { total: number; user: number; assistant: number; toolCalls: number }
    latency: { avgMs: number; p95Ms: number } | null
  }
  uptime: {
    /** Seconds since real gateway session start (firstActivity) */
    seconds: number
    formatted: string
    healthy: boolean
  }
  model: {
    /** Human-readable model name */
    current: string
    /** Raw model string from API */
    raw: string
  }
  alerts: Array<DashboardAlert>
  cron: {
    jobs: Awaited<ReturnType<typeof fetchCronJobs>>
    inProgress: number
    done: number
  }
  skills: {
    total: number
    enabled: number
  }
  timeseries: {
    /** Daily cost points — up to last 28 days, sorted ascending by date */
    costByDay: Array<{ date: string; amount: number }>
    /** Daily message counts aggregated across all sessions — up to last 28 days */
    messagesByDay: Array<{ date: string; count: number }>
    /** Daily active session counts (sessions with usage activity on that date) — up to last 28 days */
    sessionsByDay: Array<{ date: string; count: number }>
    /** Daily token breakdown — input, output, cache read — up to last 28 days */
    tokensByDay: Array<{ date: string; input: number; output: number; cacheRead: number; cost: number }>
  }
}

export type UseDashboardDataResult = {
  data: DashboardData
  refetch: () => void
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDashboardData(): UseDashboardDataResult {
  // ── Queries ──────────────────────────────────────────────────────────────

  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    refetchInterval: 30_000,
  })

  const gatewayStatusQuery = useQuery({
    queryKey: ['gateway', 'dashboard-status'],
    queryFn: fetchGatewayStatus,
    retry: false,
    refetchInterval: 15_000,
  })

  const sessionStatusQuery = useQuery({
    queryKey: ['gateway', 'session-status'],
    queryFn: fetchSessionStatus,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const costTimeseriesQuery = useQuery({
    queryKey: ['dashboard', 'cost-timeseries'],
    queryFn: fetchCostTimeseries,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const cronJobsQuery = useQuery({
    queryKey: ['cron', 'jobs'],
    queryFn: fetchCronJobs,
    retry: false,
    refetchInterval: 30_000,
  })

  const skillsSummaryQuery = useQuery({
    queryKey: ['dashboard', 'skills'],
    queryFn: fetchInstalledSkills,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const usageSummaryQuery = useQuery({
    queryKey: ['dashboard', 'usage'],
    queryFn: fetchUsage,
    retry: false,
    refetchInterval: 30_000,
  })

  // ── Usage timeout (15s) — stops infinite skeleton ────────────────────────

  const [usageTimedOut, setUsageTimedOut] = useState(false)

  useEffect(() => {
    if (!usageSummaryQuery.isLoading) {
      setUsageTimedOut(false)
      return
    }
    const timer = window.setTimeout(() => setUsageTimedOut(true), 15_000)
    return () => window.clearTimeout(timer)
  }, [usageSummaryQuery.isLoading])

  // ── Derived computations ─────────────────────────────────────────────────

  const data = useMemo<DashboardData>(function buildDashboardData() {
    const now = Date.now()
    const todayKey = toLocalDateKey(new Date(now))

    // ── Connection ──────────────────────────────────────────────────────────
    const connected = gatewayStatusQuery.data?.ok === true
    const syncing = !gatewayStatusQuery.isLoading && connected

    // ── Session-status payload ──────────────────────────────────────────────
    const ssPayload = sessionStatusQuery.data?.payload
    const ssSessions: Array<SessionStatusSession> = Array.isArray(ssPayload?.sessions)
      ? (ssPayload.sessions as Array<SessionStatusSession>).filter(
          (s) => !isSubagentSession(s as Record<string, unknown>),
        )
      : []
    const updatedAt = normalizeTimestamp(ssPayload?.updatedAt ?? 0)

    // ── Uptime: use firstActivity from the EARLIEST session, NOT startDate ──
    // startDate is the billing period start (e.g. "2026-01-20"), NOT gateway boot.
    let earliestActivity = 0
    for (const s of ssSessions) {
      const fa = normalizeTimestamp(s.usage?.firstActivity ?? 0)
      if (fa > 0 && (earliestActivity === 0 || fa < earliestActivity)) {
        earliestActivity = fa
      }
    }
    // Fallback to session updatedAt only if no firstActivity
    if (earliestActivity === 0 && ssSessions.length > 0) {
      earliestActivity = normalizeTimestamp(ssSessions[0]?.updatedAt ?? 0)
    }
    const uptimeSeconds =
      earliestActivity > 0
        ? Math.max(0, Math.floor((now - earliestActivity) / 1000))
        : 0

    // ── Sessions ────────────────────────────────────────────────────────────
    const oneDayAgo = now - 86_400_000
    const fiveMinAgo = now - 5 * 60 * 1000

    const activeSessions24h = ssSessions.filter((s) => {
      const ts = getSessionActivityTimestamp(s)
      return ts > oneDayAgo
    })
    const activeSessions5m = ssSessions.filter((s) => {
      const ts = getSessionActivityTimestamp(s)
      return ts > fiveMinAgo
    })

    // Fallback: if no sessions in session-status, use sessions from sessions API
    // Filter out subagent sessions from both sources
    const chatSessions = Array.isArray(sessionsQuery.data)
      ? sessionsQuery.data.filter(
          (s) => !isSubagentSession(s as unknown as Record<string, unknown>),
        )
      : []
    const sessionTotal = activeSessions24h.length || chatSessions.length

    // Build session list for widget from sessions query (has friendlyId etc)
    const sessionList: SessionInfo[] = chatSessions
      .map((s) => ({
        key: readString(s.key ?? s.friendlyId),
        friendlyId: readString(s.friendlyId),
        label: toSessionDisplayName(s as unknown as Record<string, unknown>),
        model: readString((s as Record<string, unknown>).model),
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10)

    // Context percent from main session in sessions API
    let contextPercent: number | null = null
    if (chatSessions.length > 0) {
      const mainSession = chatSessions[0] as unknown as Record<string, unknown>
      const totalTokens = readNumber(mainSession.totalTokens)
      const contextTokens = readNumber(mainSession.contextTokens)
      if (totalTokens > 0 && contextTokens > 0) {
        contextPercent = Math.min(100, (totalTokens / contextTokens) * 100)
      }
    }
    // Fallback to session-status contextPercent if available
    if (contextPercent === null) {
      const raw = ssPayload?.contextPercent
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        contextPercent = Math.max(0, Math.min(100, raw))
      }
    }

    // ── Agents ──────────────────────────────────────────────────────────────
    const uniqueAgentIds = new Set(
      activeSessions24h
        .map((s) => readString(s.agentId ?? s.key))
        .filter(Boolean),
    )
    const agentCount = uniqueAgentIds.size || sessionTotal

    const roster: AgentInfo[] = ssSessions
      .map((s, i): AgentInfo => {
        const updatedAtMs = normalizeTimestamp(s.updatedAt ?? 0)
        const activityAtMs = getSessionActivityTimestamp(s)
        const isActive = activityAtMs > fiveMinAgo
        const isIdle = activityAtMs > oneDayAgo && !isActive
        return {
          id: readString(s.key) || readString(s.agentId) || `agent-${i}`,
          name: toSessionDisplayName(s as Record<string, unknown>),
          status: isActive ? 'active' : isIdle ? 'idle' : 'available',
          model: readString(s.model),
          modelFormatted: formatModelName(readString(s.model)),
          updatedAt: activityAtMs || updatedAtMs,
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)

    const activeAgentCount = roster.filter((a) => a.status === 'active').length
    const idleAgentCount = roster.filter((a) => a.status === 'idle').length

    // Stalled agent: most-idle session (30+ min no updates)
    const stalledThreshold = 30 * 60 * 1000
    let stalledAgent: string | null = null
    let maxStalledMs = 0
    for (const s of ssSessions) {
      const ts = getSessionActivityTimestamp(s)
      if (ts <= 0) continue
      const staleMs = now - ts
      if (staleMs > stalledThreshold && staleMs > maxStalledMs) {
        maxStalledMs = staleMs
        stalledAgent = toSessionDisplayName(s as Record<string, unknown>)
      }
    }
    // Also check sessions API for stalled agents
    if (!stalledAgent) {
      for (const s of chatSessions) {
        const raw = s as unknown as Record<string, unknown>
        const ts = normalizeTimestamp(raw.updatedAt ?? 0)
        if (ts <= 0) continue
        const staleMs = now - ts
        if (staleMs > stalledThreshold && staleMs > maxStalledMs) {
          maxStalledMs = staleMs
          stalledAgent = toSessionDisplayName(raw)
        }
      }
    }

    // ── Current model ────────────────────────────────────────────────────────
    // Prefer the "main" session (not cron/heartbeat agents which use cheaper models)
    const mainSession = ssSessions.find((s) => readString(s.key) === 'main') ?? ssSessions[0]
    const rawModel =
      readString(mainSession?.model) ||
      readString(ssPayload?.model) ||
      readString(ssPayload?.currentModel) ||
      readString(ssPayload?.modelAlias) ||
      ''

    // ── Cost: aggregate from dailyModelUsage across all sessions ────────────
    // This gives us today's real usage, not the lifetime cost from /api/cost
    const providerMap = new Map<string, { cost: number; tokens: number }>()
    const modelMap = new Map<string, { cost: number; tokens: number; count: number }>()
    let todayCostTotal = 0
    let todayTokensTotal = 0
    let todayInputTokens = 0
    let todayOutputTokens = 0
    let todayCacheRead = 0

    for (const session of ssSessions) {
      const usage = session.usage
      if (!usage) continue

      // Daily breakdown for cost + token totals
      const breakdown = Array.isArray(usage.dailyBreakdown) ? usage.dailyBreakdown : []
      for (const entry of breakdown) {
        if (!entry.date?.startsWith(todayKey)) continue
        todayCostTotal += readNumber(entry.cost)
        const inputTokens = readNumber(entry.inputTokens)
        const outputTokens = readNumber(entry.outputTokens)
        todayTokensTotal +=
          readNumber(entry.tokens) ||
          readNumber(entry.totalTokens) ||
          (inputTokens + outputTokens)
      }

      // Model usage for provider/model breakdown
      const modelUsage = Array.isArray(usage.dailyModelUsage) ? usage.dailyModelUsage : []
      for (const entry of modelUsage) {
        if (!entry.date?.startsWith(todayKey)) continue
        const provider = readString(entry.provider)
        const modelRaw =
          readString(entry.model) ||
          readString(session.model) ||
          provider ||
          'unknown'
        const cost = readNumber(entry.cost)
        const tokens = readNumber(entry.tokens)
        const count = readNumber(entry.count)

        if (provider) {
          const prev = providerMap.get(provider) ?? { cost: 0, tokens: 0 }
          providerMap.set(provider, { cost: prev.cost + cost, tokens: prev.tokens + tokens })
        }
        const prev = modelMap.get(modelRaw) ?? { cost: 0, tokens: 0, count: 0 }
        modelMap.set(modelRaw, {
          cost: prev.cost + cost,
          tokens: prev.tokens + tokens,
          count: prev.count + count,
        })
      }
    }

    // Primary: top-level dailyCost from session-status (most accurate, always present)
    const ssDaily = readNumber(ssPayload?.dailyCost ?? ssPayload?.costUsd ?? 0)
    if (ssDaily > 0) todayCostTotal = ssDaily

    // Also pull input/output/cacheRead from usage API for finer breakdown
    const usageData = usageSummaryQuery.data?.kind === 'ok' ? usageSummaryQuery.data.data : null
    if (usageData) {
      todayInputTokens = usageData.totalInputOutput
      todayCacheRead = usageData.totalCached
      // Output = totalUsage - inputOutput - cached
      todayOutputTokens = Math.max(0, (usageData.totalUsage || 0) - usageData.totalInputOutput)
      // If we have better today's token count from session-status, use that
      if (todayTokensTotal === 0) todayTokensTotal = usageData.totalUsage
      if (todayCostTotal === 0) todayCostTotal = usageData.totalCost
    }

    const byProvider = Array.from(providerMap.entries())
      .map(([name, { cost, tokens }]) => ({ name, cost, tokens }))
      .sort((a, b) => b.cost - a.cost)

    const byModel = Array.from(modelMap.entries())
      .map(([model, { cost, tokens, count }]) => ({
        model: formatModelName(model),
        cost,
        tokens,
        count,
      }))
      .sort((a, b) => b.cost - a.cost)

    // Cost timeseries for billing total + trend
    const points = [...(Array.isArray(costTimeseriesQuery.data) ? costTimeseriesQuery.data : [])]
    points.sort((a, b) => a.date.localeCompare(b.date))
    const latestPoint = points[points.length - 1]
    const previousPoint = points[points.length - 2]

    // Billing period total from most recent cost API point
    const billingTotal =
      latestPoint?.amount ??
      (usageData?.totalCost ?? 0)

    // Trend vs previous day
    let trend: number | null = null
    if (latestPoint && previousPoint && previousPoint.amount > 0) {
      trend = ((latestPoint.amount - previousPoint.amount) / previousPoint.amount) * 100
    }

    // ── Canonical todayCostUsd ────────────────────────────────────────────────
    // Priority: (1) session-status dailyBreakdown/dailyCost, (2) /api/cost today,
    //           (3) /api/usage totalCost, (4) 0 once all queries have resolved
    const costTodayFromTimeseries = points.find((p) => p.date === todayKey)?.amount ?? null
    let todayCostUsd: number | null = null
    if (todayCostTotal > 0) {
      todayCostUsd = todayCostTotal
    } else if (costTodayFromTimeseries !== null && costTodayFromTimeseries > 0) {
      todayCostUsd = costTodayFromTimeseries
    } else if (usageData && usageData.totalCost > 0) {
      todayCostUsd = usageData.totalCost
    } else if (
      !sessionStatusQuery.isLoading &&
      !costTimeseriesQuery.isLoading &&
      !usageSummaryQuery.isLoading
    ) {
      // All queries resolved with no cost data — show $0.00 rather than "—"
      todayCostUsd = 0
    }

    // ── Message counts ───────────────────────────────────────────────────────
    let msgTotal = 0
    let msgUser = 0
    let msgAssistant = 0
    let msgToolCalls = 0
    let latencyAvg = 0
    let latencyP95 = 0
    let latencyCount = 0
    const sessionsPerDayMap = new Map<string, number>()

    for (const session of ssSessions) {
      const usage = session.usage
      if (!usage) continue

      const msgCounts = Array.isArray(usage.dailyMessageCounts) ? usage.dailyMessageCounts : []
      for (const entry of msgCounts) {
        if (!entry.date?.startsWith(todayKey)) continue
        msgTotal += readNumber(entry.total)
        msgUser += readNumber(entry.user)
        msgAssistant += readNumber(entry.assistant)
        msgToolCalls += readNumber(entry.toolCalls)
      }

      const latency = Array.isArray(usage.dailyLatency) ? usage.dailyLatency : []
      for (const entry of latency) {
        if (!entry.date?.startsWith(todayKey)) continue
        // Weighted average
        const cnt = readNumber(entry.count)
        if (cnt > 0) {
          latencyAvg = (latencyAvg * latencyCount + readNumber(entry.avgMs) * cnt) / (latencyCount + cnt)
          latencyP95 = Math.max(latencyP95, readNumber(entry.p95Ms))
          latencyCount += cnt
        }
      }

      const activeDates = new Set<string>()
      const dailyBreakdown = Array.isArray(usage.dailyBreakdown) ? usage.dailyBreakdown : []
      for (const entry of dailyBreakdown) {
        const date = readString(entry.date)
        if (!date) continue
        activeDates.add(date)
      }
      for (const date of activeDates) {
        sessionsPerDayMap.set(date, (sessionsPerDayMap.get(date) ?? 0) + 1)
      }
    }

    // ── Timeseries ───────────────────────────────────────────────────────────
    // Cost by day — from cost timeseries API (last 28 days)
    const costByDay = points.slice(-28)

    // Messages by day — aggregate dailyMessageCounts across all sessions
    const messagesPerDayMap = new Map<string, number>()
    for (const session of ssSessions) {
      const msgCounts = Array.isArray(session.usage?.dailyMessageCounts)
        ? session.usage.dailyMessageCounts
        : []
      for (const entry of msgCounts) {
        const date = readString(entry.date)
        if (!date) continue
        messagesPerDayMap.set(date, (messagesPerDayMap.get(date) ?? 0) + readNumber(entry.total))
      }
    }
    const messagesByDay = Array.from(messagesPerDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-28)
      .map(([date, count]) => ({ date, count }))
    const sessionsByDay = Array.from(sessionsPerDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-28)
      .map(([date, count]) => ({ date, count }))

    // Tokens by day — aggregate dailyBreakdown across all sessions
    const tokensPerDayMap = new Map<string, { input: number; output: number; cacheRead: number; cost: number }>()
    for (const session of ssSessions) {
      const breakdown = Array.isArray(session.usage?.dailyBreakdown) ? session.usage.dailyBreakdown : []
      for (const entry of breakdown) {
        const date = readString(entry.date)
        if (!date) continue
        const existing = tokensPerDayMap.get(date) ?? { input: 0, output: 0, cacheRead: 0, cost: 0 }
        const entryInput = readNumber(entry.inputTokens)
        const entryOutput = readNumber(entry.outputTokens)
        const total = readNumber(entry.totalTokens) || readNumber(entry.tokens)
        existing.cost += readNumber(entry.cost)

        if (entryInput > 0 || entryOutput > 0) {
          // Gateway provided a breakdown — use it, remainder is cache
          existing.input += entryInput
          existing.output += entryOutput
          const remainder = total - entryInput - entryOutput
          if (remainder > 0) existing.cacheRead += remainder
        } else if (total > 0) {
          // No input/output split — show as "input" (total tokens used)
          existing.input += total
        }
        tokensPerDayMap.set(date, existing)
      }
    }
    const tokensByDay = Array.from(tokensPerDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-28)
      .map(([date, values]) => ({ date, ...values }))

    // ── Cron jobs ────────────────────────────────────────────────────────────
    const cronJobs = Array.isArray(cronJobsQuery.data) ? cronJobsQuery.data : []
    let cronInProgress = 0
    let cronDone = 0
    for (const job of cronJobs) {
      if (!job.enabled) continue
      const status = job.lastRun?.status
      if (status === 'running' || status === 'queued') cronInProgress++
      else if (status === 'success') cronDone++
    }

    // ── Skills ───────────────────────────────────────────────────────────────
    const skills = Array.isArray(skillsSummaryQuery.data) ? skillsSummaryQuery.data : []
    const enabledSkills = skills.filter((s) => s.enabled).length

    // ── Alerts / signal chips ────────────────────────────────────────────────
    const alerts: Array<DashboardAlert> = []

    if (todayCostTotal > 50) {
      alerts.push({
        id: 'high-spend',
        text: '⚠ High spend today',
        severity: 'amber',
        dismissable: true,
      })
    }
    if (stalledAgent) {
      alerts.push({
        id: 'stalled-agent',
        text: `⚠ Agent stalled: ${stalledAgent}`,
        severity: 'red',
        dismissable: true,
      })
    }
    if (contextPercent !== null && contextPercent >= 75) {
      alerts.push({
        id: 'context-pressure',
        text: `Memory pressure: ${contextPercent.toFixed(0)}%`,
        severity: 'amber',
        dismissable: true,
      })
    }

    // ── Status ───────────────────────────────────────────────────────────────
    const isLoading =
      sessionStatusQuery.isLoading ||
      sessionsQuery.isLoading ||
      gatewayStatusQuery.isLoading
    const isError =
      sessionStatusQuery.isError ||
      sessionsQuery.isError ||
      gatewayStatusQuery.isError ||
      costTimeseriesQuery.isError

    const status: DashboardData['status'] = isError
      ? 'error'
      : isLoading
        ? 'loading'
        : 'ready'

    // Usage-specific status
    const usageResult = usageSummaryQuery.data
    let usageStatus: DashboardData['usageStatus']
    if (usageSummaryQuery.isError || usageResult?.kind === 'error' || usageResult?.kind === 'unavailable') {
      usageStatus = 'error'
    } else if (usageResult?.kind === 'ok') {
      usageStatus = 'ready'
    } else if (usageSummaryQuery.isLoading) {
      usageStatus = usageTimedOut ? 'timeout' : 'loading'
    } else {
      // Not loading, no data
      usageStatus = usageTimedOut ? 'timeout' : 'error'
    }

    return {
      status,
      usageStatus,
      todayCostUsd,
      connection: { connected, syncing },
      updatedAt,
      sessions: {
        total: sessionTotal,
        active: activeSessions5m.length || activeAgentCount || 0,
        list: sessionList,
      },
      agents: {
        total: agentCount,
        active: activeAgentCount,
        idle: idleAgentCount,
        stalled: stalledAgent,
        roster,
      },
      cost: {
        // Use todayCostUsd (canonical priority-resolved value) so cost.today
        // always reflects the same number shown in SystemGlance and MetricCards.
        today: todayCostUsd ?? todayCostTotal,
        total: billingTotal,
        trend,
        byProvider,
        byModel,
      },
      usage: {
        tokens: todayTokensTotal,
        inputTokens: todayInputTokens,
        outputTokens: todayOutputTokens,
        cacheRead: todayCacheRead,
        contextPercent,
        messages: {
          total: msgTotal,
          user: msgUser,
          assistant: msgAssistant,
          toolCalls: msgToolCalls,
        },
        latency:
          latencyCount > 0 ? { avgMs: latencyAvg, p95Ms: latencyP95 } : null,
      },
      uptime: {
        seconds: uptimeSeconds,
        formatted: formatUptime(uptimeSeconds),
        healthy: connected && uptimeSeconds > 0,
      },
      model: {
        current: rawModel ? formatModelName(rawModel) : '—',
        raw: rawModel,
      },
      alerts,
      cron: {
        jobs: cronJobs,
        inProgress: cronInProgress,
        done: cronDone,
      },
      skills: {
        total: skills.length,
        enabled: enabledSkills,
      },
      timeseries: {
        costByDay,
        messagesByDay,
        sessionsByDay,
        tokensByDay,
      },
    }
  }, [
    sessionsQuery.data,
    sessionsQuery.isLoading,
    sessionsQuery.isError,
    gatewayStatusQuery.data,
    gatewayStatusQuery.isLoading,
    gatewayStatusQuery.isError,
    sessionStatusQuery.data,
    sessionStatusQuery.isLoading,
    sessionStatusQuery.isError,
    costTimeseriesQuery.data,
    costTimeseriesQuery.isLoading,
    costTimeseriesQuery.isError,
    cronJobsQuery.data,
    skillsSummaryQuery.data,
    usageSummaryQuery.data,
    usageSummaryQuery.isLoading,
    usageTimedOut,
  ])

  const refetch = useCallback(
    function refetchAll() {
      void Promise.allSettled([
        sessionsQuery.refetch(),
        gatewayStatusQuery.refetch(),
        sessionStatusQuery.refetch(),
        costTimeseriesQuery.refetch(),
        cronJobsQuery.refetch(),
        skillsSummaryQuery.refetch(),
        usageSummaryQuery.refetch(),
      ])
    },
    [
      sessionsQuery,
      gatewayStatusQuery,
      sessionStatusQuery,
      costTimeseriesQuery,
      cronJobsQuery,
      skillsSummaryQuery,
      usageSummaryQuery,
    ],
  )

  return { data, refetch }
}

// ─── Convenience: "updated ago" string from dashboardData.updatedAt ──────────

export function useUpdatedAgo(updatedAt: number): string {
  return formatRelativeTime(updatedAt)
}

// ─── Derived usage text for CollapsibleWidget summary ───────────────────────

export function buildUsageSummaryText(data: DashboardData): string {
  if (data.usageStatus === 'error' || data.usageStatus === 'timeout') return 'Usage unavailable'
  if (data.usageStatus === 'idle' || data.usageStatus === 'loading') return 'Usage: loading…'
  // 'ready'
  const costVal = data.todayCostUsd ?? data.cost.today
  if (costVal > 0 || data.usage.tokens > 0) {
    return `Usage: ${formatMoney(costVal)} today • ${formatTokens(data.usage.tokens)} tokens`
  }
  return 'Usage: $0.00 today'
}
