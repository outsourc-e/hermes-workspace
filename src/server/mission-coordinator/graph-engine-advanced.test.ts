import { describe, expect, it } from 'vitest'
import { findLockConflicts } from './graph-engine'

const emptyEvidence = { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null }
const emptyNode = { hermesTaskId: null, claimedAt: null, dispatchedAt: null, retries: 0, evidence: emptyEvidence }

const baseMission = {
  id: 'mission-1',
  title: 'M',
  version: 1,
  maxParallelism: 1,
  nodes: [
    { id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: [], locks: ['repo:write'], readOnly: false, state: 'ready' as const, ...emptyNode },
    { id: 'b', title: 'B', role: 'builder', objective: 'B', dependsOn: [], locks: ['repo:write'], readOnly: false, state: 'ready' as const, ...emptyNode },
  ],
}

describe('findLockConflicts with active leases', () => {
  it('flags a candidate whose lock is already held by another mission', () => {
    const activeLeases = new Map([['repo:write', { missionId: 'mission-2', owner: 'owner-2' }]])
    const conflicts = findLockConflicts(baseMission, ['a'], activeLeases)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].nodeId).toBe('a')
    expect(conflicts[0].reason).toContain('mission-2')
  })

  it('also flags a lock held by another active node in the same mission', () => {
    const activeLeases = new Map([['repo:write', { missionId: 'mission-1', owner: 'owner-1' }]])
    const conflicts = findLockConflicts(baseMission, ['b'], activeLeases)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reason).toContain('another node in this mission')
  })
})
