import { beforeEach, describe, expect, it } from 'vitest'
import {
  dispatchWarRoomIntent,
  getWarRoomBodyState,
  listWarRoomEvents,
  livingV3AdapterStateFromBodyRuntime,
  requestWarRoomApproval,
  resetWarRoomBodyRuntimeForDev,
} from './index'

describe('Living V3 body adapter', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(10_000)
  })

  it('translates say intents into Living V3 talk tasks', () => {
    dispatchWarRoomIntent({ type: 'say', agentId: 'athena', text: 'Read the strongest product signal.', source: 'test' }, 10_100)
    const adapted = livingV3AdapterStateFromBodyRuntime(getWarRoomBodyState(), listWarRoomEvents(), 10_200)
    const task = adapted.tasks.find((candidate) => candidate.agentId === 'athena')

    expect(task?.kind).toBe('talk')
    expect(task?.label).toContain('strongest product signal')
    expect(task?.packetLabel).toBe('chat packet')
  })

  it('translates station work, approval packets, alerts, and rest state', () => {
    dispatchWarRoomIntent({
      type: 'work_at_station',
      agentId: 'hephaestus',
      roomId: 'forge-hephaestus',
      stationId: 'forge-workbench',
      taskId: 'forge-task',
      correlationId: 'adapter-flow',
      source: 'test',
    }, 10_300)
    dispatchWarRoomIntent({
      type: 'raise_alert',
      agentId: 'loki',
      severity: 'warning',
      text: 'Supplier evidence missing.',
      correlationId: 'adapter-flow',
      source: 'test',
    }, 10_400)
    requestWarRoomApproval({
      agentId: 'julius',
      roomId: 'council-strategists',
      stationId: 'council-table',
      reason: 'Council must approve locally.',
      correlationId: 'adapter-flow',
      source: 'test',
    }, 10_500)
    dispatchWarRoomIntent({ type: 'rest', agentId: 'roster-keeper', correlationId: 'adapter-flow', source: 'test' }, 10_600)

    const adapted = livingV3AdapterStateFromBodyRuntime(getWarRoomBodyState(), listWarRoomEvents(), 10_700)
    expect(adapted.tasks.find((task) => task.agentId === 'hephaestus')?.stationId).toBe('forge-workbench')
    expect(adapted.tasks.find((task) => task.agentId === 'roster-keeper')?.kind).toBe('rest')
    expect(adapted.alerts[0].label).toBe('Supplier evidence missing.')
    expect(adapted.approvals[0]).toMatchObject({
      agentId: 'julius',
      stationId: 'council-table',
      status: 'waiting-operator',
    })
  })
})
