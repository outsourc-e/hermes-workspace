import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeCoordinationDatabase } from './coordination-db'
import { createMission } from './coordinator'
import { reconcileMissionLifecycle } from './lifecycle-reconciler'

let stateDir = ''
beforeEach(() => {
  stateDir = mkdtempSync(`${tmpdir()}/hermes-lifecycle-`)
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})
afterEach(() => {
  closeCoordinationDatabase()
  rmSync(stateDir, { recursive: true, force: true })
})

describe('lifecycle reconciliation', () => {
  it('keeps a completed task in verifying without checkpoint evidence', async () => {
    const created = createMission({
      id: 'life-1', title: 'Lifecycle', version: 1, maxParallelism: 1,
      nodes: [{ id: 'build', title: 'Build', role: 'builder', objective: 'Build', dependsOn: [], locks: [], readOnly: false, state: 'dispatched', hermesTaskId: 'task-build' }],
    })
    expect(created.ok).toBe(true)
    const result = await reconcileMissionLifecycle('life-1', () => Promise.resolve({
      task: { status: 'done', latest_summary: 'finished' },
      runs: [{ id: 7, status: 'completed', outcome: 'success', summary: 'finished' }],
      comments: [],
    }))
    expect(result).toMatchObject({ ok: true, awaitingEvidence: ['build'] })
  })

  it('marks a task done only with successful run and DONE checkpoint evidence', async () => {
    const created = createMission({
      id: 'life-2', title: 'Lifecycle', version: 1, maxParallelism: 1,
      nodes: [{ id: 'build', title: 'Build', role: 'builder', objective: 'Build', dependsOn: [], locks: [], readOnly: false, state: 'dispatched', hermesTaskId: 'task-build' }],
    })
    expect(created.ok).toBe(true)
    const result = await reconcileMissionLifecycle('life-2', () => Promise.resolve({
      task: { status: 'done', latest_summary: 'finished' },
      runs: [{ id: 7, status: 'completed', outcome: 'success', summary: 'finished' }],
      comments: [{ body: 'STATE: DONE\nFILES_CHANGED: none\nCOMMANDS_RUN: pnpm test\nRESULT: passed\nBLOCKER: none\nNEXT_ACTION: none' }],
    }))
    expect(result).toMatchObject({ ok: true, updated: ['build'], awaitingEvidence: [] })
  })
})
