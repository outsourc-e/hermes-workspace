import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeCoordinationDatabase, saveMission } from './coordination-db'
import { claimReadyNodes, completeNode, createMission, getMissionSnapshot } from './coordinator'

const originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
let testStateDir: string

const emptyEvidence = { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null }

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

describe('mission coordinator', () => {
  it('preflights, claims, completes, and unlocks a sequential mission', () => {
    const created = createMission({
      id: 'mission-1',
      title: 'Coding pipeline',
      maxParallelism: 1,
      nodes: [
        { id: 'inspect', title: 'Inspect', role: 'researcher', objective: 'Inspect repo', dependsOn: [], locks: [], readOnly: true, state: 'blocked_by_dependency', hermesTaskId: null, evidence: emptyEvidence },
        { id: 'build', title: 'Build', role: 'builder', objective: 'Implement change', dependsOn: ['inspect'], locks: ['repo:write'], readOnly: false, state: 'blocked_by_dependency', hermesTaskId: null, evidence: emptyEvidence },
      ],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const first = claimReadyNodes('mission-1', 'owner-a')
    expect(first).toMatchObject({ ok: true, nodeIds: ['inspect'] })
    expect(claimReadyNodes('mission-1', 'owner-b').ok).toBe(false)
    expect(completeNode('mission-1', 'inspect', 'owner-a')).toMatchObject({ ok: false, reason: expect.stringContaining('leased') })
    const inspected = getMissionSnapshot('mission-1').mission
    if (!inspected) return
    inspected.nodes[0].state = 'verifying'
    inspected.nodes[0].evidence = { runId: 1, runStatus: 'completed', outcome: 'success', summary: 'verified', checkpoint: 'STATE: DONE', verifiedAt: Date.now() }
    inspected.version += 1
    saveMission(inspected)
    expect(completeNode('mission-1', 'inspect', 'owner-a').ok).toBe(true)

    const second = claimReadyNodes('mission-1', 'owner-a')
    expect(second).toMatchObject({ ok: true, nodeIds: ['build'] })
    expect(completeNode('mission-1', 'build', 'owner-a')).toMatchObject({ ok: false, reason: expect.stringContaining('leased') })

    const snapshot = getMissionSnapshot('mission-1')
    expect(snapshot.mission?.nodes.map((node) => node.state)).toEqual(['done', 'leased'])
    expect(snapshot.events.map((event) => event.type)).toEqual([
      'mission_created',
      'nodes_leased',
      'node_completed',
      'nodes_leased',
    ])
  })

  it('refuses cyclic missions before persistence', () => {
    const result = createMission({
      id: 'cycle',
      title: 'Cycle',
      nodes: [
        { id: 'a', title: 'A', role: 'builder', objective: 'A', dependsOn: ['b'], locks: [], readOnly: false, hermesTaskId: null, evidence: emptyEvidence },
        { id: 'b', title: 'B', role: 'builder', objective: 'B', dependsOn: ['a'], locks: [], readOnly: false, hermesTaskId: null, evidence: emptyEvidence },
      ],
    })
    expect(result.ok).toBe(false)
    expect(getMissionSnapshot('cycle').mission).toBeNull()
  })
})
