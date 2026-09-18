import { describe, expect, it } from 'vitest'
import { buildNextActionAssignments } from './swarm-orchestrator-loop'
import type { WorkerLoopResult } from './swarm-orchestrator-loop'
import type { ParsedSwarmCheckpoint } from '../../server/swarm-checkpoints'

function checkpoint(overrides: Partial<ParsedSwarmCheckpoint>): ParsedSwarmCheckpoint {
  return {
    stateLabel: 'DONE',
    runtimeState: 'idle',
    checkpointStatus: 'done',
    filesChanged: null,
    commandsRun: null,
    result: 'Finished the assigned work.',
    blocker: null,
    nextAction: null,
    raw: 'STATE: DONE',
    ...overrides,
  }
}

function checkpointedResult(workerId: string, overrides: Partial<ParsedSwarmCheckpoint>): WorkerLoopResult {
  return {
    workerId,
    status: 'checkpointed',
    checkpoint: checkpoint(overrides),
    action: 'test',
    runtimePath: '/tmp/does-not-matter/runtime.json',
  }
}

const WORKER_IDS = ['researcher', 'builder', 'reviewer']

describe('buildNextActionAssignments', () => {
  it('does not auto-continue implementation-like next actions from DONE when allowExecution is false (existing fail-closed behavior)', () => {
    const results = [checkpointedResult('swarm2', { stateLabel: 'DONE', nextAction: 'Implement the backend endpoint for search.' })]
    const assignments = buildNextActionAssignments(results, WORKER_IDS, false)
    expect(assignments).toEqual([])
  })

  it('continues non-side-effecting work from a HANDOFF checkpoint, not just DONE', () => {
    const results = [checkpointedResult('swarm2', { stateLabel: 'HANDOFF', nextAction: 'Review the proposed diff for correctness.' })]
    const assignments = buildNextActionAssignments(results, WORKER_IDS, false)
    expect(assignments).toHaveLength(1)
    expect(assignments[0].workerId).toBe('reviewer')
    expect(assignments[0].task).toContain('Review the proposed diff for correctness.')
  })

  it('never auto-continues external or workspace-mutating actions, even if they include a safe-looking verb', () => {
    const blockedActions = [
      'Verify the result and create a ticket for the issue.',
      'Review the change and open a pull request.',
      'Verify availability and book a meeting.',
      'Test the endpoint, then save changes.',
      'Research the account and call API to update it.',
      'Inspect the diff, commit it, and push the branch.',
    ]

    for (const nextAction of blockedActions) {
      const results = [checkpointedResult('swarm2', { stateLabel: 'HANDOFF', nextAction })]
      expect(buildNextActionAssignments(results, WORKER_IDS, true)).toEqual([])
    }
  })

  it('does not auto-continue implementation-like HANDOFF next actions, even when allowExecution is true', () => {
    const results = [checkpointedResult('swarm2', { stateLabel: 'HANDOFF', nextAction: 'Implement the backend endpoint for search.' })]
    expect(buildNextActionAssignments(results, WORKER_IDS, false)).toEqual([])
    expect(buildNextActionAssignments(results, WORKER_IDS, true)).toEqual([])
  })
})
