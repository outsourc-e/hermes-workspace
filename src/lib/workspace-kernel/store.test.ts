import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applySmartIntakeMatchToEtsyRoomLocal, createDraftPayloadLocal, createInitialEtsyRoomState, createSeoPacketLocal, createShotLabHandoffLocal, requestDlvApprovalLocal } from '../war-room/living-v3/etsy-room-contracts'
import { createSmartIntakeMission, selectedSmartIntakeMatch } from '../war-room/living-v3/smart-intake-v2'
import { buildEtsyKernelStageTimeline, syncEtsyPipelineToWorkspaceRun, workspaceKernelTelemetryFromRun } from './adapters/etsy-market-lab'
import {
  createEmptyWorkspaceKernelPersistedState,
  loadWorkspaceKernelState,
  persistWorkspaceKernelRuns,
  resetWorkspaceKernelStore,
  saveWorkspaceKernelState,
} from './store'

let tempDirs: Array<string> = []

async function tempStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'workspace-kernel-store-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('workspace kernel durable store', () => {
  it('atomically writes and reads bounded local kernel state plus JSONL events', async () => {
    const rootDir = await tempStore()
    const empty = createEmptyWorkspaceKernelPersistedState(100)
    const saved = await saveWorkspaceKernelState(empty, { rootDir, nowMs: 101 })
    const loaded = await loadWorkspaceKernelState({ rootDir, nowMs: 102 })
    const eventsText = await readFile(path.join(rootDir, 'events.jsonl'), 'utf8')

    expect(saved.schemaVersion).toBe('workspace-kernel-v2')
    expect(loaded.schemaVersion).toBe('workspace-kernel-v2')
    expect(loaded.runs).toEqual([])
    expect(eventsText).toBe('')
  })

  it('fails closed to an empty local state when the snapshot is corrupt', async () => {
    const rootDir = await tempStore()
    await writeFile(path.join(rootDir, 'state.json'), '{', 'utf8')
    const loaded = await loadWorkspaceKernelState({ rootDir, nowMs: 200 })

    expect(loaded).toMatchObject({
      schemaVersion: 'workspace-kernel-v2',
      runs: [],
      events: [],
      updatedAtMs: 200,
    })
  })

  it('persists the Etsy six-stage kernel timeline through a store round trip', async () => {
    const rootDir = await tempStore()
    const mission = createSmartIntakeMission('Dolaro AliExpress local image candidate with Google Drive and Sheet evidence.')
    const match = selectedSmartIntakeMatch(mission)
    if (!match) throw new Error('Smart Intake fixture did not create a match.')
    let roomState = applySmartIntakeMatchToEtsyRoomLocal(createInitialEtsyRoomState(300), {
      mission,
      match,
      selectedImageIds: ['smart-image-fixture'],
      nowMs: 305,
    })
    roomState = createShotLabHandoffLocal(roomState)
    roomState = createSeoPacketLocal(roomState)
    roomState = createDraftPayloadLocal(roomState)
    roomState = requestDlvApprovalLocal(roomState)

    const sync = syncEtsyPipelineToWorkspaceRun([], roomState, 310)
    const telemetryRun = sync.runs.find((run) => run.artifacts.some((artifact) => artifact.kind === 'product-candidate-packet'))!
    await persistWorkspaceKernelRuns(sync.runs, workspaceKernelTelemetryFromRun(telemetryRun, { artifactKind: 'product-candidate-packet' }), { rootDir, nowMs: 400 })
    const loaded = await loadWorkspaceKernelState({ rootDir, nowMs: 401 })
    const timeline = buildEtsyKernelStageTimeline(loaded.runs)

    expect(timeline.map((stage) => [stage.stageId, stage.hasArtifact])).toEqual([
      ['intake', true],
      ['selected', true],
      ['shotlab', true],
      ['seo', true],
      ['draft', true],
      ['approval', true],
    ])
    expect(loaded.telemetry).toMatchObject({
      agentId: 'loki',
      motion: 'basic_station_walk',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      artifactKind: 'product-candidate-packet',
      safety: 'local-only-locked',
    })

    const reset = await resetWorkspaceKernelStore({ rootDir, nowMs: 500 })
    expect(reset.runs).toEqual([])
  })
})
