import { execFileSync } from 'node:child_process'
import { buildKnowledgeGraph, knowledgeRootExists } from './knowledge-browser'
import { listMemoryFiles } from './memory-browser'
import { getTaylorApprovalQueue } from './taylor-approval-queue'
import { listSwarmMissions } from './swarm-missions'
import type { SwarmMission, SwarmMissionAssignment } from './swarm-missions'

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
  kanban: DashboardKanbanSection | null
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
  /** Source-backed capability maturity ledger for Nova/Hermes. */
  trustLedger: DashboardTrustLedgerSection | null
  /** Operational productivity loops with real source readiness. */
  controlLoops: DashboardControlLoopsSection | null
  /** Manual NotebookLM synthesis bridge, when Obsidian data is available. */
  notebookBridge: DashboardNotebookBridgeSection | null
  /** Live source-of-truth status for wiring Nova into Mission Control. */
  liveSystems: DashboardLiveSystemsSection
  /** Read-only agent workforce status derived from swarm mission receipts. */
  agentWorkforce: DashboardAgentWorkforceSection
  /** Read-only local Git/GitHub branch status for the current workspace. */
  gitWork: DashboardGitWorkSection
}

export type ControlLoopStatus = 'ready' | 'partial' | 'not-wired'

/**
 * Truth taxonomy for Mission Control panels:
 * - `operational` — connected to real data AND healthy.
 * - `connected` — real data parsed from the source, but nothing actionable yet.
 * - `reachable` — the source answered, but no real data could be proven.
 * - `approval-gated` — connected, with items or writes waiting on Taylor.
 * - `degraded` — connected but reporting errors/anomalies.
 * - `offline` — probed and down.
 * - `not-wired` — no source configured or responding.
 */
export type LiveSystemStatus =
  | 'operational'
  | 'connected'
  | 'reachable'
  | 'approval-gated'
  | 'degraded'
  | 'offline'
  | 'not-wired'

export type AgentWorkerStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'blocked'
  | 'reviewing'
  | 'done'

export type DashboardAgentWorker = {
  workerId: string
  status: AgentWorkerStatus
  activeAssignments: number
  completedAssignments: number
  blockedAssignments: number
  reviewAssignments: number
  currentTask: string | null
  missionId: string | null
  lastSeenAt: string | null
}

export type DashboardAgentWorkforceMission = {
  id: string
  title: string
  state: string
  updatedAt: string
  assignments: number
  blocked: number
  reviewing: number
}

export type DashboardAgentWorkforceSection = {
  generatedAt: string
  summary: {
    missions: number
    workers: number
    active: number
    blocked: number
    reviewing: number
    done: number
  }
  workers: Array<DashboardAgentWorker>
  recentMissions: Array<DashboardAgentWorkforceMission>
}

export type DashboardGitRemote = {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}

export type DashboardGitWorkSection = {
  branch: string | null
  clean: boolean
  ahead: number
  behind: number
  changedFiles: number
  upstream: string | null
  latestCommit: {
    hash: string
    subject: string
  } | null
  remotes: Array<DashboardGitRemote>
  prUrl: string | null
  warning: string | null
}

export type DashboardLiveSystem = {
  id: string
  label: string
  status: LiveSystemStatus
  detail: string
  href: string | null
  lastSeenAt: string | null
  source: string
}

export type DashboardLiveSystemsSection = {
  generatedAt: string
  summary: {
    total: number
    operational: number
    connected: number
    reachable: number
    approvalGated: number
    degraded: number
    offline: number
    notWired: number
  }
  blockers: Array<string>
  systems: Array<DashboardLiveSystem>
}

export type ControlLoopSourceStatus =
  | 'connected'
  | 'available'
  | 'not-wired'
  | 'unavailable'

export type DashboardControlLoopSource = {
  label: string
  status: ControlLoopSourceStatus
  detail: string
}

export type DashboardControlLoop = {
  id:
    | 'morning-command-center'
    | 'email-to-taylor-kanban'
    | 'jobboard-caretaker'
    | 'design-intake-triage'
    | 'cost-route-watch'
    | 'shutdown-routine'
  label: string
  purpose: string
  connectedSystems: Array<DashboardControlLoopSource>
  status: ControlLoopStatus
  readiness: string
  lastUsedAt: string | null
  nextScheduledAt: string | null
  dryRunPrompt: string
  guardrails: Array<string>
  sourceLinks: Array<DashboardTrustLedgerSourceLink>
}

export type DashboardControlLoopsSection = {
  generatedAt: string
  summary: {
    total: number
    ready: number
    partial: number
    notWired: number
  }
  riskGates: Array<string>
  loops: Array<DashboardControlLoop>
}

export type TrustLedgerStatus =
  | 'Unwired'
  | 'Tested'
  | 'Reliable'
  | 'Trusted'
  | 'Autonomous'

export type DashboardTrustLedgerSourceLink = {
  label: string
  href: string
}

export type DashboardTrustLedgerMilestone = {
  id: string
  label: string
  status: TrustLedgerStatus
  progress: {
    current: number
    target: number
    unit: string
  }
  summary: string
  evidence: Array<string>
  weakArea: string | null
  sourceLinks: Array<DashboardTrustLedgerSourceLink>
  updatedAt: string | null
}

export type DashboardTrustLedgerSection = {
  score: number
  highestStatus: TrustLedgerStatus
  milestones: Array<DashboardTrustLedgerMilestone>
  recentUnlocks: Array<DashboardTrustLedgerMilestone>
  weakAreas: Array<DashboardTrustLedgerMilestone>
  counters: {
    milestones: number
    reliableOrBetter: number
    trustedOrBetter: number
    autonomous: number
  }
}

export type NotebookBridgeStageStatus = 'Ready' | 'Manual' | 'Draft' | 'Blocked'

export type DashboardNotebookBridgeStage = {
  id: string
  label: string
  status: NotebookBridgeStageStatus
  summary: string
  sourceLinks: Array<DashboardTrustLedgerSourceLink>
}

