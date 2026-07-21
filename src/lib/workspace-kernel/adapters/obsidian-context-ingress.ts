import { WORKSPACE_KERNEL_LOCKED_ACTIONS } from '../blueprints'
import type { WorkspaceContextPacket } from '../context-packet'
import type { WorkspaceArtifact } from '../contracts'
import type { WorkspaceKernelEventIngressInput } from './hermes-event-ingress'

export function workspaceArtifactFromObsidianContextPacket(packet: WorkspaceContextPacket): WorkspaceArtifact {
  const missingFields = packet.sourceNotes
    .filter((source) => source.status !== 'loaded')
    .map((source) => `${source.relativePath}:${source.status}`)
  return {
    artifactId: `${packet.packetId}-artifact`,
    runId: packet.packetId,
    kind: 'obsidian-context-packet',
    label: 'Obsidian Context Packet',
    summary: 'Allowlisted Obsidian context attached locally. Writeback and live actions remain locked.',
    roomId: packet.targetRoomId,
    stationId: packet.targetStationId,
    dataOrigin: 'local-only',
    evidenceIds: packet.sourceNotes
      .filter((source) => source.status === 'loaded')
      .map((source) => source.noteId),
    sourceRecordIds: packet.sourceNotes.map((source) => source.noteId),
    missingFields: packet.blocker ? [...missingFields, packet.blocker] : missingFields,
    lockedActions: packet.forbiddenActions.length ? packet.forbiddenActions : WORKSPACE_KERNEL_LOCKED_ACTIONS,
    payload: { packet },
    createdAtMs: packet.createdAtMs,
  }
}

export function workspaceKernelEventIngressFromObsidianContextPacket(
  packet: WorkspaceContextPacket,
): WorkspaceKernelEventIngressInput {
  return {
    producer: 'hermes',
    blueprintId: 'generic-project-status-v1',
    eventType: 'artifact.created',
    summary: 'Obsidian context packet staged locally. Vault writeback, worker spawn, and live marketplace actions remain locked.',
    artifact: workspaceArtifactFromObsidianContextPacket(packet),
    telemetry: {
      agentId: 'loki',
      targetRoomId: packet.targetRoomId,
      targetStationId: packet.targetStationId,
      motion: 'working',
    },
  }
}
