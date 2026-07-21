import { describe, expect, it } from 'vitest'

import type { WorkspaceRun } from '../workspace-kernel'
import { WORKSPACE_KERNEL_SAFETY } from '../workspace-kernel'
import { buildWorkspaceCoreOpsSnapshot } from './workspace-core-ops'

function baseRun(overrides: Partial<WorkspaceRun> = {}): WorkspaceRun {
  return {
    runId: 'run-1',
    actionId: 'action-1',
    actionSummary: 'Prepare product packet locally',
    actionInput: { text: 'prepare product packet' },
    blueprintId: 'etsy-smart-product-intake-v1',
    status: 'running',
    stage: 'artifact_ready',
    ownerRoomId: 'etsy-market-lab',
    ownerStationId: 'etsy-loki-product-hunt',
    assignedWorkerProfileId: 'controlled-scout-v2',
    createdAtMs: 100,
    updatedAtMs: 200,
    events: [],
    artifacts: [],
    approvals: [],
    lockedActions: ['publish_to_etsy'],
    nextAction: 'Wait for DLV review',
    readback: 'Local packet staged. Live actions locked.',
    safety: WORKSPACE_KERNEL_SAFETY,
    ...overrides,
  }
}

describe('Workspace Core Ops snapshot', () => {
  it('returns a safe empty local snapshot when state is missing', () => {
    const snapshot = buildWorkspaceCoreOpsSnapshot(undefined, { nowMs: 123 })

    expect(snapshot).toMatchObject({
      generatedAtMs: 123,
      source: 'workspace-kernel-local-state',
      safety: {
        localOnly: true,
        readOnly: true,
        usageAllowed: false,
        workerSpawnAllowed: false,
        externalRequestsAllowed: false,
        liveActionsAllowed: false,
      },
      counts: {
        notifications: 0,
        waitingApprovals: 0,
        artifacts: 0,
        failedRuns: 0,
        blockedRuns: 0,
        completedRuns: 0,
      },
    })
    expect(snapshot.notifications).toEqual([])
    expect(snapshot.approvals).toEqual([])
    expect(snapshot.artifacts).toEqual([])
  })

  it('derives waiting approvals, artifact rows, and warning notifications from kernel runs', () => {
    const run = baseRun({
      status: 'waiting_approval',
      approvals: [
        {
          approvalId: 'approval-1',
          runId: 'run-1',
          status: 'waiting_operator',
          riskClass: 'R3_EXTERNAL_WRITE',
          requestedAction: 'Send draft to Etsy after review',
          targetSystem: 'etsy',
          preview: 'Draft preview is ready but live upload is locked.',
          evidenceIds: ['evidence-1'],
          allowedNow: ['review locally'],
          lockedActions: ['upload_draft', 'publish_listing'],
          createdAtMs: 300,
        },
      ],
      artifacts: [
        {
          artifactId: 'artifact-1',
          runId: 'run-1',
          kind: 'etsy-draft-preview-packet',
          label: 'Draft preview',
          summary: 'Draft preview packet with SEO and ShotLab pending.',
          roomId: 'etsy-market-lab',
          stationId: 'etsy-odin-draft-approval',
          dataOrigin: 'approval-required',
          evidenceIds: ['evidence-1'],
          sourceRecordIds: ['source-1'],
          missingFields: ['ShotLab images'],
          lockedActions: ['upload_draft'],
          payload: {},
          createdAtMs: 250,
        },
      ],
    })

    const snapshot = buildWorkspaceCoreOpsSnapshot({ runs: [run] }, { nowMs: 400 })

    expect(snapshot.counts).toMatchObject({
      notifications: 3,
      waitingApprovals: 1,
      artifacts: 1,
    })
    expect(snapshot.approvals[0]).toMatchObject({
      approvalId: 'approval-1',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      status: 'waiting_operator',
      lockedActions: ['upload_draft', 'publish_listing'],
    })
    expect(snapshot.artifacts[0]).toMatchObject({
      artifactId: 'artifact-1',
      kind: 'etsy-draft-preview-packet',
      stationId: 'etsy-odin-draft-approval',
    })
    expect(snapshot.notifications.map((notification) => notification.notificationId)).toEqual([
      'approval:approval-1',
      'artifact:artifact-1',
      'run:run-1:waiting_approval',
    ])
    expect(snapshot.notifications[0]).toMatchObject({
      severity: 'warning',
      title: 'Needs your OK',
      summary: expect.stringContaining('Approve before Send draft to Etsy after review'),
      actorAgentId: 'odin',
      actorLabel: 'Odin',
      approvalId: 'approval-1',
    })
    expect(snapshot.notifications[1]).toMatchObject({
      title: 'Check: Draft preview',
      actorAgentId: 'odin',
    })
    expect(snapshot.notifications[2]).toMatchObject({
      title: 'Waiting for your OK',
      actorAgentId: 'loki',
    })
    expect(snapshot.notifications.map((notification) => notification.title)).not.toContain('Artifact ready')
    expect(snapshot.notifications.map((notification) => notification.title)).not.toContain('Run completed')
  })

  it('surfaces failed and blocked runs without enabling any live action', () => {
    const failed = baseRun({
      runId: 'failed-run',
      status: 'failed',
      updatedAtMs: 500,
      readback: 'Daily news cron failed locally.',
      ownerRoomId: 'gateway-cockpit',
      ownerStationId: 'gateway-console',
    })
    const blocked = baseRun({
      runId: 'blocked-run',
      status: 'blocked',
      updatedAtMs: 450,
      readback: 'Supplier write is blocked until DLV approval.',
      ownerRoomId: 'merchant-harbor',
      ownerStationId: 'merchant-dock',
    })

    const snapshot = buildWorkspaceCoreOpsSnapshot({ runs: [blocked, failed] }, { nowMs: 600 })

    expect(snapshot.counts).toMatchObject({ failedRuns: 1, blockedRuns: 1 })
    expect(snapshot.notifications[0]).toMatchObject({
      notificationId: 'run:failed-run:failed',
      severity: 'danger',
      roomId: 'gateway-cockpit',
    })
    expect(snapshot.notifications[1]).toMatchObject({
      notificationId: 'run:blocked-run:blocked',
      severity: 'warning',
      roomId: 'merchant-harbor',
    })
    expect(snapshot.safety).toMatchObject({
      readOnly: true,
      usageAllowed: false,
      liveActionsAllowed: false,
    })
  })
})
