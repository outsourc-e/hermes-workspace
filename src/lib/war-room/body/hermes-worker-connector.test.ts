import { beforeEach, describe, expect, it } from 'vitest'
import {
  getWarRoomBodyState,
  listWarRoomEvents,
  prepareHermesWorkerDispatch,
  recordHermesWorkerDryRun,
  resetWarRoomBodyRuntimeForDev,
} from './index'

describe('Hermes worker connector scaffold', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(90_000)
  })

  it('blocks prepared worker dispatch while agents are frozen', () => {
    const result = prepareHermesWorkerDispatch({
      agentId: 'hermes',
      label: 'Would route a worker',
      roomId: 'olympus-command',
      stationId: 'mission-router',
      requestedAction: 'run Hermes worker',
      runId: 'run-worker-blocked',
      correlationId: 'corr-worker-blocked',
      source: 'test',
      explicitOperatorApproval: true,
    })

    expect(result).toMatchObject({ ok: false, dryRun: true })
    expect(getWarRoomBodyState().tasks).toHaveLength(0)
    expect(listWarRoomEvents().map((event) => event.type)).toContain('agent.connection.blocked')
  })

  it('records dry-run tasks only and never creates a completed worker run', () => {
    const result = recordHermesWorkerDryRun({
      agentId: 'julius',
      label: 'Dry-run council producer',
      roomId: 'council-strategists',
      stationId: 'council-table',
      requestedAction: 'dry-run local worker plan',
      runId: 'run-dry',
      correlationId: 'corr-dry',
      source: 'test',
    })

    expect(result).toMatchObject({ ok: true, dryRun: true })
    expect(getWarRoomBodyState().tasks[0]).toMatchObject({
      label: 'Dry-run council producer',
      status: 'blocked',
    })
    expect(listWarRoomEvents().map((event) => event.type)).toContain('agent.connection.blocked')
  })
})
