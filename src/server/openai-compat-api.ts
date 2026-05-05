import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CLAUDE_API } from './gateway-capabilities'

/**
 * Optional bearer token for authenticated OpenAI-compatible endpoints
 * (e.g. Codex OAuth, Hermes Agent gateway with API_SERVER_KEY set).
 *
 * Read at call time, not module-load time: under vite-node SSR the
 * top-level `process.env` snapshot can be empty when this module is
 * first evaluated, freezing a `const` to '' even though the env is
 * populated by the time requests actually run. Reading inside the
 * function avoids that.
 *
 * Resolution order:
 * 1. `HERMES_API_TOKEN` env var
 * 2. `CLAUDE_API_TOKEN` env var (back-compat)
 * 3. Codex OAuth access token from `~/.codex/auth.json`
 */
function getBearerToken(): string {
  const fromEnv = process.env.HERMES_API_TOKEN || process.env.CLAUDE_API_TOKEN
  if (fromEnv) return fromEnv

  // Fall back to Codex OAuth token when no env var is set.
  // This bridges the gap for users who authenticated via `codex login`
  // but don't have HERMES_API_TOKEN configured.
  try {
    const codexAuthPath = join(homedir(), '.codex', 'auth.json')
    if (existsSync(codexAuthPath)) {
      const auth = JSON.parse(readFileSync(codexAuthPath, 'utf-8')) as {
        tokens?: { access_token?: string }
      }
      if (auth.tokens?.access_token) return auth.tokens.access_token
    }
  } catch {
    // Silently ignore — no Codex auth available
  }

  return ''
}

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
    const bearer = getBearerToken()
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`
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
  | {
      type: 'tool'
      name: string
      label: string
      toolCallId?: string
      // Lifecycle phase from the upstream gateway. Vanilla Hermes Agent
      // emits 'running' at tool start and 'completed' at tool finish via
      // the `hermes.tool.progress` SSE event (#16588). Older builds that
      // sent `claude.tool.progress` did not carry status — we treat
      // missing/unknown values as a one-shot 'running' so existing flows
      // keep working.
      status?: 'running' | 'completed'
    }

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
    const toolCallId =
      readString(record.toolCallId) ||
      readString(record.tool_call_id) ||
      undefined
    const statusRaw = readString(record.status).toLowerCase()
    const status =
      statusRaw === 'running'
        ? ('running' as const)
        : statusRaw === 'completed' || statusRaw === 'complete'
          ? ('completed' as const)
          : undefined
    // Accept the chunk as long as we have either a label OR a stable
    // tool_call_id + status. Vanilla 'completed' events ship without
    // emoji/label and would otherwise be dropped, leaving cards stuck
    // in 'running'.
    if (!label && !toolCallId) return null
    return {
      type: 'tool',
      name,
      label: label || name,
      toolCallId,
      status,
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

        if (
          eventName === 'claude.tool.progress' ||
          eventName === 'hermes.tool.progress'
        ) {
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
  const bearer = getBearerToken()
  if (bearer) {
    headers['Authorization'] = `Bearer ${bearer}`
  }
  // Only send session header when authenticated — gateways without
  // API_SERVER_KEY reject this header with an auth error.
  if (options.sessionId && bearer) {
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
