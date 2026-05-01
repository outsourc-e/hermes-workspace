/**
 * Probes Claude services to detect which API groups are available.
 *
 * Zero-fork architecture:
 *   - Gateway (:8642 by default): /health, /v1/chat/completions, /v1/models
 *   - Dashboard (:9119 by default): sessions, skills, config, cron, env, analytics
 *
 * Legacy enhanced-fork compatibility remains for users still running the
 * older all-in-one web API on the gateway port.
 *
 * Precedence for gateway/dashboard URLs:
 *   1. Runtime override saved via setGatewayUrl() / setDashboardUrl()
 *      (persisted to ~/.claude/workspace-overrides.json) — set from the UI
 *      so remote / Tailscale users can relocate without a restart (#101).
 *   2. process.env.CLAUDE_API_URL / CLAUDE_DASHBOARD_URL at process start.
 *   3. Default localhost (8642 / 9119).
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

type WorkspaceOverrides = {
  claudeApiUrl?: string
  claudeDashboardUrl?: string
}

function hermesHome(): string {
  return process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
}

function overridesPath(): string {
  return path.join(hermesHome(), 'workspace-overrides.json')
}

function readOverrides(): WorkspaceOverrides {
  try {
    const raw = fs.readFileSync(overridesPath(), 'utf-8')
    const parsed = JSON.parse(raw) as WorkspaceOverrides
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeOverrides(next: WorkspaceOverrides): void {
  const file = overridesPath()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, JSON.stringify(next, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    })
  } catch {
    console.warn(`[gateway] failed to persist workspace overrides to ${file}`)
  }
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/\/+$/, '')
}

const _initialOverrides = readOverrides()

export let CLAUDE_API = normalizeUrl(
  _initialOverrides.claudeApiUrl ||
    process.env.HERMES_API_URL ||
    process.env.CLAUDE_API_URL ||
    'http://127.0.0.1:8642',
)
export let CLAUDE_DASHBOARD_URL = normalizeUrl(
  _initialOverrides.claudeDashboardUrl ||
    process.env.HERMES_DASHBOARD_URL ||
    process.env.CLAUDE_DASHBOARD_URL ||
    'http://127.0.0.1:9119',
)

/**
 * Update the gateway URL at runtime, persist it, and reset the probe cache
 * so the next call to ensureGatewayProbed() re-detects capabilities.
 * Returns the saved URL (normalized). Pass an empty string to clear the
 * override and fall back to env/default.
 */
export function setGatewayUrl(input: string | null | undefined): string {
  const normalized = input ? normalizeUrl(input) : ''
  const overrides = readOverrides()
  if (normalized) {
    overrides.claudeApiUrl = normalized
    CLAUDE_API = normalized
  } else {
    delete overrides.claudeApiUrl
    CLAUDE_API = normalizeUrl(
      process.env.HERMES_API_URL || process.env.CLAUDE_API_URL || 'http://127.0.0.1:8642',
    )
  }
  writeOverrides(overrides)
  // Force reprobe on the next capability check.
  probePromise = null
  lastProbeAt = 0
  return CLAUDE_API
}

/**
 * Same as setGatewayUrl() but for the dashboard service.
 */
export function setDashboardUrl(input: string | null | undefined): string {
  const normalized = input ? normalizeUrl(input) : ''
  const overrides = readOverrides()
  if (normalized) {
    overrides.claudeDashboardUrl = normalized
    CLAUDE_DASHBOARD_URL = normalized
  } else {
    delete overrides.claudeDashboardUrl
    CLAUDE_DASHBOARD_URL = normalizeUrl(
      process.env.HERMES_DASHBOARD_URL || process.env.CLAUDE_DASHBOARD_URL || 'http://127.0.0.1:9119',
    )
  }
  writeOverrides(overrides)
  probePromise = null
  lastProbeAt = 0
  return CLAUDE_DASHBOARD_URL
}

