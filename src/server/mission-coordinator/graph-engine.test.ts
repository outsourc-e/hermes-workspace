import { describe, expect, it } from 'vitest'
import { deriveReadyNodes, findLockConflicts, validateMission } from './graph-engine'
import type { Mission } from './types'

const emptyNode = { hermesTaskId: null, claimedAt: null, dispatchedAt: null, retries: 0, evidence: { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null } }

const baseMission: Mission = {
  id: 'mission-1',
  title: 'Coding pipeline',
  version: 1,
  maxParallelism: 2,
  nodes: [
    { id: 'inspect', title: 'Inspect', role: 'researcher', objective: 'Inspect repo', dependsOn: [], locks: [], readOnly: true, state: 'done', ...emptyNode },
    { id: 'build', title: 'Build', role: 'builder', objective: 'Implement change', dependsOn: ['inspect'], locks: ['repo:write'], readOnly: false, state: 'blocked_by_dependency', ...emptyNode },
    { id: 'review', title: 'Review', role: 'reviewer', objective: 'Review diff', dependsOn: ['build'], locks: [], readOnly: true, state: 'blocked_by_dependency', ...emptyNode },
  ],
}

describe('mission graph engine', () => {
  it('rejects missing dependencies and cycles', () => {
    expect(validateMission({ ...baseMission, nodes: [{ ...baseMission.nodes[0], dependsOn: ['missing'] }] })).toMatchObject({ mission: null })
    expect(validateMission({ ...baseMission, nodes: baseMission.nodes.map((node) => ({ ...node, dependsOn: node.id === 'inspect' ? ['review'] : node.dependsOn })) })).toMatchObject({ mission: null })
  })

  it('derives only dependency-satisfied nodes as ready', () => {
    expect(deriveReadyNodes(baseMission)).toEqual({ ready: ['build'], waiting: [{ nodeId: 'review', dependsOn: ['build'] }] })
  })

  it('detects overlapping locks before dispatch', () => {
    const mission = { ...baseMission, nodes: [
      { ...baseMission.nodes[0], id: 'a', state: 'ready' as const, locks: ['repo:write'], ...emptyNode },
      { ...baseMission.nodes[0], id: 'b', state: 'ready' as const, locks: ['repo:write'], ...emptyNode },
    ] }
    expect(findLockConflicts(mission, ['a', 'b'])).toHaveLength(1)
  })
})
