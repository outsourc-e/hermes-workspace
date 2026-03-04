import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

type ApiSessionRow = {
  sessionKey?: string
  key?: string
  id?: string
  model?: string
  modelName?: string
  agent?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  totalCost?: number
  lastActiveAt?: number | null
  updatedAt?: number | string | null
  usage?: Record<string, unknown>
  [key: string]: unknown
}

type ApiModelRow = {
  model?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  totalCost?: number
  input?: number
  output?: number
  totals?: Record<string, unknown>
  [key: string]: unknown
}

type ApiAgentRow = {
  agent?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  totalCost?: number
  sessionCount?: number
  [key: string]: unknown
}

type ApiCostPoint = {
  date?: string
  amount?: number
  totalCost?: number
}

type ApiPayload = {
  ok: boolean
  sessions?: Array<ApiSessionRow>
  agents?: Array<ApiAgentRow>
  cost?: {
    daily?: Array<ApiCostPoint>
    timeseries?: Array<ApiCostPoint>
    totals?: Record<string, unknown>
    sessions?: Array<ApiSessionRow>
    models?:
      | Array<ApiModelRow>
      | {
          rows?: Array<ApiModelRow>
          totals?: Record<string, unknown>
        }
    [key: string]: unknown
  }
  models?:
    | Array<ApiModelRow>
    | {
        rows?: Array<ApiModelRow>
        totals?: Record<string, unknown>
      }
  error?: string
  [key: string]: unknown
}

export type CostKpis = {
  todaySpend: number
  yesterdaySpend: number
  todayDelta: number
  todayDeltaPct: number | null
  monthToDate: number
  projectedEom: number
  budgetUsedPct: number | null
  mostExpensiveAgent: string | null
  activeSessions: number
}

export type CostModelRow = {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export type CostAgentRow = {
  agent: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  sessionCount: number
}

export type CostDayRow = {
  date: string
  label: string
  amount: number
}

export type CostSessionRow = {
  sessionKey: string
  label: string
  model: string
  agent: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  lastActiveAt: number | null
}

export type DerivedCostAnalytics = {
  kpis: CostKpis
  models: Array<CostModelRow>
  agents: Array<CostAgentRow>
  daily: Array<CostDayRow>
  sessions: Array<CostSessionRow>
  topSessions: Array<CostSessionRow>
  totals: {
    tokens: number
    costUsd: number
  }
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed
    }
    const iso = Date.parse(value)
    return Number.isFinite(iso) ? iso : null
  }
  return null
}

