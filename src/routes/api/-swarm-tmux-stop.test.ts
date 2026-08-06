import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from './swarm-tmux-stop'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveCard: vi.fn(),
  resolveChildCard: vi.fn(),
  patchSwarmRuntimeFile: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('node:fs', () => ({ existsSync: () => true }))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('../../server/session-card-service', () => ({
  sessionCardService: {
    resolveCard: mocks.resolveCard,
    resolveChildCard: mocks.resolveChildCard,
  },
}))
vi.mock('../../server/swarm-foundation', () => ({
  getSwarmProfilePath: () => '/profiles/builder',
  patchSwarmRuntimeFile: mocks.patchSwarmRuntimeFile,
}))

type StopHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: StopHandler } } }
const handler = (Route as unknown as TestRoute).server.handlers.POST

const cardBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

function resolvedCard(cardId = cardBinding.cardId) {
  return {
    card: {
      cardId,
      canonicalSource: 'local',
      canonicalSegmentKey: 'local:builder',
      continuationSegmentKeys: [cardId, 'local:builder'],
      continuationCount: 2,
      relationshipKind: 'root',
    },
    collection: { completeness: 'complete', retryable: false },
  }
}

function request(body: Record<string, unknown>): Request {
  return new Request('http://workspace.test/api/swarm-tmux-stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveCard.mockResolvedValue(resolvedCard())
  mocks.patchSwarmRuntimeFile.mockReturnValue({ ok: true })
  mocks.execFile.mockImplementation(
    (
      _command: string,
      args: Array<string>,
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
})

describe('POST /api/swarm-tmux-stop Card authority', () => {
  it('stops only the exact current Card-owned worker runtime', async () => {
    const response = await handler({
      request: request({ workerId: 'builder', cardBinding }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      workerId: 'builder',
      sessionName: 'swarm-builder',
      wasRunning: true,
      killed: true,
    })
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
    expect(mocks.execFile).toHaveBeenCalledWith(
      expect.any(String),
      ['kill-session', '-t', 'swarm-builder'],
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('fails closed for a raw mutable worker alias request', async () => {
    const response = await handler({
      request: request({ workerId: 'builder' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid Session Card stop binding',
    })
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('rejects rollover after has-session without killing the reassigned runtime', async () => {
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(resolvedCard('local:replacement-card'))

    const response = await handler({
      request: request({ workerId: 'builder', cardBinding }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Session Card stop binding is unavailable',
    })
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
    expect(
      mocks.execFile.mock.calls.some(
        (call) => Array.isArray(call[1]) && call[1][0] === 'kill-session',
      ),
    ).toBe(false)
    expect(mocks.patchSwarmRuntimeFile).not.toHaveBeenCalled()
  })
})
