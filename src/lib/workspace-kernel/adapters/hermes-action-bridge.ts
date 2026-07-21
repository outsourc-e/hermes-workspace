import type { WorkspaceStationActionRouterResult } from '../../war-room/living-v3/workspace-station-action-router'
import type { WorkspaceToolSurfaceId } from '../../war-room/living-v3/workspace-tool-registry'
import type { WorkspaceBlueprintId } from '../contracts'
import type { WorkspaceKernelEventIngressInput, WorkspaceKernelIngressEventType } from './hermes-event-ingress'

function blueprintIdForSurface(surfaceId: WorkspaceToolSurfaceId): WorkspaceBlueprintId {
  switch (surfaceId) {
    case 'smart-intake':
    case 'etsy-scout':
    case 'sheet-intake':
      return 'etsy-smart-product-intake-v1'
    case 'shotlab-handoff':
      return 'shotlab-media-prep-v1'
    case 'seo-workbench':
      return 'seo-alura-keyword-v1'
    case 'approval-inbox':
      return 'approval-gate-v1'
    case 'command-room-manager':
    case 'future-board':
    default:
      return 'generic-project-status-v1'
  }
}

function eventTypeForStationAction(result: WorkspaceStationActionRouterResult): WorkspaceKernelIngressEventType {
  if (result.route.stationHandoff.status === 'blocked') return 'run.blocked'
  if (result.event.kind === 'request_approval' || result.route.target.action === 'open_approval_inbox') return 'approval.requested'
  if (result.event.kind === 'stage_packet') return 'artifact.created'
  if (
    result.route.target.action === 'open_and_prefill_smart_intake' ||
    result.route.target.action === 'open_and_prefill_sheet_intake' ||
    result.route.target.action === 'open_shotlab_handoff' ||
    result.route.target.action === 'open_seo_workbench'
  ) {
    return 'artifact.created'
  }
  return 'run.started'
}

export function workspaceKernelEventIngressFromStationAction(
  result: WorkspaceStationActionRouterResult,
): WorkspaceKernelEventIngressInput {
  const eventType = eventTypeForStationAction(result)
  const blueprintId = blueprintIdForSurface(result.route.target.surfaceId)
  const stationLabel = result.route.stationHandoff.stationLabel
  return {
    producer: 'hermes',
    blueprintId,
    eventType,
    summary: [
      'Hermes Action Bridge V3 routed a typed local station event.',
      `Station: ${stationLabel}.`,
      `Readback: ${result.route.stationHandoff.readback}`,
      `Task: ${result.event.taskText}`,
      'Frozen locks remain active: no usage, no worker spawn, no external requests, no live actions.',
    ].join(' '),
    telemetry: {
      agentId: result.movement.agentId,
      targetRoomId: result.movement.roomId,
      targetStationId: result.movement.stationId,
      motion: result.movement.mode,
    },
  }
}
