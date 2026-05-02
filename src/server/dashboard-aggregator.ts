/**
 * Aggregator for the Workspace dashboard overview.
 *
 * The Workspace `/dashboard` route used to fetch a couple of pieces in
 * parallel and stitch them together client-side. As the dashboard grew
 * to include cron, achievements, platforms, and analytics, the client
 * was making 5-6 round trips on every load. Worse, each surface had to
 * implement its own capability gate.
 *
 * `buildDashboardOverview` is the server-side aggregator that fans out
 * the fetches in parallel, applies per-section graceful fallbacks, and
 * returns a single normalised payload the client can render in one shot.
 *
 * Each section is independent: a failure in one (auth missing, plugin
 * not installed, dashboard down) leaves the corresponding field at
 * `null` so the UI can hide just that card.
 */

export type DashboardOverview = {
  status: DashboardStatusSection | null
  platforms: Array<DashboardPlatformEntry>
  cron: DashboardCronSection | null
  achievements: DashboardAchievementsSection | null
  modelInfo: DashboardModelInfoSection | null
  analytics: DashboardAnalyticsSection | null
  logs: DashboardLogsSection | null
}

export type DashboardLogsSection = {
  /** Source file the dashboard returned (`agent`, `gateway`, etc.). */
  file: string
  /** Most recent N log lines, raw, including newlines. */
  lines: Array<string>
  /** Tally of obvious error/warning markers in the tail. */
  errorCount: number
  warnCount: number
}

export type DashboardStatusSection = {
  gatewayState: string
  activeAgents: number
  restartRequested: boolean
  updatedAt: string | null
  /** Gateway/dashboard semver. `null` when missing. */
  version: string | null
  /** Release date string from `/api/status`, raw value preserved. */
  releaseDate: string | null
  /** Current config schema version applied locally. */
  configVersion: number | null
  /** Latest config schema the dashboard knows about. */
  latestConfigVersion: number | null
  /** Resolved `HERMES_HOME` directory the dashboard reports. */
  hermesHome: string | null
}

export type DashboardPlatformEntry = {
  name: string
  state: string
  updatedAt: string | null
  errorMessage: string | null
}

export type DashboardCronSection = {
  total: number
  paused: number
  running: number
  nextRunAt: string | null
}

export type DashboardAchievementUnlock = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  tier: string | null
  unlockedAt: number | null
}

export type DashboardAchievementsSection = {
  totalUnlocked: number
  recentUnlocks: Array<DashboardAchievementUnlock>
}

export type DashboardModelInfoSection = {
  provider: string
  model: string
  effectiveContextLength: number
  capabilities: Record<string, unknown> | null
}

export type DashboardAnalyticsSection = {
  windowDays: number
  totalTokens: number
  /** Sum of input tokens across the window, for cache/cost split UIs. */
  inputTokens: number
  /** Sum of output tokens. */
  outputTokens: number
  /** Cache-read tokens (often >> input on long sessions). */
  cacheReadTokens: number
  /** Reasoning/thinking tokens, when the model emits them. */
  reasoningTokens: number
  /** Total session count over the window. */
  totalSessions: number
  /** API call count over the window. */
  totalApiCalls: number
  topModels: Array<{ id: string; tokens: number; calls: number; cost: number; sessions: number }>
  /**
   * Per-day rollup for sparklines. ISO date string + tokens + sessions
   * + cost per day. Always returned, even when empty.
   */
  daily: Array<{
    day: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    reasoningTokens: number
    sessions: number
    apiCalls: number
    estimatedCost: number
  }>
  estimatedCostUsd: number | null
  /** Source the totals came from. */
  source: 'analytics' | 'fallback' | 'unavailable'
}

export type DashboardFetcher = (path: string) => Promise<Response>

