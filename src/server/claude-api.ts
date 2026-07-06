/**
 * Hermes Agent FastAPI Client
 *
 * HTTP client for the Hermes Agent FastAPI backend (default: http://127.0.0.1:8642).
 * Replaces legacy WebSocket connection for the Hermes Workspace fork.
 */

import {
  BEARER_TOKEN,
  CLAUDE_API,
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
  markDashboardUnauthenticated,
  probeGateway,
} from './gateway-capabilities'
import {
  DashboardAuthError,
  createSession as createDashboardSession,
  deleteSession as deleteDashboardSession,
  forkSession as forkDashboardSession,
  getSession as getDashboardSession,
  getSessionMessages as getDashboardSessionMessages,
  listSessions as listDashboardSessions,
  searchSessions as searchDashboardSessions,
  updateSession as updateDashboardSession,
} from './claude-dashboard-api'

const _authHeaders = (): Record<string, string> =>
  BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}

console.log(`[claude-api] Configured API: ${CLAUDE_API}`)

// ── Types ─────────────────────────────────────────────────────────

export type ClaudeSession = {
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
  preview?: string | null
}

export type ClaudeMessage = {
  id: number
  session_id: string
  role: string
  content: string | null
  tool_call_id?: string | null
  tool_calls?: Array<unknown> | string | null
  tool_name?: string | null
  timestamp: number
  token_count?: number | null
  finish_reason?: string | null
}

export type ClaudeConfig = {
  model?: string
  provider?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────

async function claudeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLAUDE_API}${path}`, { headers: _authHeaders() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Hermes Agent API ${path}: ${res.status} ${body}`)
  }
  return res.json() as Promise<T>
}

async function claudePost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CLAUDE_API}${path}`, {
    method: 'POST',
    headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes Agent API POST ${path}: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function claudePatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CLAUDE_API}${path}`, {
    method: 'PATCH',
    headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes Agent API PATCH ${path}: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function claudeDeleteReq(path: string): Promise<void> {
  const res = await fetch(`${CLAUDE_API}${path}`, {
    method: 'DELETE',
    headers: _authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes Agent API DELETE ${path}: ${res.status} ${text}`)
  }
}

// ── Health ────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string }> {
  return claudeGet('/health')
}

// ── Sessions ─────────────────────────────────────────────────────

/**
 * Route to the dashboard only when its auth-gated APIs are actually usable.
 * `available` alone means "process reachable" (public /api/status) — on
 * remote/Tailscale deployments the dashboard is typically reachable but
 * cookie-gated, and dashboard calls would 401 (no_cookie). See #261-family
 * Sessions-tab failures.
 */
function dashboardSessionsUsable(): boolean {
  const d = getCapabilities().dashboard
  return d.available && d.authenticated
}

/**
 * Try the dashboard variant of a session call; on auth rejection, degrade
 * the capability and fall back to the gateway variant. DashboardAuthError
 * never reaches callers — on cookie-gated deployments the gateway is the
 * source of truth for sessions. Non-auth errors are rethrown so real
 * dashboard outages stay visible.
 */
async function sessionCall<T>(
  viaDashboard: () => Promise<T>,
  viaGateway: () => Promise<T>,
): Promise<T> {
  if (dashboardSessionsUsable()) {
    try {
      return await viaDashboard()
    } catch (err) {
      if (!(err instanceof DashboardAuthError)) throw err
      markDashboardUnauthenticated()
    }
  }
  return viaGateway()
}

/**
 * Return the first array found under the given keys, else []. Callers
 * .map/.slice/.length over these results — undefined must never escape.
 */
function asArray<T>(
  resp: unknown,
  keys: ReadonlyArray<string>,
): Array<T> {
  const r = resp as Record<string, unknown> | null | undefined
  for (const k of keys) {
    const v = r?.[k]
    if (Array.isArray(v)) return v as Array<T>
  }
  return []
}

export async function listSessions(
  limit = 50,
  offset = 0,
): Promise<Array<ClaudeSession>> {
  return sessionCall(
    async () =>
      asArray<ClaudeSession>(await listDashboardSessions(limit, offset), [
        'sessions',
        'items',
        'data',
      ]),
    async () =>
      asArray<ClaudeSession>(
        await claudeGet(`/api/sessions?limit=${limit}&offset=${offset}`),
        // Gateway (OpenAI-compat) returns { object: 'list', data: [...] };
        // dashboard / older gateway shape uses { items: [...] }.
        ['items', 'data', 'sessions'],
      ),
  )
}

export async function getSession(sessionId: string): Promise<ClaudeSession> {
  return sessionCall(
    async () => (await getDashboardSession(sessionId)) as ClaudeSession,
    async () => {
      const resp = await claudeGet<{ session?: ClaudeSession }>(
        `/api/sessions/${sessionId}`,
      )
      // Gateway wraps in { session: {...} }; be liberal if a backend returns
      // the bare session object.
      return (resp.session ?? (resp as unknown)) as ClaudeSession
    },
  )
}

export async function createSession(opts?: {
  id?: string
  title?: string
  model?: string
}): Promise<ClaudeSession> {
  return sessionCall(
    async () =>
      (await createDashboardSession(opts || {})).session as ClaudeSession,
    async () => {
      const resp = await claudePost<{ session: ClaudeSession }>(
        '/api/sessions',
        opts || {},
      )
      return resp.session
    },
  )
}

export async function updateSession(
  sessionId: string,
  updates: { title?: string },
): Promise<ClaudeSession> {
  return sessionCall(
    async () =>
      (await updateDashboardSession(sessionId, updates))
        .session as ClaudeSession,
    async () => {
      const resp = await claudePatch<{ session: ClaudeSession }>(
        `/api/sessions/${sessionId}`,
        updates,
      )
      return resp.session
    },
  )
}

export async function deleteSession(sessionId: string): Promise<void> {
  return sessionCall(
    async () => {
      await deleteDashboardSession(sessionId)
    },
    async () => claudeDeleteReq(`/api/sessions/${sessionId}`),
  )
}

export async function getMessages(
  sessionId: string,
): Promise<Array<ClaudeMessage>> {
  return sessionCall(
    async () =>
      asArray<ClaudeMessage>(await getDashboardSessionMessages(sessionId), [
        'messages',
        'items',
        'data',
      ]),
    async () =>
      asArray<ClaudeMessage>(
        await claudeGet(`/api/sessions/${sessionId}/messages`),
        // Gateway (OpenAI-compat) returns { object: 'list', data: [...] };
        // dashboard / older shape uses { items: [...] }; some message
        // endpoints use { messages: [...] }.
        ['items', 'data', 'messages'],
      ),
  )
}

export async function searchSessions(
  query: string,
  limit = 20,
): Promise<{ query?: string; count?: number; results: Array<unknown> }> {
  const normalize = (resp: {
    query?: string
    count?: number
    results?: Array<unknown>
  }) => ({ ...resp, results: resp.results ?? [] })
  return sessionCall(
    async () => normalize(await searchDashboardSessions(query)),
    async () =>
      normalize(
        await claudeGet(
          `/api/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        ),
      ),
  )
}

