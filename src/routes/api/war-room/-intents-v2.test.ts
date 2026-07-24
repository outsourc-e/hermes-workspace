import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetEtsyRoomBridgeStateForDev } from '../../../lib/war-room/body/etsy-room-event-bridge'
import { loadSharedEtsyRoomStore } from '../../../lib/war-room/body/etsy-room-shared-store'
import { resetWarRoomBodyRuntimeForDev } from '../../../lib/war-room/body/runtime'
import { runPersistedEtsyRoomLocalIntent } from './intents'

const originalStoreDir = process.env.WAR_ROOM_ETSY_ROOM_STORE_DIR
let dataRoot = ''

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), 'etsy-intents-v2-'))
  process.env.WAR_ROOM_ETSY_ROOM_STORE_DIR = dataRoot
  resetWarRoomBodyRuntimeForDev(100_000)
  resetEtsyRoomBridgeStateForDev(100_000)
})

afterEach(async () => {
  if (originalStoreDir === undefined) delete process.env.WAR_ROOM_ETSY_ROOM_STORE_DIR
  else process.env.WAR_ROOM_ETSY_ROOM_STORE_DIR = originalStoreDir
  await rm(dataRoot, { recursive: true, force: true })
})

describe('persisted Etsy V2 room intents', () => {
  it('continues from the authoritative workspace after bridge memory is reset', async () => {
    const prepared = await runPersistedEtsyRoomLocalIntent({
      type: 'prepare_product_scout_packet_local',
      prompt: 'gold initial necklace opportunities',
      runId: 'persisted-intent-run',
      correlationId: 'persisted-prepare',
      nowMs: 101_000,
    })

    expect(prepared.status).toBe(200)
    if (prepared.status !== 200) throw new Error(prepared.result.error ?? 'Prepare intent failed')
    expect(prepared.result.workspaceState.revision).toBe(1)
    expect(prepared.result.workspaceState.roomState.scoutPacket?.query).toBe('gold initial necklace opportunities')

    resetEtsyRoomBridgeStateForDev(1)

    const researched = await runPersistedEtsyRoomLocalIntent({
      type: 'apply_product_scout_worker_packet_local',
      prompt: 'gold initial necklace opportunities',
      workerRunId: 'isolated-worker-run',
      workerSummary: 'One evidence-bound candidate returned.',
      candidates: [{
        title: 'Gold Initial Necklace',
        niche: 'Personalized jewelry',
        sourceUrls: ['https://example.com/product'],
        evidence: ['Source product page captured'],
        missingFields: ['supplier match'],
        riskNotes: ['supplier match pending'],
      }],
      evidenceIds: ['evidence:product-page'],
      sourceRecordIds: ['https://example.com/product'],
      missingFields: ['supplier match'],
      runId: 'persisted-intent-run',
      correlationId: 'persisted-worker',
      nowMs: 101_500,
    })

    expect(researched.status).toBe(200)
    if (researched.status !== 200) throw new Error(researched.result.error ?? 'Worker intent failed')
    expect(researched.result.workspaceState.revision).toBe(2)
    const candidateId = researched.result.workspaceState.roomState.candidates[0]?.candidateId
    expect(candidateId).toBeTruthy()
    if (!candidateId) throw new Error('Worker intent returned no candidate')

    resetEtsyRoomBridgeStateForDev(1)

    const selected = await runPersistedEtsyRoomLocalIntent({
      type: 'select_etsy_candidate_local',
      candidateId,
      runId: 'persisted-intent-run',
      correlationId: 'persisted-select',
      nowMs: 102_000,
    })

    expect(selected.status).toBe(200)
    if (selected.status !== 200) throw new Error(selected.result.error ?? 'Select intent failed')
    expect(selected.result.workspaceState.revision).toBe(3)
    expect(selected.result.workspaceState.roomState.selectedCandidateId).toBe(candidateId)

    const stored = await loadSharedEtsyRoomStore()
    expect(stored.workspaceState.revision).toBe(3)
    expect(stored.workspaceState.roomState.selectedProductPacket?.selectedCandidateId).toBe(candidateId)
  })
})