export type BuildOverviewOptions = {
  /**
   * Pluggable HTTP client. Tests pass a stub; the live route hands in a
   * function that wraps `dashboardFetch` and `claudeFetch` so auth and
   * base-URL handling stay in one place.
   */
  fetcher: DashboardFetcher
  /** How many days of analytics to roll up. Default 30 (matches native). */
  analyticsWindowDays?: number
  /** How many recent achievement unlocks to surface. Default 3. */
  achievementsLimit?: number
  /** How many log tail lines to surface. Default 24. */
  logsLimit?: number
}

const DEFAULT_OPTIONS = {
  // 30 days matches the native Hermes dashboard's default analytics
  // window and gives the sparkline enough breathing room.
  analyticsWindowDays: 30,
  achievementsLimit: 3,
  logsLimit: 24,
}

async function safeJson<T>(
  fetcher: DashboardFetcher,
  path: string,
): Promise<T | null> {
  try {
    const res = await fetcher(path)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeStatus(raw: unknown): DashboardStatusSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const state = readString(r.gateway_state) || readString(r.state)
  if (!state) return null
  return {
    gatewayState: state,
    // The dashboard exposes `active_sessions`; older builds used `active_agents`.
    activeAgents: readNumber(r.active_sessions ?? r.active_agents),
    restartRequested: readBoolean(r.restart_requested),
    updatedAt:
      typeof r.gateway_updated_at === 'string'
        ? r.gateway_updated_at
        : typeof r.updated_at === 'string'
          ? r.updated_at
          : null,
    version: readOptionalString(r.version),
    releaseDate: readOptionalString(r.release_date),
    configVersion: readOptionalNumber(r.config_version),
    latestConfigVersion: readOptionalNumber(r.latest_config_version),
    hermesHome: readOptionalString(r.hermes_home),
  }
}

function normalizePlatforms(raw: unknown): Array<DashboardPlatformEntry> {
  if (!raw || typeof raw !== 'object') return []
  const r = raw as Record<string, unknown>
  // Dashboard responds with `gateway_platforms`; older /api/status
  // payloads carried `platforms`. Accept either.
  const candidate = r.gateway_platforms ?? r.platforms
  const platformsRaw =
    candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : null
  if (!platformsRaw) return []
  return Object.entries(platformsRaw)
    .map(([name, value]) => {
      if (!value || typeof value !== 'object') return null
      const v = value as Record<string, unknown>
      return {
        name,
        state: readString(v.state) || 'unknown',
        updatedAt: typeof v.updated_at === 'string' ? v.updated_at : null,
        errorMessage:
          typeof v.error_message === 'string' ? v.error_message : null,
      }
    })
    .filter((entry): entry is DashboardPlatformEntry => entry !== null)
}

function normalizeCron(raw: unknown): DashboardCronSection | null {
  if (!raw) return null
  let jobs: Array<Record<string, unknown>> = []
  if (Array.isArray(raw)) {
    jobs = raw as Array<Record<string, unknown>>
  } else if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (Array.isArray(r.jobs)) jobs = r.jobs as Array<Record<string, unknown>>
  }
  if (!Array.isArray(jobs)) return null

  let paused = 0
  let running = 0
  let nextRunMs: number | null = null
  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue
    const status = readString(job.status).toLowerCase()
    if (status === 'paused') paused += 1
    else if (status === 'running') running += 1
    const candidates = [
      typeof job.next_run_at === 'string' ? Date.parse(job.next_run_at) : NaN,
      typeof job.next_run === 'string' ? Date.parse(job.next_run) : NaN,
      typeof job.next_run_at === 'number'
        ? (job.next_run_at as number) * 1000
        : NaN,
    ].filter((v) => Number.isFinite(v)) as Array<number>
    for (const ts of candidates) {
      if (nextRunMs === null || ts < nextRunMs) nextRunMs = ts
    }
  }
  return {
    total: jobs.length,
    paused,
    running,
    nextRunAt: nextRunMs ? new Date(nextRunMs).toISOString() : null,
  }
}

