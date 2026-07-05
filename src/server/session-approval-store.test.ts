import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome = ''

beforeEach(() => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'session-approvals-'))
  process.env.HERMES_HOME = tempHome
  vi.resetModules()
})

afterEach(() => {
  delete process.env.HERMES_HOME
  vi.resetModules()
  if (tempHome) rmSync(tempHome, { recursive: true, force: true })
  tempHome = ''
})

describe('session approval store', () => {
  it('remembers session approval rules by session and action', async () => {
    const store = await import('./session-approval-store')

    await expect(
      store.shouldAutoApproveSessionApproval({
        sessionKey: 'main',
        approval: { tool: 'execute_code' },
      }),
    ).resolves.toBe(false)

    await store.registerPendingSessionApproval({
      runId: 'run_123',
      sessionKey: 'main',
      approval: { tool: 'execute_code' },
    })
    await store.rememberSessionApprovalForRun('run_123')

    await expect(
      store.shouldAutoApproveSessionApproval({
        sessionKey: 'main',
        approval: { tool: 'execute_code' },
      }),
    ).resolves.toBe(true)
    await expect(
      store.shouldAutoApproveSessionApproval({
        sessionKey: 'other',
        approval: { tool: 'execute_code' },
      }),
    ).resolves.toBe(false)
  })
})