/** Current resolved URLs (after any runtime override). */
export function getResolvedUrls(): {
  gateway: string
  dashboard: string
  source: 'override' | 'env' | 'default'
} {
  const overrides = readOverrides()
  const source = overrides.claudeApiUrl
    ? 'override'
    : (process.env.HERMES_API_URL || process.env.CLAUDE_API_URL)
      ? 'env'
      : 'default'
  return { gateway: CLAUDE_API, dashboard: CLAUDE_DASHBOARD_URL, source }
}

export const CLAUDE_UPGRADE_INSTRUCTIONS =
  'For full features, install Claude from source (`git clone https://github.com/NousResearch/claude-agent && cd claude-agent && pip install -e .`), then start the gateway on :8642 (`claude gateway run`). For the extended APIs (Sessions, Skills, Config, Jobs) also start the dashboard on :9119 (`claude dashboard`).'

export const SESSIONS_API_UNAVAILABLE_MESSAGE = `Your Claude backend does not support the sessions API. ${CLAUDE_UPGRADE_INSTRUCTIONS}`

const PROBE_TIMEOUT_MS = 3_000
const PROBE_TTL_MS = 120_000
const DASHBOARD_TOKEN_REGEX =
  /window\.__CLAUDE_SESSION_TOKEN__\s*=\s*["'](.+?)["']/

// ── Types ─────────────────────────────────────────────────────────

export type CoreCapabilities = {
  health: boolean
  chatCompletions: boolean
  models: boolean
  streaming: boolean
  probed: boolean
}

export type EnhancedCapabilities = {
  sessions: boolean
  enhancedChat: boolean
  skills: boolean
  memory: boolean
  config: boolean
  jobs: boolean
}

export type DashboardCapabilities = {
  dashboard: {
    available: boolean
    url: string
  }
}

/** Full capabilities — backward compat with existing code */
export type GatewayCapabilities =
  CoreCapabilities &
  EnhancedCapabilities &
  DashboardCapabilities

export type GatewayMode =
  | 'zero-fork'
  | 'enhanced-fork'
  | 'portable'
  | 'disconnected'

export type ChatMode = 'enhanced-claude' | 'portable' | 'disconnected'

export type ConnectionStatus =
  | 'connected'
  | 'enhanced'
  | 'partial'
  | 'disconnected'

// ── State ─────────────────────────────────────────────────────────

let capabilities: GatewayCapabilities = {
  health: false,
  chatCompletions: false,
  models: false,
  streaming: false,
  sessions: false,
  enhancedChat: false,
  skills: false,
  memory: false,
  config: false,
  jobs: false,
  dashboard: {
    available: false,
    url: CLAUDE_DASHBOARD_URL,
  },
  probed: false,
}

let probePromise: Promise<GatewayCapabilities> | null = null
let lastProbeAt = 0
let lastLoggedSummary = ''
let dashboardTokenPromise: Promise<string> | null = null
let dashboardTokenCache = ''

/** Optional bearer token for authenticated gateway endpoints. */
export const BEARER_TOKEN = process.env.HERMES_API_TOKEN || process.env.CLAUDE_API_TOKEN || ''

/**
 * Optional explicit bearer token for dashboard API calls.
 *
 * Preferred over scraping the dashboard's root HTML for an inline token
 * (the legacy path, which creates a brittle trust boundary — see #124).
 * When set, the workspace uses this directly and never parses HTML.
 *
 * NOTE: do NOT fall back to CLAUDE_API_TOKEN here. The gateway and the
 * upstream Claude dashboard use independent token schemes — the gateway
 * accepts a long-lived bearer (CLAUDE_API_TOKEN), while the dashboard
 * issues an ephemeral session token at boot (web_server.py:_SESSION_TOKEN).
 * Treating them as interchangeable wedges the workspace into 401 loops on
 * /api/sessions, /api/skills, etc. against the official dashboard. If
 * CLAUDE_DASHBOARD_TOKEN isn't set, leave this empty and let
 * fetchDashboardToken() fall through to the HTML-scrape legacy path.
 */
const DASHBOARD_BEARER_TOKEN = process.env.HERMES_DASHBOARD_TOKEN || process.env.CLAUDE_DASHBOARD_TOKEN || ''

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

let loggedHtmlScrapeFallback = false

/**
 * Resolve a bearer token for dashboard API calls.
 *
 * Lookup order:
 *   1.  CLAUDE_DASHBOARD_TOKEN / CLAUDE_API_TOKEN env (preferred)
 *   2.  Inline token injected into the dashboard's root HTML (legacy
 *      fallback — logs a deprecation warning; to be removed once all
 *      supported dashboards expose a first-class token endpoint). See #124.
 */
export async function fetchDashboardToken(options?: {
  force?: boolean
}): Promise<string> {
  const force = options?.force === true

  // Prefer the explicit service-to-service token — no HTML scrape at all.
  if (DASHBOARD_BEARER_TOKEN) {
    dashboardTokenCache = DASHBOARD_BEARER_TOKEN
    return DASHBOARD_BEARER_TOKEN
  }

  if (!force && dashboardTokenCache) return dashboardTokenCache
  if (!force && dashboardTokenPromise) return dashboardTokenPromise

  dashboardTokenPromise = (async () => {
    if (!loggedHtmlScrapeFallback) {
      loggedHtmlScrapeFallback = true
      console.warn(
        '[gateway] CLAUDE_DASHBOARD_TOKEN is not set — falling back to the legacy ' +
          'HTML-scrape token flow. This fallback will be removed in a future release. ' +
          'Set CLAUDE_DASHBOARD_TOKEN (or CLAUDE_API_TOKEN) to a dashboard bearer ' +
          'token to migrate. See #124.',
      )
    }
    // Dashboard injects the session token inline on `/` (root), not on
    // `/index.html` which serves the raw Vite-built HTML without the token.
    const res = await fetch(`${CLAUDE_DASHBOARD_URL}/`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`Dashboard index failed: ${res.status}`)
    }
    const html = await res.text()
    const token = html.match(DASHBOARD_TOKEN_REGEX)?.[1]?.trim() || ''
    if (!token) {
      throw new Error('Dashboard session token not found in root HTML')
    }
    dashboardTokenCache = token
    return token
  })()

  try {
    return await dashboardTokenPromise
  } finally {
    dashboardTokenPromise = null
  }
}

