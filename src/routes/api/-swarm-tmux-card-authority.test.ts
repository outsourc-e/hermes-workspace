import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as ScrollRoute } from './swarm-tmux-scroll'
import { Route as StartRoute } from './swarm-tmux-start'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveBinding: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('node:fs', () => ({
  existsSync: () => true,
  readFileSync: () => "cd '/tmp'",
}))
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
  requireLocalOrAuth: () => true,
}))
vi.mock('../../server/session-card-operation-binding', () => ({
  parseSessionCardOperationBinding: (value: unknown) =>
    value && typeof value === 'object' ? value : null,
  resolveExactSessionCardOperationBinding: mocks.resolveBinding,
}))
vi.mock('../../server/swarm-roster', () => ({
  rosterByWorkerId: () => new Map([['builder', { wrapper: 'builder' }]]),
}))
vi.mock('../../server/swarm-model-resolver', () => ({
  parseSwarmModelLabel: () => null,
}))
vi.mock('../../server/swarm-profile-config', () => ({
  syncSwarmProfileModel: vi.fn(),
}))

type Handler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: Handler } } }
const startHandler = (StartRoute as unknown as TestRoute).server.handlers.POST
const scrollHandler = (ScrollRoute as unknown as TestRoute).server.handlers.POST

const cardBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://workspace.test/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function commandWasRun(command: string): boolean {
  return mocks.execFile.mock.calls.some(
    (call) => Array.isArray(call[1]) && call[1][0] === command,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveBinding.mockResolvedValue({
    kind: 'session-card-owner',
    cardId: cardBinding.cardId,
    parentCardId: null,
  })
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
      queueMicrotask(() =>
        resolvedCallback?.(
          args[0] === 'has-session' ? new Error('missing') : null,
          '',
          '',
        ),
      )
      return { stdin: { end: vi.fn() }, on: vi.fn() }
    },
  )
})

describe('Swarm tmux Card authority', () => {
  it('rejects raw-only start and scroll requests before tmux mutation', async () => {
    const start = await startHandler({
      request: request('swarm-tmux-start', { workerId: 'builder' }),
    })
    const scroll = await scrollHandler({
      request: request('swarm-tmux-scroll', {
        workerId: 'builder',
        direction: 'up',
      }),
    })

    expect(start.status).toBe(400)
    expect(scroll.status).toBe(400)
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('revalidates immediately before tmux new-session', async () => {
    mocks.resolveBinding
      .mockResolvedValueOnce({ kind: 'session-card-owner' })
      .mockResolvedValueOnce(null)

    const response = await startHandler({
      request: request('swarm-tmux-start', {
        workerId: 'builder',
        cardBinding,
      }),
    })

    expect(response.status).toBe(409)
    expect(commandWasRun('new-session')).toBe(false)
  })

  it.each([
    ['copy-mode', 2],
    ['send-keys', 3],
  ])('rejects rollover before scroll %s', async (command, staleAt) => {
    mocks.resolveBinding.mockImplementation(() =>
      mocks.resolveBinding.mock.calls.length === staleAt ? null : {},
    )

    const response = await scrollHandler({
      request: request('swarm-tmux-scroll', {
        workerId: 'builder',
        cardBinding,
        direction: 'up',
      }),
    })

    expect(response.status).toBe(409)
    expect(commandWasRun(command)).toBe(false)
  })
})
