import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRunTextPersistenceBuffer } from '../../server/run-store'
import { createSseHeartbeatLifecycle } from './-send-stream-heartbeat'
import {
  createRunTerminalTransitionCoordinator,
  finalizeRunTerminalStream,
} from './-send-stream-terminal'

afterEach(() => {
  vi.useRealTimers()
})

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

  it('claims completion before asynchronous backfill so later cancellation cannot win', async () => {
    const backfill = createDeferred()
    const persist = vi.fn(() => Promise.resolve())
    const coordinator = createRunTerminalTransitionCoordinator({
      sealTranscript: () => Promise.resolve(),
      persist,
    })

    const runCompletedHandler = async () => {
      const terminalPersistence = coordinator.transition('complete')
      await backfill.promise
      await terminalPersistence
    }
    const completion = runCompletedHandler()
    expect(coordinator.isSealed()).toBe(true)

    const cancellationDuringBackfill = coordinator.transition('handoff')
    backfill.resolve()
    await Promise.all([completion, cancellationDuringBackfill])

    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('complete', undefined)
  })

  it('does not persist a terminal status when transcript sealing is exhausted', async () => {
    const persist = vi.fn(() => Promise.resolve())
    const coordinator = createRunTerminalTransitionCoordinator({
      sealTranscript: () =>
        Promise.reject(new Error('text remained unwritten')),
      persist,
    })

    await expect(coordinator.transition('complete')).rejects.toThrow(
      'text remained unwritten',
    )
    expect(persist).not.toHaveBeenCalled()
  })

  it.each([
    {
      closeBeforePersistence: false,
      path: 'completion, upstream error, timeout, and outer catch',
    },
    {
      closeBeforePersistence: true,
      path: 'request abort and stream cancellation',
    },
  ])(
    'closes the route stream and stops its heartbeat once when sealing rejects on $path',
    async ({ closeBeforePersistence }) => {
      vi.useFakeTimers()
      const persist = vi.fn(() => Promise.resolve())
      const onPersisted = vi.fn()
      const heartbeat = createSseHeartbeatLifecycle({
        intervalMs: 10_000,
        getActivity: () => null,
        sendActivityHeartbeat: vi.fn(),
        sendProxyKeepalive: vi.fn(),
      })
      const stopHeartbeat = vi.spyOn(heartbeat, 'stop')
      let closeStream!: ReturnType<typeof vi.fn<() => void>>
      const stream = new ReadableStream({
        start(controller) {
          heartbeat.start()
          closeStream = vi.fn(() => {
            heartbeat.stop()
            controller.close()
          })
        },
      })
      const coordinator = createRunTerminalTransitionCoordinator({
        sealTranscript: () =>
          Promise.reject(new Error('bounded sealing retries exhausted')),
        persist,
      })

      expect(vi.getTimerCount()).toBe(1)
      await expect(
        finalizeRunTerminalStream({
          terminalPersistence: coordinator.transition('complete'),
          onPersisted,
          closeStream,
          closeBeforePersistence,
        }),
      ).resolves.toBeUndefined()

      expect(persist).not.toHaveBeenCalled()
      expect(onPersisted).not.toHaveBeenCalled()
      expect(closeStream).toHaveBeenCalledTimes(1)
      expect(stopHeartbeat).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      await expect(stream.getReader().read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    },
  )

  it('closes the route stream when the real text buffer exhausts sealing retries', async () => {
    vi.useFakeTimers()
    const persist = vi.fn(() => Promise.resolve())
    const write = vi.fn(() =>
      Promise.reject(new Error('persistent text write failure')),
    )
    const buffer = createRunTextPersistenceBuffer(write)
    buffer.append('must not be silently lost')

    const heartbeat = createSseHeartbeatLifecycle({
      intervalMs: 10_000,
      getActivity: () => null,
      sendActivityHeartbeat: vi.fn(),
      sendProxyKeepalive: vi.fn(),
    })
    const stopHeartbeat = vi.spyOn(heartbeat, 'stop')
    let closeStream!: ReturnType<typeof vi.fn<() => void>>
    const stream = new ReadableStream({
      start(controller) {
        heartbeat.start()
        closeStream = vi.fn(() => {
          heartbeat.stop()
          controller.close()
        })
      },
    })
    const coordinator = createRunTerminalTransitionCoordinator({
      sealTranscript: () => buffer.seal(),
      persist,
    })

    const finalized = finalizeRunTerminalStream({
      terminalPersistence: coordinator.transition('complete'),
      closeStream,
    })
    await vi.runAllTimersAsync()
    await finalized

    expect(write).toHaveBeenCalledTimes(3)
    expect(persist).not.toHaveBeenCalled()
    expect(closeStream).toHaveBeenCalledTimes(1)
    expect(stopHeartbeat).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    await expect(stream.getReader().read()).resolves.toEqual({
      done: true,
      value: undefined,
    })
  })
})
