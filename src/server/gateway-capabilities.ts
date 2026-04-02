/**
 * Probes the Hermes gateway to detect which API groups are available.
 * Results are cached and refreshed periodically so route handlers can
 * degrade cleanly against older Hermes gateways.
 *
 * Two-tier capability model:
 *   - Core: portable chat readiness (health, chat completions, models)
 *   - Enhanced: Hermes-native extras (sessions, skills, memory, config, jobs)
 */

export let HERMES_API =
  process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

export const HERMES_UPGRADE_INSTRUCTIONS =
  'Update Hermes: cd hermes-agent && git pull && pip install -e . && hermes --gateway'

export const SESSIONS_API_UNAVAILABLE_MESSAGE =
  `Your Hermes gateway does not support the sessions API. ${HERMES_UPGRADE_INSTRUCTIONS}`

const PROBE_TIMEOUT_MS = 3_000
const PROBE_TTL_MS = 30_000

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
  skills: boolean
  memory: boolean
  config: boolean
  jobs: boolean
}

/** Full capabilities — backward compat with existing code */
export type GatewayCapabilities = CoreCapabilities & EnhancedCapabilities

export type ChatMode = 'enhanced-hermes' | 'portable' | 'disconnected'

export type ConnectionStatus = 'connected' | 'enhanced' | 'partial' | 'disconnected'

// ── State ─────────────────────────────────────────────────────────

let capabilities: GatewayCapabilities = {
  health: false,
  chatCompletions: false,
  models: false,
  streaming: false,
  sessions: false,
  skills: false,
  memory: false,
  config: false,
  jobs: false,
  probed: false,
}

let probePromise: Promise<GatewayCapabilities> | null = null
let lastProbeAt = 0
let lastLoggedSummary = ''

/** Optional bearer token for authenticated endpoints. */
const BEARER_TOKEN = process.env.HERMES_API_TOKEN || ''

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { 'Authorization': `Bearer ${BEARER_TOKEN}` } : {}
}

// ── Probing ───────────────────────────────────────────────────────

async function probe(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${HERMES_API}${path}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    // 404 = endpoint doesn't exist.
    // 403 = likely a catch-all rejection (e.g. Codex endpoint rejects unknown paths).
    // Only 2xx, 400, 405, 422 reliably indicate the endpoint exists.
    if (res.status === 404 || res.status === 403) return false
    return true
  } catch {
    return false
  }
}

/** Probe /v1/chat/completions with a minimal real POST.
 *  Some endpoints (e.g. Codex) reject OPTIONS and return 403 on unknown paths,
 *  so we need to send a real request to confirm the endpoint works. */
