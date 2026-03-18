/**
 * Hermes FastAPI Client
 *
 * HTTP client for the Hermes FastAPI backend (default: http://127.0.0.1:8642).
 * Replaces legacy WebSocket connection for the Hermes Workspace fork.
 */

import {
  ensureGatewayProbed,
  getCapabilities,
  HERMES_API,
  probeGateway,
  SESSIONS_API_UNAVAILABLE_MESSAGE,
} from './gateway-capabilities'

// ── Types ─────────────────────────────────────────────────────────

export type HermesSession = {
  id: string
  source?: string
  user_id?: string | null
  model?: string | null
  title?: string | null
  started_at?: number
  ended_at?: number | null
  end_reason?: string | null
  message_count?: number
  tool_call_count?: number
  input_tokens?: number
  output_tokens?: number
  parent_session_id?: string | null
  last_active?: number | null
}

export type HermesMessage = {
  id: number
  session_id: string
  role: string
  content: string | null
  tool_call_id?: string | null
  tool_calls?: unknown[] | string | null
  tool_name?: string | null
  timestamp: number
  token_count?: number | null
  finish_reason?: string | null
}

export type HermesConfig = {
  model?: string
  provider?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────

async function hermesGet<T>(path: string): Promise<T> {
  const res = await fetch(`${HERMES_API}${path}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Hermes API ${path}: ${res.status} ${body}`)
  }
  return res.json() as Promise<T>
}

async function hermesPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${HERMES_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes API POST ${path}: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function hermesPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HERMES_API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes API PATCH ${path}: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function hermesDeleteReq(path: string): Promise<void> {
  const res = await fetch(`${HERMES_API}${path}`, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes API DELETE ${path}: ${res.status} ${text}`)
  }
}

// ── Health ────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string }> {
  return hermesGet('/health')
}

// ── Sessions ─────────────────────────────────────────────────────

export async function listSessions(limit = 50, offset = 0): Promise<HermesSession[]> {
  const resp = await hermesGet<{ items: HermesSession[]; total: number }>(
    `/api/sessions?limit=${limit}&offset=${offset}`,
  )
  return resp.items
}

export async function getSession(sessionId: string): Promise<HermesSession> {
  const resp = await hermesGet<{ session: HermesSession }>(`/api/sessions/${sessionId}`)
  return resp.session
}

export async function createSession(opts?: {
  id?: string
  title?: string
  model?: string
}): Promise<HermesSession> {
  const resp = await hermesPost<{ session: HermesSession }>('/api/sessions', opts || {})
  return resp.session
}

export async function updateSession(
  sessionId: string,
  updates: { title?: string },
): Promise<HermesSession> {
  const resp = await hermesPatch<{ session: HermesSession }>(
    `/api/sessions/${sessionId}`,
    updates,
  )
  return resp.session
}

export async function deleteSession(sessionId: string): Promise<void> {
  return hermesDeleteReq(`/api/sessions/${sessionId}`)
}

export async function getMessages(sessionId: string): Promise<HermesMessage[]> {
  const resp = await hermesGet<{ items: HermesMessage[]; total: number }>(
    `/api/sessions/${sessionId}/messages`,
  )
  return resp.items
}

export async function searchSessions(
  query: string,
  limit = 20,
): Promise<{ query: string; count: number; results: unknown[] }> {
  return hermesGet(
    `/api/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  )
}

export async function forkSession(
  sessionId: string,
): Promise<{ session: HermesSession; forked_from: string }> {
  return hermesPost(`/api/sessions/${sessionId}/fork`)
}

// ── Conversion helpers (Hermes → Chat format) ─────────────────

/** Convert a HermesMessage to the ChatMessage format the frontend expects */
export function toChatMessage(
  msg: HermesMessage,
  options?: { historyIndex?: number },
): Record<string, unknown> {
  // Accept either parsed arrays from FastAPI or legacy JSON strings.
  let toolCalls: unknown[] | undefined
  if (Array.isArray(msg.tool_calls)) {
    toolCalls = msg.tool_calls
  } else if (msg.tool_calls && typeof msg.tool_calls === 'string') {
    try {
      toolCalls = JSON.parse(msg.tool_calls)
    } catch {
      toolCalls = undefined
    }
  }

  // Build content array
  const content: Array<Record<string, unknown>> = []

  // Build streamToolCalls array for separate pill rendering (outside bubble)
  const streamToolCallsArr: Array<Record<string, unknown>> = []
  if (msg.role === 'assistant' && toolCalls && Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const fn = (tc as Record<string, unknown>).function as
        | Record<string, unknown>
        | undefined
      streamToolCallsArr.push({
        id: (tc as Record<string, unknown>).id || `tc-${Math.random().toString(36).slice(2, 8)}`,
        name: fn?.name || 'tool',
        args: fn?.arguments,
        phase: 'complete',
      })
    }
  }

  if (msg.role === 'tool') {
    content.push({
      type: 'tool_result',
      toolCallId: msg.tool_call_id,
      toolName: msg.tool_name,
      text: msg.content || '',
    })
  }

  if (msg.content && msg.role !== 'tool') {
    content.push({ type: 'text', text: msg.content })
  }

  return {
    id: `msg-${msg.id}`,
    role: msg.role,
    content,
    text: msg.content || '',
    timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
    createdAt: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : undefined,
    sessionKey: msg.session_id,
    ...(typeof options?.historyIndex === 'number'
      ? { __historyIndex: options.historyIndex }
      : {}),
    ...(streamToolCallsArr.length > 0 ? { streamToolCalls: streamToolCallsArr } : {}),
  }
}

