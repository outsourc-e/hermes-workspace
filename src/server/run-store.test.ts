import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalHermesHome = process.env.HERMES_HOME

let tempHome: string | null = null

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetModules()
  tempHome = mkdtempSync(join(tmpdir(), 'hermes-run-store-'))
  process.env.HERMES_HOME = tempHome
})

afterEach(() => {
  vi.useRealTimers()
  if (tempHome) rmSync(tempHome, { recursive: true, force: true })
  tempHome = null
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  vi.resetModules()
})

describe('run text persistence buffer', () => {
  it('coalesces appended deltas into one bounded-interval write', async () => {
    vi.useFakeTimers()
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi.fn(() => Promise.resolve(null))
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.append('Hello')
    buffer.append(', ')
    buffer.append('world')

    expect(write).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(499)
    expect(write).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('Hello, world', { replace: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('lets a full replacement supersede queued appends while preserving later deltas', async () => {
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const writes: Array<{ text: string; replace: boolean }> = []
    const buffer = createRunTextPersistenceBuffer((text, options) => {
      writes.push({ text, replace: options.replace })
      return Promise.resolve(null)
    })

    buffer.append('discarded delta')
    buffer.replace('authoritative snapshot')
    buffer.append(' plus delta')
    await buffer.flush()

    expect(writes).toEqual([
      { text: 'authoritative snapshot plus delta', replace: true },
    ])
  })

  it('flushes queued text immediately and cancels the scheduled write', async () => {
    vi.useFakeTimers()
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi.fn(() => Promise.resolve(null))
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.append('final text')
    await buffer.flush()

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('final text', { replace: false })
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('retries a rejected batch before newer pending text in original order', async () => {
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('temporary persistence failure'))
      .mockResolvedValue(null)
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.replace('authoritative snapshot')
    await expect(buffer.flush()).rejects.toThrow(
      'temporary persistence failure',
    )

    buffer.append(' plus newer delta')
    await buffer.flush()

    expect(write.mock.calls).toEqual([
      ['authoritative snapshot', { replace: true }],
      ['authoritative snapshot', { replace: true }],
      [' plus newer delta', { replace: false }],
    ])
  })

  it('retries a timer-rejected batch during the terminal seal and rejects later text', async () => {
    vi.useFakeTimers()
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('temporary persistence failure'))
      .mockResolvedValue(null)
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.append('persist me')
    await vi.advanceTimersByTimeAsync(500)
    buffer.append(' before terminal')

    await buffer.seal()
    buffer.append(' discarded after terminal')
    await buffer.flush()

    expect(write.mock.calls).toEqual([
      ['persist me', { replace: false }],
      ['persist me', { replace: false }],
      [' before terminal', { replace: false }],
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries an in-flight rejection during seal before newer text in original order', async () => {
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const inFlightWrite = createDeferred()
    const write = vi
      .fn<(text: string, options: { replace: boolean }) => Promise<unknown>>()
      .mockImplementationOnce(() => inFlightWrite.promise)
      .mockResolvedValue(null)
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.replace('authoritative snapshot')
    const timerFlush = buffer.flush()
    expect(write).toHaveBeenCalledTimes(1)

    buffer.append(' plus newer delta')
    const terminalSeal = buffer.seal()
    inFlightWrite.reject(new Error('in-flight persistence failure'))

    await expect(timerFlush).rejects.toThrow('in-flight persistence failure')
    await terminalSeal

    expect(write.mock.calls).toEqual([
      ['authoritative snapshot', { replace: true }],
      ['authoritative snapshot', { replace: true }],
      [' plus newer delta', { replace: false }],
    ])
  })
})

describe('run-store persistence', () => {
  it('preserves concurrent updates to the same run', async () => {
    const { addRunLifecycleEvent, createPersistedRun, getPersistedRun } =
      await import('./run-store')

    await createPersistedRun({ runId: 'run-1', sessionKey: 'session-1' })

    const events = Array.from({ length: 24 }, (_, index) => ({
      text: `event-${index}`,
      emoji: '',
      timestamp: index,
      isError: false,
    }))

    await Promise.all(
      events.map((event) => addRunLifecycleEvent('session-1', 'run-1', event)),
    )

    const stored = await getPersistedRun('session-1', 'run-1')
    expect(stored?.lifecycleEvents.map((event) => event.text).sort()).toEqual(
      events.map((event) => event.text).sort(),
    )
  })
})
