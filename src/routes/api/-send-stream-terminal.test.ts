import { describe, expect, it, vi } from 'vitest'

import { createRunTerminalTransitionCoordinator } from './-send-stream-terminal'

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('run terminal transition coordinator', () => {
  it('lets cancellation seal transcript writes and retain handoff against completion and error', async () => {
    const transcriptSeal = createDeferred()
    const persist = vi.fn(() => Promise.resolve())
    const coordinator = createRunTerminalTransitionCoordinator({
      sealTranscript: () => transcriptSeal.promise,
      persist,
    })

    const cancellation = coordinator.transition('handoff')
    expect(coordinator.isSealed()).toBe(true)

    const completion = coordinator.transition('complete')
    const upstreamError = coordinator.transition('error', 'late failure')
    transcriptSeal.resolve()
    await Promise.all([cancellation, completion, upstreamError])

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('handoff', undefined)
  })

  it('retains an upstream error when later cancellation and completion arrive during persistence', async () => {
    const terminalWrite = createDeferred()
    const persist = vi.fn(() => terminalWrite.promise)
    const coordinator = createRunTerminalTransitionCoordinator({
      sealTranscript: () => Promise.resolve(),
      persist,
    })

    const upstreamError = coordinator.transition('error', 'upstream failed')
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1))

    const cancellation = coordinator.transition('handoff')
    const completion = coordinator.transition('complete')
    terminalWrite.resolve()
    await Promise.all([upstreamError, cancellation, completion])

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('error', 'upstream failed')
  })

  it('retains complete when a normally completed stream is aborted during persistence', async () => {
    const terminalWrite = createDeferred()
    const persist = vi.fn(() => terminalWrite.promise)
    const coordinator = createRunTerminalTransitionCoordinator({
      sealTranscript: () => Promise.resolve(),
      persist,
    })

    const completion = coordinator.transition('complete')
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1))

    const lateAbort = coordinator.transition('handoff')
    const lateError = coordinator.transition('error', 'late failure')
    terminalWrite.resolve()
    await Promise.all([completion, lateAbort, lateError])

    expect(coordinator.isSealed()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('complete', undefined)
  })
})
