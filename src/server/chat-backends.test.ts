import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamChatUnified } from './chat-backends'

type StreamEvent = {
  event: string
  data: Record<string, unknown>
}

type StreamEventHandler = (payload: StreamEvent) => void | Promise<void>

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  resolveChatBackend: vi.fn(),
  openaiChat: vi.fn(),
}))

vi.mock('./claude-api', () => ({
  streamChat: mocks.streamChat,
}))

vi.mock('./chat-mode', () => ({
  resolveChatBackend: mocks.resolveChatBackend,
}))

vi.mock('./openai-compat-api', () => ({
  openaiChat: mocks.openaiChat,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveChatBackend.mockReturnValue('claude-enhanced')
})

describe('enhanced chat stream buffering', () => {
  it('does not replay the completed response after streamed deltas are drained', async () => {
    const completion = deferred<void>()
    let onEvent: StreamEventHandler | undefined
    mocks.streamChat.mockImplementation(
      (
        _sessionId: string,
        _body: Record<string, unknown>,
        options: { onEvent: StreamEventHandler },
      ) => {
        onEvent = options.onEvent
        return completion.promise
      },
    )

    const stream = await streamChatUnified(
      [{ role: 'user', content: 'Say hello' }],
      { sessionId: 'session-1' },
    )
    const firstChunk = stream.next()
    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))

    await onEvent?.({
      event: 'assistant.delta',
      data: { delta: 'Hello' },
    })
    await expect(firstChunk).resolves.toEqual({ done: false, value: 'Hello' })

    const terminalResult = stream.next()
    await onEvent?.({
      event: 'assistant.completed',
      data: { content: 'Hello' },
    })
    completion.resolve()

    await expect(terminalResult).resolves.toEqual({
      done: true,
      value: undefined,
    })
  })

  it('uses completed content when the upstream emitted no deltas', async () => {
    const completion = deferred<void>()
    let onEvent: StreamEventHandler | undefined
    mocks.streamChat.mockImplementation(
      (
        _sessionId: string,
        _body: Record<string, unknown>,
        options: { onEvent: StreamEventHandler },
      ) => {
        onEvent = options.onEvent
        return completion.promise
      },
    )

    const stream = await streamChatUnified(
      [{ role: 'user', content: 'Say hello' }],
      { sessionId: 'session-2' },
    )
    const firstChunk = stream.next()
    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))

    await onEvent?.({
      event: 'assistant.completed',
      data: { content: 'Hello without deltas' },
    })

    await expect(firstChunk).resolves.toEqual({
      done: false,
      value: 'Hello without deltas',
    })

    const terminalResult = stream.next()
    await onEvent?.({
      event: 'assistant.completed',
      data: { content: 'Hello without deltas' },
    })
    completion.resolve()

    await expect(terminalResult).resolves.toEqual({
      done: true,
      value: undefined,
    })
  })
})
