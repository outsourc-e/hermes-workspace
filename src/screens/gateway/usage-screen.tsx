import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDiamondIcon,
  ArrowDown01Icon,
  ArrowTurnBackwardIcon,
  Calendar03Icon,
  DollarCircleIcon,
  FileExportIcon,
  FolderDetailsIcon,
  Message01Icon,
  PackageSearchIcon,
  SearchList01Icon,
  ServerStackIcon,
  SpeedTrain01Icon,
  ToolsIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

type Totals = {
  totalCost?: number
  totalTokens?: number
  inputCost?: number
  outputCost?: number
  cacheReadCost?: number
  cacheWriteCost?: number
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

type GatewayUsageData = {
  cost?: { totals?: Totals; days?: number; updatedAt?: number }
  usage?: {
    totals?: Totals
    startDate?: string
    endDate?: string
    updatedAt?: number
  }
}

type UsageAnalyticsSession = {
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

type UsageAnalyticsModel = {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  sessions: number
}

type UsageAnalyticsPayload = {
  ok: boolean
  sessions?: Array<UsageAnalyticsSession>
  models?: {
    rows?: Array<UsageAnalyticsModel>
    totals?: {
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
      costUsd?: number
    }
  }
  error?: string
}

type SessionStatusDailyBreakdown = {
  date?: string
  tokens?: number
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
  cost?: number
}

type SessionStatusDailyMessageCounts = {
  date?: string
  total?: number
  user?: number
  assistant?: number
  toolCalls?: number
}

type SessionStatusDailyModelUsage = {
  date?: string
  provider?: string
  model?: string
  tokens?: number
  cost?: number
  count?: number
}

type SessionStatusUsage = {
  dailyBreakdown?: Array<SessionStatusDailyBreakdown>
  dailyMessageCounts?: Array<SessionStatusDailyMessageCounts>
  dailyModelUsage?: Array<SessionStatusDailyModelUsage>
  [key: string]: unknown
}

type SessionStatusSession = {
  key?: string
  label?: string
  model?: string
  updatedAt?: number | string
  usage?: SessionStatusUsage
}

type SessionStatusPayload = {
  ok: boolean
  payload?: {
    sessions?: Array<SessionStatusSession>
  }
  error?: string
}

type HistoryMessage = {
  role?: string
  timestamp?: number | string
  toolCallId?: string
  toolName?: string
  isError?: boolean
  content?: Array<{
    type?: string
    name?: string
    text?: string
    toolName?: string
    isError?: boolean
  }>
}

type HistoryPayload = {
  sessionKey?: string
  messages?: Array<HistoryMessage>
}

type FilterPreset = 'today' | '7d' | '30d' | 'custom'

type DateRange = {
  fromMs: number
  toMs: number
  fromKey: string
  toKey: string
  label: string
  days: number
}

type TopListRow = {
  label: string
  value: number
  subtitle?: string
}

type DashboardStats = {
  messagesTotal: number
  userMessages: number
  assistantMessages: number
  toolCalls: number
  uniqueTools: number
  errors: number
  errorRate: number | null
  avgTokensPerMessage: number | null
  avgCostPerMessage: number | null
  totalCost: number
  sessions: number
  cacheHitRate: number | null
  throughputTokensPerMinute: number | null
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  activeSessionKeys: Array<string>
  topModels: Array<TopListRow>
}

type ToolInsights = {
  topTools: Array<TopListRow>
  toolCalls: number
  uniqueTools: number
  errors: number
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber
    }
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCost(n?: number) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)}`
}

function formatTokens(n?: number) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function formatCompactNumber(n?: number) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

function formatPercent(n?: number | null) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `${n.toFixed(n >= 10 ? 1 : 2)}%`
}

function formatRate(n: number | null | undefined, suffix: string) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${suffix}`
}

function formatDateLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function buildDateRange(
  preset: FilterPreset,
  customFrom: string,
  customTo: string,
) {
  const now = new Date()
  const today = startOfDay(now)

  if (preset === 'today') {
    return {
      fromMs: today.getTime(),
      toMs: now.getTime(),
      fromKey: toDateKey(today),
      toKey: toDateKey(now),
      label: 'Today',
      days: 1,
    } satisfies DateRange
  }

  if (preset === '7d' || preset === '30d') {
    const days = preset === '7d' ? 7 : 30
    const from = startOfDay(new Date(today))
    from.setDate(from.getDate() - (days - 1))
    return {
      fromMs: from.getTime(),
      toMs: now.getTime(),
      fromKey: toDateKey(from),
      toKey: toDateKey(now),
      label: `${days} days`,
      days,
    } satisfies DateRange
  }

  const parsedFrom = customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)) : today
  const parsedTo = customTo ? endOfDay(new Date(`${customTo}T00:00:00`)) : now
  const safeFrom = Number.isNaN(parsedFrom.getTime()) ? today : parsedFrom
  const safeTo = Number.isNaN(parsedTo.getTime()) ? now : parsedTo
  const from = safeFrom.getTime() <= safeTo.getTime() ? safeFrom : safeTo
  const to = safeTo.getTime() >= safeFrom.getTime() ? safeTo : safeFrom
  const days =
    Math.max(1, Math.ceil((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000))

  return {
    fromMs: from.getTime(),
    toMs: Math.min(to.getTime(), now.getTime()),
    fromKey: toDateKey(from),
    toKey: toDateKey(to),
    label: `${formatDateLabel(toDateKey(from))} - ${formatDateLabel(toDateKey(to))}`,
    days,
  } satisfies DateRange
}

function isDateKeyWithinRange(dateKey: string, range: DateRange) {
  return dateKey >= range.fromKey && dateKey <= range.toKey
}

function getMessageTimestamp(message: HistoryMessage) {
  return (
    toTimestampMs(message.timestamp) ??
    toTimestampMs((message as Record<string, unknown>).createdAt) ??
    toTimestampMs((message as Record<string, unknown>).updatedAt)
  )
}

function getToolCallNames(message: HistoryMessage) {
  const names: string[] = []
  const content = Array.isArray(message.content) ? message.content : []

  for (const part of content) {
    if (part?.type === 'toolCall') {
      const name = readString(part.name ?? part.toolName)
      if (name) names.push(name)
    }
  }

  if (names.length === 0) {
    const fallback = readString(message.toolName)
    if (fallback && message.role === 'assistant') {
      names.push(fallback)
    }
  }

  return names
}

function isToolError(message: HistoryMessage) {
  if (message.isError === true) return true
  const content = Array.isArray(message.content) ? message.content : []
  return content.some((part) => part?.type === 'toolResult' && part?.isError === true)
}

