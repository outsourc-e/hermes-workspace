import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquireResourceLeases, acquireSchedulerLease, closeCoordinationDatabase, expireLeases, listLeases, recordWebhookReceipt, renewResourceLeases, renewSchedulerLease } from './coordination-db'

let stateDir = ''
beforeEach(() => {
  stateDir = mkdtempSync(`${tmpdir()}/hermes-coordination-recovery-`)
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})
afterEach(() => {
  closeCoordinationDatabase()
  rmSync(stateDir, { recursive: true, force: true })
})

describe('coordination lease recovery', () => {
  it('renews active leases and expires abandoned leases', () => {
    expect(acquireSchedulerLease('m', 'a', 100)).not.toBeNull()
    expect(acquireResourceLeases('m', 'a', ['repo:write'], 100)).not.toBeNull()
    expect(renewSchedulerLease('m', 'a', 1000)).not.toBeNull()
    expect(renewResourceLeases('a', ['repo:write'], 1000)).toHaveLength(1)
    expect(expireLeases(Date.now() + 2000)).toEqual({ scheduler: 1, resources: 1 })
    expect(listLeases()).toMatchObject({ scheduler: [], resources: [] })
  })

  it('deduplicates webhook receipts by event id', () => {
    expect(recordWebhookReceipt({ eventId: 'evt-1', missionId: 'm', eventType: 'completed' })).toBe(true)
    expect(recordWebhookReceipt({ eventId: 'evt-1', missionId: 'm', eventType: 'completed' })).toBe(false)
  })
})
