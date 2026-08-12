import { describe, expect, it } from 'vitest'
import { validateExecutionResult } from './result-validation'

const proof = {
  pid: 123,
  executor: 'hermes-worker',
  adapterId: 'hermes-native',
  startedAt: 100,
  lastActivityAt: 200,
  finishedAt: 300,
  exitCode: 0,
  providerCalls: 1,
  provider: 'omniroute',
  model: 'hermes-coding',
  usageKnown: true,
  inputTokens: 10,
  outputTokens: 5,
  command: 'hermes chat -q task',
  outputHash: 'abc',
}

describe('validateExecutionResult', () => {
  it('accepts a fresh provider-backed successful result', () => {
    expect(validateExecutionResult({
      state: 'succeeded',
      checkpointRaw: 'STATE: DONE',
      checkpointFresh: true,
      proof,
      summary: 'Completed the command and returned the result.',
      error: null,
    })).toEqual({ ok: true, errors: [] })
  })

  it('rejects a stale or proofless DONE result', () => {
    const result = validateExecutionResult({
      state: 'succeeded',
      checkpointRaw: 'STATE: DONE',
      checkpointFresh: false,
      proof: { ...proof, pid: null, command: null },
      summary: 'All services active.',
      error: null,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'successful checkpoints must be fresh',
      'successful results require a process id',
      'successful results require command proof',
    ]))
  })
})
