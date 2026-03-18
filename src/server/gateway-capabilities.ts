/**
 * Probes the Hermes gateway to detect which API groups are available.
 * Results are cached and refreshed periodically so route handlers can
 * degrade cleanly against older Hermes gateways.
 */

export const HERMES_API =
  process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

export const HERMES_UPGRADE_INSTRUCTIONS =
  'Update Hermes: cd hermes-agent && git pull && pip install -e . && hermes gateway'

export const SESSIONS_API_UNAVAILABLE_MESSAGE =
  `Your Hermes gateway does not support the sessions API. ${HERMES_UPGRADE_INSTRUCTIONS}`

const PROBE_TIMEOUT_MS = 3_000
const PROBE_TTL_MS = 30_000

export type GatewayCapabilities = {
  health: boolean
  models: boolean
  sessions: boolean
  skills: boolean
  memory: boolean
  config: boolean
  jobs: boolean
  probed: boolean
}

let capabilities: GatewayCapabilities = {
  health: false,
  models: false,
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

async function probe(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${HERMES_API}${path}`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return res.status !== 404
  } catch {
    return false
  }
}

function summarizeCapabilities(next: GatewayCapabilities): {
  available: Array<string>
  missing: Array<string>
} {
  const available: Array<string> = []
  const missing: Array<string> = []

  for (const [key, value] of Object.entries(next)) {
    if (key === 'probed') continue
    ;(value ? available : missing).push(key)
  }

  return { available, missing }
}

function logCapabilities(next: GatewayCapabilities): void {
  const { available, missing } = summarizeCapabilities(next)
  const summary =
    `[gateway] ${HERMES_API} available: ${available.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}`
  if (summary === lastLoggedSummary) return
  lastLoggedSummary = summary
  console.log(summary)
  if (missing.length > 0) {
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
    const [health, models, sessions, skills, memory, config, jobs] =
      await Promise.all([
        probe('/health'),
        probe('/v1/models'),
        probe('/api/sessions'),
        probe('/api/skills'),
        probe('/api/memory'),
        probe('/api/config'),
        probe('/api/jobs'),
      ])

    capabilities = {
      health,
      models,
      sessions,
      skills,
      memory,
      config,
      jobs,
      probed: true,
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

export function getCapabilities(): GatewayCapabilities {
  return capabilities
}

void ensureGatewayProbed()
