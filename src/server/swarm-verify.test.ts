import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listQueue } from './swarm-queue'
import {
  enqueueVerification,
  isVerificationTask,
  refutedVerdict,
  shouldVerify,
} from './swarm-verify'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

let dir: string
let prev: string | undefined

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarm-verify-'))
  prev = process.env.HERMES_SWARM_QUEUE_PATH
  process.env.HERMES_SWARM_QUEUE_PATH = join(dir, 'queue.json')
})

afterAll(() => {
  if (prev === undefined) delete process.env.HERMES_SWARM_QUEUE_PATH
  else process.env.HERMES_SWARM_QUEUE_PATH = prev
  rmSync(dir, { recursive: true, force: true })
})

const doneCheckpoint = {
  stateLabel: 'DONE',
  result: 'Implemented and tested the thing.',
  filesChanged: 'src/foo.ts',
  commandsRun: 'vitest run',
} as unknown as ParsedSwarmCheckpoint

const longTask =
  'Implement a robust retry wrapper around the dispatch pipeline and add unit tests covering timeout, backoff, and cancellation paths.'

describe('shouldVerify', () => {
  it('verifies long DONE work from normal workers only', () => {
    expect(
      shouldVerify({ workerId: 'builder', task: longTask, ok: true, checkpoint: doneCheckpoint }),
    ).toBe(true)
    expect(
      shouldVerify({ workerId: 'reviewer', task: longTask, ok: true, checkpoint: doneCheckpoint }),
    ).toBe(false)
    expect(
      shouldVerify({ workerId: 'builder', task: 'short task', ok: true, checkpoint: doneCheckpoint }),
    ).toBe(false)
    expect(
      shouldVerify({ workerId: 'builder', task: `[verify] ${longTask}`, ok: true, checkpoint: doneCheckpoint }),
    ).toBe(false)
    expect(
      shouldVerify({ workerId: 'builder', task: longTask, ok: false, checkpoint: doneCheckpoint }),
    ).toBe(false)
  })
})

describe('enqueueVerification', () => {
  it('queues a P1 reviewer task once per claim', () => {
    expect(
      enqueueVerification({ workerId: 'builder', task: longTask, checkpoint: doneCheckpoint }),
    ).toBe(true)
    // duplicate suppressed
    expect(
      enqueueVerification({ workerId: 'builder', task: longTask, checkpoint: doneCheckpoint }),
    ).toBe(false)
    const items = listQueue()
    const verifyItem = items.find((i) => isVerificationTask(i.task))
    expect(verifyItem?.worker).toBe('reviewer')
    expect(verifyItem?.priority).toBe(1)
    expect(verifyItem?.task).toContain('VERDICT')
  })
})

describe('refutedVerdict', () => {
  it('extracts refutations and ignores confirmations', () => {
    expect(
      refutedVerdict({ result: 'All checks pass. VERDICT: CONFIRMED' } as never),
    ).toBeNull()
    expect(
      refutedVerdict({ result: 'VERDICT: REFUTED — tests actually fail' } as never),
    ).toBe('tests actually fail')
  })
})