async function probeChatCompletions(): Promise<boolean> {
  try {
    const res = await fetch(`${HERMES_API}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        model: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS + 5_000),
    })
    // 200 = works. 400/422 = endpoint exists. 401 = exists, bad auth.
    if (res.ok || res.status === 400 || res.status === 422 || res.status === 401) return true
    // 404 could mean "endpoint doesn't exist" OR "model not found" (Ollama).
    // Check if the response is a JSON API error — that means the endpoint exists.
    if (res.status === 404) {
      const text = await res.text().catch(() => '')
      return text.includes('"error"') || text.includes('"message"')
    }
    // 403 on completions specifically — check if it's a real API error vs catch-all
    if (res.status === 403) {
      const text = await res.text().catch(() => '')
      return text.includes('error') || text.includes('unauthorized') || text.includes('forbidden')
    }
    return true
  } catch {
    return false
  }
}

// APIs that are optional and do not warrant an upgrade warning when absent.
const OPTIONAL_APIS = new Set(['jobs', 'chatCompletions', 'streaming'])

function logCapabilities(next: GatewayCapabilities): void {
  const core: Array<string> = []
  const enhanced: Array<string> = []
  const missing: Array<string> = []

  const coreKeys: Array<keyof CoreCapabilities> = ['health', 'chatCompletions', 'models', 'streaming']
  const enhancedKeys: Array<keyof EnhancedCapabilities> = ['sessions', 'skills', 'memory', 'config', 'jobs']

  for (const key of coreKeys) {
    if (key === 'probed') continue
    ;(next[key] ? core : missing).push(key)
  }
  for (const key of enhancedKeys) {
    ;(next[key] ? enhanced : missing).push(key)
  }

  const mode = getChatMode()
  const summary =
    `[gateway] ${HERMES_API} mode=${mode} core=[${core.join(', ')}] enhanced=[${enhanced.join(', ')}] missing=[${missing.join(', ')}]`
  if (summary === lastLoggedSummary) return
  lastLoggedSummary = summary
  console.log(summary)

  // Only warn about critical missing APIs (not optional ones)
  const criticalMissing = missing.filter((key) => !OPTIONAL_APIS.has(key))
  if (criticalMissing.length > 0 && next.health) {
    console.warn(
      `[gateway] Missing Hermes APIs detected. ${HERMES_UPGRADE_INSTRUCTIONS}`,
    )
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
    // Auto-detect port if no explicit env var set
    if (!process.env.HERMES_API_URL) {
      const healthOn8642 = await probe('/health')
      if (!healthOn8642) {
        const fallback = 'http://127.0.0.1:8643'
        const healthOn8643 = await fetch(`${fallback}/health`, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }).then(r => r.ok).catch(() => false)
        if (healthOn8643) {
          HERMES_API = fallback
          console.log(`[gateway] Connected to Hermes at ${HERMES_API}`)
        } else {
          console.warn('[gateway] Could not reach Hermes on 8642 or 8643')
        }
      } else {
        console.log(`[gateway] Connected to Hermes at ${HERMES_API}`)
      }
    }

    const [health, chatCompletions, models, sessions, skills, memory, config, jobs] =
      await Promise.all([
        probe('/health'),
        probeChatCompletions(),
        probe('/v1/models'),
        probe('/api/sessions'),
        probe('/api/skills'),
        probe('/api/memory'),
        probe('/api/config'),
        probe('/api/jobs'),
      ])

    capabilities = {
      // Core
      health,
      chatCompletions,
      models,
      streaming: chatCompletions, // If chat completions exists, streaming is supported
      probed: true,
      // Enhanced
      sessions,
      skills,
      memory,
      config,
      jobs,
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

/** Full capabilities — backward compatible */
export function getCapabilities(): GatewayCapabilities {
  return capabilities
}

/** Core portable capabilities only */
export function getCoreCapabilities(): CoreCapabilities {
  return {
    health: capabilities.health,
    chatCompletions: capabilities.chatCompletions,
    models: capabilities.models,
    streaming: capabilities.streaming,
    probed: capabilities.probed,
  }
}

/** Hermes-native enhanced capabilities only */
export function getEnhancedCapabilities(): EnhancedCapabilities {
  return {
    sessions: capabilities.sessions,
    skills: capabilities.skills,
    memory: capabilities.memory,
    config: capabilities.config,
    jobs: capabilities.jobs,
  }
}

/**
 * Current chat transport mode:
 * - 'enhanced-hermes': full Hermes session API available
 * - 'portable': OpenAI-compatible /v1/chat/completions available
 * - 'disconnected': no usable chat backend
 */
export function getChatMode(): ChatMode {
  if (capabilities.sessions) return 'enhanced-hermes'
  if (capabilities.chatCompletions || capabilities.health) return 'portable'
  return 'disconnected'
}

/**
 * Connection status for UI display:
 * - 'enhanced': full Hermes APIs detected
 * - 'connected': chat works
 * - 'partial': chat works, some advanced features unavailable
 * - 'disconnected': no backend
 */
export function getConnectionStatus(): ConnectionStatus {
  if (!capabilities.health && !capabilities.chatCompletions) return 'disconnected'
  const enhanced = capabilities.sessions && capabilities.skills && capabilities.memory && capabilities.config
  if (enhanced) return 'enhanced'
  if (capabilities.chatCompletions || capabilities.sessions) return 'partial'
  return 'connected'
}

export function isHermesConnected(): boolean {
  return capabilities.health
}

void ensureGatewayProbed()
