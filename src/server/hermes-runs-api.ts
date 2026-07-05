import { CLAUDE_API } from './gateway-capabilities'
import { getBearerToken } from './openai-compat-api'

export type HermesRunEvent =
  | { kind: 'started'; runId: string }
  | { kind: 'text.delta'; delta: string; runId: string }
  | { kind: 'tool.started'; runId: string; callId: string; name: string; preview?: string }
  | { kind: 'tool.completed'; runId: string; callId: string; name: string; error?: boolean }
  | { kind: 'reasoning'; runId: string; text: string }
  | { kind: 'approval.request'; runId: string; approval: Record<string, unknown> }
  | { kind: 'approval.responded'; runId: string; choice: string }
  | { kind: 'completed'; runId: string; output: string }
  | { kind: 'failed'; runId: string; error: string }

export type HermesRunRequest = {
  input: string
  conversationHistory?: Array<{ role: string; content: string }>
  instructions?: string
  model?: string
  sessionId?: string
  signal?: AbortSignal
}

export class HermesRunStartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HermesRunStartError'
  }
}

const authHeaders = (): Record<string, string> => {
  const bearer = getBearerToken()
  return bearer ? { Authorization: `Bearer ${bearer}` } : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseSseData(rawEvent: string): Array<Record<string, unknown>> {
  const payloads: Array<Record<string, unknown>> = []
  const dataLines: Array<string> = []
  for (const line of rawEvent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).trim())
  }
  for (const payload of dataLines) {
    if (!payload || payload === '[DONE]') continue
    try {
      const parsed = JSON.parse(payload) as unknown
      const record = readRecord(parsed)
      if (record) payloads.push(record)
    } catch {
      // Ignore malformed or comment-only SSE frames.
    }
  }
  return payloads
}

function normalizeRunEvent(event: Record<string, unknown>): HermesRunEvent | null {
  const eventName = readString(event.event)
  const runId = readString(event.run_id) || readString(event.runId)
  if (!eventName || !runId) return null

  if (eventName === 'message.delta') {
    const delta = readString(event.delta)
    return delta ? { kind: 'text.delta', runId, delta } : null
  }
  if (eventName === 'tool.started') {
    const name = readString(event.tool) || readString(event.name) || 'tool'
    const callId =
      readString(event.tool_call_id) ||
      readString(event.call_id) ||
      readString(event.id) ||
      `${runId}:${name}`
    return {
      kind: 'tool.started',
      runId,
      callId,
      name,
      preview: readString(event.preview) || undefined,
    }
  }
  if (eventName === 'tool.completed') {
    const name = readString(event.tool) || readString(event.name) || 'tool'
    const callId =
      readString(event.tool_call_id) ||
      readString(event.call_id) ||
      readString(event.id) ||
      `${runId}:${name}`
    return {
      kind: 'tool.completed',
      runId,
      callId,
      name,
      error: event.error === true,
    }
  }
  if (eventName === 'reasoning.available') {
    const text = readString(event.text)
    return text ? { kind: 'reasoning', runId, text } : null
  }
  if (eventName === 'approval.request') {
    const requestApprovalId =
      readString(event.approval_id) ||
      readString(event.approvalId) ||
      readString(event.id)
    return {
      kind: 'approval.request',
      runId,
      approval: {
        ...event,
        id: requestApprovalId || runId,
        approvalId: runId,
        approvalRunId: runId,
        requestApprovalId: requestApprovalId || undefined,
        runId,
      },
    }
  }
  if (eventName === 'approval.responded') {
    return {
      kind: 'approval.responded',
      runId,
      choice: readString(event.choice),
    }
  }
  if (eventName === 'run.completed') {
    return {
      kind: 'completed',
      runId,
      output: readString(event.output),
    }
  }
  if (eventName === 'run.failed') {
    return {
      kind: 'failed',
      runId,
      error: readString(event.error) || 'Run failed',
    }
  }
  return null
}

export async function* streamHermesRun(
  req: HermesRunRequest,
): AsyncGenerator<HermesRunEvent, void, void> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (req.sessionId) {
    headers['X-Hermes-Session-Id'] = req.sessionId
  }

  const body: Record<string, unknown> = {
    input: req.input,
  }
  if (req.conversationHistory) body.conversation_history = req.conversationHistory
  if (req.instructions) body.instructions = req.instructions
  if (req.model) body.model = req.model
  if (req.sessionId) body.session_id = req.sessionId

  const startRes = await fetch(`${CLAUDE_API}/v1/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  })
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => '')
    throw new HermesRunStartError(`/v1/runs start failed: ${startRes.status} ${text}`)
  }
  const started = (await startRes.json()) as { run_id?: string }
  const runId = readString(started.run_id)
  if (!runId) {
    throw new HermesRunStartError('/v1/runs start response did not include run_id')
  }
  yield { kind: 'started', runId }

  const eventsRes = await fetch(`${CLAUDE_API}/v1/runs/${encodeURIComponent(runId)}/events`, {
    method: 'GET',
    headers: {
      ...authHeaders(),
      Accept: 'text/event-stream',
    },
    signal: req.signal,
  })
  if (!eventsRes.ok) {
    const text = await eventsRes.text().catch(() => '')
    throw new Error(`/v1/runs events failed: ${eventsRes.status} ${text}`)
  }

  const reader = eventsRes.body?.getReader()
  if (!reader) throw new Error('No response body for /v1/runs events stream')

  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      for (const payload of parseSseData(rawEvent)) {
        const normalized = normalizeRunEvent(payload)
        if (normalized) yield normalized
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

export async function submitHermesRunApproval(
  runId: string,
  choice: 'once' | 'session' | 'always' | 'deny',
): Promise<void> {
  const res = await fetch(`${CLAUDE_API}/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ choice }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`approval response failed: ${res.status} ${text}`)
  }
}
