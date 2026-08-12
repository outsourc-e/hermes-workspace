import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  killWorkerProcess,
  renewWorker,
  requestWorkerHandoff,
  sendToWorker,
  startWorkerProcessNative,
} from './swarm-lifecycle'
import type { SessionCardOperationBinding } from './session-card-operation-binding'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveBinding: vi.fn(),
  appendMemory: vi.fn(),
  mutateRuntime: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
  execFileSync: vi.fn(() => ''),
  spawn: mocks.spawn,
}))
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  existsSync: () => true,
  mkdirSync: vi.fn(),
  readFileSync: () => '{}',
  statSync: () => ({ mtimeMs: 1 }),
}))
vi.mock('./claude-paths', () => ({ getProfilesDir: () => '/profiles' }))
vi.mock('./swarm-environment', () => ({ SWARM_MEMORY_ROOT: '/memory' }))
vi.mock('./swarm-memory', () => ({
  appendSwarmMemoryEvent: mocks.appendMemory,
}))
vi.mock('./swarm-missions', () => ({
  swarmMissionAssignmentAcceptsRuntimeMutation: () => true,
}))
vi.mock('./swarm-runtime-reset', () => ({
  mutateSwarmWorkerRuntime: mocks.mutateRuntime,
}))
vi.mock('./session-card-operation-binding', () => ({
  resolveExactSessionCardOperationBinding: mocks.resolveBinding,
}))

const cardBinding: SessionCardOperationBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

function mutations(): Array<string> {
  return mocks.execFile.mock.calls.map((call) => (call[1] as Array<string>)[0]!)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    queueMicrotask(() => (callback as () => void)())
    return 0 as unknown as ReturnType<typeof setTimeout>
  })
  mocks.resolveBinding.mockResolvedValue({ kind: 'session-card-owner' })
  mocks.mutateRuntime.mockImplementation(
    (
      _profilePath: string,
      mutation: (current: Record<string, unknown>) => unknown,
    ) => {
      const result = mutation({}) as { value: unknown }
      return result.value
    },
  )
  mocks.execFile.mockImplementation(
    (
      _command: string,
      _args: Array<string>,
      callback: (error: Error | null, stdout?: string, stderr?: string) => void,
    ) => {
      queueMicrotask(() => callback(null, '', ''))
      return { stdin: { end: vi.fn() } }
    },
  )
})

afterEach(() => vi.restoreAllMocks())

describe('Swarm lifecycle Card authority', () => {
  it('revalidates before native process spawn', async () => {
    mocks.resolveBinding.mockResolvedValueOnce(null)

    const result = await startWorkerProcessNative('native-spawn', cardBinding)

    expect(result.ok).toBe(false)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('revalidates before native TERM and rollover KILL', async () => {
    const processMock = {
      pid: 123,
      stdin: { writable: true, write: vi.fn() },
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    }
    mocks.spawn.mockReturnValue(processMock)
    expect(
      (await startWorkerProcessNative('native-kill', cardBinding)).ok,
    ).toBe(true)

    mocks.resolveBinding.mockReset()
    mocks.resolveBinding.mockResolvedValueOnce(null)
    expect((await killWorkerProcess('native-kill', cardBinding)).ok).toBe(false)
    expect(processMock.kill).not.toHaveBeenCalled()

    mocks.resolveBinding.mockReset()
    mocks.resolveBinding.mockResolvedValueOnce({}).mockResolvedValueOnce(null)
    expect((await killWorkerProcess('native-kill', cardBinding)).ok).toBe(false)
    expect(processMock.kill).toHaveBeenCalledWith('SIGTERM')
    expect(processMock.kill).not.toHaveBeenCalledWith('SIGKILL')
  })

  it.each([
    ['load-buffer', 1],
    ['send-keys clear', 2],
    ['paste-buffer', 3],
    ['send-keys enter', 4],
  ])('rejects rollover before lifecycle %s', async (_label, staleAt) => {
    mocks.resolveBinding.mockImplementation(() =>
      mocks.resolveBinding.mock.calls.length === staleAt ? null : {},
    )

    const result = await sendToWorker('builder', 'handoff', cardBinding)

    expect(result.ok).toBe(false)
    expect(mutations()).toHaveLength(staleAt - 1)
  })

  it.each([
    ['kill-session', 1],
    ['new-session', 2],
    ['load-buffer', 3],
    ['send-keys clear', 4],
    ['paste-buffer', 5],
    ['send-keys enter', 6],
  ])('rejects rollover before renew %s', async (_label, staleAt) => {
    mocks.resolveBinding.mockImplementation(() =>
      mocks.resolveBinding.mock.calls.length === staleAt ? null : {},
    )

    const result = await renewWorker('builder', cardBinding)

    expect(result.ok).toBe(false)
    expect(mutations()).toHaveLength(staleAt - 1)
  })

  it('rejects runtime cancellation before the next terminal mutation', async () => {
    mocks.mutateRuntime.mockImplementation(
      (
        _profilePath: string,
        mutation: (current: Record<string, unknown>) => unknown,
      ) => {
        const current =
          mocks.mutateRuntime.mock.calls.length === 4
            ? { acceptsCheckpoints: false }
            : {}
        return (mutation(current) as { value: unknown }).value
      },
    )

    const result = await sendToWorker('builder', 'handoff', cardBinding)

    expect(result.ok).toBe(false)
    expect(mutations()).toEqual(['load-buffer', 'send-keys', 'paste-buffer'])
  })

  it('does not let renew adopt a replacement runtime generation', async () => {
    mocks.mutateRuntime.mockImplementation(
      (
        _profilePath: string,
        mutation: (current: Record<string, unknown>) => unknown,
      ) => {
        const current =
          mocks.mutateRuntime.mock.calls.length === 1
            ? {}
            : { currentMissionId: 'replacement', currentAssignmentId: 'new' }
        return (mutation(current) as { value: unknown }).value
      },
    )

    const result = await renewWorker('builder', cardBinding)

    expect(result.ok).toBe(false)
    expect(mutations()).toEqual(['kill-session'])
  })

  it('does not publish a success-shaped handoff event after failed delivery', async () => {
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: Array<string>,
        callback: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        queueMicrotask(() =>
          callback(new Error('delivery failed'), '', 'failed'),
        )
        return { stdin: { end: vi.fn() } }
      },
    )

    const result = await requestWorkerHandoff('builder', cardBinding)

    expect(result.ok).toBe(false)
    expect(mocks.appendMemory).not.toHaveBeenCalled()
  })
})
