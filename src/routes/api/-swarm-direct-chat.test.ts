import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-direct-chat'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  readWorkerMessages: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('node:fs', () => ({
  existsSync: () => true,
  readFileSync: () => '#!/bin/sh\n',
}))
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))
vi.mock('../../server/swarm-chat-reader', () => ({
  readWorkerMessages: mocks.readWorkerMessages,
}))
vi.mock('../../server/swarm-roster', () => ({
  rosterByWorkerId: () => new Map(),
}))

type PostHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { options: { server: { handlers: { POST: PostHandler } } } }
const handler = (Route as unknown as TestRoute).options.server.handlers.POST

function request() {
  return new Request('http://workspace.test/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workerId: 'builder',
      prompt: 'Run the focused checks',
      limit: 30,
      timeoutMs: 1_000,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.execFile.mockImplementation(
    (
      _command: string,
      _args: Array<string>,
      optionsOrCallback: unknown,
      callback?: (
        error: Error | null,
        stdout?: string,
        stderr?: string,
      ) => void,
    ) => {
      const resolvedCallback =
        typeof optionsOrCallback === 'function'
          ? (optionsOrCallback as typeof callback)
          : callback
      queueMicrotask(() => resolvedCallback?.(null, '', ''))
      return { stdin: { end: vi.fn() } }
    },
  )
  const rawMessages = [
    {
      id: 'raw-message-id',
      role: 'assistant',
      content: 'Raw state.db content',
      timestamp: 1,
    },
  ]
  mocks.readWorkerMessages.mockReturnValue({
    sessionId: 'raw-session-id',
    sessionTitle: 'Raw session title',
    messages: rawMessages,
    ok: true,
  })
})

describe('POST /api/swarm-direct-chat control response', () => {
  it('preserves delivery control without returning a raw transcript or session identity', async () => {
    const response = await handler({ request: request() })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      workerId: 'builder',
      delivered: true,
      delivery: 'tmux',
    })
    expect(body).not.toHaveProperty('sessionId')
    expect(body).not.toHaveProperty('sessionTitle')
    expect(body).not.toHaveProperty('messages')
    expect(body).not.toHaveProperty('source')
    expect(JSON.stringify(body)).not.toContain('raw-message-id')
    expect(JSON.stringify(body)).not.toContain('raw-session-id')
  })

  it('does not leak the baseline transcript when delivery fails', async () => {
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: Array<string>,
        optionsOrCallback: unknown,
        callback?: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        const resolvedCallback =
          typeof optionsOrCallback === 'function'
            ? (optionsOrCallback as typeof callback)
            : callback
        queueMicrotask(() =>
          resolvedCallback?.(new Error('tmux unavailable'), '', ''),
        )
        return { stdin: { end: vi.fn() } }
      },
    )

    const response = await handler({ request: request() })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      ok: false,
      workerId: 'builder',
      delivered: false,
      error: 'tmux unavailable',
    })
    expect(body).not.toHaveProperty('sessionId')
    expect(body).not.toHaveProperty('sessionTitle')
    expect(body).not.toHaveProperty('messages')
    expect(body).not.toHaveProperty('source')
  })
})
