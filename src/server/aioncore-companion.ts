const DEFAULT_AIONCORE_URL = 'http://127.0.0.1:25808'
const AIONCORE_TIMEOUT_MS = 5_000
const AIONCORE_HEALTH_CHECK_TIMEOUT_MS = 30_000

type AionCoreEnvelope<T> = {
  success?: boolean
  data?: T
  error?: string
  code?: string
}

type AionCoreHealth = {
  status?: string
  version?: string
  build_time?: string
}

type AionCoreAgentRow = {
  id?: string
  name?: string
  description?: string
  backend?: string
  agent_type?: string
  agent_source?: string
  enabled?: boolean
  installed?: boolean
  command?: string
  args?: Array<string>
  team_capable?: boolean
  status?: string
  last_check_status?: string
  last_check_error_code?: string
  last_check_error_message?: string
  last_check_guidance?: string
  last_check_latency_ms?: number
  last_check_at?: number
  last_success_at?: number
  last_failure_at?: number
}

export type ExternalAgentRuntimeStatus =
  | 'online'
  | 'offline'
  | 'unchecked'
  | 'missing'
  | 'disabled'
  | 'unknown'

export type ExternalAgentRuntime = {
  id: string
  name: string
  description: string
  backend: string
  agentType: string
  source: string
  enabled: boolean
  installed: boolean
  command: string
  args: Array<string>
  teamCapable: boolean
  status: ExternalAgentRuntimeStatus
  lastCheckStatus: string
  lastCheckErrorCode: string
  lastCheckErrorMessage: string
  lastCheckGuidance: string
  lastCheckLatencyMs: number | null
  lastCheckAt: number | null
  lastSuccessAt: number | null
  lastFailureAt: number | null
}

export type AionCoreCompanionSnapshot = {
  online: boolean
  version: string
  runtimes: Array<ExternalAgentRuntime>
  error?: string
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStatus(value: unknown): ExternalAgentRuntimeStatus {
  const normalized = readText(value).toLowerCase()
  if (
    normalized === 'online' ||
    normalized === 'offline' ||
    normalized === 'unchecked' ||
    normalized === 'missing' ||
    normalized === 'disabled'
  ) {
    return normalized
  }
  return 'unknown'
}

export function normalizeExternalAgentRuntime(
  row: AionCoreAgentRow,
): ExternalAgentRuntime | null {
  const id = readText(row.id)
  const name = readText(row.name)
  if (!id || !name) return null

  return {
    id,
    name,
    description: readText(row.description),
    backend: readText(row.backend) || readText(row.agent_type) || 'agent',
    agentType: readText(row.agent_type) || 'unknown',
    source: readText(row.agent_source) || 'unknown',
    enabled: row.enabled !== false,
    installed: row.installed === true,
    command: readText(row.command),
    args: Array.isArray(row.args) ? row.args.map(readText).filter(Boolean) : [],
    teamCapable: row.team_capable === true,
    status: normalizeStatus(row.last_check_status || row.status),
    lastCheckStatus: readText(row.last_check_status),
    lastCheckErrorCode: readText(row.last_check_error_code),
    lastCheckErrorMessage: readText(row.last_check_error_message),
    lastCheckGuidance: readText(row.last_check_guidance),
    lastCheckLatencyMs: readOptionalNumber(row.last_check_latency_ms),
    lastCheckAt: readOptionalNumber(row.last_check_at),
    lastSuccessAt: readOptionalNumber(row.last_success_at),
    lastFailureAt: readOptionalNumber(row.last_failure_at),
  }
}

function getAionCoreUrl(): string {
  const configured = process.env.AIONCORE_URL?.trim()
  return (configured || DEFAULT_AIONCORE_URL).replace(/\/$/, '')
}

export async function requestAionCoreJson<T>(
  endpoint: string,
  init?: RequestInit,
  timeoutMs = AIONCORE_TIMEOUT_MS,
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/json')
  if (init?.body) headers.set('content-type', 'application/json')

  const response = await fetch(`${getAionCoreUrl()}${endpoint}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  })

  const payload = (await response.json().catch(() => ({}))) as
    | AionCoreEnvelope<T>
    | T

  if (!response.ok) {
    const envelope = payload as AionCoreEnvelope<T>
    throw new Error(
      envelope.error || `AionCore returned HTTP ${response.status}`,
    )
  }

  return payload as T
}

async function readHealth(): Promise<AionCoreHealth> {
  return requestAionCoreJson<AionCoreHealth>('/health')
}

async function readManagementRows(): Promise<Array<AionCoreAgentRow>> {
  const payload = await requestAionCoreJson<
    AionCoreEnvelope<Array<AionCoreAgentRow>>
  >('/api/agents/management')
  if (payload.success === false) {
    throw new Error(payload.error || 'AionCore agent registry unavailable')
  }
  return Array.isArray(payload.data) ? payload.data : []
}

export async function getAionCoreCompanionSnapshot(): Promise<AionCoreCompanionSnapshot> {
  try {
    const [health, rows] = await Promise.all([
      readHealth(),
      readManagementRows(),
    ])
    const runtimes = rows
      .map(normalizeExternalAgentRuntime)
      .filter((runtime): runtime is ExternalAgentRuntime => runtime !== null)
      .filter((runtime) => runtime.installed)
      .sort((left, right) => left.name.localeCompare(right.name))

    return {
      online: readText(health.status).toLowerCase() === 'ok',
      version: readText(health.version),
      runtimes,
    }
  } catch (error) {
    return {
      online: false,
      version: '',
      runtimes: [],
      error:
        error instanceof Error
          ? error.message
          : 'AionCore companion is unavailable',
    }
  }
}

export async function healthCheckExternalAgentRuntime(
  runtimeId: string,
): Promise<ExternalAgentRuntime> {
  const id = runtimeId.trim()
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error('Invalid agent runtime id')
  }

  const payload = await requestAionCoreJson<AionCoreEnvelope<AionCoreAgentRow>>(
    `/api/agents/${encodeURIComponent(id)}/health-check`,
    { method: 'POST', body: '{}' },
    AIONCORE_HEALTH_CHECK_TIMEOUT_MS,
  )
  if (payload.success === false || !payload.data) {
    throw new Error(payload.error || 'Agent health check failed')
  }

  const runtime = normalizeExternalAgentRuntime(payload.data)
  if (!runtime) throw new Error('AionCore returned an invalid agent runtime')
  return runtime
}
