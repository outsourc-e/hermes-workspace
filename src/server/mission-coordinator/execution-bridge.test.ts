import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeCoordinationDatabase } from './coordination-db'
import { claimReadyNodes, createMission } from './coordinator'
import { dispatchNextClaimedNode } from './execution-bridge'

const updateKanbanCard = vi.hoisted(() => vi.fn())
vi.mock('../kanban-backend', () => ({ updateKanbanCard }))

let stateDir = ''
beforeEach(() => {
  stateDir = `/tmp/hermes-execution-bridge-${process.pid}-${Math.random().toString(36).slice(2)}`
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
  updateKanbanCard.mockReset()
  updateKanbanCard.mockResolvedValue({ id: 'task-inspect', status: 'ready' })
})
afterEach(() => {
  closeCoordinationDatabase()
})

describe('execution bridge', () => {
  it('dispatches exactly one claimed node through native task status', async () => {
    const created = createMission({
      id: 'bridge-1', title: 'Bridge', nodes: [{ id: 'inspect', title: 'Inspect', role: 'researcher', objective: 'Inspect', dependsOn: [], locks: [], readOnly: true, hermesTaskId: 'task-inspect', evidence: { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null } }],
    })
    expect(created.ok).toBe(true)
    expect(claimReadyNodes('bridge-1', 'owner')).toMatchObject({ ok: true, nodeIds: ['inspect'] })
    await expect(dispatchNextClaimedNode('bridge-1', 'owner')).resolves.toMatchObject({ ok: true, nodeId: 'inspect' })
    expect(updateKanbanCard).toHaveBeenCalledWith('task-inspect', { status: 'ready' })
  })
})
