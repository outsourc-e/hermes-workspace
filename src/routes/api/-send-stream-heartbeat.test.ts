import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSseHeartbeatLifecycle } from './-send-stream-heartbeat'

afterEach(() => {
  vi.useRealTimers()
})

describe('SSE heartbeat lifecycle', () => {
  it('uses one timer for activity heartbeats and idle proxy keepalives', async () => {
    vi.useFakeTimers()
    const sendActivityHeartbeat = vi.fn()
    const sendProxyKeepalive = vi.fn()
    let activity: string | null = 'Running a tool'
    const heartbeat = createSseHeartbeatLifecycle({
      intervalMs: 10_000,
      getActivity: () => activity,
      sendActivityHeartbeat,
      sendProxyKeepalive,
    })

    heartbeat.start()
    heartbeat.start()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(sendActivityHeartbeat).toHaveBeenCalledTimes(1)
    expect(sendActivityHeartbeat).toHaveBeenLastCalledWith({
      timestamp: Date.now(),
      activity: 'Running a tool',
    })
    expect(sendProxyKeepalive).toHaveBeenCalledTimes(1)

    activity = 'Finishing up'
    heartbeat.noteClientEvent()
    await vi.advanceTimersByTimeAsync(10_000 - 1)
    expect(sendActivityHeartbeat).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(sendActivityHeartbeat).toHaveBeenCalledTimes(2)
    expect(sendActivityHeartbeat).toHaveBeenLastCalledWith({
      timestamp: Date.now(),
      activity: 'Finishing up',
    })
    expect(sendProxyKeepalive).toHaveBeenCalledTimes(2)
  })

  it('clears its only interval and emits nothing after stop', async () => {
    vi.useFakeTimers()
    const sendActivityHeartbeat = vi.fn()
    const sendProxyKeepalive = vi.fn()
    const heartbeat = createSseHeartbeatLifecycle({
      intervalMs: 10_000,
      getActivity: () => null,
      sendActivityHeartbeat,
      sendProxyKeepalive,
    })

    heartbeat.start()
    expect(vi.getTimerCount()).toBe(1)

    heartbeat.stop()
    heartbeat.stop()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(sendActivityHeartbeat).not.toHaveBeenCalled()
    expect(sendProxyKeepalive).not.toHaveBeenCalled()
  })
})