export async function forkSession(
  sessionId: string,
): Promise<{ session: ClaudeSession; forked_from: string }> {
  return sessionCall(
    async () =>
      (await forkDashboardSession(sessionId)) as {
        session: ClaudeSession
        forked_from: string
      },
    async () => claudePost(`/api/sessions/${sessionId}/fork`),
  )
}

// ── Conversion helpers (Claude → Chat format) ─────────────────

/** Convert a ClaudeMessage to the ChatMessage format the frontend expects */
export function toChatMessage(
  msg: ClaudeMessage,
  options?: { historyIndex?: number },
): Record<string, unknown> {
  // Accept either parsed arrays from FastAPI or legacy JSON strings.
  let toolCalls: Array<unknown> | undefined
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

  // Build streamToolCalls array for separate pill rendering and content blocks
  const streamToolCallsArr: Array<Record<string, unknown>> = []
  if (msg.role === 'assistant' && toolCalls && Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const record = tc as Record<string, unknown>
      const fn = record.function as Record<string, unknown> | undefined
      const toolCallId =
        record.id || `tc-${Math.random().toString(36).slice(2, 8)}`
      const toolName = fn?.name || (record.name as string | undefined) || 'tool'
      const toolArgs = fn?.arguments
      streamToolCallsArr.push({
        id: toolCallId,
        name: toolName,
        args: toolArgs,
        phase: 'complete',
      })
      content.push({
        type: 'toolCall',
        id: toolCallId,
        name: toolName,
        arguments:
          toolArgs && typeof toolArgs === 'object'
            ? (toolArgs as Record<string, unknown>)
            : undefined,
        partialJson: typeof toolArgs === 'string' ? toolArgs : undefined,
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
    createdAt: msg.timestamp
      ? new Date(msg.timestamp * 1000).toISOString()
      : undefined,
    sessionKey: msg.session_id,
    ...(typeof options?.historyIndex === 'number'
      ? { __historyIndex: options.historyIndex }
      : {}),
    ...(streamToolCallsArr.length > 0
      ? { streamToolCalls: streamToolCallsArr }
      : {}),
  }
}

/** Convert a ClaudeSession to the session summary format the frontend expects */
export function toSessionSummary(
  session: ClaudeSession,
): Record<string, unknown> {
  return {
    key: session.id,
    friendlyId: session.id,
    kind: 'chat',
    status: session.ended_at ? 'ended' : 'idle',
    model: session.model || '',
    label: session.title || undefined,
    title: session.title || undefined,
    derivedTitle: session.title || session.preview || undefined,
    preview: session.preview || undefined,
    tokenCount: (session.input_tokens ?? 0) + (session.output_tokens ?? 0),
    totalTokens: (session.input_tokens ?? 0) + (session.output_tokens ?? 0),
    message_count: session.message_count ?? 0,
    tool_call_count: session.tool_call_count ?? 0,
    messageCount: session.message_count ?? 0,
    toolCallCount: session.tool_call_count ?? 0,
    cost: 0,
    createdAt: session.started_at ? session.started_at * 1000 : Date.now(),
    startedAt: session.started_at ? session.started_at * 1000 : Date.now(),
    updatedAt: session.last_active
      ? session.last_active * 1000
      : session.ended_at
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
  onEvent: (payload: {
    event: string
    data: Record<string, unknown>
  }) => void | Promise<void>
}

/**
 * Send a chat message and stream SSE events from Hermes Agent FastAPI.
 * Returns a promise that resolves when the stream ends.
 */
export async function streamChat(
  sessionId: string,
  body: {
    message: string
    model?: string
    system_message?: string
    attachments?: Array<Record<string, unknown>>
  },
  opts: StreamChatOptions,
): Promise<void> {
  const res = await fetch(
    `${CLAUDE_API}/api/sessions/${sessionId}/chat/stream`,
    {
      method: 'POST',
      headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes chat stream: ${res.status} ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  // Debug tap: when HERMES_TOOL_DEBUG=1, dump every raw SSE event to a file so
  // we can inspect what vanilla Hermes Agent actually emits during tool calls
  // (event names + data shapes) without changing any agent code.
  const toolDebug = process.env.HERMES_TOOL_DEBUG === '1'
  let toolDebugStream: NodeJS.WritableStream | null = null
  if (toolDebug) {
    try {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const os = await import('node:os')
      const dir = path.join(os.tmpdir(), 'hermes-tool-debug')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(
        dir,
        `sse-${sessionId}-${Date.now()}.log`,
      )
      toolDebugStream = fs.createWriteStream(file, { flags: 'a' })
      console.log(`[claude-api][tool-debug] writing SSE dump to ${file}`)
      toolDebugStream.write(`# session=${sessionId} ts=${new Date().toISOString()}\n`)
    } catch (err) {
      console.warn('[claude-api][tool-debug] failed to open dump file:', err)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
        if (toolDebugStream) toolDebugStream.write(`event: ${currentEvent}\n`)
      } else if (line.startsWith('data: ')) {
        const dataStr = line.slice(6)
        if (dataStr === '[DONE]') {
          if (toolDebugStream) toolDebugStream.write('data: [DONE]\n\n')
          continue
        }
        if (toolDebugStream) {
          // Truncate very long payloads so the dump stays human-readable.
          const trimmed =
            dataStr.length > 4000 ? dataStr.slice(0, 4000) + '...[trunc]' : dataStr
          toolDebugStream.write(`data: ${trimmed}\n\n`)
        }
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>
          await opts.onEvent({ event: currentEvent || 'message', data })
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
  if (toolDebugStream) {
    try {
      toolDebugStream.end()
    } catch {
      // ignore close errors
    }
  }
}

/** Non-streaming chat */
export async function sendChat(
  sessionId: string,
  messageOrOpts: string | { message: string; model?: string },
  model?: string,
): Promise<Record<string, unknown>> {
  const msg =
    typeof messageOrOpts === 'string' ? messageOrOpts : messageOrOpts.message
  const mdl = typeof messageOrOpts === 'string' ? model : messageOrOpts.model
  return claudePost(`/api/sessions/${sessionId}/chat`, {
    message: msg,
    model: mdl,
  })
}

// ── Memory ───────────────────────────────────────────────────────

export async function getMemory(): Promise<unknown> {
  return claudeGet('/api/memory')
}

// ── Skills ───────────────────────────────────────────────────────

export async function listSkills(): Promise<unknown> {
  return claudeGet('/api/skills')
}

export async function getSkill(name: string): Promise<unknown> {
  return claudeGet(`/api/skills/${encodeURIComponent(name)}`)
}

export async function getSkillCategories(): Promise<unknown> {
  return claudeGet('/api/skills/categories')
}

// ── Config ───────────────────────────────────────────────────────

export async function getConfig(): Promise<ClaudeConfig> {
  if (getCapabilities().dashboard.available) {
    const res = await dashboardFetch('/api/config')
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Hermes dashboard /api/config: ${res.status} ${body}`)
    }
    return res.json() as Promise<ClaudeConfig>
  }
  return claudeGet<ClaudeConfig>('/api/config')
}

export async function patchConfig(
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (getCapabilities().dashboard.available) {
    const res = await dashboardFetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Hermes dashboard PATCH /api/config: ${res.status} ${body}`)
    }
    return res.json() as Promise<Record<string, unknown>>
  }
  return claudePatch<Record<string, unknown>>('/api/config', patch)
}

// ── Models ───────────────────────────────────────────────────────

export async function listModels(): Promise<{
  object: string
  data: Array<{ id: string; object: string }>
}> {
  return claudeGet('/v1/models')
}

// ── Connection check ─────────────────────────────────────────────

export async function isClaudeAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${CLAUDE_API}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      await probeGateway({ force: true })
      return false
    }
    await probeGateway({ force: true })
    return true
  } catch {
    await probeGateway({ force: true }).catch(() => undefined)
    return false
  }
}

export {
  ensureGatewayProbed,
  getCapabilities as getGatewayCapabilities,
  CLAUDE_API,
  SESSIONS_API_UNAVAILABLE_MESSAGE,
}
