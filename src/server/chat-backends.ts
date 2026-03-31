import { streamChat } from './hermes-api'
import { resolveChatBackend } from './chat-mode'
import { openaiChat } from './openai-compat-api'

export type ChatMessage = {
  role: string
  content: string
}

export type UnifiedChatOptions = {
  model?: string
  temperature?: number
  signal?: AbortSignal
  sessionId?: string
  systemMessage?: string
  attachments?: Array<Record<string, unknown>>
}

async function* streamHermesChat(
  messages: Array<ChatMessage>,
  options: UnifiedChatOptions,
): AsyncGenerator<string, void, void> {
  if (!options.sessionId) {
    throw new Error('Hermes enhanced chat requires sessionId')
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  if (!lastUserMessage) {
    throw new Error('Hermes enhanced chat requires a user message')
  }

  const queue: Array<string> = []
  let done = false
  let failure: Error | null = null
  let notify: (() => void) | null = null

  void streamChat(
    options.sessionId,
    {
      message: lastUserMessage.content,
      model: options.model,
      system_message: options.systemMessage,
      attachments: options.attachments,
    },
    {
      signal: options.signal,
      onEvent({ event, data }) {
        if (event === 'assistant.delta' && typeof data.delta === 'string' && data.delta) {
          queue.push(data.delta)
          notify?.()
          notify = null
        }
        if (event === 'assistant.completed' && typeof data.content === 'string' && data.content && queue.length === 0) {
          queue.push(data.content)
          notify?.()
          notify = null
        }
      },
    },
  ).then(
    () => {
      done = true
      notify?.()
      notify = null
    },
    (error: unknown) => {
      failure = error instanceof Error ? error : new Error(String(error))
      done = true
      notify?.()
      notify = null
    },
  )

  while (!done || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift() as string
      continue
    }

    await new Promise<void>((resolve) => {
      notify = resolve
    })
  }

  if (failure) throw failure
}

export async function sendChatUnified(
  messages: Array<ChatMessage>,
  options: UnifiedChatOptions = {},
): Promise<string> {
  const backend = resolveChatBackend()

  if (backend === 'openai-compat') {
    return openaiChat(messages, {
      model: options.model,
      temperature: options.temperature,
      signal: options.signal,
      stream: false,
    })
  }

  if (backend === 'hermes-enhanced') {
    let text = ''
    for await (const delta of streamHermesChat(messages, options)) {
      text += delta
    }
    return text
  }

  throw new Error('No chat backend available')
}

export async function streamChatUnified(
  messages: Array<ChatMessage>,
  options: UnifiedChatOptions = {},
): Promise<AsyncGenerator<string, void, void>> {
  const backend = resolveChatBackend()

  if (backend === 'openai-compat') {
    return openaiChat(messages, {
      model: options.model,
      temperature: options.temperature,
      signal: options.signal,
      stream: true,
    })
  }

  if (backend === 'hermes-enhanced') {
    return streamHermesChat(messages, options)
  }

  throw new Error('No chat backend available')
}
