export const BASE_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:4444'

export type GatewaySessionUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  tokens?: number
  cost?: number
}

export type GatewayMessagePart = {
  type?: string
  text?: string
}

export type GatewaySessionMessage = {
  role?: string
  content?: Array<GatewayMessagePart>
  text?: string
}

export type GatewaySession = {
  key?: string
  friendlyId?: string
  kind?: string
  status?: string
  model?: string
  label?: string
  title?: string
  derivedTitle?: string
  task?: string
  initialMessage?: string
  progress?: number
  tokenCount?: number
  totalTokens?: number
  cost?: number
  createdAt?: number | string
  startedAt?: number | string
  updatedAt?: number | string
  lastMessage?: GatewaySessionMessage | null
  usage?: GatewaySessionUsage
  [key: string]: unknown
}

export type GatewaySessionsResponse = {
  sessions?: Array<GatewaySession>
}

export type GatewaySessionStatusResponse = {
  status?: string
  progress?: number
  model?: string
  tokenCount?: number
  totalTokens?: number
  usage?: GatewaySessionUsage
  error?: string
  [key: string]: unknown
}

export type GatewayModelCatalogEntry =
  | string
  | {
      alias?: string
      provider?: string
      model?: string
      name?: string
      label?: string
      displayName?: string
      id?: string
      [key: string]: unknown
    }

export type GatewayModelsResponse = {
  ok?: boolean
  models?: Array<GatewayModelCatalogEntry>
  configuredProviders?: Array<string>
  error?: string
}

export type GatewayModelSwitchResponse = {
  ok?: boolean
  error?: string
  resolved?: {
    modelProvider?: string
    model?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type GatewayModelDefaultResponse = {
  ok?: boolean
  error?: string
}

export type GatewayAgentActionResponse = {
  ok?: boolean
  error?: string
}

export type GatewayAgentPauseResponse = GatewayAgentActionResponse & {
  paused?: boolean
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    return JSON.stringify(payload)
  } catch {
    const text = await response.text().catch(() => '')
    return text || response.statusText || 'Gateway request failed'
  }
}

function makeEndpoint(pathname: string): string {
  return new URL(pathname, BASE_URL).toString()
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

// ── Session History & Messaging ───────────────────────────────────────────────

export type SessionHistoryMessage = {
  role: string
  content?: string | Array<{ type?: string; text?: string }>
  timestamp?: number
  toolName?: string
  toolCallId?: string
}

export type SessionHistoryResponse = {
  ok?: boolean
  messages?: SessionHistoryMessage[]
  error?: string
}

export async function fetchSessionHistory(
  sessionKey: string,
  opts?: { limit?: number; includeTools?: boolean },
): Promise<SessionHistoryResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000)
  try {
    const params = new URLSearchParams({ key: sessionKey })
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.includeTools) params.set('includeTools', 'true')
    const response = await fetch(makeEndpoint(`/api/session-history?${params}`), {
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, messages: [], error: await readError(response) }
    return (await response.json()) as SessionHistoryResponse
  } catch (error) {
    if (isAbortError(error)) return { ok: false, messages: [], error: 'Request timed out' }
    return { ok: false, messages: [], error: String(error) }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export type SendToSessionResponse = {
  ok?: boolean
  error?: string
}

export async function sendToSession(
  sessionKey: string,
  message: string,
): Promise<SendToSessionResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(makeEndpoint('/api/session-send'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey, message }),
      signal: controller.signal,
    })
    const payload = (await response.json().catch(() => ({}))) as SendToSessionResponse
    if (!response.ok || payload.ok === false) {
      throw new Error(
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error
          : response.statusText || 'Failed to send message',
      )
    }
    return payload
  } catch (error) {
    if (isAbortError(error)) throw new Error('Request timed out')
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function fetchSessions(): Promise<GatewaySessionsResponse> {
  const response = await fetch(makeEndpoint('/api/sessions'))
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return (await response.json()) as GatewaySessionsResponse
}

export async function fetchSessionStatus(
  key: string,
): Promise<GatewaySessionStatusResponse> {
  const response = await fetch(makeEndpoint(`/api/session-status?key=${encodeURIComponent(key)}`))
  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const payload = (await response.json()) as Record<string, unknown>
  const normalized =
    payload &&
    typeof payload === 'object' &&
    payload.payload &&
    typeof payload.payload === 'object'
      ? payload.payload
      : payload

  return normalized as GatewaySessionStatusResponse
}

export async function fetchModels(): Promise<GatewayModelsResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 7000)

  try {
    const response = await fetch(makeEndpoint('/api/models'), {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(await readError(response))
    }

    const payload = (await response.json()) as GatewayModelsResponse
    if (payload.ok === false) {
      throw new Error(payload.error || 'Failed to load models')
    }

    return {
      ok: true,
      models: Array.isArray(payload.models) ? payload.models : [],
      configuredProviders: Array.isArray(payload.configuredProviders)
        ? payload.configuredProviders
        : [],
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Gateway disconnected')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function switchModel(
  model: string,
  sessionKey?: string,
): Promise<GatewayModelSwitchResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(makeEndpoint('/api/model-switch'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, sessionKey }),
      signal: controller.signal,
    })

    const payload = (await response
      .json()
      .catch(() => ({}))) as GatewayModelSwitchResponse

    if (!response.ok || payload.ok === false) {
      const message =
        typeof payload.error === 'string' && payload.error.trim().length > 0
          ? payload.error
          : response.statusText || 'Failed to switch model'
      throw new Error(message)
    }

    return payload
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function setDefaultModel(
  model: string,
): Promise<GatewayModelDefaultResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(makeEndpoint('/api/config-patch'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        raw: JSON.stringify({ defaultModel: model }, null, 2),
        reason: 'Studio: set default model',
      }),
      signal: controller.signal,
    })

    const payload = (await response
      .json()
      .catch(() => ({}))) as GatewayModelDefaultResponse

    if (!response.ok || payload.ok === false) {
      const message =
        typeof payload.error === 'string' && payload.error.trim().length > 0
          ? payload.error
          : response.statusText || 'Failed to persist default model'
      throw new Error(message)
    }

    return payload
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function steerAgent(
  sessionKey: string,
  message: string,
): Promise<GatewayAgentActionResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(makeEndpoint('/api/agent-steer'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey, message }),
      signal: controller.signal,
    })

    const payload = (await response
      .json()
      .catch(() => ({}))) as GatewayAgentActionResponse

    if (!response.ok || payload.ok === false) {
      const message =
        typeof payload.error === 'string' && payload.error.trim().length > 0
          ? payload.error
          : response.statusText || 'Failed to send directive'
      throw new Error(message)
    }

    return payload
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function killAgentSession(
  sessionKey: string,
): Promise<GatewayAgentActionResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(makeEndpoint('/api/agent-kill'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey }),
      signal: controller.signal,
    })

    const payload = (await response
      .json()
      .catch(() => ({}))) as GatewayAgentActionResponse

    if (!response.ok || payload.ok === false) {
      const message =
        typeof payload.error === 'string' && payload.error.trim().length > 0
          ? payload.error
          : response.statusText || 'Failed to terminate agent'
      throw new Error(message)
    }

    return payload
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