export type DashboardNotebookBridgeSection = {
  mode: 'manual-approval'
  canonicalSource: string
  synthesisLayer: string
  writebackTargets: Array<string>
  vaultNotes: number
  vaultLinks: number
  lastVaultUpdate: string | null
  guardrails: Array<string>
  stages: Array<DashboardNotebookBridgeStage>
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
  source: 'cron' | 'kanban' | 'platform' | 'log' | 'config' | 'gateway'
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
   * (`/health/detailed` -> `active_agents`). Falls back to legacy
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

export type DashboardKanbanSection = {
  total: number
  triage: number
  todo: number
  ready: number
  running: number
  blocked: number
  done: number
  other: number
  topBlocked: Array<{
    id: string
    title: string
    assignee: string | null
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
  topModels: Array<{
    id: string
    tokens: number
    calls: number
    cost: number
    sessions: number
  }>
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
  /**
   * Cost-coverage trust label.
   *
   *  - `precise`        — every session in the window has a known
   *                       priced model.
   *  - `partial`        — some sessions priced, some included or
   *                       unknown.
   *  - `included`       — every session is on a subscription/included
   *                       provider so the dollar number is
   *                       structurally zero.
   *  - `unknown`        — we have no signal at all.
   *
   * Computed in the aggregator from `by_model` cost per provider:
   * codex / anthropic-oauth / minimax (subscription) vs explicit
   * priced models. Workspace UIs should use `costLabel` instead of
   * showing `estimatedCostUsd` as a precise dollar figure.
   */
  costLabel: 'precise' | 'partial' | 'included' | 'unknown'
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

async function safeUrlJson<T>(
  url: string,
  timeoutMs = 2500,
): Promise<T | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
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

export function normalizeCron(raw: unknown): DashboardCronSection | null {
  if (!raw) return null
  let jobs: Array<unknown> = []
  if (Array.isArray(raw)) {
    jobs = raw
  } else if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (Array.isArray(r.jobs)) jobs = r.jobs
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
          ? j.last_delivery_error
          : null
    const isFailure =
      lastStatus === 'failed' ||
      lastStatus === 'error' ||
      (lastError !== null && lastError.length > 0)
    if (isFailure) {
      failed += 1
      const id = readString(j.id) || readString(j.name) || 'unknown'
      const name = readString(j.name) || id
      const lastRunAt = typeof j.last_run_at === 'string' ? j.last_run_at : null
      recentFailures.push({ id, name, lastError, lastRunAt })
    }
    const candidates = [
      typeof j.next_run_at === 'string' ? Date.parse(j.next_run_at) : NaN,
      typeof j.next_run === 'string' ? Date.parse(j.next_run) : NaN,
      typeof j.next_run_at === 'number' ? j.next_run_at * 1000 : NaN,
    ].filter((v) => Number.isFinite(v))
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

function normalizeKanban(raw: unknown): DashboardKanbanSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const columnsRaw = Array.isArray(r.columns) ? r.columns : null
  if (!columnsRaw) return null

  const out: DashboardKanbanSection = {
    total: 0,
    triage: 0,
    todo: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    done: 0,
    other: 0,
    topBlocked: [],
  }

  const bucketFor = (
    status: string,
  ): keyof Pick<
    DashboardKanbanSection,
    'triage' | 'todo' | 'ready' | 'running' | 'blocked' | 'done' | 'other'
  > => {
    const s = status.toLowerCase()
    if (s === 'triage') return 'triage'
    if (s === 'todo' || s === 'queued') return 'todo'
    if (s === 'ready') return 'ready'
    if (s === 'running' || s === 'claimed' || s === 'in_progress')
      return 'running'
    if (s === 'blocked') return 'blocked'
    if (s === 'done' || s === 'completed' || s === 'complete') return 'done'
    return 'other'
  }

  for (const column of columnsRaw) {
    if (!column || typeof column !== 'object') continue
    const c = column as Record<string, unknown>
    const columnName = readString(c.name || c.id || c.status)
    const tasks = Array.isArray(c.tasks) ? c.tasks : []
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue
      const t = task as Record<string, unknown>
      const bucket = bucketFor(readString(t.status) || columnName)
      out.total += 1
      out[bucket] += 1
      if (bucket === 'blocked' && out.topBlocked.length < 5) {
        out.topBlocked.push({
          id: readString(t.id) || 'unknown',
          title: readString(t.title) || readString(t.name) || 'Untitled task',
          assignee: readOptionalString(t.assignee),
        })
      }
    }
  }

  return out
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
    unlockedAt: typeof r.unlocked_at === 'number' ? r.unlocked_at : null,
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
    .filter((entry): entry is DashboardAchievementUnlock => entry !== null)
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
        lastUsedAt: typeof e.last_used_at === 'number' ? e.last_used_at : null,
      }
    })
    .filter(
      (
        e,
      ): e is {
        skill: string
        totalCount: number
        percentage: number
        lastUsedAt: number | null
      } => e !== null,
    )
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 5)
  if (!summary && topSkills.length === 0) {
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
    totalsRaw?.total_cache_read ?? r.total_cache_read ?? r.cache_read_tokens,
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
    inputTokens + outputTokens > 0 ? inputTokens + outputTokens : fallbackTotal

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
        tokens:
          tokensIn + tokensOut > 0
            ? tokensIn + tokensOut
            : readNumber(e.tokens),
        calls: readNumber(e.api_calls ?? e.calls ?? e.requests),
        cost: readNumber(e.estimated_cost ?? e.cost),
        sessions: readNumber(e.sessions),
      }
    })
    .filter(
      (
        entry,
      ): entry is {
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
      (
        entry,
      ): entry is {
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

  // Cost-coverage trust label. The Hermes Agent confirmed that codex /
  // anthropic-oauth / minimax sessions report cost 0 because they're
  // subscription-included, not because they cost zero dollars. Showing
  // a precise $0.052 with 247M tokens routed through OAuth providers is
  // misleading. We classify sessions by provider into priced vs
  // included buckets and surface a coherent label.
  const SUBSCRIPTION_PROVIDER_PATTERNS = [
    /(^|[\s\-:/])codex(\b|[-/])/i,
    /anthropic[-_]?oauth/i,
    /^claude-(opus|sonnet|haiku)/i, // anthropic OAuth distilled models
    /minimax/i,
    /ollama/i,
    /lmstudio/i,
    /^pc1-/i,
    /^pc2-/i,
  ]
  const isSubscriptionLike = (modelId: string): boolean =>
    SUBSCRIPTION_PROVIDER_PATTERNS.some((rx) => rx.test(modelId))

  let pricedSessions = 0
  let includedSessions = 0
  for (const m of modelsRaw) {
    if (!m || typeof m !== 'object') continue
    const e = m as Record<string, unknown>
    const id = readString(e.model) || readString(e.id)
    if (!id) continue
    const sessions = readNumber(e.sessions)
    if (sessions <= 0) continue
    const cost = readNumber(e.estimated_cost)
    if (cost > 0) {
      pricedSessions += sessions
    } else if (isSubscriptionLike(id)) {
      includedSessions += sessions
    } else {
      pricedSessions += sessions // unknown provider, optimistically count
    }
  }
  let costLabel: DashboardAnalyticsSection['costLabel']
  const totalSessionsLocal = pricedSessions + includedSessions
  if (totalSessionsLocal === 0) {
    costLabel = 'unknown'
  } else if (includedSessions === 0) {
    costLabel = 'precise'
  } else if (pricedSessions === 0) {
    costLabel = 'included'
  } else {
    costLabel = 'partial'
  }

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
    costLabel,
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
 * Strip namespace prefix on a skill id (e.g.
 * `autonomous-ai-agents:hermes-agent` -> `hermes-agent`). Mirrors the
 * Workspace `formatSkillName` helper but lives here so the aggregator
 * can produce already-pretty insight text.
 */
function shortSkillName(raw: string): string {
  if (!raw) return raw
  const segments = raw.split(/[:/]/)
  return segments[segments.length - 1] || raw
}

/**
 * Strip provider prefix from model ids in insight text. Keeps the
 * aggregator output presentation-ready instead of relying on each UI
 * to re-format. Mirrors the front-end formatter for the common cases.
 */
function shortModelName(raw: string): string {
  if (!raw) return raw
  return raw.split('/').slice(-1)[0]
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
  kanban: DashboardKanbanSection | null,
): Array<DashboardInsight> {
  const out: Array<DashboardInsight> = []
  if (!analytics || analytics.source !== 'analytics') return out

  // 1. Peak day driver
  let peakIsToday = false
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
      const driver =
        analytics.topModels.length > 0
          ? `, driven by ${shortModelName(analytics.topModels[0].id)}`
          : ''
      const peakDay = analytics.daily[peakIdx].day
      const todayIso = new Date().toISOString().slice(0, 10)
      peakIsToday = peakDay === todayIso
      out.push({
        tone: 'info',
        text: `Usage peaked ${shortDate(peakDay)} (${formatTokensCompact(peakVal)} tokens)${driver}.`,
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

  // 3. Operational pulse. Drop "no active runs" if we just told the
  // operator usage peaked today — those two sentences contradict at a
  // glance.
  const ops: Array<string> = []
  if (cron && cron.failed > 0) {
    ops.push(`${cron.failed} failed cron job${cron.failed === 1 ? '' : 's'}`)
  }
  if (cron && cron.nextRunAt) {
    const nextMs = Date.parse(cron.nextRunAt)
    if (Number.isFinite(nextMs) && nextMs - Date.now() < -7 * 86_400_000) {
      ops.push(`${cron.total} stale cron job${cron.total === 1 ? '' : 's'}`)
    }
  }
  if (
    !peakIsToday &&
    status &&
    status.gatewayState === 'running' &&
    status.activeAgents === 0
  ) {
    ops.push('no active runs')
  }
  if (status?.restartRequested) ops.push('restart pending')
  if (kanban && kanban.blocked > 0) {
    ops.push(
      `${kanban.blocked} blocked kanban task${kanban.blocked === 1 ? '' : 's'}`,
    )
  }
  if (ops.length > 0) {
    out.push({
      tone: ops.length >= 2 ? 'warn' : 'info',
      text: ops.join(' Â· ') + '.',
    })
  }

  // 4. Skills heat — only if we have at least one item AND the cron/op
  // pulse line wasn't itself a warning (we don't want 3 warning lines
  // when one info line conveys what's worth knowing).
  if (skills && skills.distinctSkills > 0 && skills.topSkills[0]) {
    const top = skills.topSkills[0]
    out.push({
      tone: 'info',
      text: `Top skill: ${shortSkillName(top.skill)} (${top.totalCount} uses, ${top.percentage.toFixed(1)}% of skill activity).`,
    })
  }

  // Cap at 3 callouts (any more clutters the chart card).
  return out.slice(0, 3)
}

function computeIncidents(
  status: DashboardStatusSection | null,
  platforms: Array<DashboardPlatformEntry>,
  cron: DashboardCronSection | null,
  logs: DashboardLogsSection | null,
  kanban: DashboardKanbanSection | null,
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
  // Kanban blockers
  if (kanban && kanban.blocked > 0) {
    out.push({
      id: 'kanban-blocked',
      severity: 'warn',
      source: 'kanban',
      label: `${kanban.blocked} kanban task${kanban.blocked === 1 ? '' : 's'} blocked`,
      detail:
        kanban.topBlocked.map((t) => t.title).join(' Â· ') ||
        'blocked cards need attention',
      href: '/swarm2',
    })
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
      detail: `local v${status.configVersion} Â· latest v${status.latestConfigVersion}`,
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

const TRUST_STATUS_ORDER: Array<TrustLedgerStatus> = [
  'Unwired',
  'Tested',
  'Reliable',
  'Trusted',
  'Autonomous',
]

type TrustLedgerBuildInput = {
  status: DashboardStatusSection | null
  cron: DashboardCronSection | null
  kanban: DashboardKanbanSection | null
  analytics: DashboardAnalyticsSection | null
  skillsUsage: DashboardSkillsUsageSection | null
  sessionsRaw: unknown
  skillsRaw: unknown
  oauthProvidersRaw: unknown
}

function trustRank(status: TrustLedgerStatus): number {
  return TRUST_STATUS_ORDER.indexOf(status)
}

function statusAt(
  value: number,
  thresholds: Partial<Record<TrustLedgerStatus, number>>,
): TrustLedgerStatus {
  let status: TrustLedgerStatus = 'Unwired'
  for (const candidate of TRUST_STATUS_ORDER) {
    const threshold = thresholds[candidate]
    if (threshold !== undefined && value >= threshold) status = candidate
  }
  return status
}

function safeLocal<T>(reader: () => T, fallback: T): T {
  try {
    return reader()
  } catch {
    return fallback
  }
}

function newestIso(values: Array<string | null | undefined>): string | null {
  let newest = 0
  for (const value of values) {
    if (!value) continue
    const ts = Date.parse(value)
    if (Number.isFinite(ts) && ts > newest) newest = ts
  }
  return newest > 0 ? new Date(newest).toISOString() : null
}

function countPayloadItems(raw: unknown, keys: Array<string>): number {
  if (Array.isArray(raw)) return raw.length
  if (!raw || typeof raw !== 'object') return 0
  const record = raw as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (Array.isArray(candidate)) return candidate.length
    if (typeof candidate === 'number' && Number.isFinite(candidate))
      return candidate
  }
  return 0
}

type OauthSignal = {
  name: string
  text: string
  connected: boolean
}

function collectOauthSignals(raw: unknown): Array<OauthSignal> {
  const out: Array<OauthSignal> = []
  const seen = new Set<unknown>()

  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4)
      return
    seen.add(value)

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }

    const record = value as Record<string, unknown>
    const name =
      readString(record.name) ||
      readString(record.id) ||
      readString(record.provider) ||
      readString(record.service) ||
      readString(record.type)
    const text = JSON.stringify(record).toLowerCase()
    const looksRelevant = /google|gmail|calendar|oauth|provider/.test(text)
    const statusText = [
      record.state,
      record.status,
      record.auth_status,
      record.connection_status,
    ]
      .map(readString)
      .join(' ')
      .toLowerCase()
    const explicitlyDown =
      /disconnected|missing|error|failed|revoked|expired/.test(statusText)
    const booleanConnected = [
      record.connected,
      record.configured,
      record.enabled,
      record.authenticated,
      record.authorized,
      record.active,
      record.ready,
    ].some((entry) => entry === true)
    const statusConnected =
      /connected|configured|authorized|authenticated|active|ready|ok/.test(
        statusText,
      )

    if (looksRelevant && (name || statusText)) {
      out.push({
        name: name || 'oauth-provider',
        text,
        connected: !explicitlyDown && (booleanConnected || statusConnected),
      })
    }

    for (const child of Object.values(record)) visit(child, depth + 1)
  }

  visit(raw, 0)
  return out
}

function buildTrustLedger(
  input: TrustLedgerBuildInput,
): DashboardTrustLedgerSection {
  const memoryFiles = safeLocal(() => listMemoryFiles(), [])
  const knowledge = safeLocal(
    () => (knowledgeRootExists() ? buildKnowledgeGraph() : null),
    null,
  )
  const now = new Date().toISOString()
  const sessionCount = Math.max(
    input.analytics?.totalSessions ?? 0,
    countPayloadItems(input.sessionsRaw, [
      'sessions',
      'items',
      'rows',
      'total',
    ]),
  )
  const apiCalls = input.analytics?.totalApiCalls ?? 0
  const installedSkills = Math.max(
    countPayloadItems(input.skillsRaw, [
      'skills',
      'items',
      'installed',
      'total',
    ]),
    input.skillsUsage?.distinctSkills ?? 0,
  )
  const skillActions = input.skillsUsage?.totalActions ?? 0
  const oauthSignals = collectOauthSignals(input.oauthProvidersRaw)
  const googleSignals = oauthSignals.filter((entry) =>
    /google|gmail|calendar/.test(entry.text),
  )
  const gmailConnected = googleSignals.some(
    (entry) => entry.connected && /gmail|mail|google/.test(entry.text),
  )
  const calendarConnected = googleSignals.some(
    (entry) => entry.connected && /calendar|gcal|google/.test(entry.text),
  )
  const connectedGoogleSignals = [gmailConnected, calendarConnected].filter(
    Boolean,
  ).length
  const knowledgeNodes = knowledge?.nodes.length ?? 0
  const knowledgeEdges = knowledge?.edges.length ?? 0
  const latestKnowledge = newestIso(
    knowledge?.nodes.map((node) => node.modified) ?? [],
  )

  const cronTotal = input.cron?.total ?? 0
  const cronFailed = input.cron?.failed ?? 0
  const cronPaused = input.cron?.paused ?? 0
  let cronStatus: TrustLedgerStatus = 'Unwired'
  if (cronTotal > 0) cronStatus = 'Tested'
  if (cronTotal >= 2 && cronFailed === 0) cronStatus = 'Reliable'
  if (cronTotal >= 3 && cronFailed === 0 && input.cron?.nextRunAt)
    cronStatus = 'Trusted'
  if (
    cronTotal >= 3 &&
    cronFailed === 0 &&
    cronPaused === 0 &&
    input.cron?.nextRunAt
  ) {
    cronStatus = 'Autonomous'
  }

  const kanbanTotal = input.kanban?.total ?? 0
  const kanbanDone = input.kanban?.done ?? 0
  const kanbanRunning = input.kanban?.running ?? 0
  const kanbanBlocked = input.kanban?.blocked ?? 0
  let kanbanStatus: TrustLedgerStatus = 'Unwired'
  if (kanbanTotal > 0) kanbanStatus = 'Tested'
  if (kanbanDone + kanbanRunning > 0) kanbanStatus = 'Reliable'
  if (kanbanDone >= 5 && kanbanBlocked === 0) kanbanStatus = 'Trusted'
  if (kanbanDone >= 10 && kanbanRunning > 0 && kanbanBlocked === 0)
    kanbanStatus = 'Autonomous'

  let authStatus: TrustLedgerStatus = 'Unwired'
  if (googleSignals.length > 0) authStatus = 'Tested'
  if (connectedGoogleSignals === 1) authStatus = 'Reliable'
  if (connectedGoogleSignals >= 2) authStatus = 'Trusted'

  const milestones: Array<DashboardTrustLedgerMilestone> = [
    {
      id: 'session-history',
      label: 'Hermes session history',
      status: statusAt(sessionCount, { Tested: 1, Reliable: 10, Trusted: 25 }),
      progress: { current: sessionCount, target: 50, unit: 'sessions' },
      summary: `${sessionCount} session${sessionCount === 1 ? '' : 's'} and ${apiCalls} API call${apiCalls === 1 ? '' : 's'} in the analytics window.`,
      evidence: [
        `Analytics window: ${input.analytics?.windowDays ?? 30} days`,
        `${apiCalls} API calls observed`,
      ],
      weakArea:
        sessionCount >= 10
          ? null
          : 'Needs more completed live sessions before Nova can be called reliable here.',
      sourceLinks: [
        { label: 'Sessions', href: '/chat' },
        { label: 'Analytics', href: '/dashboard' },
      ],
      updatedAt: input.status?.updatedAt ?? now,
    },
    {
      id: 'memory-recall',
      label: 'Hermes memory recall',
      status: statusAt(memoryFiles.length, {
        Tested: 1,
        Reliable: 5,
        Trusted: 20,
      }),
      progress: { current: memoryFiles.length, target: 20, unit: 'files' },
      summary: `${memoryFiles.length} browsable Hermes memory file${memoryFiles.length === 1 ? '' : 's'} available to Mission Control.`,
      evidence: memoryFiles.slice(0, 3).map((file) => file.path),
      weakArea:
        memoryFiles.length >= 5
          ? null
          : 'Memory browser has too little source material to prove stable recall.',
      sourceLinks: [{ label: 'Memory', href: '/memory' }],
      updatedAt: newestIso(memoryFiles.map((file) => file.modified)) ?? now,
    },
    {
      id: 'skills',
      label: 'Skills execution',
      status: statusAt(Math.max(skillActions, installedSkills), {
        Tested: 1,
        Reliable: 10,
        Trusted: 50,
      }),
      progress: {
        current: Math.max(skillActions, installedSkills),
        target: 50,
        unit: 'skill signals',
      },
      summary: `${installedSkills} skill${installedSkills === 1 ? '' : 's'} installed or observed; ${skillActions} skill action${skillActions === 1 ? '' : 's'} used in-window.`,
      evidence:
        input.skillsUsage?.topSkills
          .slice(0, 3)
          .map(
            (skill) => `${shortSkillName(skill.skill)}: ${skill.totalCount}`,
          ) ?? [],
      weakArea:
        skillActions >= 10
          ? null
          : 'Skills exist, but recent usage is still light.',
      sourceLinks: [{ label: 'Skills', href: '/skills' }],
      updatedAt: now,
    },
    {
      id: 'scheduled-wakeups',
      label: 'Cron and wakeups',
      status: cronStatus,
      progress: { current: cronTotal, target: 3, unit: 'jobs' },
      summary: `${cronTotal} scheduled job${cronTotal === 1 ? '' : 's'}; ${cronFailed} failed and ${cronPaused} paused.`,
      evidence: [
        input.cron?.nextRunAt
          ? `Next run: ${input.cron.nextRunAt}`
          : 'No next run reported',
        ...(input.cron?.recentFailures ?? [])
          .slice(0, 2)
          .map((job) => `${job.name}: ${job.lastError || 'failed'}`),
      ],
      weakArea:
        cronFailed > 0 || cronPaused > 0
          ? 'Cron has paused or failed jobs that need review.'
          : null,
      sourceLinks: [{ label: 'Jobs', href: '/jobs' }],
      updatedAt: input.cron?.nextRunAt ?? now,
    },
    {
      id: 'job-board-events',
      label: 'Job board events',
      status: kanbanStatus,
      progress: { current: kanbanDone, target: 10, unit: 'done jobs' },
      summary: `${kanbanTotal} board item${kanbanTotal === 1 ? '' : 's'}; ${kanbanRunning} running, ${kanbanDone} done, ${kanbanBlocked} blocked.`,
      evidence:
        input.kanban?.topBlocked.slice(0, 3).map((task) => task.title) ?? [],
      weakArea:
        kanbanBlocked > 0
          ? 'Blocked work remains on the board.'
          : kanbanTotal > 0
            ? null
            : 'No job-board events were returned.',
      sourceLinks: [
        { label: 'Jobs', href: '/jobs' },
        { label: 'Board', href: '/swarm2' },
      ],
      updatedAt: now,
    },
    {
      id: 'gmail-calendar-auth',
      label: 'Gmail and Calendar auth',
      status: authStatus,
      progress: {
        current: connectedGoogleSignals,
        target: 2,
        unit: 'auth lanes',
      },
      summary: `${connectedGoogleSignals}/2 Google work lanes show connected signals.`,
      evidence: googleSignals
        .slice(0, 4)
        .map(
          (entry) => `${entry.name}: ${entry.connected ? 'connected' : 'seen'}`,
        ),
      weakArea:
        connectedGoogleSignals >= 2
          ? null
          : 'Gmail and Calendar are not both proven connected from the OAuth provider endpoint.',
      sourceLinks: [
        { label: 'Settings', href: '/settings' },
        { label: 'MCP', href: '/mcp' },
      ],
      updatedAt: now,
    },
    {
      id: 'obsidian-notes',
      label: 'Obsidian vault graph',
      status: statusAt(Math.min(knowledgeNodes, knowledgeEdges * 2), {
        Tested: 1,
        Reliable: 25,
        Trusted: 100,
      }),
      progress: { current: knowledgeNodes, target: 250, unit: 'notes' },
      summary: `${knowledgeNodes} note${knowledgeNodes === 1 ? '' : 's'} and ${knowledgeEdges} wikilink edge${knowledgeEdges === 1 ? '' : 's'} parsed from the configured knowledge root.`,
      evidence: knowledge?.nodes.slice(0, 3).map((node) => node.path) ?? [],
      weakArea:
        knowledgeEdges >= 10
          ? null
          : 'The vault graph has too few links to prove durable relationship recall.',
      sourceLinks: [
        { label: 'Memory', href: '/memory' },
        { label: 'Galaxy', href: '/dashboard' },
      ],
      updatedAt: latestKnowledge ?? now,
    },
  ]

  const counters = {
    milestones: milestones.length,
    reliableOrBetter: milestones.filter(
      (m) => trustRank(m.status) >= trustRank('Reliable'),
    ).length,
    trustedOrBetter: milestones.filter(
      (m) => trustRank(m.status) >= trustRank('Trusted'),
    ).length,
    autonomous: milestones.filter((m) => m.status === 'Autonomous').length,
  }
  const highestStatus = milestones.reduce<TrustLedgerStatus>(
    (best, item) =>
      trustRank(item.status) > trustRank(best) ? item.status : best,
    'Unwired',
  )
  const score = Math.round(
    (milestones.reduce((sum, item) => sum + trustRank(item.status), 0) /
      (milestones.length * (TRUST_STATUS_ORDER.length - 1))) *
      100,
  )

  return {
    score,
    highestStatus,
    milestones,
    recentUnlocks: [...milestones]
      .filter((m) => trustRank(m.status) >= trustRank('Reliable'))
      .sort((a, b) => {
        const timeDelta =
          Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
        if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta
        return trustRank(b.status) - trustRank(a.status)
      })
      .slice(0, 3),
    weakAreas: milestones
      .filter((m) => m.weakArea || trustRank(m.status) < trustRank('Reliable'))
      .sort((a, b) => trustRank(a.status) - trustRank(b.status))
      .slice(0, 4),
    counters,
  }
}

export type TaylorKanbanSummary = {
  items: number
  open: number
  stale: number
  blockers: number
  topTitles: Array<string>
}

export function summarizeTaylorKanban(
  raw: unknown,
  now: string,
): TaylorKanbanSummary | null {
  if (!Array.isArray(raw)) return null
  const nowMs = Date.parse(now)
  const summary: TaylorKanbanSummary = {
    items: raw.length,
    open: 0,
    stale: 0,
    blockers: 0,
    topTitles: [],
  }
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const item = entry as Record<string, unknown>
    const title =
      (typeof item.title === 'string' && item.title) ||
      (typeof item.name === 'string' && item.name) ||
      (typeof item.text === 'string' && item.text) ||
      ''
    const status = String(item.status ?? item.state ?? '').toLowerCase()
    const done = /done|complete|closed|finished/.test(status)
    const blocked = /block|stuck|wait|hold/.test(status)
    if (!done) summary.open += 1
    if (blocked) summary.blockers += 1
    const updatedRaw =
      item.updatedAt ?? item.updated ?? item.modified ?? item.timestamp
    const updatedMs =
      typeof updatedRaw === 'string' || typeof updatedRaw === 'number'
        ? Date.parse(String(updatedRaw))
        : Number.NaN
    if (
      !done &&
      Number.isFinite(updatedMs) &&
      nowMs - updatedMs > 7 * 24 * 60 * 60 * 1000
    ) {
      summary.stale += 1
    }
    if (!done && title && summary.topTitles.length < 5) {
      summary.topTitles.push(title.slice(0, 60))
    }
  }
  return summary
}

export type JobBoardReadModel = {
  online: boolean
  version: string | null
  stateKeys: number
  events: number
  taylorKanbanItems: number
  taylorKanban: TaylorKanbanSummary | null
}

export async function readJobBoardModel(): Promise<JobBoardReadModel> {
  const base = (
    process.env.NOVA_JOBBOARD_URL ||
    process.env.NEON_MOON_JOBBOARD_URL ||
    'http://127.0.0.1:8765'
  ).replace(/\/+$/, '')

  const [ping, versionRaw, stateRaw, eventsRaw] = await Promise.all([
    safeUrlJson<unknown>(`${base}/ping`),
    safeUrlJson<unknown>(`${base}/version`),
    safeUrlJson<unknown>(`${base}/state`, 4000),
    safeUrlJson<unknown>(`${base}/events`),
  ])

  const state =
    stateRaw && typeof stateRaw === 'object' && !Array.isArray(stateRaw)
      ? (stateRaw as Record<string, unknown>)
      : null
  const version =
    versionRaw && typeof versionRaw === 'object'
      ? (readOptionalString((versionRaw as Record<string, unknown>).id) ??
        String((versionRaw as Record<string, unknown>).id ?? ''))
      : null
  let taylorKanbanItems = 0
  let taylorKanban: TaylorKanbanSummary | null = null
  const taylorRaw = state?.['nm-taylor-kanban']
  if (typeof taylorRaw === 'string') {
    try {
      const parsed = JSON.parse(taylorRaw) as unknown
      if (Array.isArray(parsed)) {
        taylorKanbanItems = parsed.length
        taylorKanban = summarizeTaylorKanban(parsed, new Date().toISOString())
      }
    } catch {
      taylorKanbanItems = 0
    }
  }

  return {
    online:
      Boolean(ping) ||
      Boolean(versionRaw) ||
      Boolean(stateRaw) ||
      Boolean(eventsRaw),
    version: version && version.length > 0 ? version : null,
    stateKeys: state ? Object.keys(state).length : 0,
    taylorKanban,
    events: Array.isArray(eventsRaw) ? eventsRaw.length : 0,
    taylorKanbanItems,
  }
}

function assignmentStatus(assignment: SwarmMissionAssignment): AgentWorkerStatus {
  if (assignment.state === 'blocked' || assignment.state === 'needs_input') return 'blocked'
  if (assignment.state === 'reviewing') return 'reviewing'
  if (assignment.state === 'checkpointed' && assignment.reviewRequired) return 'reviewing'
  if (assignment.state === 'dispatched' || assignment.state === 'checkpointed') return 'running'
  if (assignment.state === 'queued') return 'queued'
  if (assignment.state === 'done') return 'done'
  return 'done'
}

function workerStatusRank(status: AgentWorkerStatus): number {
  return {
    blocked: 6,
    reviewing: 5,
    running: 4,
    queued: 3,
    done: 2,
    idle: 1,
  }[status]
}

function assignmentLastSeen(mission: SwarmMission, assignment: SwarmMissionAssignment): number {
  return assignment.reviewedAt ?? assignment.completedAt ?? assignment.dispatchedAt ?? mission.updatedAt
}

function isoFromMs(value: number | null): string | null {
  if (!value || !Number.isFinite(value)) return null
  return new Date(value).toISOString()
}

export function buildAgentWorkforceSection(
  missions: Array<SwarmMission>,
): DashboardAgentWorkforceSection {
  const generatedAt = new Date().toISOString()
  const workerMap = new Map<string, DashboardAgentWorker>()

  for (const mission of missions) {
    for (const assignment of mission.assignments) {
      const status = assignmentStatus(assignment)
      const seenAt = assignmentLastSeen(mission, assignment)
      const existing = workerMap.get(assignment.workerId) ?? {
        workerId: assignment.workerId,
        status: 'idle' as AgentWorkerStatus,
        activeAssignments: 0,
        completedAssignments: 0,
        blockedAssignments: 0,
        reviewAssignments: 0,
        currentTask: null,
        missionId: null,
        lastSeenAt: null,
      }

      if (status !== 'done' && status !== 'idle') existing.activeAssignments += 1
      if (status === 'done') existing.completedAssignments += 1
      if (status === 'blocked') existing.blockedAssignments += 1
      if (status === 'reviewing') existing.reviewAssignments += 1
      if (workerStatusRank(status) > workerStatusRank(existing.status)) {
        existing.status = status
        existing.currentTask = assignment.task
        existing.missionId = mission.id
      }
      const currentLastSeen = existing.lastSeenAt ? Date.parse(existing.lastSeenAt) : 0
      if (seenAt > currentLastSeen) existing.lastSeenAt = isoFromMs(seenAt)
      workerMap.set(assignment.workerId, existing)
    }
  }

  const workers = Array.from(workerMap.values()).sort((a, b) => {
    const statusDelta = workerStatusRank(b.status) - workerStatusRank(a.status)
    if (statusDelta !== 0) return statusDelta
    return Date.parse(b.lastSeenAt ?? '') - Date.parse(a.lastSeenAt ?? '')
  })
  const recentMissions = missions.slice(0, 5).map((mission) => ({
    id: mission.id,
    title: mission.title,
    state: mission.state,
    updatedAt: new Date(mission.updatedAt).toISOString(),
    assignments: mission.assignments.length,
    blocked: mission.assignments.filter((item) => assignmentStatus(item) === 'blocked').length,
    reviewing: mission.assignments.filter((item) => assignmentStatus(item) === 'reviewing').length,
  }))

  return {
    generatedAt,
    summary: {
      missions: missions.length,
      workers: workers.length,
      active: workers.filter((item) => ['queued', 'running', 'blocked', 'reviewing'].includes(item.status)).length,
      blocked: workers.filter((item) => item.status === 'blocked').length,
      reviewing: workers.filter((item) => item.status === 'reviewing').length,
      done: workers.filter((item) => item.status === 'done').length,
    },
    workers,
    recentMissions,
  }
}

type GitWorkInput = {
  statusPorcelain: string | null
  remotes: string | null
  latestCommit: string | null
  upstream: string | null
  prUrl?: string | null
  warning?: string | null
}

function parseBranchLine(line: string | undefined): {
  branch: string | null
  ahead: number
  behind: number
} {
  if (!line?.startsWith('## ')) return { branch: null, ahead: 0, behind: 0 }
  const body = line.slice(3).trim()
  const [branchPart, metaPart = ''] = body.split('...')
  const branch = branchPart.trim() || null
  const ahead = Number(/ahead (\d+)/.exec(metaPart)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(metaPart)?.[1] ?? 0)
  return { branch, ahead, behind }
}

function parseGitRemotes(raw: string | null): Array<DashboardGitRemote> {
  if (!raw) return []
  const remotes = new Map<string, DashboardGitRemote>()
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim())
    if (!match) continue
    const [, name, url, direction] = match
    const remote = remotes.get(name) ?? { name, fetchUrl: null, pushUrl: null }
    if (direction === 'fetch') remote.fetchUrl = url
    if (direction === 'push') remote.pushUrl = url
    remotes.set(name, remote)
  }
  return Array.from(remotes.values())
}

