import { CLAUDE_API } from './gateway-capabilities'

/** Optional bearer token for authenticated OpenAI-compatible endpoints (e.g. Codex OAuth). */
const BEARER_TOKEN = process.env.CLAUDE_API_TOKEN || ''

/** Cached first available model from /v1/models — used as fallback when no model is specified. */
let _cachedDefaultModel: string | null = null

async function getDefaultModel(): Promise<string> {
  if (_cachedDefaultModel) return _cachedDefaultModel
  if (process.env.CLAUDE_DEFAULT_MODEL) {
    _cachedDefaultModel = process.env.CLAUDE_DEFAULT_MODEL
    return _cachedDefaultModel
  }
  try {
    const headers: Record<string, string> = {}
    if (BEARER_TOKEN) headers['Authorization'] = `Bearer ${BEARER_TOKEN}`
    const res = await fetch(`${CLAUDE_API}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(3_000),
    })
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id: string }> }
      if (data.data && data.data.length > 0) {
        // Prefer a known-good chat model over the first alphabetical one
        const preferred = data.data.find((m) =>
          /qwen|llama|mistral|gemma/i.test(m.id),
        )
        _cachedDefaultModel = preferred?.id ?? data.data[0].id
        return _cachedDefaultModel
      }
    }
  } catch {
    /* ignore */
  }
  return 'default'
}

export type OpenAICompatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type OpenAICompatMessage = {
  role: string
  content: string | Array<OpenAICompatContentPart>
}

export type OpenAIChatOptions = {
  model?: string
  stream?: boolean
  temperature?: number
  signal?: AbortSignal
  sessionId?: string
  /** Override the base URL (e.g. for local providers). Bypasses gateway. */
  baseUrl?: string
}

type OpenAIChatRequest = {
  model: string
  messages: Array<{
    role: string
    content: string | Array<OpenAICompatContentPart>
  }>
  stream: boolean
  temperature?: number
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

export async function buildRequestBody(
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions,
): Promise<OpenAIChatRequest> {
  const model =
    options.model && options.model !== 'default'
      ? options.model
      : await getDefaultModel()
  return {
    model,
    messages,
    stream: options.stream === true,
    temperature: options.temperature,
  }
}

export type StreamChunkType =
  | { type: 'content' | 'reasoning'; text: string }
  | { type: 'tool'; name: string; label: string }

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseClaudeToolProgressChunk(payload: string): StreamChunkType | null {
  try {
    const parsed = JSON.parse(payload) as unknown
    const record = readRecord(parsed)
    if (!record) return null
    const name =
      readString(record.tool) || readString(record.name) || 'tool'
    const emoji = readString(record.emoji)
    const labelText = readString(record.label)
    const label = [emoji, labelText].filter(Boolean).join(' ').trim()
    if (!label) return null
    return {
      type: 'tool',
      name,
      label,
    }
  } catch {
    return null
  }
}

export async function* parseOpenAIStream(
  response: Response,
): AsyncGenerator<StreamChunkType, void, void> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

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

      let eventName = ''
      const dataLines: string[] = []

      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('event:')) {
          eventName = trimmed.slice(6).trim()
          continue
        }
        if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trim())
        }
      }

      for (const payload of dataLines) {
        if (!payload || payload === '[DONE]') continue

        if (eventName === 'claude.tool.progress') {
          const toolChunk = parseClaudeToolProgressChunk(payload)
          if (toolChunk) yield toolChunk
          continue
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null
                reasoning?: string | null
                reasoning_content?: string | null
              }
            }>
          }
          const d = parsed.choices?.[0]?.delta
          const content = d?.content || ''
          const reasoning = d?.reasoning || d?.reasoning_content || ''
          // Yield content when available; fall back to reasoning only if no content yet
          if (content) yield { type: 'content' as const, text: content }
          else if (reasoning)
            yield { type: 'reasoning' as const, text: reasoning }
        } catch {
          // Ignore malformed chunks.
        }
      }

      boundary = buffer.indexOf('\n\n')
    }
  }
}

export function openaiChat(
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions & { stream: true },
): Promise<AsyncGenerator<StreamChunkType, void, void>>
export function openaiChat(
  messages: Array<OpenAICompatMessage>,
  options?: OpenAIChatOptions & { stream?: false },
): Promise<string>
export async function openaiChat(
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions = {},
): Promise<string | AsyncGenerator<StreamChunkType, void, void>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (BEARER_TOKEN) {
    headers['Authorization'] = `Bearer ${BEARER_TOKEN}`
  }
  // Only send session header when authenticated — gateways without
  // API_SERVER_KEY reject this header with an auth error.
  if (options.sessionId && BEARER_TOKEN) {
    headers['X-Claude-Session-Id'] = options.sessionId
  }

  const endpoint = options.baseUrl
    ? `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`
    : `${CLAUDE_API}/v1/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(await buildRequestBody(messages, options)),
    signal: options.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenAI-compatible chat: ${response.status} ${text}`)
  }

  if (options.stream) {
    return parseOpenAIStream(response)
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse
  return data.choices?.[0]?.message?.content ?? ''
}