/** Convert a HermesSession to the session summary format the frontend expects */
export function toSessionSummary(session: HermesSession): Record<string, unknown> {
  return {
    key: session.id,
    friendlyId: session.id,
    kind: 'chat',
    status: session.ended_at ? 'ended' : 'idle',
    model: session.model || '',
    label: session.title || session.id,
    title: session.title || session.id,
    derivedTitle: session.title || session.id,
    tokenCount: (session.input_tokens ?? 0) + (session.output_tokens ?? 0),
    totalTokens: (session.input_tokens ?? 0) + (session.output_tokens ?? 0),
    cost: 0,
    createdAt: session.started_at ? session.started_at * 1000 : Date.now(),
    startedAt: session.started_at ? session.started_at * 1000 : Date.now(),
    updatedAt: session.ended_at
      ? session.ended_at * 1000
      : session.started_at
        ? session.started_at * 1000
        : Date.now(),
    usage: {
      promptTokens: session.input_tokens ?? 0,
      completionTokens: session.output_tokens ?? 0,
      totalTokens: (session.input_tokens ?? 0) + (session.output_tokens ?? 0),
    },
  }
}

// ── Chat (streaming) ─────────────────────────────────────────────

type StreamChatOptions = {
  signal?: AbortSignal
  onEvent: (payload: { event: string; data: Record<string, unknown> }) => void
}

/**
 * Send a chat message and stream SSE events from Hermes FastAPI.
 * Returns a promise that resolves when the stream ends.
 */
export async function streamChat(
  sessionId: string,
  body: { message: string; model?: string; system_message?: string },
  opts: StreamChatOptions,
): Promise<void> {
  const res = await fetch(`${HERMES_API}/api/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes chat stream: ${res.status} ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const dataStr = line.slice(6)
        if (dataStr === '[DONE]') continue
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>
          opts.onEvent({ event: currentEvent || 'message', data })
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
}

/** Non-streaming chat */
export async function sendChat(
  sessionId: string,
  messageOrOpts: string | { message: string; model?: string },
  model?: string,
): Promise<Record<string, unknown>> {
  const msg = typeof messageOrOpts === 'string' ? messageOrOpts : messageOrOpts.message
  const mdl = typeof messageOrOpts === 'string' ? model : messageOrOpts.model
  return hermesPost(`/api/sessions/${sessionId}/chat`, { message: msg, model: mdl })
}

// ── Memory ───────────────────────────────────────────────────────

export async function getMemory(): Promise<unknown> {
  return hermesGet('/api/memory')
}

// ── Skills ───────────────────────────────────────────────────────

export async function listSkills(): Promise<unknown> {
  return hermesGet('/api/skills')
}

export async function getSkill(name: string): Promise<unknown> {
  return hermesGet(`/api/skills/${encodeURIComponent(name)}`)
}

export async function getSkillCategories(): Promise<unknown> {
  return hermesGet('/api/skills/categories')
}

// ── Config ───────────────────────────────────────────────────────

export async function getConfig(): Promise<HermesConfig> {
  return hermesGet<HermesConfig>('/api/config')
}

// ── Models ───────────────────────────────────────────────────────

export async function listModels(): Promise<{
  object: string
  data: Array<{ id: string; object: string }>
}> {
  return hermesGet('/v1/models')
}

// ── Connection check ─────────────────────────────────────────────

export async function isHermesAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${HERMES_API}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    await probeGateway({ force: true })
    return true
  } catch {
    return false
  }
}

export {
  ensureGatewayProbed,
  getCapabilities as getGatewayCapabilities,
  HERMES_API,
  SESSIONS_API_UNAVAILABLE_MESSAGE,
}