export function buildGitWorkSection(input: GitWorkInput): DashboardGitWorkSection {
  const lines = input.statusPorcelain?.split(/\r?\n/).filter(Boolean) ?? []
  const branchInfo = parseBranchLine(lines[0])
  const changedFiles = lines.filter((line) => !line.startsWith('## ')).length
  const latestParts = input.latestCommit?.split('\t') ?? []
  const latestCommit = latestParts[0]
    ? { hash: latestParts[0], subject: latestParts.slice(1).join('\t') || 'No subject' }
    : null

  return {
    branch: branchInfo.branch,
    clean: changedFiles === 0,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    changedFiles,
    upstream: input.upstream?.trim() || null,
    latestCommit,
    remotes: parseGitRemotes(input.remotes),
    prUrl: input.prUrl?.trim() || null,
    warning: input.warning?.trim() || null,
  }
}

function readGitOutput(args: Array<string>): string | null {
  return safeLocal(
    () => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf-8' }).trim(),
    null,
  )
}

function readGitWorkSection(): DashboardGitWorkSection {
  const statusPorcelain = readGitOutput(['status', '--porcelain=v1', '-b'])
  const remotes = readGitOutput(['remote', '-v'])
  const latestCommit = readGitOutput(['log', '-1', '--pretty=%h%x09%s'])
  const branch = parseBranchLine(statusPorcelain?.split(/\r?\n/)[0]).branch
  const upstream = branch
    ? readGitOutput(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])
    : null
  return buildGitWorkSection({
    statusPorcelain,
    remotes,
    latestCommit,
    upstream,
    prUrl: process.env.NOVA_GITHUB_PR_URL ?? null,
    warning: statusPorcelain ? null : 'Git status unavailable for this workspace.',
  })
}

