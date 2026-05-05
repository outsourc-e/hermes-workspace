/**
 * Probes Hermes services to detect which API groups are available.
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
 *      (persisted to ~/.hermes/workspace-overrides.json) — set from the UI
 *      so remote / Tailscale users can relocate without a restart (#101).
 *   2. process.env.HERMES_API_URL / HERMES_DASHBOARD_URL at process start.
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
  'For full features, install Hermes Agent from source (`git clone https://github.com/NousResearch/hermes-agent && cd hermes-agent && pip install -e .`), then start the gateway on :8642 (`hermes gateway run`). For the extended APIs (Sessions, Skills, Config, Jobs) also start the dashboard on :9119 (`hermes dashboard`).'

export const SESSIONS_API_UNAVAILABLE_MESSAGE = `Your Hermes backend does not support the sessions API. ${CLAUDE_UPGRADE_INSTRUCTIONS}`

const PROBE_TIMEOUT_MS = 3_000
// Probe TTL: 120s when the gateway is healthy, 15s when it isn't. The
// shorter window during 'disconnected' state means a Docker stack where
// the workspace boots before the agent recovers within ~15s of the agent
// becoming reachable, instead of being stuck on the first failed probe
// for two minutes. See #275.
const PROBE_TTL_MS = 120_000
const PROBE_TTL_DISCONNECTED_MS = 15_000

function effectiveProbeTtl(caps: { health: boolean; chatCompletions: boolean }): number {
  if (caps.health || caps.chatCompletions) return PROBE_TTL_MS
  return PROBE_TTL_DISCONNECTED_MS
}
const DASHBOARD_TOKEN_REGEX =
  /window\.__(?:CLAUDE|HERMES)_SESSION_TOKEN__\s*=\s*["'](.+?)["']/

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
  mcp: boolean
  /**
   * Phase 1.5 — local-only fallback. True when the agent does NOT yet expose
   * the `/api/mcp*` runtime endpoints but the dashboard `/api/config` route
   * exposes a `mcp_servers` map AND the deployment is loopback-only. The
   * workspace then performs CRUD against `config.mcp_servers` directly while
   * disabling Test/Discover/Logs (which require runtime probing). Removed
   * once hermes-agent ships native `/api/mcp*` endpoints.
   */
  mcpFallback: boolean
  /**
   * True when the dashboard exposes `/api/conductor/missions`. The Conductor
   * UI requires this; if false, the screen renders an 'upstream not ready'
   * placeholder instead of failing mid-action. See #262.
   */
  conductor: boolean
  /**
   * True when the dashboard exposes `/api/plugins/kanban/board` (the native
   * Hermes kanban plugin shipped upstream). When available, the workspace's
   * /swarm kanban surface can sync with the dashboard's kanban DB so both
   * UIs read/write the same SQLite source of truth instead of running
   * separate stores. When false, the workspace falls back to its local
   * file-backed swarm-kanban store. See v2.3.0 plan.
   */
  kanban: boolean
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
  mcp: false,
  mcpFallback: false,
  conductor: false,
  kanban: false,
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
 * upstream Hermes Agent dashboard use independent token schemes — the gateway
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

/**
 * Lightweight fetch helper that targets the gateway base URL
 * (`CLAUDE_API`, e.g. http://127.0.0.1:8645). Used for endpoints that
 * live on the gateway runtime rather than the dashboard, like
 * `/health/detailed`.
 */
export async function gatewayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${CLAUDE_API}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(init.headers)
  for (const [k, v] of Object.entries(authHeaders())) {
    if (!headers.has(k)) headers.set(k, v)
  }
  return fetch(url, { ...init, headers })
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

/**
 * Stricter probe for the legacy enhanced chat-stream endpoint.
 *
 * The previous probe used a generic GET and treated any non-404/403 status
 * as "available". That misclassified vanilla hermes-agent (which serves a
 * router-level handler that 405s/400s GETs to that path) as having the
 * enhanced fork's session-stream capability. Workspace then fell through
 * to streamChat() which posts to /api/sessions/{id}/chat/stream — vanilla
 * agent returns 404 there at runtime and chat appears to fail with
 * "Authentication error" because the bundle's error mapper is overly
 * generous about what it interprets as auth failures. See #261.
 *
 * Real enhanced-fork gateways respond to GET on the probe path with one
 * of: 405 Method Not Allowed (it's POST-only there too) but also expose
 * the path in their router; we cannot distinguish reliably from a generic
 * status code on GET, so we POST a tiny no-op body and look for a
 * structured error shape that only the fork emits.
 */
