import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordSwarmOutcome } from './swarm-outcomes'
import { detectAnomalies } from './swarm-selftune'

let dir: string
const prevQueue = process.env.HERMES_SWARM_QUEUE_PATH

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'selftune-'))
  process.env.HERMES_SWARM_QUEUE_PATH = join(dir, 'queue.json')
})

afterAll(() => {
  if (prevQueue === undefined) delete process.env.HERMES_SWARM_QUEUE_PATH
  else process.env.HERMES_SWARM_QUEUE_PATH = prevQueue
  rmSync(dir, { recursive: true, force: true })
})

describe('detectAnomalies', () => {
  it('is quiet with no data', () => {
    // Uses the real outcomes file; a far-future "now" isolates the window.
    const report = detectAnomalies(Date.now() + 365 * 86_400_000)
    expect(report.alerts).toEqual([])
    expect(report.today.attempts).toBe(0)
  })

  it('computes rates from the outcome log shape', () => {
    // Sanity: recordSwarmOutcome + detectAnomalies share the same store.
    recordSwarmOutcome({
      workerId: 'bench-test',
      task: 'selftune test record',
      tier: null,
      model: null,
      mode: 'oneshot',
      ok: true,
      blocked: false,
      blockReason: null,
      checkpointStatus: null,
      durationMs: 10,
    })
    const report = detectAnomalies()
    expect(report.today.attempts).toBeGreaterThanOrEqual(1)
    expect(report.today.failRate).toBeLessThanOrEqual(1)
  })
})
