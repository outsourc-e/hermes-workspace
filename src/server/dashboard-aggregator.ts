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
  /** Skills usage (counts + top skills) from the analytics window. */
  skillsUsage: DashboardSkillsUsageSection | null
  /** Pre-computed insight callouts the UI can render verbatim. */
  insights: Array<DashboardInsight>
  /** Aggregated triage list: failed crons + platform errors + log errors. */
  incidents: Array<DashboardIncident>
}

export type DashboardSkillsUsageSection = {
  totalLoads: number
  totalEdits: number
  totalActions: number
  distinctSkills: number
  topSkills: Array<{
    skill: string
    totalCount: number
    percentage: number
    lastUsedAt: number | null
  }>
}

export type DashboardInsight = {
  text: string
  tone: 'info' | 'positive' | 'warn'
}

export type DashboardIncident = {
  id: string
  severity: 'info' | 'warn' | 'error'
  source: 'cron' | 'platform' | 'log' | 'config' | 'gateway'
  label: string
  detail: string
  href: string | null
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
  /**
   * **Heuristic** count from `/api/status`: sessions touched in the
   * last 300s. Use `activeAgents` for "currently running".
   */
  activeSessions: number
  /**
   * Canonical "currently running" number from gateway runtime status
   * (​`/health/detailed` -> `active_agents`). Falls back to legacy
   * `active_sessions` when `/health/detailed` is unreachable.
   */
  activeAgents: number
  restartRequested: boolean
  updatedAt: string | null
  /** Last gateway runtime pulse — alias of `updatedAt` for clarity. */
  lastHeartbeatAt: string | null
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
  failed: number
  nextRunAt: string | null
  /** Jobs whose `last_status` indicates a failure or whose tail-error is non-null. */
  recentFailures: Array<{
    id: string
    name: string
    lastError: string | null
    lastRunAt: string | null
  }>
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

function normalizeStatus(
  raw: unknown,
  health: unknown,
): DashboardStatusSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const state = readString(r.gateway_state) || readString(r.state)
  if (!state) return null
  // `/health/detailed` is the canonical source for currently-running
  // agent count. Falls back to legacy fields when the gateway endpoint
  // is missing/unreachable.
  let activeAgents: number | null = null
  if (health && typeof health === 'object') {
    const h = health as Record<string, unknown>
    if (typeof h.active_agents === 'number') {
      activeAgents = h.active_agents
    }
  }
  if (activeAgents === null && typeof r.active_agents === 'number') {
    activeAgents = r.active_agents
  }
  if (activeAgents === null) activeAgents = 0
  const updatedAt =
    typeof r.gateway_updated_at === 'string'
      ? r.gateway_updated_at
      : typeof r.updated_at === 'string'
        ? r.updated_at
        : null
  return {
    gatewayState: state,
    activeSessions: readNumber(r.active_sessions),
    activeAgents,
    restartRequested: readBoolean(r.restart_requested),
    updatedAt,
    lastHeartbeatAt: updatedAt,
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
  let failed = 0
  let nextRunMs: number | null = null
  const recentFailures: DashboardCronSection['recentFailures'] = []
  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue
    const j = job as Record<string, unknown>
    const state = readString(j.state || j.status).toLowerCase()
    if (state === 'paused') paused += 1
    else if (state === 'running') running += 1
    const lastStatus = readString(j.last_status).toLowerCase()
    const lastError =
      typeof j.last_error === 'string'
        ? j.last_error
        : typeof j.last_delivery_error === 'string'
          ? (j.last_delivery_error as string)
          : null
    const isFailure =
      lastStatus === 'failed' ||
      lastStatus === 'error' ||
      (lastError !== null && lastError.length > 0)
    if (isFailure) {
      failed += 1
      const id = readString(j.id) || readString(j.name) || 'unknown'
      const name = readString(j.name) || id
      const lastRunAt =
        typeof j.last_run_at === 'string' ? j.last_run_at : null
      recentFailures.push({ id, name, lastError, lastRunAt })
    }
    const candidates = [
      typeof j.next_run_at === 'string' ? Date.parse(j.next_run_at) : NaN,
      typeof j.next_run === 'string' ? Date.parse(j.next_run) : NaN,
      typeof j.next_run_at === 'number'
        ? (j.next_run_at as number) * 1000
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
    failed,
    nextRunAt: nextRunMs ? new Date(nextRunMs).toISOString() : null,
    recentFailures: recentFailures.slice(0, 5),
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

function normalizeSkillsUsage(
  raw: unknown,
): DashboardSkillsUsageSection | null {
  if (!raw || typeof raw !== 'object') return null
  // Native shape: analytics payload's `skills` field is an object with
  // `summary` and `top_skills` per the Hermes Agent confirmation.
  const skillsRaw = (raw as Record<string, unknown>).skills
  if (!skillsRaw || typeof skillsRaw !== 'object') return null
  const s = skillsRaw as Record<string, unknown>
  const summary =
    s.summary && typeof s.summary === 'object'
      ? (s.summary as Record<string, unknown>)
      : null
  const topRaw = Array.isArray(s.top_skills) ? s.top_skills : []
  const topSkills = topRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const skill = readString(e.skill)
      if (!skill) return null
      return {
        skill,
        totalCount: readNumber(e.total_count),
        percentage: readNumber(e.percentage),
        lastUsedAt:
          typeof e.last_used_at === 'number'
            ? (e.last_used_at as number)
            : null,
      }
    })
    .filter(
      (e): e is {
        skill: string
        totalCount: number
        percentage: number
        lastUsedAt: number | null
      } => e !== null,
    )
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 5)
  if (
    !summary &&
    topSkills.length === 0
  ) {
    return null
  }
  return {
    totalLoads: readNumber(summary?.total_skill_loads),
    totalEdits: readNumber(summary?.total_skill_edits),
    totalActions: readNumber(summary?.total_skill_actions),
    distinctSkills: readNumber(summary?.distinct_skills_used),
    topSkills,
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

function shortDate(day: string): string {
  const ts = Date.parse(day)
  if (!Number.isFinite(ts)) return day
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function formatTokensCompact(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Build server-side insight callouts so the UI can render them as-is.
 * Per the Hermes Agent guidance, computing this in the aggregator keeps
 * the UI dumb and lets us swap in a real anomaly endpoint later without
 * touching components.
 */
function computeInsights(
  analytics: DashboardAnalyticsSection | null,
  cron: DashboardCronSection | null,
  status: DashboardStatusSection | null,
  skills: DashboardSkillsUsageSection | null,
): Array<DashboardInsight> {
  const out: Array<DashboardInsight> = []
  if (!analytics || analytics.source !== 'analytics') return out
  // 1. Peak day driver
  if (analytics.daily.length >= 3) {
    let peakIdx = 0
    let peakVal = 0
    for (let i = 0; i < analytics.daily.length; i += 1) {
      const total =
        analytics.daily[i].inputTokens + analytics.daily[i].outputTokens
      if (total > peakVal) {
        peakVal = total
        peakIdx = i
      }
    }
    if (peakVal > 0) {
      const top = analytics.topModels[0]
      const driver = top ? `, driven by ${top.id}` : ''
      out.push({
        tone: 'info',
        text: `Usage peaked ${shortDate(analytics.daily[peakIdx].day)} (${formatTokensCompact(peakVal)} tokens)${driver}.`,
      })
    }
  }
  // 2. Cache delta
  if (analytics.daily.length >= 14) {
    const mid = Math.floor(analytics.daily.length / 2)
    let prior = 0
    let recent = 0
    for (let i = 0; i < mid; i += 1) prior += analytics.daily[i].cacheReadTokens
    for (let i = mid; i < analytics.daily.length; i += 1)
      recent += analytics.daily[i].cacheReadTokens
    if (prior > 0) {
      const delta = ((recent - prior) / prior) * 100
      if (Math.abs(delta) >= 5) {
        out.push({
          tone: delta > 0 ? 'positive' : 'warn',
          text: `Cache reads ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)}% vs prior period.`,
        })
      }
    }
  }
  // 3. Operational pulse
  const ops: Array<string> = []
  if (cron && cron.failed > 0) {
    ops.push(
      `${cron.failed} failed cron job${cron.failed === 1 ? '' : 's'}`,
    )
  }
  if (cron && cron.nextRunAt) {
    const nextMs = Date.parse(cron.nextRunAt)
    if (Number.isFinite(nextMs) && nextMs - Date.now() < -7 * 86_400_000) {
      ops.push(
        `${cron.total} stale cron job${cron.total === 1 ? '' : 's'}`,
      )
    }
  }
  if (
    status &&
    status.gatewayState === 'running' &&
    status.activeAgents === 0
  ) {
    ops.push('no active runs')
  }
  if (status?.restartRequested) ops.push('restart pending')
  if (ops.length > 0) {
    out.push({
      tone: ops.length >= 2 ? 'warn' : 'info',
      text: ops.join(' · ') + '.',
    })
  }
  // 4. Skills heat
  if (skills && skills.distinctSkills > 0 && skills.topSkills[0]) {
    const top = skills.topSkills[0]
    out.push({
      tone: 'info',
      text: `Top skill: ${top.skill} (${top.totalCount} uses, ${top.percentage.toFixed(1)}% of skill activity).`,
    })
  }
  return out.slice(0, 4)
}

function computeIncidents(
  status: DashboardStatusSection | null,
  platforms: Array<DashboardPlatformEntry>,
  cron: DashboardCronSection | null,
  logs: DashboardLogsSection | null,
): Array<DashboardIncident> {
  const out: Array<DashboardIncident> = []
  // Cron failures
  if (cron) {
    for (const f of cron.recentFailures) {
      out.push({
        id: `cron-fail-${f.id}`,
        severity: 'error',
        source: 'cron',
        label: `cron job failed: ${f.name}`,
        detail: f.lastError || 'last_status indicates failure',
        href: '/jobs',
      })
    }
    if (cron.nextRunAt) {
      const nextMs = Date.parse(cron.nextRunAt)
      if (
        Number.isFinite(nextMs) &&
        nextMs - Date.now() < -7 * 86_400_000 &&
        out.length < 5
      ) {
        out.push({
          id: 'cron-stale',
          severity: 'warn',
          source: 'cron',
          label: `${cron.total} cron job${cron.total === 1 ? '' : 's'} stale`,
          detail: 'next scheduled run is more than 7 days overdue',
          href: '/jobs',
        })
      }
    }
    if (cron.paused > 0) {
      out.push({
        id: 'cron-paused',
        severity: 'warn',
        source: 'cron',
        label: `${cron.paused} cron job${cron.paused === 1 ? '' : 's'} paused`,
        detail: 'resume from /jobs if these should be running',
        href: '/jobs',
      })
    }
  }
  // Platform errors
  for (const p of platforms) {
    const s = p.state.toLowerCase()
    if (s === 'error' || s === 'failed' || s === 'disconnected') {
      out.push({
        id: `platform-${p.name}`,
        severity: 'error',
        source: 'platform',
        label: `${p.name} ${p.state}`,
        detail: p.errorMessage || 'platform reports a non-connected state',
        href: null,
      })
    }
  }
  // Config drift
  if (
    status &&
    status.configVersion !== null &&
    status.latestConfigVersion !== null &&
    status.latestConfigVersion > status.configVersion
  ) {
    const diff = status.latestConfigVersion - status.configVersion
    out.push({
      id: 'config-drift',
      severity: 'warn',
      source: 'config',
      label: `${diff} config diff${diff === 1 ? '' : 's'} pending`,
      detail: `local v${status.configVersion} · latest v${status.latestConfigVersion}`,
      href: '/settings',
    })
  }
  // Restart pending
  if (status?.restartRequested) {
    out.push({
      id: 'restart-pending',
      severity: 'warn',
      source: 'gateway',
      label: 'restart pending',
      detail: 'gateway flagged restart_requested',
      href: null,
    })
  }
  // Log-tail errors
  if (logs && logs.errorCount > 0) {
    out.push({
      id: 'log-errors',
      severity: 'error',
      source: 'log',
      label: `${logs.errorCount} log error${logs.errorCount === 1 ? '' : 's'} in tail`,
      detail: 'recent agent log shows tracebacks or fatal errors',
      href: null,
    })
  } else if (logs && logs.warnCount > 0) {
    out.push({
      id: 'log-warns',
      severity: 'warn',
      source: 'log',
      label: `${logs.warnCount} log warning${logs.warnCount === 1 ? '' : 's'}`,
      detail: 'recent agent log emitted warnings',
      href: null,
    })
  }
  return out
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

export type BuildOverviewExtraFetchers = {
  /**
   * Optional fetcher for the gateway runtime endpoint (`/health/detailed`).
   * Different host/port from the dashboard fetcher; lets the aggregator
   * pick up the canonical `active_agents` value the Hermes Agent
   * confirmed is the right “currently running” source.
   */
  gatewayFetcher?: DashboardFetcher
}

export async function buildDashboardOverview(
  options: BuildOverviewOptions & BuildOverviewExtraFetchers,
): Promise<DashboardOverview> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { fetcher, analyticsWindowDays, achievementsLimit, logsLimit } = opts

  const [
    statusRaw,
    healthRaw,
    cronRaw,
    achRecentRaw,
    achAllRaw,
    modelInfoRaw,
    analyticsRaw,
    logsRaw,
  ] = await Promise.all([
    safeJson<unknown>(fetcher, '/api/status'),
    options.gatewayFetcher
      ? safeJson<unknown>(options.gatewayFetcher, '/health/detailed')
      : Promise.resolve(null),
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

  const status = normalizeStatus(statusRaw, healthRaw)
  const platforms = normalizePlatforms(statusRaw)
  const cron = normalizeCron(cronRaw)
  const analytics = normalizeAnalytics(analyticsRaw, analyticsWindowDays)
  const logs = normalizeLogs(logsRaw, logsLimit)
  const skillsUsage = normalizeSkillsUsage(analyticsRaw)
  const insights = computeInsights(analytics, cron, status, skillsUsage)
  const incidents = computeIncidents(status, platforms, cron, logs)

  return {
    status,
    platforms,
    cron,
    achievements: normalizeAchievements(
      achRecentRaw,
      achAllRaw,
      achievementsLimit,
    ),
    modelInfo: normalizeModelInfo(modelInfoRaw),
    analytics,
    logs,
    skillsUsage,
    insights,
    incidents,
  }
}
