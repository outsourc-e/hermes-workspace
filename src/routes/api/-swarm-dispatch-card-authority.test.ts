import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Route,
  ensureLiveTmuxSession,
  sendPromptToLiveSession,
} from './swarm-dispatch'
import type { SessionCardOperationBinding } from '../../server/session-card-operation-binding'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveBinding: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('node:fs', () => ({
  existsSync: () => true,
  mkdirSync: vi.fn(),
  readFileSync: () => '',
  writeFileSync: vi.fn(),
}))
vi.mock('../../server/session-card-operation-binding', () => ({
  parseSessionCardOperationBinding: (value: unknown) => value,
  resolveExactSessionCardOperationBinding: mocks.resolveBinding,
}))
vi.mock('../../server/swarm-profile-config', () => ({
  ensureSwarmProfileConfig: vi.fn(),
}))
vi.mock('../../server/swarm-roster', () => ({
  rosterByWorkerId: () => new Map(),
}))

const cardBinding: SessionCardOperationBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

type Handler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: Handler } } }
const handler = (Route as unknown as TestRoute).server.handlers.POST

function mutationCommands() {
  return mocks.execFile.mock.calls.flatMap((call) => {
    const args = call[1] as Array<string>
    return ['new-session', 'send-keys', 'load-buffer', 'paste-buffer'].includes(
      args[0]!,
    )
      ? [args[0]]
      : []
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    queueMicrotask(() => (callback as () => void)())
    return 0 as unknown as ReturnType<typeof setTimeout>
  })
  mocks.resolveBinding.mockResolvedValue({ kind: 'session-card-owner' })
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
      return { stdin: { end: vi.fn() }, on: vi.fn() }
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('swarm dispatch tmux mutation authority', () => {
  it('rejects raw worker-only dispatch before any mutation', async () => {
    const response = await handler({
      request: new Request('http://workspace.test/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workerIds: ['builder'],
          prompt: 'raw dispatch',
        }),
      }),
    })

    expect(response.status).toBe(400)
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it.each([
    ['load-buffer', 1],
    ['send-keys clear', 2],
    ['paste-buffer', 3],
    ['send-keys enter', 4],
    ['send-keys confirm', 5],
  ])('rejects exact Card rollover before %s', async (_label, staleAt) => {
    mocks.resolveBinding.mockImplementation(() =>
      mocks.resolveBinding.mock.calls.length === staleAt ? null : {},
    )

    const result = await sendPromptToLiveSession(
      'builder',
      'test prompt',
      cardBinding,
    )

    expect(result).toBeNull()
    expect(mutationCommands()).toHaveLength(staleAt - 1)
  })

  it.each([
    ['new-session', 1, 0],
    ['launch send-keys', 2, 0],
  ])(
    'rejects exact Card rollover before %s',
    async (_label, staleAt, expectedMutations) => {
      let hasSessionCalls = 0
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
          const missing = args[0] === 'has-session' && hasSessionCalls++ === 0
          queueMicrotask(() =>
            resolvedCallback?.(missing ? new Error('missing') : null, '', ''),
          )
          return { stdin: { end: vi.fn() }, on: vi.fn() }
        },
      )
      mocks.resolveBinding.mockImplementation(() =>
        mocks.resolveBinding.mock.calls.length === staleAt ? null : {},
      )

      const result = await ensureLiveTmuxSession('builder', cardBinding)

      expect(result).toMatchObject({ ok: false })
      expect(mutationCommands()).toHaveLength(expectedMutations)
    },
  )
})