export function buildRouteCostAnomalies(
  analytics: DashboardAnalyticsSection | null,
  expectedModels?: Array<string>,
): Array<string> {
  if (!analytics) return []
  const expected = (
    expectedModels ??
    (process.env.NOVA_EXPECTED_MODELS ?? 'gpt-5.5,kimi-k2.6,gpt-oss-120b')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  ).map((entry) => entry.toLowerCase())
  const anomalies: Array<string> = []
  for (const model of analytics.topModels) {
    const id = model.id.toLowerCase()
    const isExpected = expected.some((candidate) => id.includes(candidate))
    if (!isExpected && model.cost > 0.05) {
      anomalies.push(
        `Route leak: $${model.cost.toFixed(2)} on unexpected model ${model.id}`,
      )
    }
  }
  return anomalies
}

export type LiveSystemsApprovalsProbe = {
  pending: number
  actionable: number
  degraded: boolean
}

export type LiveSystemsVaultProbe = {
  reachable: boolean
  nodeCount: number
  memoryFiles: number
  newestModified: string | null
}

export type LiveSystemsBuildInput = {
  status: DashboardStatusSection | null
  platforms: Array<DashboardPlatformEntry>
  cron: DashboardCronSection | null
  kanban: DashboardKanbanSection | null
  modelInfo: DashboardModelInfoSection | null
  analytics: DashboardAnalyticsSection | null
  skillsRaw: unknown
  oauthProvidersRaw: unknown
  jobBoard: JobBoardReadModel
  gitWork?: DashboardGitWorkSection | null
  approvals?: LiveSystemsApprovalsProbe | null
  /** Injectable for tests; when absent the local vault is probed directly. */
  vaultProbe?: LiveSystemsVaultProbe | null
}

