import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeCoordinationDatabase } from './coordination-db'
import { cancelCoordinatorMission } from './cancel'
import { createMission } from './coordinator'

const updateKanbanCard = vi.hoisted(() => vi.fn())
vi.mock('../kanban-backend', () => ({ updateKanbanCard }))

let stateDir = ''
beforeEach(() => {
  stateDir = mkdtempSync(`${tmpdir()}/hermes-cancel-`)
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
  updateKanbanCard.mockResolvedValue({ id: 'task-1', status: 'blocked' })
})
afterEach(() => {
  closeCoordinationDatabase()
  rmSync(stateDir, { recursive: true, force: true })
})

describe('coordinator cancellation', () => {
  it('cancels remaining nodes and blocks linked Hermes tasks', async () => {
    const created = createMission({ id: 'cancel-1', title: 'Cancel', nodes: [{ id: 'node', title: 'Node', role: 'builder', objective: 'work', dependsOn: [], locks: ['repo:write'], hermesTaskId: 'task-1' }] })
    expect(created.ok).toBe(true)
    const result = await cancelCoordinatorMission('cancel-1')
    expect(result.ok).toBe(true)
    expect(result.mission?.nodes[0].state).toBe('cancelled')
    expect(updateKanbanCard).toHaveBeenCalledWith('task-1', { status: 'blocked' })
  })
})
