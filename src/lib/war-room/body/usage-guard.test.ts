import { beforeEach, describe, expect, it } from 'vitest'
import {
  armWarRoomAgentsManually,
  assertWarRoomUsageAllowed,
  listWarRoomEvents,
  resetWarRoomBodyRuntimeForDev,
} from './index'

describe('War Room usage guard', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(80_000)
  })

  it('blocks usage-consuming dispatch when agents are frozen', () => {
    const result = assertWarRoomUsageAllowed({
      agentId: 'hermes',
      intentType: 'work_at_station',
      requestedAction: 'run Hermes worker',
      runId: 'run-frozen',
      correlationId: 'corr-frozen',
      source: 'test',
      explicitOperatorApproval: true,
    })

    expect(result.ok).toBe(false)
    expect(result.safetyLocks.liveExternalMutation).toBe(false)
    expect(listWarRoomEvents().map((event) => event.type)).toContain('agent.connection.blocked')
  })

  it('keeps armed mode blocked for live/external action requests', () => {
    armWarRoomAgentsManually({ updatedBy: 'test' }, 80_100)
    const result = assertWarRoomUsageAllowed({
      agentId: 'merchant-scout',
      intentType: 'request_approval',
      requestedAction: 'publish Etsy listing and message supplier',
      runId: 'run-live-block',
      correlationId: 'corr-live-block',
      source: 'test',
      explicitOperatorApproval: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blockedAction).toBe('publish Etsy listing and message supplier')
    expect(result.safetyLocks.paidGenerationEnabled).toBe(false)
  })

  it('requires run and correlation identifiers for future worker usage', () => {
    armWarRoomAgentsManually({ updatedBy: 'test' }, 80_200)
    const result = assertWarRoomUsageAllowed({
      agentId: 'hermes',
      intentType: 'work_at_station',
      requestedAction: 'run local worker draft',
      source: 'test',
      explicitOperatorApproval: true,
    })

    expect(result.ok).toBe(false)
  })
})