// ── Gateway Approvals ─────────────────────────────────────────────────────────

export type GatewayApprovalEntry = {
  id: string
  sessionKey?: string
  agentName?: string
  action?: string
  context?: string
  tool?: string
  input?: unknown
  requestedAt?: number
  status?: 'pending' | 'approved' | 'denied'
}

export type GatewayApprovalsResponse = {
  ok?: boolean
  approvals?: GatewayApprovalEntry[]
  pending?: GatewayApprovalEntry[]
}

export async function fetchGatewayApprovals(): Promise<GatewayApprovalsResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(makeEndpoint('/api/gateway/approvals'), {
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, approvals: [] }
    return (await response.json()) as GatewayApprovalsResponse
  } catch {
    return { ok: false, approvals: [] }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function resolveGatewayApproval(
  approvalId: string,
  action: 'approve' | 'deny',
): Promise<{ ok: boolean }> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(makeEndpoint(`/api/gateway/approvals/${approvalId}/${action}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    })
    return { ok: response.ok }
  } catch {
    return { ok: false }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function toggleAgentPause(
  sessionKey: string,
  pause: boolean,
): Promise<GatewayAgentPauseResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(makeEndpoint('/api/agent-pause'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey, pause }),
      signal: controller.signal,
    })

    const payload = (await response
      .json()
      .catch(() => ({}))) as GatewayAgentPauseResponse

    if (!response.ok || payload.ok === false) {
      const message =
        typeof payload.error === 'string' && payload.error.trim().length > 0
          ? payload.error
          : response.statusText || 'Failed to update pause state'
      throw new Error(message)
    }

    return payload
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