function deriveDashboardStats(
  sessions: Array<SessionStatusSession>,
  analyticsSessions: Array<UsageAnalyticsSession>,
  range: DateRange,
) {
  const activeSessionKeys = new Set<string>()
  const modelMap = new Map<string, { tokens: number; cost: number; count: number }>()

  let totalCost = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let totalTokens = 0
  let messagesTotal = 0
  let userMessages = 0
  let assistantMessages = 0
  let toolCalls = 0

  for (const session of sessions) {
    const sessionKey = readString(session.key)
    const usage = session.usage
    if (!usage || !sessionKey) continue

    let sessionActiveInRange = false

    const dailyBreakdown = Array.isArray(usage.dailyBreakdown)
      ? usage.dailyBreakdown
      : []
    for (const entry of dailyBreakdown) {
      const dateKey = readString(entry.date)
      if (!dateKey || !isDateKeyWithinRange(dateKey, range)) continue
      sessionActiveInRange = true
      const entryInput = readNumber(entry.inputTokens)
      const entryOutput = readNumber(entry.outputTokens)
      const entryTotal =
        readNumber(entry.totalTokens) ||
        readNumber(entry.tokens) ||
        entryInput + entryOutput
      const inferredCacheRead = Math.max(0, entryTotal - entryInput - entryOutput)

      inputTokens += entryInput
      outputTokens += entryOutput
      cacheReadTokens += inferredCacheRead
      totalTokens += entryTotal
      totalCost += readNumber(entry.cost)
    }

    const dailyMessageCounts = Array.isArray(usage.dailyMessageCounts)
      ? usage.dailyMessageCounts
      : []
    for (const entry of dailyMessageCounts) {
      const dateKey = readString(entry.date)
      if (!dateKey || !isDateKeyWithinRange(dateKey, range)) continue
      sessionActiveInRange = true
      messagesTotal += readNumber(entry.total)
      userMessages += readNumber(entry.user)
      assistantMessages += readNumber(entry.assistant)
      toolCalls += readNumber(entry.toolCalls)
    }

    const dailyModelUsage = Array.isArray(usage.dailyModelUsage)
      ? usage.dailyModelUsage
      : []
    for (const entry of dailyModelUsage) {
      const dateKey = readString(entry.date)
      if (!dateKey || !isDateKeyWithinRange(dateKey, range)) continue
      sessionActiveInRange = true
      const provider = readString(entry.provider)
      const modelName = readString(entry.model)
      const label = provider && modelName ? `${provider}/${modelName}` : modelName || provider || 'unknown'
      const current = modelMap.get(label) ?? { tokens: 0, cost: 0, count: 0 }
      current.tokens += readNumber(entry.tokens)
      current.cost += readNumber(entry.cost)
      current.count += readNumber(entry.count)
      modelMap.set(label, current)
    }

    if (sessionActiveInRange) {
      activeSessionKeys.add(sessionKey)
    }
  }

  if (activeSessionKeys.size === 0) {
    for (const session of analyticsSessions) {
      if (!session.lastActiveAt) continue
      if (session.lastActiveAt < range.fromMs || session.lastActiveAt > range.toMs) continue
      activeSessionKeys.add(session.sessionKey)
      totalCost += session.costUsd
      inputTokens += session.inputTokens
      outputTokens += session.outputTokens
      totalTokens += session.totalTokens
      const current = modelMap.get(session.model || 'unknown') ?? {
        tokens: 0,
        cost: 0,
        count: 0,
      }
      current.tokens += session.totalTokens
      current.cost += session.costUsd
      current.count += 1
      modelMap.set(session.model || 'unknown', current)
    }
  }

  const topModels = Array.from(modelMap.entries())
    .map(([label, value]) => ({
      label,
      value: value.tokens,
      subtitle: `${formatCost(value.cost)} · ${formatCompactNumber(value.count)} runs`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const cacheHitRate =
    inputTokens + cacheReadTokens > 0
      ? (cacheReadTokens / (inputTokens + cacheReadTokens)) * 100
      : null

  const durationMinutes = Math.max(1, (range.toMs - range.fromMs) / 60_000)

  return {
    messagesTotal,
    userMessages,
    assistantMessages,
    toolCalls,
    uniqueTools: 0,
    errors: 0,
    errorRate: null,
    avgTokensPerMessage:
      messagesTotal > 0 ? totalTokens / messagesTotal : null,
    avgCostPerMessage:
      messagesTotal > 0 ? totalCost / messagesTotal : null,
    totalCost,
    sessions: activeSessionKeys.size,
    cacheHitRate,
    throughputTokensPerMinute:
      totalTokens > 0 ? totalTokens / durationMinutes : null,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    activeSessionKeys: Array.from(activeSessionKeys),
    topModels,
  } satisfies DashboardStats
}

function deriveToolInsights(
  histories: Array<HistoryPayload>,
  range: DateRange,
  baselineToolCalls: number,
) {
  const toolCounts = new Map<string, number>()
  let historyToolCalls = 0
  let errors = 0

  for (const history of histories) {
    const messages = Array.isArray(history.messages) ? history.messages : []
    for (const message of messages) {
      const timestamp = getMessageTimestamp(message)
      if (timestamp !== null && (timestamp < range.fromMs || timestamp > range.toMs)) {
        continue
      }

      const names = getToolCallNames(message)
      for (const name of names) {
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1)
        historyToolCalls += 1
      }

      if (isToolError(message)) {
        errors += 1
      }
    }
  }

  const toolCalls = historyToolCalls || baselineToolCalls
  const topTools = Array.from(toolCounts.entries())
    .map(([label, value]) => ({
      label,
      value,
      subtitle: `${value === 1 ? '1 call' : `${value} calls`}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return {
    topTools,
    toolCalls,
    uniqueTools: toolCounts.size,
    errors,
  } satisfies ToolInsights
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: typeof Message01Icon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary-500">
            {label}
          </p>
          <p className="text-2xl font-semibold text-primary-900">{value}</p>
          {sub ? <p className="text-sm text-primary-600">{sub}</p> : null}
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-700">
          <HugeiconsIcon icon={icon} size={18} strokeWidth={1.6} />
        </div>
      </div>
    </div>
  )
}

function TopList({
  title,
  icon,
  rows,
  empty,
}: {
  title: string
  icon: typeof PackageSearchIcon
  rows: Array<TopListRow>
  empty: string
}) {
  return (
    <section className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-700">
          <HugeiconsIcon icon={icon} size={18} strokeWidth={1.6} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-primary-900">{title}</h2>
          <p className="text-xs text-primary-500">Visible range only</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/60 px-4 py-6 text-sm text-primary-500">
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-primary-900">
                  {row.label}
                </p>
                {row.subtitle ? (
                  <p className="truncate text-xs text-primary-500">
                    {row.subtitle}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-sm font-semibold text-primary-900">
                {formatCompactNumber(row.value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-primary-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 text-primary-500">
        <div className="size-5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-700" />
        <span className="text-sm">Loading analytics…</span>
      </div>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-xl border border-primary-200 bg-white px-6 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500">
        <HugeiconsIcon icon={AlertDiamondIcon} size={22} strokeWidth={1.6} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-primary-900">
          Usage analytics unavailable
        </p>
        <p className="max-w-lg text-sm text-primary-600">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={16} strokeWidth={1.6} />
        Retry
      </Button>
    </div>
  )
}

export function UsageScreen() {
  const [preset, setPreset] = useState<FilterPreset>('7d')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return toDateKey(d)
  })
  const [customTo, setCustomTo] = useState(() => toDateKey(new Date()))

  const range = useMemo(
    () => buildDateRange(preset, customFrom, customTo),
    [customFrom, customTo, preset],
  )

  const gatewayUsageQuery = useQuery({
    queryKey: ['gateway', 'usage-gateway'],
    queryFn: async () => {
      const res = await fetch('/api/gateway/usage')
      const json = (await res.json()) as {
        ok?: boolean
        data?: GatewayUsageData
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      return json.data ?? {}
    },
    refetchInterval: 15_000,
    retry: 1,
  })

  const analyticsQuery = useQuery({
    queryKey: ['usage-analytics', 'usage-screen'],
    queryFn: async () => {
      const res = await fetch('/api/usage-analytics')
      const json = (await res.json()) as UsageAnalyticsPayload
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      return json
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  })

  const sessionStatusQuery = useQuery({
    queryKey: ['gateway', 'session-status', 'usage-screen'],
    queryFn: async () => {
      const res = await fetch('/api/session-status')
      const json = (await res.json()) as SessionStatusPayload
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      return json
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  })

  const analyticsSessions = analyticsQuery.data?.sessions ?? []
  const statusSessions = sessionStatusQuery.data?.payload?.sessions ?? []

  const dashboardStats = useMemo(
    () => deriveDashboardStats(statusSessions, analyticsSessions, range),
    [analyticsSessions, range, statusSessions],
  )

  const historyQuery = useQuery({
    queryKey: [
      'usage-history-insights',
      range.fromKey,
      range.toKey,
      ...dashboardStats.activeSessionKeys,
    ],
    queryFn: async () => {
      const responses = await Promise.all(
        dashboardStats.activeSessionKeys.map(async (sessionKey) => {
          const params = new URLSearchParams({
            sessionKey,
            limit: '1000',
          })
          const res = await fetch(`/api/history?${params.toString()}`)
          if (!res.ok) {
            throw new Error(`Failed to load history for ${sessionKey}`)
          }
          return (await res.json()) as HistoryPayload
        }),
      )
      return responses
    },
    enabled:
      sessionStatusQuery.isSuccess && dashboardStats.activeSessionKeys.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  })

  const toolInsights = useMemo(
    () =>
      deriveToolInsights(
        historyQuery.data ?? [],
        range,
        dashboardStats.toolCalls,
      ),
    [dashboardStats.toolCalls, historyQuery.data, range],
  )

  const mergedStats = useMemo(() => {
    const errorRate =
      toolInsights.toolCalls > 0
        ? (toolInsights.errors / toolInsights.toolCalls) * 100
        : null

    return {
      ...dashboardStats,
      toolCalls: toolInsights.toolCalls,
      uniqueTools: toolInsights.uniqueTools,
      errors: toolInsights.errors,
      errorRate,
      topTools: toolInsights.topTools,
    }
  }, [dashboardStats, toolInsights])

  const exportPayload = useMemo(() => {
    const filteredSessions = analyticsSessions.filter((session) => {
      if (!session.lastActiveAt) return false
      return session.lastActiveAt >= range.fromMs && session.lastActiveAt <= range.toMs
    })

    return {
      generatedAt: new Date().toISOString(),
      range: {
        preset,
        from: new Date(range.fromMs).toISOString(),
        to: new Date(range.toMs).toISOString(),
        label: range.label,
      },
      summary: {
        messages: {
          total: mergedStats.messagesTotal,
          user: mergedStats.userMessages,
          assistant: mergedStats.assistantMessages,
        },
        toolCalls: {
          total: mergedStats.toolCalls,
          uniqueTools: mergedStats.uniqueTools,
        },
        errors: {
          total: mergedStats.errors,
          errorRatePct: mergedStats.errorRate,
        },
        avgTokensPerMessage: mergedStats.avgTokensPerMessage,
        avgCostPerMessage: mergedStats.avgCostPerMessage,
        totalCostUsd: mergedStats.totalCost,
        totalTokens: mergedStats.totalTokens,
        sessions: mergedStats.sessions,
        cacheHitRatePct: mergedStats.cacheHitRate,
        throughputTokensPerMinute: mergedStats.throughputTokensPerMinute,
      },
      topModels: mergedStats.topModels,
      topTools: mergedStats.topTools,
      sessions: filteredSessions,
      gatewayTotals: gatewayUsageQuery.data?.usage?.totals ?? null,
    }
  }, [analyticsSessions, gatewayUsageQuery.data?.usage?.totals, mergedStats, preset, range])

  const isInitialLoading =
    gatewayUsageQuery.isPending ||
    analyticsQuery.isPending ||
    sessionStatusQuery.isPending

  const primaryError =
    (gatewayUsageQuery.error as Error | null) ??
    (analyticsQuery.error as Error | null) ??
    (sessionStatusQuery.error as Error | null)

  const lastUpdatedAt = Math.max(
    gatewayUsageQuery.dataUpdatedAt || 0,
    analyticsQuery.dataUpdatedAt || 0,
    sessionStatusQuery.dataUpdatedAt || 0,
    historyQuery.dataUpdatedAt || 0,
  )

  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString()
    : null

  const handleExport = () => {
    try {
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `usage-analytics-${range.fromKey}-${range.toKey}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      toast('Exported usage analytics JSON')
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Unable to export analytics',
        { type: 'error' },
      )
    }
  }

  const gatewayCost = gatewayUsageQuery.data?.cost?.totals
  const gatewayUsage = gatewayUsageQuery.data?.usage?.totals
  const gatewayPeriod = gatewayUsageQuery.data?.usage
    ? `${gatewayUsageQuery.data.usage.startDate || '?'} - ${gatewayUsageQuery.data.usage.endDate || '?'}`
    : null

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-primary-900">
                Usage Analytics
              </h1>
              {gatewayUsageQuery.isFetching ||
              analyticsQuery.isFetching ||
              sessionStatusQuery.isFetching ||
              historyQuery.isFetching ? (
                <span className="text-xs text-primary-500">Syncing…</span>
              ) : null}
            </div>
            <p className="text-sm text-primary-600">
              Messages, token flow, cost, cache efficiency, and top models/tools
              for {range.label.toLowerCase()}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {lastUpdatedLabel ? (
              <div className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-xs text-primary-600 shadow-sm">
                Updated {lastUpdatedLabel}
              </div>
            ) : null}
            <Button variant="outline" onClick={handleExport}>
              <HugeiconsIcon icon={FileExportIcon} size={16} strokeWidth={1.6} />
              Export JSON
            </Button>
          </div>
        </header>

        <section className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {([
                ['today', 'Today'],
                ['7d', '7d'],
                ['30d', '30d'],
                ['custom', 'Custom'],
              ] as const).map(([value, label]) => {
                const isActive = preset === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreset(value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-accent-500 bg-primary-50 text-primary-900'
                        : 'border-primary-200 bg-white text-primary-600 hover:bg-primary-50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {preset === 'custom' ? (
                <>
                  <label className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2 text-sm text-primary-600">
                    <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={1.6} />
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(event) => setCustomFrom(event.target.value)}
                      className="bg-transparent text-primary-900 outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2 text-sm text-primary-600">
                    <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.6} />
                    <input
                      type="date"
                      value={customTo}
                      onChange={(event) => setCustomTo(event.target.value)}
                      className="bg-transparent text-primary-900 outline-none"
                    />
                  </label>
                </>
              ) : null}
              <div className="rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2 text-sm text-primary-600">
                Showing {range.label}
              </div>
            </div>
          </div>
        </section>

        {isInitialLoading ? (
          <LoadingState />
        ) : primaryError ? (
          <ErrorState
            message={primaryError.message}
            onRetry={() => {
              void Promise.all([
                gatewayUsageQuery.refetch(),
                analyticsQuery.refetch(),
                sessionStatusQuery.refetch(),
                historyQuery.refetch(),
              ])
            }}
          />
        ) : (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
              <StatCard
                icon={Message01Icon}
                label="Messages"
                value={formatCompactNumber(mergedStats.messagesTotal)}
                sub={`${formatCompactNumber(mergedStats.userMessages)} user · ${formatCompactNumber(mergedStats.assistantMessages)} assistant`}
              />
              <StatCard
                icon={ToolsIcon}
                label="Tool Calls"
                value={formatCompactNumber(mergedStats.toolCalls)}
                sub={`${formatCompactNumber(mergedStats.uniqueTools)} unique tools`}
              />
              <StatCard
                icon={AlertDiamondIcon}
                label="Errors"
                value={formatCompactNumber(mergedStats.errors)}
                sub={`${formatPercent(mergedStats.errorRate)} error rate`}
              />
              <StatCard
                icon={SearchList01Icon}
                label="Avg Tokens / Msg"
                value={formatCompactNumber(mergedStats.avgTokensPerMessage ?? undefined)}
                sub={`${formatTokens(mergedStats.totalTokens)} total tokens`}
              />
              <StatCard
                icon={DollarCircleIcon}
                label="Avg Cost / Msg"
                value={formatCost(mergedStats.avgCostPerMessage ?? undefined)}
                sub={`${formatCost(mergedStats.totalCost)} total cost`}
              />
              <StatCard
                icon={FolderDetailsIcon}
                label="Sessions"
                value={formatCompactNumber(mergedStats.sessions)}
                sub="Sessions active in range"
              />
              <StatCard
                icon={ServerStackIcon}
                label="Cache Hit Rate"
                value={formatPercent(mergedStats.cacheHitRate)}
                sub={`${formatTokens(mergedStats.cacheReadTokens)} cached prompt tokens`}
              />
              <StatCard
                icon={SpeedTrain01Icon}
                label="Throughput"
                value={formatRate(mergedStats.throughputTokensPerMinute, 'tok/min')}
                sub={`${range.days} day window`}
              />
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <TopList
                title="Top Models"
                icon={PackageSearchIcon}
                rows={mergedStats.topModels}
                empty="No model usage recorded for this range."
              />
              <TopList
                title="Top Tools"
                icon={ToolsIcon}
                rows={mergedStats.topTools}
                empty={
                  historyQuery.isPending
                    ? 'Loading tool usage…'
                    : 'No tool calls found for this range.'
                }
              />
            </section>

            <section className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-primary-900">
                    Gateway Cost Breakdown
                  </h2>
                  <p className="text-xs text-primary-500">
                    Preserved from the existing screen. Totals reflect gateway
                    usage for {gatewayPeriod ? gatewayPeriod : 'the current billing window'}.
                  </p>
                </div>
                {gatewayPeriod ? (
                  <p className="text-xs text-primary-500">{gatewayPeriod}</p>
                ) : null}
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <StatCard
                  icon={DollarCircleIcon}
                  label="Total Cost"
                  value={formatCost(gatewayUsage?.totalCost)}
                  sub={
                    gatewayCost
                      ? `Session: ${formatCost(gatewayCost.totalCost)}`
                      : undefined
                  }
                />
                <StatCard
                  icon={SearchList01Icon}
                  label="Total Tokens"
                  value={formatTokens(gatewayUsage?.totalTokens)}
                />
                <StatCard
                  icon={ArrowDown01Icon}
                  label="Input Cost"
                  value={formatCost(gatewayUsage?.inputCost)}
                />
                <StatCard
                  icon={ArrowTurnBackwardIcon}
                  label="Output Cost"
                  value={formatCost(gatewayUsage?.outputCost)}
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-primary-200">
                <table className="min-w-[520px] w-full text-sm">
                  <thead className="bg-primary-50/80">
                    <tr className="border-b border-primary-200 text-left">
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-primary-500">
                        Category
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.18em] text-primary-500">
                        Tokens
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.18em] text-primary-500">
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: 'Input',
                        tokens: gatewayUsage?.input,
                        cost: gatewayUsage?.inputCost,
                      },
                      {
                        label: 'Output',
                        tokens: gatewayUsage?.output,
                        cost: gatewayUsage?.outputCost,
                      },
                      {
                        label: 'Cache Read',
                        tokens: gatewayUsage?.cacheRead,
                        cost: gatewayUsage?.cacheReadCost,
                      },
                      {
                        label: 'Cache Write',
                        tokens: gatewayUsage?.cacheWrite,
                        cost: gatewayUsage?.cacheWriteCost,
                      },
                    ].map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-primary-100 last:border-b-0"
                      >
                        <td className="px-4 py-3 text-primary-900">
                          {row.label}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-primary-600">
                          {formatTokens(row.tokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-primary-600">
                          {formatCost(row.cost)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-primary-50/60 font-medium">
                      <td className="px-4 py-3 text-primary-900">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums text-primary-900">
                        {formatTokens(gatewayUsage?.totalTokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-primary-900">
                        {formatCost(gatewayUsage?.totalCost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