function formatDayLabel(dateKey: string) {
  const dt = new Date(dateKey + 'T00:00:00')
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function buildDailySeries(rawCost: ApiPayload['cost']): Array<CostDayRow> {
  const entries = Array.isArray(rawCost?.daily)
    ? rawCost.daily
    : Array.isArray(rawCost?.timeseries)
      ? rawCost.timeseries
      : []

  const amountByDay = new Map<string, number>()
  for (const row of entries) {
    const date = typeof row?.date === 'string' ? row.date.slice(0, 10) : ''
    if (!date) continue
    const amount = readNumber(row.amount ?? row.totalCost)
    amountByDay.set(date, (amountByDay.get(date) ?? 0) + amount)
  }

  const today = new Date()
  const result: Array<CostDayRow> = []
  for (let i = 29; i >= 0; i -= 1) {
    const dt = new Date(today)
    dt.setHours(0, 0, 0, 0)
    dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    result.push({
      date: key,
      label: formatDayLabel(key),
      amount: amountByDay.get(key) ?? 0,
    })
  }
  return result
}

function normalizeModels(
  payload: ApiPayload['models'] | ApiPayload['cost'] | undefined,
): Array<CostModelRow> {
  const root = toRecord(payload)
  const rows: Array<ApiModelRow> = Array.isArray(payload)
    ? payload
    : Array.isArray(root.rows)
      ? root.rows
      : Array.isArray(toRecord(root.models).rows)
        ? (toRecord(root.models).rows as Array<ApiModelRow>)
        : []

  return rows
    .map((row) => {
      const record = toRecord(row)
      const totals = toRecord(record.totals)
      const model =
        typeof record.model === 'string' && record.model.length > 0
          ? record.model
          : 'unknown'
      const inputTokens = readNumber(
        record.inputTokens ??
          record.input ??
          totals.input ??
          totals.inputTokens,
      )
      const outputTokens = readNumber(
        record.outputTokens ??
          record.output ??
          totals.output ??
          totals.outputTokens,
      )
      const totalTokens =
        readNumber(record.totalTokens ?? totals.totalTokens) ||
        inputTokens + outputTokens
      const costUsd = readNumber(
        record.costUsd ??
          record.totalCost ??
          totals.totalCost ??
          totals.costUsd,
      )
      return { model, inputTokens, outputTokens, totalTokens, costUsd }
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
}

function extractAgentFromSessionKey(sessionKey: string): string {
  if (!sessionKey) return 'unknown'
  const parts = sessionKey.split(':')
  if (parts[0] === 'agent' && parts.length >= 3) {
    if (parts[2] === 'subagent') return 'subagent'
    return parts[2] || parts[1] || 'agent'
  }
  if (parts[0] === 'cron') return 'cron'
  return parts[0] || 'unknown'
}

function normalizeAgents(
  agents: Array<ApiAgentRow> | undefined,
  sessions: Array<CostSessionRow>,
): Array<CostAgentRow> {
  if (Array.isArray(agents) && agents.length > 0) {
    return agents
      .map((row) => {
        const record = toRecord(row)
        return {
          agent:
            typeof record.agent === 'string' && record.agent.length > 0
              ? record.agent
              : 'unknown',
          inputTokens: readNumber(record.inputTokens),
          outputTokens: readNumber(record.outputTokens),
          totalTokens: readNumber(record.totalTokens),
          costUsd: readNumber(record.costUsd ?? record.totalCost),
          sessionCount: readNumber(record.sessionCount),
        }
      })
      .sort((a, b) => b.costUsd - a.costUsd)
  }

  // Fallback: derive from sessions client-side
  const map = new Map<string, CostAgentRow>()
  for (const s of sessions) {
    const agent = s.agent || 'unknown'
    const existing = map.get(agent)
    if (existing) {
      existing.inputTokens += s.inputTokens
      existing.outputTokens += s.outputTokens
      existing.totalTokens += s.totalTokens
      existing.costUsd += s.costUsd
      existing.sessionCount += 1
    } else {
      map.set(agent, {
        agent,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        totalTokens: s.totalTokens,
        costUsd: s.costUsd,
        sessionCount: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd)
}

function normalizeSessions(
  payload: Array<ApiSessionRow> | ApiPayload['cost'] | undefined,
): Array<CostSessionRow> {
  const root = toRecord(payload)
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root.sessions)
      ? (root.sessions as Array<ApiSessionRow>)
      : []
  return rows
    .map((row) => {
      const record = toRecord(row)
      const usage = toRecord(record.usage)
      const sessionKey =
        typeof record.sessionKey === 'string' && record.sessionKey.length > 0
          ? record.sessionKey
          : typeof record.key === 'string' && record.key.length > 0
            ? record.key
            : typeof record.id === 'string' && record.id.length > 0
              ? record.id
              : 'session'
      const agent =
        typeof record.agent === 'string' && record.agent.length > 0
          ? record.agent
          : extractAgentFromSessionKey(sessionKey)
      const rawLabel =
        typeof record.label === 'string' && record.label.length > 0
          ? record.label
          : typeof record.displayName === 'string' && record.displayName.length > 0
            ? record.displayName
            : typeof record.friendlyId === 'string' && record.friendlyId.length > 0
              ? record.friendlyId
              : ''
      const label = rawLabel || agent
      const inputTokens = readNumber(
        record.inputTokens ??
          usage.inputTokens ??
          usage.input ??
          usage.promptTokens,
      )
      const outputTokens = readNumber(
        record.outputTokens ??
          usage.outputTokens ??
          usage.output ??
          usage.completionTokens,
      )
      const totalTokens =
        readNumber(record.totalTokens ?? usage.totalTokens) ||
        inputTokens + outputTokens
      return {
        sessionKey,
        label,
        model:
          typeof record.model === 'string' && record.model.length > 0
            ? record.model
            : typeof record.modelName === 'string' &&
                record.modelName.length > 0
              ? record.modelName
              : 'unknown',
        agent,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: readNumber(
          record.costUsd ??
            record.totalCost ??
            usage.totalCost ??
            usage.costUsd,
        ),
        lastActiveAt: toTimestampMs(record.lastActiveAt ?? record.updatedAt),
      } satisfies CostSessionRow
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
}

/** Monthly budget in USD — user-configurable in the future */
const DEFAULT_MONTHLY_BUDGET = 100

function buildKpis(
  daily: Array<CostDayRow>,
  sessions: Array<CostSessionRow>,
  modelRows: Array<CostModelRow>,
  agentRows: Array<CostAgentRow>,
): CostKpis {
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const todaySpend = daily.find((d) => d.date === todayKey)?.amount ?? 0
  const yesterdaySpend =
    daily.find((d) => d.date === yesterdayKey)?.amount ?? 0
  const todayDelta = todaySpend - yesterdaySpend
  const todayDeltaPct =
    yesterdaySpend > 0 ? (todayDelta / yesterdaySpend) * 100 : null

  const year = today.getFullYear()
  const month = today.getMonth()
  const monthToDate = daily
    .filter((d) => {
      const dt = new Date(d.date + 'T00:00:00')
      return dt.getFullYear() === year && dt.getMonth() === month
    })
    .reduce((sum, d) => sum + d.amount, 0)

  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const projectedEom =
    dayOfMonth > 0 ? (monthToDate / dayOfMonth) * daysInMonth : 0

  const budgetUsedPct =
    DEFAULT_MONTHLY_BUDGET > 0
      ? (monthToDate / DEFAULT_MONTHLY_BUDGET) * 100
      : null

  const mostExpensiveAgent =
    agentRows.length > 0 ? agentRows[0].agent : null

  const activeSessions = sessions.filter(
    (s) => s.totalTokens > 0 || s.costUsd > 0,
  ).length
  const fallbackActive = modelRows.length > 0 ? modelRows.length : 0

  return {
    todaySpend,
    yesterdaySpend,
    todayDelta,
    todayDeltaPct,
    monthToDate,
    projectedEom,
    budgetUsedPct,
    mostExpensiveAgent,
    activeSessions: activeSessions || fallbackActive,
  }
}

function derive(payload: ApiPayload): DerivedCostAnalytics {
  const models = normalizeModels(payload.models ?? payload.cost)
  const sessions = normalizeSessions(payload.sessions ?? payload.cost)
  const agents = normalizeAgents(payload.agents, sessions)
  const daily = buildDailySeries(payload.cost)
  const kpis = buildKpis(daily, sessions, models, agents)
  const totalTokens = models.reduce((sum, m) => sum + m.totalTokens, 0)
  const totalCostUsd = models.reduce((sum, m) => sum + m.costUsd, 0)

  return {
    kpis,
    models,
    agents,
    daily,
    sessions,
    topSessions: sessions.slice(0, 10),
    totals: {
      tokens: totalTokens,
      costUsd: totalCostUsd,
    },
  }
}

export function useCostAnalytics() {
  const query = useQuery({
    queryKey: ['usage-analytics', 'costs'],
    queryFn: async () => {
      const res = await fetch('/api/usage-analytics')
      const payload = (await res.json()) as ApiPayload
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'HTTP ' + res.status)
      }
      return payload
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  })

  const derived = useMemo(
    () => derive(query.data ?? { ok: true }),
    [query.data],
  )

  return {
    ...query,
    analytics: derived,
  }
}
