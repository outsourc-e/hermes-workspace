import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeCoordinationDatabase } from './coordination-db'
import { reconcileOnce } from './reconciliation-loop'

let stateDir = ''
beforeEach(() => {
  stateDir = mkdtempSync(`${tmpdir()}/hermes-reconciliation-loop-`)
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})
afterEach(() => {
  closeCoordinationDatabase()
  rmSync(stateDir, { recursive: true, force: true })
})

describe('reconciliation loop', () => {
  it('returns a bounded summary when no missions are active', async () => {
    const result = await reconcileOnce(1)
    expect(result).toMatchObject({ checked: 0, updated: 0, awaitingEvidence: 0, errors: [] })
  })
})
