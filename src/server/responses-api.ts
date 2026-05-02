/**
 * Vanilla Hermes Agent /v1/responses streaming client.
 *
 * The OpenAI Responses API path (POST /v1/responses + stream:true) is the
 * structured streaming surface the upstream Hermes Agent emits when it
 * wants frontends to render tool calls *during* a run. Unlike the
 * /v1/chat/completions surface, it carries:
 *
 *   - full tool args (as JSON in `arguments`)
 *   - stable call_id for matching start/done/result
 *   - tool result text (`function_call_output`)
 *
 * That is everything the Hermes Workspace TUI tool card needs to render
 * mid-run with INPUT JSON expanded and live duration counters.
 *
 * This module is the thin consumer side. It talks to the gateway, parses
 * the SSE stream, and yields a normalized `ResponsesStreamEvent` so
 * `send-stream.ts` can translate to its existing `tool.*` events without
 * caring about Responses-spec quirks.
 */
import { BEARER_TOKEN, CLAUDE_API } from './gateway-capabilities'

export type ResponsesStreamEvent =
  | { kind: 'text.delta'; delta: string }
  | {
      kind: 'tool.started'
      callId: string
      name: string
      // Parsed when the upstream argument JSON is well-formed; falls back
      // to the raw string otherwise so callers can still display *something*.
      args: Record<string, unknown> | string | null
      itemId: string
    }
  | {
      kind: 'tool.completed'
      callId: string
      name: string
    }
  | {
      kind: 'tool.output'
      callId: string
      // Concatenated text from `output[*].text` parts. Workspace cards
      // render this as the tool result body.
      output: string
    }
  | { kind: 'completed' }
  | { kind: 'failed'; error: string }

export type ResponsesChatRequest = {
  input: string
  conversationHistory?: Array<{ role: string; content: string }>
  instructions?: string
  model?: string
  sessionId?: string
  signal?: AbortSignal
}

const _authHeaders = (): Record<string, string> =>
  BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}

function tryParseJson(value: string): Record<string, unknown> | string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return value
    }
  }
  return value
}

function extractOutputText(output: unknown): string {
  if (typeof output === 'string') return output
  if (!Array.isArray(output)) return ''
  const parts: Array<string> = []
  for (const part of output) {
    if (!part || typeof part !== 'object') continue
    const rec = part as Record<string, unknown>
    if (typeof rec.text === 'string') parts.push(rec.text)
    else if (typeof rec.output === 'string') parts.push(rec.output)
  }
  return parts.join('')
}

/**
 * POST /v1/responses with stream=true and yield normalized events.
 *
 * The Responses API spec is large but we only consume a focused subset:
 *   - `response.output_text.delta`             -> text.delta
 *   - `response.output_item.added`/`.done` for `function_call`  -> tool.started / tool.completed
 *   - `response.output_item.added` for `function_call_output`  -> tool.output
 *   - `response.completed`                                     -> completed
 *   - `response.failed`                                        -> failed
 *
 * Anything else is ignored. We deliberately key tool events by `call_id`
 * (not the function_call item's `id`) because that's what binds a started
 * call to its later output.
 */
export async function* streamResponses(
  req: ResponsesChatRequest,
): AsyncGenerator<ResponsesStreamEvent, void, void> {
  const headers: Record<string, string> = {
    ..._authHeaders(),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (req.sessionId && BEARER_TOKEN) {
    headers['X-Hermes-Session-Id'] = req.sessionId
  }

  const body: Record<string, unknown> = {
    input: req.input,
    stream: true,
    store: false,
  }
  if (req.conversationHistory) body.conversation_history = req.conversationHistory
  if (req.instructions) body.instructions = req.instructions
  if (req.model) body.model = req.model
  if (req.sessionId) body.session_id = req.sessionId

  const res = await fetch(`${CLAUDE_API}/v1/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`responses stream: ${res.status} ${text}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body for /v1/responses stream')

  const decoder = new TextDecoder()
  let buffer = ''

  // Map function_call item.id -> call_id so we can reconcile `done`
  // events that only carry the item, not the call_id.
  const itemIdToCallId = new Map<string, string>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      // The Responses SSE stream marks the type both as `event: <name>`
      // *and* in the JSON `type` field. We rely on the JSON because
      // it's always present, even when intermediate proxies strip the
      // `event:` lines.
      const dataLines: Array<string> = []
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).trim())
      }
      for (const payload of dataLines) {
        if (!payload || payload === '[DONE]') continue
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(payload) as Record<string, unknown>
        } catch {
          continue
        }
        const eventType =
          typeof parsed.type === 'string' ? (parsed.type as string) : ''

        if (eventType === 'response.output_text.delta') {
          const delta = typeof parsed.delta === 'string' ? parsed.delta : ''
          if (delta) yield { kind: 'text.delta', delta }
          continue
        }

        if (eventType === 'response.output_item.added') {
          const item = parsed.item as Record<string, unknown> | undefined
          if (!item || typeof item !== 'object') continue
          const itemType = typeof item.type === 'string' ? item.type : ''

          if (itemType === 'function_call') {
            const callId =
              typeof item.call_id === 'string' ? item.call_id : ''
            const itemId = typeof item.id === 'string' ? item.id : ''
            if (callId && itemId) itemIdToCallId.set(itemId, callId)
            const argsRaw =
              typeof item.arguments === 'string' ? item.arguments : ''
            yield {
              kind: 'tool.started',
              callId: callId || itemId,
              name: typeof item.name === 'string' ? item.name : 'tool',
              args: tryParseJson(argsRaw),
              itemId: itemId || callId,
            }
            continue
          }

          if (itemType === 'function_call_output') {
            const callId =
              typeof item.call_id === 'string' ? item.call_id : ''
            const output = extractOutputText(item.output)
            if (callId) yield { kind: 'tool.output', callId, output }
            continue
          }
          continue
        }

        if (eventType === 'response.output_item.done') {
          const item = parsed.item as Record<string, unknown> | undefined
          if (!item || typeof item !== 'object') continue
          const itemType = typeof item.type === 'string' ? item.type : ''
          if (itemType !== 'function_call') continue
          const callId =
            typeof item.call_id === 'string'
              ? item.call_id
              : itemIdToCallId.get(
                  typeof item.id === 'string' ? item.id : '',
                ) || ''
          if (!callId) continue
          yield {
            kind: 'tool.completed',
            callId,
            name: typeof item.name === 'string' ? item.name : 'tool',
          }
          continue
        }

        if (eventType === 'response.completed') {
          yield { kind: 'completed' }
          continue
        }
        if (eventType === 'response.failed') {
          const err =
            typeof parsed.error === 'string'
              ? (parsed.error as string)
              : 'Response failed'
          yield { kind: 'failed', error: err }
          continue
        }
      }

      boundary = buffer.indexOf('\n\n')
    }
  }
}
