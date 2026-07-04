import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFileAgentConnectionStore,
  createMemoryAgentConnectionStore,
  dispatchWarRoomIntent,
  freezeWarRoomAgents,
  getAgentConnectionState,
  listWarRoomEvents,
  prepareHermesWorkerDispatch,
  resetWarRoomBodyRuntimeForDev,
  setWarRoomAgentsLocalOnly,
} from './index'

describe('War Room agent connection control', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(70_000)
  })

  it('defaults to frozen and usage-disallowed', () => {
    const memory = createMemoryAgentConnectionStore()

    expect(memory.read()).toMatchObject({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
    expect(getAgentConnectionState()).toMatchObject({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
  })

  it('fails closed to frozen when the file-backed state is missing or broken', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-connection-'))
    const missingStore = createFileAgentConnectionStore(path.join(dir, 'missing-state.json'))
    expect(missingStore.read()).toMatchObject({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
    expect(missingStore.read().warning).toBeTruthy()

    const brokenFile = path.join(dir, 'broken-state.json')
    fs.writeFileSync(brokenFile, '{not-json', 'utf8')
    const brokenStore = createFileAgentConnectionStore(brokenFile)
    expect(brokenStore.read()).toMatchObject({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
    expect(brokenStore.read().warning).toBeTruthy()
  })

  it('freeze state always sets usageAllowed false and clears active runs', () => {
    setWarRoomAgentsLocalOnly({ updatedBy: 'test', runId: 'run-active' }, 70_100)
    const frozen = freezeWarRoomAgents({ updatedBy: 'test', reason: 'Stop all worker usage.', runId: 'run-active' }, 70_200)

    expect(frozen.mode).toBe('frozen')
    expect(frozen.frozen).toBe(true)
    expect(frozen.usageAllowed).toBe(false)
    expect(frozen.workerSpawnAllowed).toBe(false)
    expect(frozen.activeRunIds).toEqual([])
    expect(listWarRoomEvents().map((event) => event.type)).toContain('agent.connection.frozen')
  })

  it('local-only mode permits local body movement but blocks worker dispatch', () => {
    setWarRoomAgentsLocalOnly({ updatedBy: 'test' }, 70_300)
    expect(getAgentConnectionState()).toMatchObject({
      mode: 'local_only',
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
    dispatchWarRoomIntent({
      type: 'say',
      agentId: 'athena',
      text: 'Local body event is still available.',
      source: 'test',
    }, 70_400)

    const worker = prepareHermesWorkerDispatch({
      agentId: 'athena',
      label: 'Would start worker',
      roomId: 'agora-opportunity',
      stationId: 'agora-intake',
      requestedAction: 'run Athena worker',
      runId: 'run-local-only',
      correlationId: 'corr-local-only',
      source: 'test',
      explicitOperatorApproval: true,
    })

    expect(worker.ok).toBe(false)
    expect(listWarRoomEvents().map((event) => event.type)).toEqual(expect.arrayContaining([
      'agent.said',
      'agent.connection.blocked',
    ]))
  })
})