function normalizeAchievementUnlock(
  raw: unknown,
): DashboardAchievementUnlock | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = readString(r.id)
  const name = readString(r.name)
  if (!id || !name) return null
  return {
    id,
    name,
    description: readString(r.description),
    category: readString(r.category) || 'General',
    icon: readString(r.icon) || 'Star',
    tier: typeof r.tier === 'string' ? r.tier : null,
    unlockedAt:
      typeof r.unlocked_at === 'number' ? (r.unlocked_at as number) : null,
  }
}

function normalizeAchievements(
  recent: unknown,
  all: unknown,
  limit: number,
): DashboardAchievementsSection | null {
  const recentArr = Array.isArray(recent) ? recent : []
  if (recentArr.length === 0 && (!all || typeof all !== 'object')) return null
  const recentUnlocks = recentArr
    .map(normalizeAchievementUnlock)
    .filter(
      (entry): entry is DashboardAchievementUnlock => entry !== null,
    )
    .slice(0, limit)

  let totalUnlocked = 0
  if (all && typeof all === 'object') {
    const ach = (all as Record<string, unknown>).achievements
    if (Array.isArray(ach)) {
      for (const item of ach) {
        if (!item || typeof item !== 'object') continue
        const state = readString((item as Record<string, unknown>).state)
        if (state === 'unlocked') totalUnlocked += 1
      }
    }
  }

  return { totalUnlocked, recentUnlocks }
}

function normalizeModelInfo(raw: unknown): DashboardModelInfoSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const model = readString(r.model)
  if (!model) return null
  return {
    provider: readString(r.provider) || 'unknown',
    model,
    effectiveContextLength: readNumber(r.effective_context_length),
    capabilities:
      r.capabilities && typeof r.capabilities === 'object'
        ? (r.capabilities as Record<string, unknown>)
        : null,
  }
}

function normalizeAnalytics(
  raw: unknown,
  windowDays: number,
): DashboardAnalyticsSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Native Hermes dashboard shape:
  //   { daily: [...], by_model: [...], totals: {...}, period_days, skills }
  // Older / synthetic shape may use total_tokens / top_models. Support both.
  const totalsRaw =
    r.totals && typeof r.totals === 'object'
      ? (r.totals as Record<string, unknown>)
      : null
  const inputTokens = readNumber(
    totalsRaw?.total_input ?? r.total_input ?? r.input_tokens,
  )
  const outputTokens = readNumber(
    totalsRaw?.total_output ?? r.total_output ?? r.output_tokens,
  )
  const cacheReadTokens = readNumber(
    totalsRaw?.total_cache_read ??
      r.total_cache_read ??
      r.cache_read_tokens,
  )
  const reasoningTokens = readNumber(
    totalsRaw?.total_reasoning ?? r.total_reasoning ?? r.reasoning_tokens,
  )
  const totalSessions = readNumber(
    totalsRaw?.total_sessions ?? r.total_sessions,
  )
  const totalApiCalls = readNumber(
    totalsRaw?.total_api_calls ?? r.total_api_calls,
  )
  const totalCost = ((): number | null => {
    const candidates = [
      totalsRaw?.total_estimated_cost,
      totalsRaw?.total_actual_cost,
      r.estimated_cost_usd,
      r.cost_usd,
    ]
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c)) return c
    }
    return null
  })()

  // Sum input+output for the legacy `totalTokens` consumers; cache and
  // reasoning are exposed separately for the rich UI.
  const fallbackTotal = readNumber(r.total_tokens)
  const totalTokens =
    inputTokens + outputTokens > 0
      ? inputTokens + outputTokens
      : fallbackTotal

  const modelsRaw = Array.isArray(r.by_model)
    ? r.by_model
    : Array.isArray(r.top_models)
      ? r.top_models
      : Array.isArray(r.models)
        ? r.models
        : []
  const topModels = modelsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const id = readString(e.model) || readString(e.id)
      if (!id) return null
      const tokensIn = readNumber(e.input_tokens ?? e.tokens)
      const tokensOut = readNumber(e.output_tokens)
      return {
        id,
        tokens: tokensIn + tokensOut > 0 ? tokensIn + tokensOut : readNumber(e.tokens),
        calls: readNumber(e.api_calls ?? e.calls ?? e.requests),
        cost: readNumber(e.estimated_cost ?? e.cost),
        sessions: readNumber(e.sessions),
      }
    })
    .filter(
      (entry): entry is {
        id: string
        tokens: number
        calls: number
        cost: number
        sessions: number
      } => entry !== null,
    )
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5)

  const dailyRaw = Array.isArray(r.daily) ? r.daily : []
  const daily = dailyRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const day = readString(e.day) || readString(e.date)
      if (!day) return null
      return {
        day,
        inputTokens: readNumber(e.input_tokens),
        outputTokens: readNumber(e.output_tokens),
        cacheReadTokens: readNumber(e.cache_read_tokens),
        reasoningTokens: readNumber(e.reasoning_tokens),
        sessions: readNumber(e.sessions),
        apiCalls: readNumber(e.api_calls),
        estimatedCost: readNumber(e.estimated_cost),
      }
    })
    .filter(
      (entry): entry is {
        day: string
        inputTokens: number
        outputTokens: number
        cacheReadTokens: number
        reasoningTokens: number
        sessions: number
        apiCalls: number
        estimatedCost: number
      } => entry !== null,
    )

  const hasAny = totalTokens > 0 || topModels.length > 0 || daily.length > 0
  return {
    windowDays,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    reasoningTokens,
    totalSessions,
    totalApiCalls,
    topModels,
    daily,
    estimatedCostUsd: totalCost,
    source: hasAny ? 'analytics' : 'unavailable',
  }
}

