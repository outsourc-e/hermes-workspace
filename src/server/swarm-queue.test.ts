import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enqueueTask, listQueue, updateQueueItem } from './swarm-queue'

let dir: string
let prev: string | undefined

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarm-queue-'))
  prev = process.env.HERMES_SWARM_QUEUE_PATH
  process.env.HERMES_SWARM_QUEUE_PATH = join(dir, 'queue.json')
})

afterAll(() => {
  if (prev === undefined) delete process.env.HERMES_SWARM_QUEUE_PATH
  else process.env.HERMES_SWARM_QUEUE_PATH = prev
  rmSync(dir, { recursive: true, force: true })
})

describe('swarm-queue', () => {
  it('enqueues, orders by priority, and cancels', () => {
    const low = enqueueTask({ task: 'low priority thing', priority: 3 })
    const high = enqueueTask({ task: 'high priority thing', priority: 1 })
    const items = listQueue()
    expect(items[0].id).toBe(high.id)
    expect(items[1].id).toBe(low.id)

    const cancelled = updateQueueItem(low.id, { status: 'cancelled' })
    expect(cancelled?.status).toBe('cancelled')
    const open = listQueue().filter((i) => i.status === 'queued')
    expect(open.map((i) => i.id)).toEqual([high.id])
  })

  it('rejects empty tasks and clamps bad priority', () => {
    expect(() => enqueueTask({ task: '   ' })).toThrow()
    const item = enqueueTask({ task: 'clamp me', priority: 99 })
    expect(item.priority).toBe(2)
  })
})
