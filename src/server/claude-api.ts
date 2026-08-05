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
  probeGateway,
} from './gateway-capabilities'
import {
  createSession as createDashboardSession,
  deleteSession as deleteDashboardSession,
  getLatestDescendant as getDashboardLatestDescendant,
  getSession as getDashboardSession,
  getSessionExport as getDashboardSessionExport,
  getSessionMessages as getDashboardSessionMessages,
  listSessions as listDashboardSessions,
  searchSessions as searchDashboardSessions,
  updateSession as updateDashboardSession,
} from './claude-dashboard-api'
import type { SessionLineage, SessionSummary } from '../screens/chat/types'

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
  relationship_type?: string | null
  parent_title?: string | null
  parent_source?: string | null
  session_source?: string | null
  _lineage_root_id?: string | null
  _lineage_tip_id?: string | null
  _compression_segment_count?: number | null
  _parent_lineage_root_id?: string | null
  _parent_lineage_tip_id?: string | null
  _cross_surface_child_session?: boolean | null
  pre_compression_snapshot?: boolean | null
  last_active?: number | null
  preview?: string | null
}

export type ClaudeSessionSummary = SessionSummary & {
  key: string
  friendlyId: string
  [key: string]: unknown
}

export type ClaudeMessage = {
  /** Stable when supplied by the upstream; some dashboard rows omit it. */
  id?: number | string
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

export type ClaudeSessionSource = 'dashboard' | 'gateway'

export type ClaudeSessionPage = {
  sessions: Array<ClaudeSession>
  source: ClaudeSessionSource
  limit: number
  offset: number
  total?: number
  snapshot?: string
  hasMore: boolean
  pagination: 'supported'
}

export type ClaudeMessagesResult = {
  messages: Array<ClaudeMessage>
  source: ClaudeSessionSource
  resolvedSessionId?: string
  total?: number
  truncated?: boolean
}

export type GetMessagesOptions = {
  /** Read the requested persisted segment instead of resolving it to a resume tip. */
  exact?: boolean
}

export class ClaudeMessageIdentityError extends Error {
  constructor(requestedSessionId: string, returnedSessionId: string) {
    super(
      `Gateway history segment mismatch (${requestedSessionId} requested, ${returnedSessionId} returned).`,
    )
    this.name = 'ClaudeMessageIdentityError'
  }
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

export async function listSessionsPage(
  limit = 50,
  offset = 0,
  pinnedSource?: ClaudeSessionSource,
): Promise<ClaudeSessionPage> {
  const source =
    pinnedSource ??
    (getCapabilities().dashboard.available ? 'dashboard' : 'gateway')
  if (source === 'dashboard') {
    const resp = await listDashboardSessions(limit, offset)
    const sessions = resp.sessions as Array<ClaudeSession>
    return {
      sessions,
      source: 'dashboard',
      limit: resp.limit,
      offset: resp.offset,
      total: resp.total,
      ...(typeof resp.snapshot === 'string' ? { snapshot: resp.snapshot } : {}),
      hasMore: resp.offset + sessions.length < resp.total,
      pagination: 'supported',
    }
  }
  const resp = await claudeGet<{
    items?: Array<ClaudeSession>
    data?: Array<ClaudeSession>
    total?: number
    snapshot?: string
  }>(`/api/sessions?limit=${limit}&offset=${offset}`)
  // The gateway (OpenAI-compat) returns { object: 'list', data: [...] }, while the
  // dashboard / older gateway shape uses { items: [...] }. Accept either, and never
  // return undefined (callers .map over this).
  const sessions = resp.items ?? resp.data ?? []
  return {
    sessions,
    source: 'gateway',
    limit,
    offset,
    ...(typeof resp.total === 'number' ? { total: resp.total } : {}),
    ...(typeof resp.snapshot === 'string' ? { snapshot: resp.snapshot } : {}),
    hasMore:
      typeof resp.total === 'number'
        ? offset + sessions.length < resp.total
        : sessions.length >= limit,
    pagination: 'supported',
  }
}

/** Preserve the existing array-returning wrapper for all non-card callers. */
export async function listSessions(
  limit = 50,
  offset = 0,
): Promise<Array<ClaudeSession>> {
  return (await listSessionsPage(limit, offset)).sessions
}

export async function getSession(sessionId: string): Promise<ClaudeSession> {
  if (getCapabilities().dashboard.available) {
    return getDashboardSession(sessionId) as Promise<ClaudeSession>
  }
  const resp = await claudeGet<{ session: ClaudeSession }>(
    `/api/sessions/${sessionId}`,
  )
  return resp.session
}

export async function createSession(opts?: {
  id?: string
  title?: string
  model?: string
}): Promise<ClaudeSession> {
  if (getCapabilities().dashboard.available) {
    const resp = await createDashboardSession(opts || {})
    return resp.session as ClaudeSession
  }
  const resp = await claudePost<{ session: ClaudeSession }>(
    '/api/sessions',
    opts || {},
  )
  return resp.session
}

export async function updateSession(
  sessionId: string,
  updates: { title?: string },
): Promise<ClaudeSession> {
  if (getCapabilities().dashboard.available) {
    const resp = await updateDashboardSession(sessionId, updates)
    return resp.session as ClaudeSession
  }
  const resp = await claudePatch<{ session: ClaudeSession }>(
    `/api/sessions/${sessionId}`,
    updates,
  )
  return resp.session
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (getCapabilities().dashboard.available) {
    await deleteDashboardSession(sessionId)
    return
  }
  return claudeDeleteReq(`/api/sessions/${sessionId}`)
}

export async function getMessagesResult(
  sessionId: string,
  pinnedSource?: ClaudeSessionSource,
  options?: GetMessagesOptions,
): Promise<ClaudeMessagesResult> {
  const source =
    pinnedSource ??
    (getCapabilities().dashboard.available ? 'dashboard' : 'gateway')
  if (source === 'dashboard') {
    if (options?.exact) {
      const resp = await getDashboardSessionExport(sessionId)
      return {
        messages: resp.messages as Array<ClaudeMessage>,
        source: 'dashboard',
        ...(typeof resp.id === 'string' ? { resolvedSessionId: resp.id } : {}),
      }
    }
    const resp = await getDashboardSessionMessages(sessionId)
    const messages = resp.messages as Array<ClaudeMessage>
    return {
      messages,
      source: 'dashboard',
      ...(typeof resp.session_id === 'string'
        ? { resolvedSessionId: resp.session_id }
        : {}),
      ...messagePageMetadata(resp, messages.length),
    }
  }
  const resp = await claudeGet<{
    items?: Array<ClaudeMessage>
    data?: Array<ClaudeMessage>
    messages?: Array<ClaudeMessage>
    total?: number
    truncated?: boolean
    has_more?: boolean
    hasMore?: boolean
    session_id?: string
  }>(`/api/sessions/${sessionId}/messages`)
  // Gateway (OpenAI-compat) returns { object: 'list', data: [...] }; dashboard / older
  // shape uses { items: [...] }; some message endpoints use { messages: [...] }.
  // Accept any, and never return undefined (callers read .length / .map / .slice).
  const messages = resp.items ?? resp.data ?? resp.messages ?? []
  const hasReturnedSessionId = Object.prototype.hasOwnProperty.call(
    resp,
    'session_id',
  )
  if (
    options?.exact &&
    hasReturnedSessionId &&
    (typeof resp.session_id !== 'string' || resp.session_id !== sessionId)
  ) {
    const returned =
      typeof resp.session_id === 'string' && resp.session_id.length > 0
        ? resp.session_id
        : 'invalid'
    throw new ClaudeMessageIdentityError(sessionId, returned)
  }
  const metadata = messagePageMetadata(resp, messages.length)
  return {
    messages,
    source: 'gateway',
    ...(typeof resp.session_id === 'string'
      ? { resolvedSessionId: resp.session_id }
      : options?.exact
        ? { resolvedSessionId: sessionId }
        : {}),
    ...metadata,
    // Exact Card-history reads are authoritative only with positive source
    // evidence that the response was not silently bounded. Interactive legacy
    // reads retain their prior best-effort metadata shape.
    ...(options?.exact && metadata.truncated === undefined
      ? { truncated: true }
      : {}),
  }
}

/** Preserve the existing array-returning wrapper for all non-card callers. */
export async function getMessages(
  sessionId: string,
): Promise<Array<ClaudeMessage>> {
  return (await getMessagesResult(sessionId)).messages
}

export async function searchSessions(
  query: string,
  limit = 20,
): Promise<{ query?: string; count?: number; results: Array<unknown> }> {
  if (getCapabilities().dashboard.available) {
    return searchDashboardSessions(query)
  }
  return claudeGet(
    `/api/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  )
}

export type LatestDescendantResolution = {
  requestedSessionId: string
  sessionId: string
  path: Array<string>
  changed: boolean
  supported: boolean
}

function unsupportedDescendant(
  requestedSessionId: string,
): LatestDescendantResolution {
  return {
    requestedSessionId,
    sessionId: requestedSessionId,
    path: [requestedSessionId],
    changed: false,
    supported: false,
  }
}

/**
 * Resolve through the dashboard's read-only lineage endpoint when explicitly
 * advertised. History navigation must remain usable on older or broken
 * deployments, so every unsupported/error/malformed path safely returns the
 * requested ID.
 */
export async function getLatestDescendant(
  sessionId: string,
): Promise<LatestDescendantResolution> {
  try {
    const capabilities = await ensureGatewayProbed()
    if (!capabilities.latestDescendant || !capabilities.dashboard.available) {
      return unsupportedDescendant(sessionId)
    }

    const result = await getDashboardLatestDescendant(sessionId)
    const validPath =
      Array.isArray(result.path) &&
      result.path.length > 0 &&
      result.path.every(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0,
      )
    const valid =
      result.requested_session_id === sessionId &&
      typeof result.session_id === 'string' &&
      result.session_id.trim().length > 0 &&
      validPath &&
      result.path[0] === sessionId &&
      result.path[result.path.length - 1] === result.session_id &&
      typeof result.changed === 'boolean' &&
      result.changed === (result.session_id !== sessionId)

    if (!valid) return unsupportedDescendant(sessionId)
    return {
      requestedSessionId: sessionId,
      sessionId: result.session_id,
      path: result.path,
      changed: result.changed,
      supported: true,
    }
  } catch {
    return unsupportedDescendant(sessionId)
  }
}

export type ForkSessionOptions = {
  title?: string
}

export type ForkSessionResult = {
  session: ClaudeSession
  forkedFrom: string | null
}

export class SessionForkUnavailableError extends Error {
  constructor() {
    super('Whole-session fork is unavailable on this Hermes backend.')
    this.name = 'SessionForkUnavailableError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function messagePageMetadata(
  value: unknown,
  messageCount: number,
): Pick<ClaudeMessagesResult, 'total' | 'truncated'> {
  if (!isRecord(value)) return {}
  const total =
    typeof value.total === 'number' &&
    Number.isSafeInteger(value.total) &&
    value.total >= 0
      ? value.total
      : undefined
  const explicitTruncated =
    typeof value.truncated === 'boolean'
      ? value.truncated
      : typeof value.has_more === 'boolean'
        ? value.has_more
        : typeof value.hasMore === 'boolean'
          ? value.hasMore
          : undefined
  const truncated =
    total === undefined
      ? explicitTruncated
      : total !== messageCount || explicitTruncated === true
  return {
    ...(total === undefined ? {} : { total }),
    ...(truncated === undefined ? {} : { truncated }),
  }
}

function parseForkParentIdentity(
  value: unknown,
  expectedParent: string,
): string | null {
  if (value === undefined || value === null) return null
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value !== expectedParent
  ) {
    throw new Error(
      'Hermes fork response did not identify the requested parent session.',
    )
  }
  return value
}

/** Whole-session fork deliberately targets only the advertised gateway API. */
export async function forkSession(
  sessionId: string,
  options?: ForkSessionOptions,
): Promise<ForkSessionResult> {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.sessionFork) {
    throw new SessionForkUnavailableError()
  }

  const result = await claudePost<unknown>(
    `/api/sessions/${encodeURIComponent(sessionId)}/fork`,
    options ?? {},
  )
  if (!isRecord(result) || !isRecord(result.session)) {
    throw new Error('Hermes fork response was malformed.')
  }
  const childId = result.session.id
  if (typeof childId !== 'string' || childId.trim().length === 0) {
    throw new Error('Hermes fork response did not include a child session ID.')
  }
  if (childId.trim() === sessionId) {
    throw new Error('Hermes fork response identified the parent as its child.')
  }

  const explicitParent = parseForkParentIdentity(result.forked_from, sessionId)
  const sessionParent = parseForkParentIdentity(
    result.session.parent_session_id,
    sessionId,
  )
  if (explicitParent === null && sessionParent === null) {
    throw new Error(
      'Hermes fork response did not identify the requested parent session.',
    )
  }

  return {
    session: result.session as ClaudeSession,
    forkedFrom: explicitParent,
  }
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
export function toSessionSummary(session: ClaudeSession): ClaudeSessionSummary {
  const hasLineageFacts =
    session.parent_session_id != null ||
    session.relationship_type != null ||
    session.parent_title != null ||
    session.parent_source != null ||
    session.session_source != null ||
    session._lineage_root_id != null ||
    session._lineage_tip_id != null ||
    session._compression_segment_count != null ||
    session._parent_lineage_root_id != null ||
    session._parent_lineage_tip_id != null ||
    session._cross_surface_child_session != null ||
    session.pre_compression_snapshot != null ||
    session.source != null ||
    session.end_reason != null

  const lineage: SessionLineage | undefined = hasLineageFacts
    ? {
        ...(session.parent_session_id
          ? { parentSessionId: session.parent_session_id }
          : {}),
        ...(session.relationship_type
          ? { relationshipType: session.relationship_type }
          : {}),
        ...(session.parent_title ? { parentTitle: session.parent_title } : {}),
        ...(session.parent_source
          ? { parentSource: session.parent_source }
          : {}),
        ...(session.session_source
          ? { sessionSource: session.session_source }
          : {}),
        ...(session._lineage_root_id
          ? { lineageRootId: session._lineage_root_id }
          : {}),
        ...(session._lineage_tip_id
          ? { lineageTipId: session._lineage_tip_id }
          : {}),
        ...(typeof session._compression_segment_count === 'number'
          ? { compressionSegmentCount: session._compression_segment_count }
          : {}),
        ...(session._parent_lineage_root_id
          ? { parentLineageRootId: session._parent_lineage_root_id }
          : {}),
        ...(session._parent_lineage_tip_id
          ? { parentLineageTipId: session._parent_lineage_tip_id }
          : {}),
        ...(typeof session._cross_surface_child_session === 'boolean'
          ? { isCrossSurfaceChild: session._cross_surface_child_session }
          : {}),
        ...(typeof session.pre_compression_snapshot === 'boolean'
          ? { isPreCompressionSnapshot: session.pre_compression_snapshot }
          : {}),
        ...(session.source ? { source: session.source } : {}),
        ...(session.end_reason ? { endReason: session.end_reason } : {}),
        ...(typeof session.started_at === 'number'
          ? { startedAt: session.started_at * 1000 }
          : {}),
        ...(typeof session.ended_at === 'number'
          ? { endedAt: session.ended_at * 1000 }
          : {}),
      }
    : undefined

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
    ...(lineage ? { lineage } : {}),
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
      const file = path.join(dir, `sse-${sessionId}-${Date.now()}.log`)
      toolDebugStream = fs.createWriteStream(file, { flags: 'a' })
      console.log(`[claude-api][tool-debug] writing SSE dump to ${file}`)
      toolDebugStream.write(
        `# session=${sessionId} ts=${new Date().toISOString()}\n`,
      )
    } catch (err) {
      console.warn('[claude-api][tool-debug] failed to open dump file:', err)
    }
  }

  for (;;) {
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
            dataStr.length > 4000
              ? dataStr.slice(0, 4000) + '...[trunc]'
              : dataStr
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
      throw new Error(
        `Hermes dashboard PATCH /api/config: ${res.status} ${body}`,
      )
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