function normalizeLogs(
  raw: unknown,
  limit: number,
): DashboardLogsSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const linesRaw = Array.isArray(r.lines) ? r.lines : null
  if (!linesRaw) return null
  const lines = linesRaw
    .filter((entry): entry is string => typeof entry === 'string')
    .slice(-limit)
  let errorCount = 0
  let warnCount = 0
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (
      /\b(error|exception|traceback|failed|fatal)\b/.test(lower) ||
      lower.includes('errno')
    ) {
      errorCount += 1
    } else if (/\b(warn|warning|deprecated)\b/.test(lower)) {
      warnCount += 1
    }
  }
  return {
    file: readString(r.file) || 'agent',
    lines,
    errorCount,
    warnCount,
  }
}

export async function buildDashboardOverview(
  options: BuildOverviewOptions,
): Promise<DashboardOverview> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { fetcher, analyticsWindowDays, achievementsLimit, logsLimit } = opts

  const [
    statusRaw,
    cronRaw,
    achRecentRaw,
    achAllRaw,
    modelInfoRaw,
    analyticsRaw,
    logsRaw,
  ] = await Promise.all([
    safeJson<unknown>(fetcher, '/api/status'),
    safeJson<unknown>(fetcher, '/api/cron/jobs'),
    safeJson<unknown>(
      fetcher,
      `/api/plugins/hermes-achievements/recent-unlocks?limit=${achievementsLimit}`,
    ),
    safeJson<unknown>(fetcher, '/api/plugins/hermes-achievements/achievements'),
    safeJson<unknown>(fetcher, '/api/model/info'),
    safeJson<unknown>(
      fetcher,
      `/api/analytics/usage?days=${analyticsWindowDays}`,
    ),
    safeJson<unknown>(fetcher, `/api/logs?lines=${logsLimit}`),
  ])

  return {
    status: normalizeStatus(statusRaw),
    platforms: normalizePlatforms(statusRaw),
    cron: normalizeCron(cronRaw),
    achievements: normalizeAchievements(
      achRecentRaw,
      achAllRaw,
      achievementsLimit,
    ),
    modelInfo: normalizeModelInfo(modelInfoRaw),
    analytics: normalizeAnalytics(analyticsRaw, analyticsWindowDays),
    logs: normalizeLogs(logsRaw, logsLimit),
  }
}