export async function getDashboardToken(options?: {
  force?: boolean
}): Promise<string> {
  return fetchDashboardToken(options)
}

export async function dashboardAuthHeaders(options?: {
  force?: boolean
}): Promise<Record<string, string>> {
  const token = await getDashboardToken(options)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function withDashboardBase(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${CLAUDE_DASHBOARD_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export async function dashboardFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const requestPath = withDashboardBase(path)
  const method = (init.method || 'GET').toUpperCase()
  const doFetch = async (forceToken = false) => {
    const headers = new Headers(init.headers)
    const isProtected =
      requestPath.includes('/api/') &&
      !requestPath.endsWith('/api/status') &&
      !requestPath.endsWith('/api/config/defaults') &&
      !requestPath.endsWith('/api/config/schema') &&
      !requestPath.endsWith('/api/model/info') &&
      !requestPath.endsWith('/api/dashboard/themes') &&
      !requestPath.endsWith('/api/dashboard/plugins') &&
      !requestPath.endsWith('/api/dashboard/plugins/rescan')

    if (isProtected && !headers.has('Authorization')) {
      const auth = await dashboardAuthHeaders({ force: forceToken })
      for (const [key, value] of Object.entries(auth)) {
        headers.set(key, value)
      }
    }

    return fetch(requestPath, {
      ...init,
      method,
      headers,
    })
  }

  let res = await doFetch(false)
  if (res.status === 401) {
    dashboardTokenCache = ''
    res = await doFetch(true)
  }
  return res
}

// ── Probing ───────────────────────────────────────────────────────

async function probe(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${CLAUDE_API}${path}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (res.status === 404 || res.status === 403) return false
    return true
  } catch {
    return false
  }
}

async function probeChatCompletions(): Promise<boolean> {
  try {
    const getRes = await fetch(`${CLAUDE_API}/v1/chat/completions`, {
      method: 'GET',
      headers: authHeaders(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (getRes.status === 405) return true
    if (getRes.ok) return true
    if (getRes.status === 400 || getRes.status === 422) return true
    if (getRes.status === 404) return false
    return true
  } catch {
    return false
  }
}

async function probeDashboard(): Promise<{ available: boolean; url: string }> {
  try {
    const res = await fetch(`${CLAUDE_DASHBOARD_URL}/api/status`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) return { available: false, url: CLAUDE_DASHBOARD_URL }
    const body = (await res.json()) as { version?: string }
    if (!body.version) return { available: false, url: CLAUDE_DASHBOARD_URL }
    await fetchDashboardToken().catch(() => '')
    return { available: true, url: CLAUDE_DASHBOARD_URL }
  } catch {
    return { available: false, url: CLAUDE_DASHBOARD_URL }
  }
}

// Vanilla claude-agent 0.10.0 satisfies: health, chatCompletions, models, streaming,
// sessions, skills, config, jobs. Dashboard-only endpoints (themes/plugins) and the
// legacy enhanced-fork chat stream are optional — their absence should not emit the
// "Missing Claude APIs detected" warning, which only applies to critical gaps.
const OPTIONAL_APIS = new Set([
  'jobs',
  'chatCompletions',
  'streaming',
  'memory',
  'dashboard',
  'enhancedChat',
])

function logCapabilities(next: GatewayCapabilities): void {
  const core: Array<string> = []
  const enhanced: Array<string> = []
  const missing: Array<string> = []

  const coreKeys: Array<keyof CoreCapabilities> = [
    'health',
    'chatCompletions',
    'models',
    'streaming',
  ]
  const enhancedKeys: Array<keyof EnhancedCapabilities> = [
    'sessions',
    'enhancedChat',
    'skills',
    'memory',
    'config',
    'jobs',
  ]

  for (const key of coreKeys) {
    ;(next[key] ? core : missing).push(key)
  }
  for (const key of enhancedKeys) {
    ;(next[key] ? enhanced : missing).push(key)
  }
  if (next.dashboard.available) core.push('dashboard')
  else missing.push('dashboard')

  const mode = getGatewayMode()
  const summary = `[gateway] gateway=${CLAUDE_API} dashboard=${next.dashboard.url} mode=${mode} core=[${core.join(', ')}] enhanced=[${enhanced.join(', ')}] missing=[${missing.join(', ')}]`
  if (summary === lastLoggedSummary) return
  lastLoggedSummary = summary
  console.log(summary)

  const criticalMissing = missing.filter((key) => !OPTIONAL_APIS.has(key))
  if (criticalMissing.length > 0 && (next.health || next.dashboard.available)) {
    console.warn(
      `[gateway] Missing Claude APIs detected. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
    )
  }
}

async function autoDetectGatewayUrl(): Promise<void> {
  if (process.env.HERMES_API_URL || process.env.CLAUDE_API_URL) return

  const candidates = [
    'http://127.0.0.1:8642',
    'http://127.0.0.1:8643',
    'http://127.0.0.1:8645',
  ]

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${candidate}/health`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (res.ok) {
        CLAUDE_API = candidate
        console.log(`[gateway] Connected to Claude gateway at ${CLAUDE_API}`)
        return
      }
    } catch {
      // continue
    }
  }

  console.warn(
    '[gateway] Could not reach Claude gateway on 8645, 8642, or 8643. ' +
      'If you run the workspace on a different machine (Tailscale / VPN / LAN), ' +
      'set CLAUDE_API_URL=http://<reachable-host>:8642 in .env and restart. ' +
      'Also set API_SERVER_HOST=0.0.0.0 on the gateway so remote peers can connect.',
  )
}

async function autoDetectDashboardUrl(): Promise<void> {
  if (process.env.CLAUDE_DASHBOARD_URL) return

  const candidates = ['http://127.0.0.1:9119']
  for (const candidate of candidates) {
    try {
      const res = await fetch(`${candidate}/api/status`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (res.ok) {
        CLAUDE_DASHBOARD_URL = candidate
        return
      }
    } catch {
      // continue
    }
  }
}

export async function probeGateway(options?: {
  force?: boolean
}): Promise<GatewayCapabilities> {
  const force = options?.force === true
  if (!force && capabilities.probed) {
    return capabilities
  }
  if (probePromise) {
    return probePromise
  }

  probePromise = (async () => {
    await Promise.all([autoDetectGatewayUrl(), autoDetectDashboardUrl()])

    const [
      health,
      chatCompletions,
      models,
      legacySessions,
      enhancedChat,
      legacySkills,
      legacyConfig,
      legacyJobs,
      dashboard,
    ] = await Promise.all([
      probe('/health'),
      probeChatCompletions(),
      probe('/v1/models'),
      probe('/api/sessions'),
      probe('/api/sessions/__probe__/chat/stream'),
      probe('/api/skills'),
      probe('/api/config'),
      probe('/api/jobs'),
      probeDashboard(),
    ])

    capabilities = {
      health,
      chatCompletions,
      models,
      streaming: chatCompletions,
      probed: true,
      sessions: dashboard.available || legacySessions,
      enhancedChat,
      skills: dashboard.available || legacySkills,
      // Memory is always available: workspace reads $CLAUDE_HOME/MEMORY.md +
      // memory/*.md + memories/*.md directly from the local filesystem.
      // No remote gateway endpoint is required.
      memory: true,
      config: dashboard.available || legacyConfig,
      jobs: dashboard.available || legacyJobs,
      dashboard,
    }
    lastProbeAt = Date.now()
    logCapabilities(capabilities)
    return capabilities
  })()

  try {
    return await probePromise
  } finally {
    probePromise = null
  }
}

export async function ensureGatewayProbed(): Promise<GatewayCapabilities> {
  const isStale = Date.now() - lastProbeAt > PROBE_TTL_MS
  if (!capabilities.probed || isStale) {
    return probeGateway({ force: isStale })
  }
  return capabilities
}

// ── Accessors ─────────────────────────────────────────────────────

export function getCapabilities(): GatewayCapabilities {
  return capabilities
}

export function getCoreCapabilities(): CoreCapabilities {
  return {
    health: capabilities.health,
    chatCompletions: capabilities.chatCompletions,
    models: capabilities.models,
    streaming: capabilities.streaming,
    probed: capabilities.probed,
  }
}

export function getEnhancedCapabilities(): EnhancedCapabilities {
  return {
    sessions: capabilities.sessions,
    enhancedChat: capabilities.enhancedChat,
    skills: capabilities.skills,
    memory: capabilities.memory,
    config: capabilities.config,
    jobs: capabilities.jobs,
  }
}

export function getGatewayMode(): GatewayMode {
  // 'zero-fork' requires the optional dashboard plugin bundle; 'enhanced' is
  // granted whenever the core enhanced-chat endpoints are present — which
  // vanilla claude-agent (≥0.10) satisfies. The label 'enhanced-fork' is
  // legacy copy from the 2025-era fork and does NOT imply an actual fork is
  // required. We keep the value for backwards compatibility with UI code.
  if (capabilities.dashboard.available && capabilities.chatCompletions) {
    return 'zero-fork'
  }
  if (capabilities.sessions && capabilities.enhancedChat) {
    return 'enhanced-fork'
  }
  if (capabilities.chatCompletions || capabilities.health) return 'portable'
  return 'disconnected'
}

/**
 * UI-facing chat transport mode:
 * - enhanced-claude: legacy fork session streaming API available
 * - portable: OpenAI-compatible /v1/chat/completions transport
 * - disconnected: no usable chat backend
 */
export function getChatMode(): ChatMode {
  if (capabilities.enhancedChat) return 'enhanced-claude'
  if (capabilities.chatCompletions || capabilities.health) return 'portable'
  return 'disconnected'
}

export function getConnectionStatus(): ConnectionStatus {
  if (!capabilities.health && !capabilities.chatCompletions) {
    return capabilities.dashboard.available ? 'partial' : 'disconnected'
  }
  const enhanced =
    (capabilities.dashboard.available || capabilities.sessions) &&
    capabilities.skills &&
    capabilities.config
  if (enhanced) return 'enhanced'
  if (capabilities.chatCompletions || capabilities.sessions) return 'partial'
  return 'connected'
}

export function isClaudeConnected(): boolean {
  return capabilities.health || capabilities.dashboard.available
}

void ensureGatewayProbed()
