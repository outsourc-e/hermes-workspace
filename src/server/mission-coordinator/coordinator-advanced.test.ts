import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeCoordinationDatabase, saveMission } from './coordination-db'
import { claimReadyNodes, completeNode, createMission, getMissionMetrics, getMissionSnapshot, retryMissionNode } from './coordinator'

const originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
let testStateDir: string

const emptyEvidence = { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null }
const emptyNode = { hermesTaskId: null, claimedAt: null, dispatchedAt: null, retries: 0, evidence: emptyEvidence }

beforeEach(() => {
  testStateDir = mkdtempSync(`${tmpdir()}/hermes-workspace-coordination-`)
  process.env.HERMES_WORKSPACE_STATE_DIR = testStateDir
})

afterEach(() => {
  closeCoordinationDatabase()
  rmSync(testStateDir, { recursive: true, force: true })
  if (originalStateDir === undefined) delete process.env.HERMES_WORKSPACE_STATE_DIR
  else process.env.HERMES_WORKSPACE_STATE_DIR = originalStateDir
})

describe('coordinator advanced features', () => {
  it('rejects stale saves due to version conflict', () => {
    const created = createMission({
      id: 'mission-1',
      title: 'M',
      maxParallelism: 1,
      nodes: [{ id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: [], locks: [], readOnly: false, state: 'blocked_by_dependency', ...emptyNode }],
    })
    expect(created.ok).toBe(true)

    const first = getMissionSnapshot('mission-1').mission!
    const second = getMissionSnapshot('mission-1').mission!
    first.version += 1
    saveMission(first)
    second.version += 1
    expect(() => saveMission(second)).toThrow(/version conflict/)
  })

  it('retries a failed node and increments retries', () => {
    createMission({
      id: 'mission-1',
      title: 'M',
      maxParallelism: 1,
      nodes: [{ id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: [], locks: [], readOnly: false, state: 'failed', ...emptyNode }],
    })
    const result = retryMissionNode('mission-1', 'a', 'test')
    expect(result.ok).toBe(true)
    const node = getMissionSnapshot('mission-1').mission?.nodes[0]
    expect(node?.state).toBe('ready')
    expect(node?.retries).toBe(1)
    expect(completeNode('mission-1', 'a', 'test').ok).toBe(false)
  })

  it('reports metrics for active and completed missions', () => {
    createMission({
      id: 'active',
      title: 'Active',
      maxParallelism: 1,
      nodes: [{ id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: [], locks: [], readOnly: false, state: 'ready', ...emptyNode }],
    })
    const completed = createMission({
      id: 'completed',
      title: 'Completed',
      maxParallelism: 1,
      nodes: [{ id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: [], locks: [], readOnly: false, state: 'done', ...emptyNode }],
    })
    expect(completed.ok).toBe(true)
    const metrics = getMissionMetrics()
    expect(metrics.total).toBe(2)
    expect(metrics.active).toBe(1)
    expect(metrics.completed).toBe(1)
    expect(metrics.byState.ready).toBe(1)
    expect(metrics.byState.done).toBe(1)
  })

  it('records claimedAt when claiming a node', () => {
    createMission({
      id: 'mission-1',
      title: 'M',
      maxParallelism: 1,
      nodes: [{ id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: [], locks: [], readOnly: false, state: 'ready', ...emptyNode }],
    })
    const before = Date.now()
    const claim = claimReadyNodes('mission-1', 'owner')
    expect(claim.ok).toBe(true)
    const node = getMissionSnapshot('mission-1').mission?.nodes[0]
    expect(node?.state).toBe('leased')
    expect(node?.claimedAt).toBeGreaterThanOrEqual(before)
  })
})
