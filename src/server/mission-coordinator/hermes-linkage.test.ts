import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeCoordinationDatabase } from './coordination-db'
import { createMission } from './coordinator'
import { provisionHermesTasks, reconcileHermesTasks, updateHermesTaskStatus } from './hermes-linkage'

const mocks = vi.hoisted(() => ({
  createKanbanCard: vi.fn(),
  listKanbanCards: vi.fn(),
  updateKanbanCard: vi.fn(),
}))

vi.mock('../kanban-backend', () => mocks)

const originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
let stateDir = ''

const emptyEvidence = { runId: null, runStatus: null, outcome: null, summary: null, checkpoint: null, verifiedAt: null }

beforeEach(() => {
  stateDir = `/tmp/hermes-linkage-${process.pid}-${Math.random().toString(36).slice(2)}`
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
  mocks.createKanbanCard.mockReset()
  mocks.listKanbanCards.mockReset()
  mocks.updateKanbanCard.mockReset()
  mocks.createKanbanCard.mockImplementation((input: { title: string }) => Promise.resolve({ id: `task-${input.title.split(':').pop()?.trim().toLowerCase()}`, title: input.title, status: 'todo' }))
  mocks.listKanbanCards.mockResolvedValue([])
  mocks.updateKanbanCard.mockResolvedValue({ id: 'task-build', status: 'running' })
})

afterEach(() => {
  closeCoordinationDatabase()
  if (originalStateDir === undefined) delete process.env.HERMES_WORKSPACE_STATE_DIR
  else process.env.HERMES_WORKSPACE_STATE_DIR = originalStateDir
})

describe('Hermes task linkage', () => {
  it('provisions one native task per mission node and reconciles status', async () => {
    const result = createMission({
      id: 'link-1', title: 'Link', nodes: [
        { id: 'inspect', title: 'Inspect', role: 'researcher', objective: 'Inspect', dependsOn: [], locks: [], readOnly: true, hermesTaskId: null, evidence: emptyEvidence },
        { id: 'build', title: 'Build', role: 'builder', objective: 'Build', dependsOn: ['inspect'], locks: ['repo:write'], readOnly: false, hermesTaskId: null, evidence: emptyEvidence },
      ],
    })
    expect(result.ok).toBe(true)
    await expect(provisionHermesTasks('link-1')).resolves.toMatchObject({ ok: true, created: ['inspect', 'build'] })
    expect(mocks.createKanbanCard).toHaveBeenCalledTimes(2)

    mocks.listKanbanCards.mockResolvedValue([{ id: 'task-inspect', status: 'done' }, { id: 'task-build', status: 'running' }])
    await expect(reconcileHermesTasks('link-1')).resolves.toMatchObject({ ok: true, updated: ['inspect'] })

    // Build must wait until its dependency is marked done; it is not prematurely set to running.
    await expect(reconcileHermesTasks('link-1')).resolves.toMatchObject({ ok: true, updated: [] })
    await expect(updateHermesTaskStatus('link-1', 'build', 'running')).resolves.toMatchObject({ ok: true })
  })
})
