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
  topModels: Array<{ id: string; tokens: number; calls: number }>
  estimatedCostUsd: number | null
}

export type DashboardFetcher = (path: string) => Promise<Response>

export type BuildOverviewOptions = {
  /**
   * Pluggable HTTP client. Tests pass a stub; the live route hands in a
   * function that wraps `dashboardFetch` and `claudeFetch` so auth and
   * base-URL handling stay in one place.
   */
  fetcher: DashboardFetcher
  /** How many days of analytics to roll up. Default 7. */
  analyticsWindowDays?: number
  /** How many recent achievement unlocks to surface. Default 3. */
  achievementsLimit?: number
}

const DEFAULT_OPTIONS = {
  analyticsWindowDays: 7,
  achievementsLimit: 3,
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
  const totalTokens = readNumber(r.total_tokens)
  const modelsRaw =
    Array.isArray(r.top_models) ? r.top_models : Array.isArray(r.models) ? r.models : []
  const topModels = modelsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const id = readString(e.id) || readString(e.model)
      if (!id) return null
      return {
        id,
        tokens: readNumber(e.tokens),
        calls: readNumber(e.calls ?? e.requests),
      }
    })
    .filter((entry): entry is { id: string; tokens: number; calls: number } => entry !== null)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 3)
  const estimatedCostUsd =
    typeof r.estimated_cost_usd === 'number'
      ? (r.estimated_cost_usd as number)
      : typeof r.cost_usd === 'number'
        ? (r.cost_usd as number)
        : null
  return {
    windowDays,
    totalTokens,
    topModels,
    estimatedCostUsd,
  }
}

export async function buildDashboardOverview(
  options: BuildOverviewOptions,
): Promise<DashboardOverview> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { fetcher, analyticsWindowDays, achievementsLimit } = opts

  const [
    statusRaw,
    cronRaw,
    achRecentRaw,
    achAllRaw,
    modelInfoRaw,
    analyticsRaw,
  ] = await Promise.all([
    safeJson<unknown>(fetcher, '/api/status'),
    safeJson<unknown>(fetcher, '/api/cron/jobs'),
    safeJson<unknown>(
      fetcher,
      `/api/plugins/hermes-achievements/recent-unlocks?limit=${achievementsLimit}`,
    ),
    safeJson<unknown>(fetcher, '/api/plugins/hermes-achievements/achievements'),
    safeJson<unknown>(fetcher, '/api/model/info'),
    safeJson<unknown>(fetcher, `/api/analytics/usage?days=${analyticsWindowDays}`),
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
  }
}