async function probeEnhancedChatStream(): Promise<boolean> {
  try {
    const res = await fetch(`${CLAUDE_API}/api/sessions/__probe__/chat/stream`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    // Vanilla hermes-agent has no such endpoint — dashboard layer 404s,
    // gateway 404s, anything in between 404s. Enhanced fork accepts POST
    // and returns either a 4xx structured error (validation) or starts a
    // stream; either way the path is registered.
    if (res.status === 404 || res.status === 403) return false
    // 405 = the path exists but POST is wrong. That's still vanilla — no
    // enhanced fork would 405 a POST to its own chat/stream endpoint.
    if (res.status === 405) return false
    // 401 means auth gate is wired; treat as available so token-gated
    // setups don't get downgraded by a missing token at probe time.
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

/**
 * Strict MCP capability probe.
 *
 * Per plan §Open Questions #4: probing `dashboard.available || /api/mcp` is
 * insufficient. The probe must hit `GET /api/mcp` directly and verify both:
 *   1. 200 OK
 *   2. Body parses through normalizeMcpList (i.e. shape is recognizable)
 * If the dashboard is up but `/api/mcp` is absent (404) or returns a
 * malformed body, capability is `false`.
 */
async function probeMcp(): Promise<boolean> {
  const { normalizeMcpList } = await import('./mcp-normalize')
  const validate = async (res: Response): Promise<boolean> => {
    if (!res.ok) return false
    const body = (await res.json().catch(() => null)) as unknown
    if (body === null) return false
    // Empty list is a valid configured-zero state — still indicates the
    // endpoint is real. The shape check is "does the normalizer accept it
    // without throwing", which it does for `{servers: []}`, `[]`, etc.
    void normalizeMcpList(body)
    return true
  }
  // Use dashboardFetch so the probe goes through the same authenticated path
  // workspace routes use at runtime — otherwise an auth-protected dashboard
  // /api/mcp would falsely report capability=false (Codex MAJOR finding).
  try {
    const res = await dashboardFetch('/api/mcp', {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (await validate(res)) return true
  } catch {
    // fall through to gateway path
  }
  try {
    const res = await fetch(`${CLAUDE_API}/api/mcp`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return await validate(res)
  } catch {
    return false
  }
}

/**
 * Conservative loopback check. Returns true ONLY when:
 *   1. Both `CLAUDE_API` and `CLAUDE_DASHBOARD_URL` resolve to a loopback host
 *      (`127.0.0.1`, `::1`, or `localhost`).
 *   2. Workspace `HOST` env is unset OR loopback. Any non-loopback `HOST`
 *      (including `0.0.0.0`) disables fallback so we never silently expose a
 *      remote-deploy to plaintext config.yaml writes.
 *
 * On any parse failure we return false. Better to under-enable than to
 * silently enable on a remote deployment.
 */
export function isLocalhostDeployment(): boolean {
  const isLoopbackHost = (host: string): boolean => {
    const h = host.trim().toLowerCase()
    if (!h) return false
    return h === '127.0.0.1' || h === '::1' || h === 'localhost' || h === '[::1]'
  }
  const isLoopbackUrl = (raw: string): boolean => {
    try {
      const u = new URL(raw)
      return isLoopbackHost(u.hostname)
    } catch {
      return false
    }
  }
  const host = (process.env.HOST || '').trim()
  if (host && !isLoopbackHost(host)) return false
  return isLoopbackUrl(CLAUDE_API) && isLoopbackUrl(CLAUDE_DASHBOARD_URL)
}

/**
 * Probe whether the dashboard's `/api/config` payload includes an
 * `mcp_servers` entry. The presence of the key (even if empty) signals that
 * config-fallback CRUD is safe to expose.
 *
 * Used as part of the `mcpFallback` capability gate.
 */
async function probeMcpConfigKey(): Promise<boolean> {
  try {
    const { getConfig } = await import('./claude-dashboard-api')
    const cfg = await getConfig()
    if (typeof cfg !== 'object') return false
    if ('mcp_servers' in cfg) return true
    const inner =
      cfg.config && typeof cfg.config === 'object'
        ? (cfg.config as Record<string, unknown>)
        : null
    return inner ? 'mcp_servers' in inner : false
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

/**
 * Lightweight probe for the Conductor mission endpoint. Some dashboard builds
 * ship without it; those deployments should show a graceful placeholder
 * instead of letting the Conductor UI 500. See #262.
 */
async function probeConductor(dashboardAvailable: boolean): Promise<boolean> {
  if (!dashboardAvailable) return false
  try {
    const res = await dashboardFetch('/api/conductor/missions', {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (res.status === 404 || res.status === 405) return false
    // 401 means the path exists but the auth token isn't accepted yet —
    // treat as available so token-gated setups don't hide the feature.
    return true
  } catch {
    return false
  }
}

/**
 * Lightweight probe for the upstream Hermes kanban plugin. When the dashboard
 * exposes `/api/plugins/kanban/board` we assume the kanban plugin is loaded
 * and the workspace can sync its /swarm kanban surface with the dashboard's
 * SQLite-backed kanban DB. Mounted by hermes_cli.web_server
 * `_mount_plugin_api_routes()`. See v2.3.0 plan.
 */
async function probeKanban(dashboardAvailable: boolean): Promise<boolean> {
  if (!dashboardAvailable) return false
  try {
    const res = await dashboardFetch('/api/plugins/kanban/board', {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (res.status === 404 || res.status === 405) return false
    // The plugin route is unauthenticated by design (loopback-only), so
    // 200 is the normal success. Some auth setups may return 401 — still
    // means the route exists.
    return true
  } catch {
    return false
  }
}


// Vanilla hermes-agent 0.10.0 satisfies: health, chatCompletions, models, streaming,
// sessions, skills, config, jobs. Dashboard-only endpoints (themes/plugins) and the
// legacy enhanced-fork chat stream are optional — their absence should not emit the
// "Missing Hermes APIs detected" warning, which only applies to critical gaps.
const OPTIONAL_APIS = new Set([
  'jobs',
  'chatCompletions',
  'streaming',
  'memory',
  'dashboard',
  'enhancedChat',
  'mcp',
  'mcpFallback',
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
    'mcp',
    'mcpFallback',
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
      `[gateway] Missing Hermes APIs detected. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
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
        console.log(`[gateway] Connected to Hermes gateway at ${CLAUDE_API}`)
        return
      }
    } catch {
      // continue
    }
  }

  console.warn(
    '[gateway] Could not reach Hermes gateway on 8645, 8642, or 8643. ' +
      'If you run the workspace on a different machine (Tailscale / VPN / LAN), ' +
      'set HERMES_API_URL=http://<reachable-host>:8642 in .env and restart. ' +
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
      probeEnhancedChatStream(),
      probe('/api/skills'),
      probe('/api/config'),
      probe('/api/jobs'),
      probeDashboard(),
    ])

    // Strict MCP probe runs after dashboard probe so dashboard token
    // resolution (in-page HTML scrape fallback) has had a chance to populate
    // the cache when the dashboard is up.
    const mcp = await probeMcp()

    // Conductor probe runs after dashboard probe.
    const conductor = await probeConductor(dashboard.available)
    const kanban = await probeKanban(dashboard.available)

    // Phase 1.5 fallback: when native /api/mcp is missing but the dashboard
    // exposes `config.mcp_servers` AND we are loopback-only, allow a config
    // -backed CRUD path. Test/Discover/Logs remain disabled in this mode.
    const dashboardConfigAvailable = dashboard.available || legacyConfig
    const mcpFallback =
      !mcp &&
      dashboard.available &&
      dashboardConfigAvailable &&
      isLocalhostDeployment() &&
      (await probeMcpConfigKey())

    capabilities = {
      health,
      chatCompletions,
      models,
      streaming: chatCompletions,
      probed: true,
      sessions: dashboard.available || legacySessions,
      enhancedChat,
      skills: dashboard.available || legacySkills,
      // Memory is always available: workspace reads $HERMES_HOME/MEMORY.md +
      // memory/*.md + memories/*.md directly from the local filesystem.
      // No remote gateway endpoint is required.
      memory: true,
      config: dashboard.available || legacyConfig,
      jobs: dashboard.available || legacyJobs,
      mcp,
      mcpFallback,
      conductor,
      kanban,
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
  const isStale =
    Date.now() - lastProbeAt > effectiveProbeTtl(capabilities)
  if (!capabilities.probed || isStale) {
    return probeGateway({ force: isStale })
  }
  return capabilities
}

/**
 * Force-reprobe regardless of TTL. Used by the UI 'Reconnect' action
 * and by any tool that wants to validate the current state immediately
 * (for example after a docker compose restart). See #275.
 */
export async function forceReprobeGateway(): Promise<GatewayCapabilities> {
  return probeGateway({ force: true })
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
    mcp: capabilities.mcp,
    mcpFallback: capabilities.mcpFallback,
    conductor: capabilities.conductor,
    kanban: capabilities.kanban,
  }
}

export function getGatewayMode(): GatewayMode {
  // 'zero-fork' requires the optional dashboard plugin bundle; 'enhanced' is
  // granted whenever the core enhanced-chat endpoints are present — which
  // vanilla hermes-agent (≥0.10) satisfies. The label 'enhanced-fork' is
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