function liveSystem(
  id: string,
  label: string,
  status: LiveSystemStatus,
  detail: string,
  sourceLabel: string,
  href: string | null = null,
  lastSeenAt: string | null = null,
): DashboardLiveSystem {
  return { id, label, status, detail, href, lastSeenAt, source: sourceLabel }
}

function platformLooksOnline(entry: DashboardPlatformEntry): boolean {
  return /connected|running|ready|ok|active/i.test(entry.state)
}

function platformLooksBad(entry: DashboardPlatformEntry): boolean {
  return /error|failed|missing|disconnected|offline|revoked/i.test(entry.state)
}

function probeLocalVault(): LiveSystemsVaultProbe {
  const memoryFiles = safeLocal(() => listMemoryFiles(), [])
  const reachable = safeLocal(() => knowledgeRootExists(), false)
  const knowledge = safeLocal(() => (reachable ? buildKnowledgeGraph() : null), null)
  return {
    reachable,
    nodeCount: knowledge?.nodes.length ?? 0,
    memoryFiles: memoryFiles.length,
    newestModified: newestIso([
      ...(knowledge?.nodes.map((node) => node.modified) ?? []),
      ...memoryFiles.map((file) => file.modified),
    ]),
  }
}

export function buildLiveSystems(input: LiveSystemsBuildInput): DashboardLiveSystemsSection {
  const generatedAt = new Date().toISOString()
  const oauthSignals = collectOauthSignals(input.oauthProvidersRaw)
  const googleSignals = oauthSignals.filter((entry) => /google|gmail|calendar/.test(entry.text))
  const gmailConnected = googleSignals.some((entry) => entry.connected && /gmail|mail|google/.test(entry.text))
  const calendarConnected = googleSignals.some((entry) => entry.connected && /calendar|gcal|google/.test(entry.text))
  const skillsCount = countPayloadItems(input.skillsRaw, ['skills', 'items', 'installed', 'total'])
  const vault = input.vaultProbe ?? probeLocalVault()
  const approvals = input.approvals ?? null
  const platformErrors = input.platforms.filter((entry) => platformLooksBad(entry))
  const platformOnline = input.platforms.filter((entry) => platformLooksOnline(entry)).length

  const systems: Array<DashboardLiveSystem> = [
    liveSystem(
      'hermes-gateway',
      'Hermes gateway',
      input.status ? (platformErrors.length > 0 ? 'degraded' : 'operational') : 'offline',
      input.status
        ? `${input.status.gatewayState || 'unknown'}; ${input.status.activeAgents} active agent${input.status.activeAgents === 1 ? '' : 's'}; ${platformOnline} platform${platformOnline === 1 ? '' : 's'} up`
        : 'Gateway status endpoint unavailable',
      '/api/gateway-status + /api/status',
      '/settings',
      input.status?.lastHeartbeatAt ?? input.status?.updatedAt ?? null,
    ),
    liveSystem(
      'model-route',
      'Model route',
      input.modelInfo
        ? input.modelInfo.provider && input.modelInfo.model
          ? 'operational'
          : 'connected'
        : 'not-wired',
      input.modelInfo
        ? `${input.modelInfo.provider || 'unknown'} / ${input.modelInfo.model || 'unknown model'}`
        : 'Model info endpoint unavailable',
      '/api/model/info',
      '/settings',
      generatedAt,
    ),
    liveSystem(
      'tools-skills',
      'Skills/tools',
      skillsCount > 0
        ? 'operational'
        : input.skillsRaw !== null && input.skillsRaw !== undefined
          ? 'reachable'
          : 'not-wired',
      skillsCount > 0
        ? `${skillsCount} installed skill${skillsCount === 1 ? '' : 's'} returned`
        : input.skillsRaw !== null && input.skillsRaw !== undefined
          ? 'Skills endpoint answered but returned no installed skills'
          : 'Skills endpoint unavailable',
      '/api/skills',
      '/skills',
      generatedAt,
    ),
    liveSystem(
      'cron-background',
      'Cron/background',
      input.cron
        ? input.cron.failed > 0
          ? 'degraded'
          : input.cron.total > 0
            ? 'operational'
            : 'connected'
        : 'not-wired',
      input.cron
        ? `${input.cron.total} job${input.cron.total === 1 ? '' : 's'}; ${input.cron.failed} failed; ${input.cron.paused} paused`
        : 'Cron endpoint unavailable',
      '/api/cron/jobs',
      '/jobs',
      input.cron?.nextRunAt ?? generatedAt,
    ),
    liveSystem(
      'google-workspace',
      'Google Workspace',
      gmailConnected && calendarConnected
        ? 'approval-gated'
        : googleSignals.length > 0
          ? 'reachable'
          : 'not-wired',
      gmailConnected && calendarConnected
        ? 'Gmail + Calendar connected; reads only — sends/schedules wait on Taylor approval'
        : googleSignals.length > 0
          ? `${gmailConnected ? 'Gmail' : 'Gmail not proven'}; ${calendarConnected ? 'Calendar' : 'Calendar not proven'}`
          : 'No Google/Gmail/Calendar OAuth signal returned',
      '/api/providers/oauth',
      '/settings',
      generatedAt,
    ),
    liveSystem(
      'obsidian-vault',
      'Obsidian vault',
      vault.reachable ? (vault.nodeCount > 0 ? 'operational' : 'reachable') : 'not-wired',
      vault.reachable
        ? `${vault.nodeCount} graph node${vault.nodeCount === 1 ? '' : 's'}; ${vault.memoryFiles} memory file${vault.memoryFiles === 1 ? '' : 's'}`
        : 'Knowledge root/vault not reachable',
      '/api/knowledge/graph + /api/knowledge/insights',
      '/memory',
      vault.newestModified,
    ),
    liveSystem(
      'neon-moon-job-board',
      'Neon Moon job board',
      input.jobBoard.online
        ? input.jobBoard.taylorKanban
          ? 'operational'
          : 'reachable'
        : 'not-wired',
      input.jobBoard.online
        ? input.jobBoard.taylorKanban
          ? `v${input.jobBoard.version ?? 'unknown'}; ${input.jobBoard.taylorKanbanItems} Taylor kanban item${input.jobBoard.taylorKanbanItems === 1 ? '' : 's'}`
          : `ping OK (v${input.jobBoard.version ?? 'unknown'}); kanban state not parsed`
        : 'Job board HTTP endpoints unavailable',
      'job board /ping + /state (HTTP only)',
      '/swarm2',
      generatedAt,
    ),
    liveSystem(
      'kanban-board',
      'Kanban board',
      input.kanban
        ? input.kanban.blocked > 0
          ? 'degraded'
          : 'operational'
        : 'not-wired',
      input.kanban
        ? `${input.kanban.total} card${input.kanban.total === 1 ? '' : 's'}; ${input.kanban.blocked} blocked`
        : 'Kanban plugin endpoint unavailable',
      '/api/plugins/kanban/board',
      '/swarm2',
      generatedAt,
    ),
    liveSystem(
      'cost-route-watch',
      'Cost/route watch',
      input.analytics
        ? buildRouteCostAnomalies(input.analytics).length > 0
          ? 'degraded'
          : 'operational'
        : 'not-wired',
      input.analytics
        ? (buildRouteCostAnomalies(input.analytics)[0] ??
          `${input.analytics.totalTokens} tokens; ${
            input.analytics.estimatedCostUsd === null
              ? input.analytics.costLabel
              : `$${input.analytics.estimatedCostUsd.toFixed(2)}`
          } cost signal in ${input.analytics.windowDays}d`)
        : 'Analytics usage endpoint unavailable',
      '/api/analytics/usage + /api/provider-usage',
      '/dashboard',
      generatedAt,
    ),
    liveSystem(
      'github-agent-work',
      'GitHub/agent work',
      input.gitWork ? 'operational' : 'not-wired',
      input.gitWork
        ? `${input.gitWork.branch ?? 'unknown branch'} @ ${input.gitWork.latestCommit?.hash ?? '?'} · ${
            input.gitWork.clean
              ? 'clean'
              : `${input.gitWork.changedFiles} changed`
          } · PR ${input.gitWork.prUrl ? 'linked' : 'not set'} · receipts via /api/nova-work-scan`
        : 'Local git unreadable; work receipts unavailable',
      'local git + /api/nova-work-scan',
      null,
      input.gitWork ? generatedAt : null,
    ),
    liveSystem(
      'taylor-approvals',
      'Taylor approvals',
      approvals
        ? approvals.degraded
          ? 'degraded'
          : approvals.pending > 0
            ? 'approval-gated'
            : 'operational'
        : 'not-wired',
      approvals
        ? approvals.degraded
          ? 'Approval queue degraded — fabric store unreadable'
          : approvals.pending > 0
            ? `${approvals.pending} item${approvals.pending === 1 ? '' : 's'} waiting on Taylor (${approvals.actionable} actionable here)`
            : 'Queue clear — nothing waiting on Taylor'
        : 'Approval queue unavailable',
      '/api/taylor-approvals',
      '/dashboard',
      generatedAt,
    ),
  ]

  const summary = {
    total: systems.length,
    operational: systems.filter((item) => item.status === 'operational').length,
    connected: systems.filter((item) => item.status === 'connected').length,
    reachable: systems.filter((item) => item.status === 'reachable').length,
    approvalGated: systems.filter((item) => item.status === 'approval-gated').length,
    degraded: systems.filter((item) => item.status === 'degraded').length,
    offline: systems.filter((item) => item.status === 'offline').length,
    notWired: systems.filter((item) => item.status === 'not-wired').length,
  }

  // approval-gated means "needs Taylor", not "broken" — it is surfaced by the
  // approval queue panel, so only real outages become blockers here.
  const blockers = systems
    .filter((item) => item.status === 'offline' || item.status === 'degraded' || item.status === 'not-wired')
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.detail}`)

  return { generatedAt, summary, blockers, systems }
}

type ControlLoopBuildInput = {
  status: DashboardStatusSection | null
  cron: DashboardCronSection | null
  kanban: DashboardKanbanSection | null
  analytics: DashboardAnalyticsSection | null
  skillsRaw: unknown
  oauthProvidersRaw: unknown
  jobBoard: JobBoardReadModel
}

function skillInstalled(raw: unknown, id: string): boolean {
  const text = JSON.stringify(raw ?? {}).toLowerCase()
  return text.includes(id.toLowerCase())
}

function source(
  label: string,
  ok: boolean,
  detailWhenOk: string,
  detailWhenMissing: string,
  availableOnly = false,
): DashboardControlLoopSource {
  return {
    label,
    status: ok ? (availableOnly ? 'available' : 'connected') : 'not-wired',
    detail: ok ? detailWhenOk : detailWhenMissing,
  }
}

function loopStatus(
  sources: Array<DashboardControlLoopSource>,
  skillReady: boolean,
): ControlLoopStatus {
  const liveSources = sources.filter(
    (item) => item.status === 'connected' || item.status === 'available',
  ).length
  if (skillReady && liveSources >= Math.max(2, sources.length - 1))
    return 'ready'
  if (skillReady || liveSources > 0) return 'partial'
  return 'not-wired'
}

function nextForCron(
  cron: DashboardCronSection | null,
  hint: string,
): string | null {
  if (!cron?.nextRunAt || !hint) return null
  return null
}

function buildControlLoops(
  input: ControlLoopBuildInput,
): DashboardControlLoopsSection {
  const now = new Date().toISOString()
  const oauthSignals = collectOauthSignals(input.oauthProvidersRaw)
  const gmailConnected = oauthSignals.some(
    (entry) => entry.connected && /gmail|mail|google/.test(entry.text),
  )
  const calendarConnected = oauthSignals.some(
    (entry) => entry.connected && /calendar|gcal|google/.test(entry.text),
  )
  const hermesOnline = Boolean(input.status?.gatewayState)
  const cronOnline = (input.cron?.total ?? 0) > 0
  const analyticsOnline = input.analytics !== null
  const jobBoardOnline = input.jobBoard.online
  const taylorKanbanOnline = input.jobBoard.taylorKanbanItems > 0
  const skillsEndpointOnline =
    input.skillsRaw !== null &&
    input.skillsRaw !== undefined &&
    JSON.stringify(input.skillsRaw).length > 2
  const vaultOnline = knowledgeRootExists()

  const makeLoop = (
    loop: Omit<DashboardControlLoop, 'status' | 'readiness'>,
  ): DashboardControlLoop => {
    const installed = skillInstalled(input.skillsRaw, loop.id)
    const status = loopStatus(loop.connectedSystems, installed)
    const readyCount = loop.connectedSystems.filter(
      (item) => item.status === 'connected' || item.status === 'available',
    ).length
    return {
      ...loop,
      status,
      readiness: installed
        ? `${readyCount}/${loop.connectedSystems.length} systems live; skill detected`
        : `${readyCount}/${loop.connectedSystems.length} systems live; skill not detected`,
    }
  }

  const commonGuardrails = [
    'Dry-run only from Mission Control.',
    'No emails/messages are sent.',
    'No money, spend, login, credential, or destructive action.',
    'Customer/vendor-facing actions require Taylor approval.',
  ]

  const loops: Array<DashboardControlLoop> = [
    makeLoop({
      id: 'morning-command-center',
      label: 'Morning Command Center',
      purpose:
        'Pull the morning operating picture and return first-fire plus a 3-item plan.',
      connectedSystems: [
        source(
          'Gmail',
          gmailConnected,
          'OAuth provider signal seen',
          'Google/Gmail auth not proven',
        ),
        source(
          'Calendar',
          calendarConnected,
          'Calendar auth signal seen',
          'Calendar auth not proven',
        ),
        source(
          'Neon Moon board',
          jobBoardOnline,
          `Board v${input.jobBoard.version ?? 'unknown'} online`,
          'Board HTTP endpoints unavailable',
        ),
        source(
          'Taylor kanban',
          taylorKanbanOnline,
          `${input.jobBoard.taylorKanbanItems} items`,
          'nm-taylor-kanban not found in board state',
        ),
        source(
          'Cost route',
          analyticsOnline,
          `${input.analytics?.totalTokens ?? 0} tokens in window`,
          'Hermes analytics unavailable',
        ),
      ],
      lastUsedAt: null,
      nextScheduledAt: nextForCron(input.cron, 'morning'),
      dryRunPrompt:
        'Dry-run Morning Command Center: read Gmail, Calendar, Neon Moon board, Taylor kanban, and route/cost status; produce first-fire plus exactly 3 morning priorities. Draft only. No sends or writes.',
      guardrails: commonGuardrails,
      sourceLinks: [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Jobs', href: '/jobs' },
      ],
    }),
    makeLoop({
      id: 'email-to-taylor-kanban',
      label: 'Email to Taylor Kanban',
      purpose:
        'Triage Gmail action items into Taylor personal kanban and draft replies only.',
      connectedSystems: [
        source(
          'Gmail',
          gmailConnected,
          'OAuth provider signal seen',
          'Google/Gmail auth not proven',
        ),
        source(
          'Taylor kanban',
          taylorKanbanOnline,
          `${input.jobBoard.taylorKanbanItems} items`,
          'nm-taylor-kanban not found in board state',
        ),
        source(
          'Hermes skills',
          skillsEndpointOnline,
          'Installed skills endpoint answered',
          'Skills endpoint unavailable',
          true,
        ),
      ],
      lastUsedAt: null,
      nextScheduledAt: null,
      dryRunPrompt:
        'Dry-run Email to Taylor Kanban: scan Gmail for actionable items, propose kanban cards for nm-taylor-kanban, and draft replies only. Do not send, archive, label, or write without approval.',
      guardrails: commonGuardrails,
      sourceLinks: [
        { label: 'Taylor kanban', href: 'http://127.0.0.1:8765' },
        { label: 'Settings', href: '/settings' },
      ],
    }),
    makeLoop({
      id: 'jobboard-caretaker',
      label: 'Jobboard Caretaker',
      purpose:
        'Check Neon Moon board health, version, events, and Taylor kanban through HTTP only.',
      connectedSystems: [
        source(
          'Board /ping',
          jobBoardOnline,
          'HTTP board answered',
          'Board /ping unavailable',
        ),
        source(
          'Board /version',
          Boolean(input.jobBoard.version),
          `Version ${input.jobBoard.version}`,
          'Board /version unavailable',
        ),
        source(
          'Board /state',
          input.jobBoard.stateKeys > 0,
          `${input.jobBoard.stateKeys} keys`,
          'Board /state unavailable',
        ),
        source(
          'Board /events',
          input.jobBoard.events > 0,
          `${input.jobBoard.events} events`,
          'Board /events unavailable',
        ),
        source(
          'Taylor kanban',
          taylorKanbanOnline,
          `${input.jobBoard.taylorKanbanItems} items`,
          'nm-taylor-kanban not found',
        ),
      ],
      lastUsedAt: null,
      nextScheduledAt: nextForCron(input.cron, 'jobboard'),
      dryRunPrompt:
        'Dry-run Jobboard Caretaker: check /ping, /version, /state, /events, and Taylor kanban. Summarize health/version/events. Do not edit state.json. Do not call /set, /event, or /sync-now.',
      guardrails: [
        ...commonGuardrails,
        'HTTP endpoints only; never edit state.json.',
      ],
      sourceLinks: [{ label: 'Job board', href: 'http://127.0.0.1:8765' }],
    }),
    makeLoop({
      id: 'design-intake-triage',
      label: 'Design Intake Triage',
      purpose:
        'Classify invoices, quote emails, art requests, digitizing, mockups, tracing, and order-entry prep.',
      connectedSystems: [
        source(
          'Gmail',
          gmailConnected,
          'OAuth provider signal seen',
          'Google/Gmail auth not proven',
        ),
        source(
          'Obsidian vault',
          vaultOnline,
          'Unified vault exists',
          'Vault path unavailable',
        ),
        source(
          'Taylor kanban',
          taylorKanbanOnline,
          `${input.jobBoard.taylorKanbanItems} items`,
          'Taylor kanban unavailable',
        ),
      ],
      lastUsedAt: null,
      nextScheduledAt: null,
      dryRunPrompt:
        'Dry-run Design Intake Triage: classify recent invoices, quotes, art requests, vector tracing, digitizing, mockups, and order-entry prep. Route next action to Taylor/staff/vendor as recommendations only.',
      guardrails: commonGuardrails,
      sourceLinks: [
        { label: 'Memory', href: '/memory' },
        { label: 'Taylor kanban', href: 'http://127.0.0.1:8765' },
      ],
    }),
    makeLoop({
      id: 'cost-route-watch',
      label: 'Cost Route Watch',
      purpose:
        'Watch Hermes/session DB/provider route usage, estimates, billing mode, and route leaks.',
      connectedSystems: [
        source(
          'Hermes status',
          hermesOnline,
          input.status?.gatewayState ?? 'online',
          'Hermes status unavailable',
        ),
        source(
          'Session analytics',
          analyticsOnline,
          `${input.analytics?.totalSessions ?? 0} sessions`,
          'Analytics unavailable',
        ),
        source(
          'Cost estimates',
          analyticsOnline,
          input.analytics?.costLabel ?? 'available',
          'Cost route data unavailable',
        ),
      ],
      lastUsedAt: null,
      nextScheduledAt: null,
      dryRunPrompt:
        'Dry-run Cost Route Watch: inspect Hermes analytics/session usage and provider route mix. Estimate 1h/5h/24h tokens and cost, flag route leaks, and make no provider/config changes.',
      guardrails: commonGuardrails,
      sourceLinks: [
        { label: 'Analytics', href: '/dashboard' },
        { label: 'Settings', href: '/settings' },
      ],
    }),
    makeLoop({
      id: 'shutdown-routine',
      label: 'Shutdown Routine',
      purpose:
        'Park open loops, separate real fires from fake fires, queue reminders, and protect evening boundary.',
      connectedSystems: [
        source(
          'Cron',
          cronOnline,
          `${input.cron?.total ?? 0} jobs`,
          'Cron jobs unavailable',
        ),
        source(
          'Taylor kanban',
          taylorKanbanOnline,
          `${input.jobBoard.taylorKanbanItems} items`,
          'Taylor kanban unavailable',
        ),
        source(
          'Hermes status',
          hermesOnline,
          input.status?.gatewayState ?? 'online',
          'Hermes status unavailable',
        ),
      ],
      lastUsedAt: null,
      nextScheduledAt: nextForCron(input.cron, 'shutdown'),
      dryRunPrompt:
        'Dry-run Shutdown Routine: list open loops, identify real fires vs fake fires, queue suggested reminders/follow-ups, and propose an evening boundary. No writes or sends.',
      guardrails: commonGuardrails,
      sourceLinks: [
        { label: 'Jobs', href: '/jobs' },
        { label: 'Dashboard', href: '/dashboard' },
      ],
    }),
  ]

  return {
    generatedAt: now,
    summary: {
      total: loops.length,
      ready: loops.filter((loop) => loop.status === 'ready').length,
      partial: loops.filter((loop) => loop.status === 'partial').length,
      notWired: loops.filter((loop) => loop.status === 'not-wired').length,
    },
    riskGates: commonGuardrails,
    loops,
  }
}

function buildNotebookBridge(): DashboardNotebookBridgeSection | null {
  const knowledge = safeLocal(
    () => (knowledgeRootExists() ? buildKnowledgeGraph() : null),
    null,
  )
  if (!knowledge) return null
  return {
    mode: 'manual-approval',
    canonicalSource: 'Obsidian vault',
    synthesisLayer: 'NotebookLM',
    writebackTargets: ['agents/kimi', 'inbox'],
    vaultNotes: knowledge.nodes.length,
    vaultLinks: knowledge.edges.length,
    lastVaultUpdate: newestIso(knowledge.nodes.map((node) => node.modified)),
    guardrails: [
      'Obsidian remains the source of truth.',
      'NotebookLM outputs are synthesis drafts only.',
      'Writeback requires manual approval and source links.',
    ],
    stages: [
      {
        id: 'vault-sources',
        label: 'Vault source pack',
        status: knowledge.nodes.length > 0 ? 'Ready' : 'Blocked',
        summary:
          'Mission Control can enumerate Obsidian notes and wikilinks for a source bundle.',
        sourceLinks: [{ label: 'Memory', href: '/memory' }],
      },
      {
        id: 'notebooklm-synthesis',
        label: 'NotebookLM synthesis',
        status: 'Manual',
        summary:
          'NotebookLM summaries, mind maps, and audio overviews are manually generated outside the source vault.',
        sourceLinks: [
          { label: 'NotebookLM', href: 'https://notebooklm.google.com/' },
        ],
      },
      {
        id: 'reviewed-writeback',
        label: 'Reviewed writeback',
        status: 'Draft',
        summary:
          'Approved synthesis becomes structured notes in agents/kimi or inbox with source links.',
        sourceLinks: [{ label: 'Inbox', href: '/memory' }],
      },
    ],
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
    kanbanRaw,
    logsRaw,
    sessionsRaw,
    skillsRaw,
    oauthProvidersRaw,
    jobBoard,
    swarmMissions,
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
    safeJson<unknown>(fetcher, '/api/plugins/kanban/board'),
    safeJson<unknown>(fetcher, `/api/logs?lines=${logsLimit}`),
    safeJson<unknown>(fetcher, '/api/sessions?limit=50&offset=0'),
    safeJson<unknown>(
      fetcher,
      '/api/skills?tab=installed&limit=200&summary=search',
    ),
    safeJson<unknown>(fetcher, '/api/providers/oauth'),
    readJobBoardModel(),
    Promise.resolve(safeLocal(() => listSwarmMissions(20), [])),
  ])

  const status = normalizeStatus(statusRaw, healthRaw)
  const platforms = normalizePlatforms(statusRaw)
  const cron = normalizeCron(cronRaw)
  const analytics = normalizeAnalytics(analyticsRaw, analyticsWindowDays)
  const kanban = normalizeKanban(kanbanRaw)
  const logs = normalizeLogs(logsRaw, logsLimit)
  const modelInfo = normalizeModelInfo(modelInfoRaw)
  const skillsUsage = normalizeSkillsUsage(analyticsRaw)
  const insights = computeInsights(analytics, cron, status, skillsUsage, kanban)
  const incidents = computeIncidents(status, platforms, cron, logs, kanban)
  const achievements = normalizeAchievements(
    achRecentRaw,
    achAllRaw,
    achievementsLimit,
  )
  const trustLedger = buildTrustLedger({
    status,
    cron,
    kanban,
    analytics,
    skillsUsage,
    sessionsRaw,
    skillsRaw,
    oauthProvidersRaw,
  })
  const controlLoops = buildControlLoops({
    status,
    cron,
    kanban,
    analytics,
    skillsRaw,
    oauthProvidersRaw,
    jobBoard,
  })
  const gitWork = readGitWorkSection()
  const approvalsProbe = safeLocal((): LiveSystemsApprovalsProbe => {
    const queue = getTaylorApprovalQueue()
    return {
      pending: queue.counts.total,
      actionable: queue.counts.actionable,
      degraded: queue.degraded,
    }
  }, null)
  const liveSystems = buildLiveSystems({
    status,
    platforms,
    cron,
    kanban,
    modelInfo,
    analytics,
    skillsRaw,
    oauthProvidersRaw,
    jobBoard,
    gitWork,
    approvals: approvalsProbe,
  })
  const agentWorkforce = buildAgentWorkforceSection(swarmMissions)

  return {
    status,
    platforms,
    cron,
    kanban,
    achievements,
    modelInfo,
    analytics,
    logs,
    skillsUsage,
    insights,
    incidents,
    trustLedger,
    controlLoops,
    notebookBridge: buildNotebookBridge(),
    liveSystems,
    agentWorkforce,
    gitWork,
  }
}
