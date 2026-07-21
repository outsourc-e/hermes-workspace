import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applySmartIntakeMatchToEtsyRoomLocal,
  createDraftPayloadLocal,
  createInitialEtsyRoomState,
  createSeoPacketLocal,
  createShotLabHandoffLocal,
  requestDlvApprovalLocal,
} from '../../war-room/living-v3/etsy-room-contracts'
import { createSmartIntakeMission, selectedSmartIntakeMatch } from '../../war-room/living-v3/smart-intake-v2'
import { workspaceRunToStationAction } from './living-v3'
import {
  buildEtsyKernelStageTimeline,
  syncEtsyPipelineToWorkspaceRun,
  workspaceKernelTelemetryFromRun,
} from './etsy-market-lab'

function createSmartIntakeRoomState() {
  const mission = createSmartIntakeMission('Find Dolaro jewelry from AliExpress links, Google Drive images, Google Sheet rows, local files, and prompt notes.')
  const match = selectedSmartIntakeMatch(mission)
  if (!match) throw new Error('Smart Intake fixture did not create a match.')
  return applySmartIntakeMatchToEtsyRoomLocal(createInitialEtsyRoomState(100), {
    mission,
    match,
    selectedImageIds: ['smart-image-fixture'],
    nowMs: 110,
  })
}

describe('Etsy Market Lab workspace kernel adapter', () => {
  it('maps Smart Intake and Selected Product packets to kernel artifacts', () => {
    const roomState = createSmartIntakeRoomState()
    const result = syncEtsyPipelineToWorkspaceRun([], roomState, 200)
    const artifactKinds = result.runs.flatMap((run) => run.artifacts.map((artifact) => artifact.kind))

    expect(artifactKinds).toContain('product-candidate-packet')
    expect(artifactKinds).toContain('selected-product-packet')
    expect(result.runs).toHaveLength(2)
    expect(result.runs.every((run) => run.ownerRoomId === 'etsy-market-lab')).toBe(true)
    expect(result.runs.every((run) => run.safety.usageAllowed === false && run.safety.workerSpawnAllowed === false)).toBe(true)
  })

  it('maps ShotLab, SEO, Draft, and Approval packets to kernel artifacts and approval state', () => {
    let roomState = createSmartIntakeRoomState()
    let kernelRuns = syncEtsyPipelineToWorkspaceRun([], roomState, 200).runs

    roomState = createShotLabHandoffLocal(roomState, { nowMs: 300 })
    kernelRuns = syncEtsyPipelineToWorkspaceRun(kernelRuns, roomState, 400).runs
    expect(kernelRuns.flatMap((run) => run.artifacts.map((artifact) => artifact.kind))).toContain('shotlab-handoff-packet')

    roomState = createSeoPacketLocal(roomState, 500)
    kernelRuns = syncEtsyPipelineToWorkspaceRun(kernelRuns, roomState, 600).runs
    expect(kernelRuns.flatMap((run) => run.artifacts.map((artifact) => artifact.kind))).toContain('seo-packet')

    roomState = createDraftPayloadLocal(roomState, 700)
    kernelRuns = syncEtsyPipelineToWorkspaceRun(kernelRuns, roomState, 800).runs
    expect(kernelRuns.flatMap((run) => run.artifacts.map((artifact) => artifact.kind))).toContain('etsy-draft-preview-packet')

    roomState = requestDlvApprovalLocal(roomState, 900)
    kernelRuns = syncEtsyPipelineToWorkspaceRun(kernelRuns, roomState, 1000).runs
    const approvalRun = kernelRuns.find((run) => run.artifacts.some((artifact) => artifact.kind === 'approval-packet'))

    expect(approvalRun?.approvals[0]).toMatchObject({
      status: 'waiting_operator',
      targetSystem: 'etsy',
    })
    expect(approvalRun?.status).toBe('waiting_approval')
    expect(approvalRun?.safety).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('builds Etsy stage timeline with artifacts and events', () => {
    let roomState = createSmartIntakeRoomState()
    roomState = createShotLabHandoffLocal(roomState, { nowMs: 300 })
    roomState = createSeoPacketLocal(roomState, 400)
    roomState = createDraftPayloadLocal(roomState, 500)
    roomState = requestDlvApprovalLocal(roomState, 600)
    const timeline = buildEtsyKernelStageTimeline(syncEtsyPipelineToWorkspaceRun([], roomState, 700).runs)

    expect(timeline.map((item) => item.artifactKind)).toEqual([
      'product-candidate-packet',
      'selected-product-packet',
      'shotlab-handoff-packet',
      'seo-packet',
      'etsy-draft-preview-packet',
      'approval-packet',
    ])
    expect(timeline.every((item) => item.hasArtifact && item.hasEvent)).toBe(true)
    expect(timeline.find((item) => item.stageId === 'approval')?.approvalStatus).toBe('waiting_operator')
  })

  it('creates persistent telemetry for an opened Etsy kernel run', () => {
    const roomState = createSmartIntakeRoomState()
    const run = syncEtsyPipelineToWorkspaceRun([], roomState, 200).runs.find((candidate) =>
      candidate.artifacts.some((artifact) => artifact.kind === 'product-candidate-packet'),
    )
    if (!run) throw new Error('Expected product candidate kernel run.')
    const stationAction = workspaceRunToStationAction(run, 300)
    const telemetry = workspaceKernelTelemetryFromRun(run, {
      stationActionId: stationAction?.actionId,
      agentId: stationAction?.movement.agentId,
      motion: stationAction?.movement.mode,
      artifactKind: 'product-candidate-packet',
    })

    expect(telemetry).toMatchObject({
      agentId: 'loki',
      motion: 'basic_station_walk',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      artifactKind: 'product-candidate-packet',
      safety: 'local-only-locked',
    })
    expect(telemetry.agentId).not.toBe('julius')
  })

  it('does not add live, network, or process call sites to the adapter', () => {
    const source = readFileSync(new URL('./etsy-market-lab.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toMatch(/\bchild_process\b|\bspawn\s*\(|\bexec\s*\(/)
  })
})
