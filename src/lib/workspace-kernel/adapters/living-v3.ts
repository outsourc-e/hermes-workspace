import {

  routeWorkspaceStationActionEvent
} from '../../war-room/living-v3/workspace-station-action-router'
import type {WorkspaceStationActionRouterResult} from '../../war-room/living-v3/workspace-station-action-router';
import type { LivingV3AgentId, LivingV3BadgeKind } from '../../war-room/living-v3/living-v3-contract'
import type { WorkspaceArtifact, WorkspaceBlueprintId, WorkspaceRun } from '../contracts'

function agentForBlueprint(blueprintId: WorkspaceBlueprintId): LivingV3AgentId {
  switch (blueprintId) {
    case 'etsy-smart-product-intake-v1':
      return 'loki'
    case 'etsy-draft-prep-v1':
      return 'odin'
    case 'seo-alura-keyword-v1':
      return 'thor'
    case 'shotlab-media-prep-v1':
      return 'thor'
    case 'supplier-proof-v1':
      return 'thor'
    case 'cad-3d-print-design-v1':
      return 'terra'
    case 'daily-news-content-v1':
    case 'discord-readback-v1':
      return 'heimdall'
    case 'approval-gate-v1':
      return 'odin'
    case 'generic-project-status-v1':
    default:
      return 'hermes'
  }
}

export function workspaceRunToStationAction(run: WorkspaceRun, nowMs = Date.now()): WorkspaceStationActionRouterResult | null {
  if (run.blueprintId !== 'etsy-smart-product-intake-v1') return null
  return routeWorkspaceStationActionEvent({
    eventId: `kernel-${run.runId}`,
    source: 'ui',
    kind: 'prefill_tool',
    taskText: run.actionInput.text ?? run.actionSummary,
    toolId: 'smart-intake-v2',
    stationId: 'etsy-loki-product-hunt',
    surfaceId: 'smart-intake',
    readback: `Workspace Kernel run ${run.runId} requested Smart Intake V2 local staging.`,
    payload: {
      packetLabel: run.artifacts[0]?.kind ?? 'product-candidate-packet',
    },
  }, nowMs)
}

export function workspaceRunToLivingV3Task(run: WorkspaceRun) {
  const blocked = run.status === 'blocked' || run.status === 'waiting_approval'
  return {
    agentId: agentForBlueprint(run.blueprintId),
    kind: blocked ? 'approval' as const : 'work' as const,
    label: `Kernel ${run.blueprintId}: ${run.nextAction}`,
    roomId: run.ownerRoomId,
    stationId: run.ownerStationId,
    badge: (blocked ? 'blocked' : 'active-task') as LivingV3BadgeKind,
    packetLabel: run.artifacts[0]?.kind ?? run.blueprintId,
  }
}

export function workspaceArtifactToRoomPacket(artifact: WorkspaceArtifact) {
  return {
    packetId: artifact.artifactId,
    runId: artifact.runId,
    kind: artifact.kind,
    label: artifact.label,
    roomId: artifact.roomId,
    stationId: artifact.stationId,
    dataOrigin: artifact.dataOrigin,
    missingFields: artifact.missingFields,
    lockedActions: artifact.lockedActions,
    readback: artifact.summary,
  }
}
