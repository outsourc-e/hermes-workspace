import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  send: vi.fn(async () => ({ ok: true })),
  start: vi.fn(async () => ({ ok: true })),
  stop: vi.fn(async () => ({ ok: true })),
}))

vi.mock('./worker-process-host', () => ({
  getWorkerProcessHost: () => host,
}))

import { sendToWorker } from './swarm-lifecycle'

describe('swarm lifecycle process host integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates worker input to the durable WorkerProcessHost authority', async () => {
    expect(await sendToWorker('builder', 'continue')).toEqual({ ok: true })
    expect(host.send).toHaveBeenCalledWith('builder', 'continue')
  })
})
