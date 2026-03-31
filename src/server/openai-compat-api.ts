import { HERMES_API } from './gateway-capabilities'

export type OpenAICompatMessage = {
  role: string
  content: string
}

export type OpenAIChatOptions = {
  model?: string
  stream?: boolean
  temperature?: number
  signal?: AbortSignal
}

type OpenAIChatRequest = {
  model: string
  messages: Array<OpenAICompatMessage>
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

function buildRequestBody(
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions,
): OpenAIChatRequest {
  return {
    model: options.model || 'default',
    messages,
    stream: options.stream === true,
    temperature: options.temperature,
  }
}

async function* parseOpenAIStream(
  response: Response,
): AsyncGenerator<string, void, void> {
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

      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null
              }
            }>
          }
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) yield delta
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
): Promise<AsyncGenerator<string, void, void>>
export function openaiChat(
  messages: Array<OpenAICompatMessage>,
  options?: OpenAIChatOptions & { stream?: false },
): Promise<string>
export async function openaiChat(
  messages: Array<OpenAICompatMessage>,
  options: OpenAIChatOptions = {},
): Promise<string | AsyncGenerator<string, void, void>> {
  const response = await fetch(`${HERMES_API}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestBody(messages, options)),
    signal: options.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenAI-compatible chat: ${response.status} ${text}`)
  }

  if (options.stream) {
    return parseOpenAIStream(response)
  }

  const data = await response.json() as OpenAIChatCompletionResponse
  return data.choices?.[0]?.message?.content ?? ''
}
