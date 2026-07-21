import { etsyMarketLabStationOperatorId } from '../../war-room/living-v3/etsy-station-apps'
import { getWorkspaceBlueprintById } from '../blueprints'
import {
  appendWorkspaceEvent,
  attachWorkspaceArtifact,
  createWorkspaceApprovalForRun,
  createWorkspaceRun,
  requestWorkspaceApproval,
} from '../reducer'
import { createWorkspaceAction } from '../router'
import type {
  EtsyApprovalPacket,
  EtsyBaseRoomPacket,
  EtsyDraftPayload,
  EtsyProductScoutPacket,
  EtsyRoomState,
  EtsySelectedProductPacket,
  EtsySeoPacket,
  EtsyShotLabHandoffPacket,
} from '../../war-room/living-v3/etsy-room-contracts'
import type { LivingV3AgentId, LivingV3StationId } from '../../war-room/living-v3/living-v3-contract'
import type { SmartIntakeMission } from '../../war-room/living-v3/smart-intake-v2'
import type {
  WorkspaceApproval,
  WorkspaceArtifact,
  WorkspaceArtifactKind,
  WorkspaceBlueprintId,
  WorkspaceEvent,
  WorkspaceKernelState,
  WorkspaceKernelTelemetryMotion,
  WorkspaceKernelTelemetrySnapshot,
  WorkspaceRun,
} from '../contracts'

export type EtsyKernelStageId =
  | 'intake'
  | 'selected'
  | 'shotlab'
  | 'seo'
  | 'draft'
  | 'approval'

export type EtsyKernelStageDefinition = {
  stageId: EtsyKernelStageId
  label: string
  blueprintId: WorkspaceBlueprintId
  artifactKind: WorkspaceArtifactKind
  stationId: LivingV3StationId
  nextAction: string
}

export type EtsyKernelSyncResult = {
  runs: Array<WorkspaceRun>
  createdRuns: Array<WorkspaceRun>
}

type EtsyKernelPacket =
  | EtsyProductScoutPacket
  | EtsySelectedProductPacket
  | EtsyShotLabHandoffPacket
  | EtsySeoPacket
  | EtsyDraftPayload
  | EtsyApprovalPacket

export const ETSY_KERNEL_STAGE_DEFINITIONS: Array<EtsyKernelStageDefinition> = [
  {
    stageId: 'intake',
    label: 'Intake',
    blueprintId: 'etsy-smart-product-intake-v1',
    artifactKind: 'product-candidate-packet',
    stationId: 'etsy-loki-product-hunt',
    nextAction: 'Review the local product candidate and choose it.',
  },
  {
    stageId: 'selected',
    label: 'Selected',
    blueprintId: 'etsy-smart-product-intake-v1',
    artifactKind: 'selected-product-packet',
    stationId: 'etsy-loki-product-hunt',
    nextAction: 'Create the local ShotLab handoff packet.',
  },
  {
    stageId: 'shotlab',
    label: 'ShotLab',
    blueprintId: 'shotlab-media-prep-v1',
    artifactKind: 'shotlab-handoff-packet',
    stationId: 'etsy-thor-shotlab-prep',
    nextAction: 'Review the local media handoff; paid ShotLab generation remains locked.',
  },
  {
    stageId: 'seo',
    label: 'SEO',
    blueprintId: 'seo-alura-keyword-v1',
    artifactKind: 'seo-packet',
    stationId: 'etsy-thor-seo-metrics',
    nextAction: 'Review local SEO packet and missing live metrics.',
  },
  {
    stageId: 'draft',
    label: 'Draft',
    blueprintId: 'etsy-draft-prep-v1',
    artifactKind: 'etsy-draft-preview-packet',
    stationId: 'etsy-odin-draft-approval',
    nextAction: 'Review draft preview before requesting DLV approval.',
  },
  {
    stageId: 'approval',
    label: 'Approval',
    blueprintId: 'approval-gate-v1',
    artifactKind: 'approval-packet',
    stationId: 'etsy-odin-draft-approval',
    nextAction: 'Operator approval only; no live Etsy action is enabled.',
  },
]

function packetForStage(state: EtsyRoomState, stageId: EtsyKernelStageId) {
  switch (stageId) {
    case 'intake':
      return state.scoutPacket
    case 'selected':
      return state.selectedProductPacket
    case 'shotlab':
      return state.shotLabHandoffPacket
    case 'seo':
      return state.seoPacket
    case 'draft':
      return state.draftPayload
    case 'approval':
      return state.approvalPacket
    default: {
      const _exhaustive: never = stageId
      return _exhaustive
    }
  }
}

function packetTitle(packet: EtsyKernelPacket) {
  switch (packet.kind) {
    case 'product_scout':
      return packet.query
    case 'draft_payload':
      return packet.title
    case 'selected_product':
    case 'shotlab_handoff':
    case 'seo_packet':
    case 'approval_packet':
      return packet.selectedProductTitle
    default: {
      const _exhaustive: never = packet
      return _exhaustive
    }
  }
}

function packetSummary(packet: EtsyKernelPacket, definition: EtsyKernelStageDefinition) {
  const title = packetTitle(packet)
  return `${definition.label}: ${title}. Origin ${packet.dataOrigin}; missing ${packet.missingFields.length}; locked ${packet.lockedActions.length}.`
}

function hasPacketArtifact(runs: Array<WorkspaceRun>, packetId: string, artifactKind: WorkspaceArtifactKind, packet?: EtsyBaseRoomPacket) {
  const sourceRecordIds = new Set(packet?.sourceRecordIds ?? [])
  return runs.some((run) =>
    run.artifacts.some((artifact) => {
      if (artifact.kind !== artifactKind) return false
      if (artifact.payload.originalPacketId === packetId) return true
      return artifact.sourceRecordIds.some((sourceRecordId) => sourceRecordIds.has(sourceRecordId))
    }),
  )
}

function eventId(runId: string, type: WorkspaceEvent['type'], packetId: string, createdAtMs: number) {
  const suffix = packetId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  return `${runId}-${type.replace(/\./g, '-')}-${createdAtMs}-${suffix || 'etsy'}`
}

export function etsyKernelStageForArtifactKind(kind: WorkspaceArtifactKind) {
  return ETSY_KERNEL_STAGE_DEFINITIONS.find((definition) => definition.artifactKind === kind)
}

export function createEtsyKernelArtifact(
  run: WorkspaceRun,
  packet: EtsyKernelPacket,
  definition: EtsyKernelStageDefinition,
  createdAtMs = Date.now(),
): WorkspaceArtifact {
  return {
    artifactId: `workspace-artifact-${createdAtMs}-${definition.artifactKind}-${packet.packetId}`,
    runId: run.runId,
    kind: definition.artifactKind,
    label: definition.label,
    summary: packetSummary(packet, definition),
    roomId: 'etsy-market-lab',
    stationId: definition.stationId,
    dataOrigin: packet.dataOrigin === 'live-readonly-research'
      ? 'live-readonly-research'
      : packet.dataOrigin === 'future-internet-scout'
        ? 'controlled-worker-local'
        : 'local-only',
    evidenceIds: [...packet.evidenceIds],
    sourceRecordIds: [...packet.sourceRecordIds],
    missingFields: [...packet.missingFields],
    lockedActions: [...packet.lockedActions],
    payload: {
      originalPacketId: packet.packetId,
      originalRunId: packet.runId,
      originalPacketKind: packet.kind,
      sourceStationId: packet.sourceStationId,
      targetStationId: packet.targetStationId,
      status: packet.status,
      dataOrigin: packet.dataOrigin,
      humanApprovalRequired: packet.humanApprovalRequired,
      nextHandoff: packet.nextHandoff,
      title: packetTitle(packet),
      packet,
    },
    createdAtMs,
  }
}

export function createEtsyKernelApproval(run: WorkspaceRun, packet: EtsyApprovalPacket, createdAtMs = Date.now()) {
  const blueprint = getWorkspaceBlueprintById('approval-gate-v1')
  if (!blueprint) throw new Error('Missing approval-gate-v1 blueprint')
  return {
    ...createWorkspaceApprovalForRun(run, blueprint, createdAtMs),
    status: packet.approvalStatus,
    requestedAction: packet.nextIfApproved,
    targetSystem: 'etsy',
    preview: packetSummary(packet, ETSY_KERNEL_STAGE_DEFINITIONS[5]),
    evidenceIds: [...packet.evidenceIds],
    lockedActions: [...packet.lockedActions],
  } satisfies WorkspaceApproval
}

export function createEtsyKernelRunForPacket(
  packet: EtsyKernelPacket,
  definition: EtsyKernelStageDefinition,
  createdAtMs = Date.now(),
) {
  const blueprint = getWorkspaceBlueprintById(definition.blueprintId)
  if (!blueprint) throw new Error(`Missing workspace blueprint: ${definition.blueprintId}`)
  const action = createWorkspaceAction({
    actionId: `etsy-kernel-${definition.stageId}-${packet.packetId}`,
    source: 'ui',
    intent: `etsy ${definition.stageId} local packet`,
    summary: packetSummary(packet, definition),
    domain: definition.blueprintId === 'approval-gate-v1' ? 'approval' : 'etsy',
    input: {
      text: packetSummary(packet, definition),
      payload: {
        originalPacketId: packet.packetId,
        originalRunId: packet.runId,
        stageId: definition.stageId,
        artifactKind: definition.artifactKind,
      },
    },
    preferredBlueprintId: definition.blueprintId,
    preferredRoomId: 'etsy-market-lab',
    preferredStationId: definition.stationId,
    requiresApproval: definition.stageId === 'approval',
  }, createdAtMs)
  const baseRun = createWorkspaceRun(action, {
    ...blueprint,
    roomId: 'etsy-market-lab',
    stationId: definition.stationId,
  }, createdAtMs)
  const run: WorkspaceRun = {
    ...baseRun,
    status: definition.stageId === 'approval' ? baseRun.status : 'queued',
    stage: definition.stageId === 'approval' ? baseRun.stage : 'routed',
    ownerRoomId: 'etsy-market-lab',
    ownerStationId: definition.stationId,
    nextAction: definition.nextAction,
    readback: `${definition.label} reflected into Workspace Kernel V1. ${definition.nextAction}`,
    lockedActions: [...packet.lockedActions],
  }
  const artifact = createEtsyKernelArtifact(run, packet, definition, createdAtMs + 1)
  let state: WorkspaceKernelState = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)

  const packetRouted: WorkspaceEvent = {
    eventId: eventId(run.runId, 'packet.routed', packet.packetId, createdAtMs + 2),
    runId: run.runId,
    type: 'packet.routed',
    createdAtMs: createdAtMs + 2,
    roomId: 'etsy-market-lab',
    stationId: definition.stationId,
    workerProfileId: run.assignedWorkerProfileId,
    artifactId: artifact.artifactId,
    message: `${definition.artifactKind} routed locally through Etsy Market Lab.`,
    payload: {
      originalPacketId: packet.packetId,
      artifactKind: definition.artifactKind,
      sourceRecordIds: artifact.sourceRecordIds,
      evidenceIds: artifact.evidenceIds,
      missingFields: artifact.missingFields,
      lockedActions: artifact.lockedActions,
    },
  }
  state = appendWorkspaceEvent(state, run.runId, packetRouted)

  let approval: WorkspaceApproval | undefined
  if (definition.stageId === 'approval' && packet.kind === 'approval_packet') {
    approval = createEtsyKernelApproval(state.runs[0], packet, createdAtMs + 3)
    state = requestWorkspaceApproval(state, run.runId, approval)
  }

  return {
    run: state.runs[0],
    artifact,
    approval,
  }
}

export function createSmartIntakeMissionKernelRun(mission: SmartIntakeMission, inputText: string, createdAtMs = Date.now()) {
  const blueprint = getWorkspaceBlueprintById('etsy-smart-product-intake-v1')
  if (!blueprint) throw new Error('Missing etsy-smart-product-intake-v1 blueprint')
  const match = mission.productMatches[0]
  const sourceRecordIds = Array.from(new Set([
    `smart-intake:${mission.missionId}`,
    ...mission.sources.map((source) => source.normalizedRef),
  ])).slice(0, 18)
  const evidenceIds = Array.from(new Set([
    ...mission.productMatches.flatMap((candidate) => candidate.evidenceIds),
    ...mission.productMatches.flatMap((candidate) => candidate.imageSetIds),
    ...mission.markdownDossiers.map((dossier) => `dossier:${dossier.dossierId}`),
  ])).slice(0, 24)
  const missingFields = Array.from(new Set([
    ...mission.productMatches.flatMap((candidate) => candidate.missingEvidence),
    ...mission.sources.filter((source) => source.accessState !== 'mock_readable').flatMap((source) => source.warnings),
  ])).slice(0, 18)
  const summary = `Smart Intake V2 mission ${mission.missionId} created ${mission.productMatches.length} local product match${mission.productMatches.length === 1 ? '' : 'es'}.`
  const action = createWorkspaceAction({
    actionId: `etsy-kernel-smart-intake-${mission.missionId}`,
    source: 'ui',
    intent: 'smart intake local mission result',
    summary,
    domain: 'etsy',
    input: {
      text: inputText,
      payload: {
        missionId: mission.missionId,
        sourceCount: mission.sources.length,
        matchCount: mission.productMatches.length,
      },
    },
    preferredBlueprintId: 'etsy-smart-product-intake-v1',
    preferredRoomId: 'etsy-market-lab',
    preferredStationId: 'etsy-loki-product-hunt',
  }, createdAtMs)
  const run = {
    ...createWorkspaceRun(action, blueprint, createdAtMs),
    status: 'running' as const,
    stage: 'artifact_ready' as const,
    nextAction: 'Choose a product match or prepare a local ShotLab handoff.',
    readback: `${summary} Live source reads, paid ShotLab, and Etsy actions remain locked.`,
  }
  const artifact: WorkspaceArtifact = {
    artifactId: `workspace-artifact-${createdAtMs + 1}-product-candidate-packet-${mission.missionId}`,
    runId: run.runId,
    kind: 'product-candidate-packet',
    label: 'Smart Intake product candidates',
    summary,
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    dataOrigin: 'local-only',
    evidenceIds,
    sourceRecordIds,
    missingFields,
    lockedActions: [...blueprint.lockedActions],
    payload: {
      missionId: mission.missionId,
      selectedMatchId: match?.matchId,
      selectedTitle: match?.title,
      readiness: match?.readiness,
      score: match?.score,
      sourceCount: mission.sources.length,
      matchCount: mission.productMatches.length,
      dossierCount: mission.markdownDossiers.length,
      safety: 'local-only-locked',
    },
    createdAtMs: createdAtMs + 1,
  }
  return attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact).runs[0]
}

export function appendEtsyKernelArtifact(
  state: WorkspaceKernelState,
  packet: EtsyKernelPacket,
  definition: EtsyKernelStageDefinition,
  createdAtMs = Date.now(),
): WorkspaceKernelState {
  if (hasPacketArtifact(state.runs, packet.packetId, definition.artifactKind, packet)) return state
  const { run } = createEtsyKernelRunForPacket(packet, definition, createdAtMs)
  return {
    runs: [run, ...state.runs],
  }
}

export function syncEtsyPipelineToWorkspaceRun(
  runs: Array<WorkspaceRun>,
  roomState: EtsyRoomState,
  createdAtMs = Date.now(),
): EtsyKernelSyncResult {
  let state: WorkspaceKernelState = { runs }
  const createdRuns: Array<WorkspaceRun> = []
  ETSY_KERNEL_STAGE_DEFINITIONS.forEach((definition, index) => {
    const packet = packetForStage(roomState, definition.stageId)
    if (!packet || hasPacketArtifact(state.runs, packet.packetId, definition.artifactKind, packet)) return
    const { run } = createEtsyKernelRunForPacket(packet, definition, createdAtMs + index * 10)
    state = { runs: [run, ...state.runs] }
    createdRuns.push(run)
  })
  return {
    runs: state.runs.slice(0, 18),
    createdRuns,
  }
}

export function buildEtsyKernelStageTimeline(runs: Array<WorkspaceRun>) {
  return ETSY_KERNEL_STAGE_DEFINITIONS.map((definition) => {
    const run = runs.find((candidate) =>
      candidate.ownerRoomId === 'etsy-market-lab'
      && candidate.artifacts.some((artifact) => artifact.kind === definition.artifactKind),
    )
    const artifact = run?.artifacts.find((item) => item.kind === definition.artifactKind)
    return {
      ...definition,
      runId: run?.runId,
      artifactId: artifact?.artifactId,
      status: run ? run.status : 'pending',
      hasArtifact: Boolean(artifact),
      hasEvent: Boolean(run?.events.some((event) => event.artifactId === artifact?.artifactId || event.payload?.artifactKind === definition.artifactKind)),
      approvalStatus: run?.approvals[0]?.status ?? (run?.status === 'waiting_approval' ? 'waiting_operator' : 'not_required'),
    }
  })
}

export function workspaceKernelTelemetryFromRun(
  run: WorkspaceRun,
  input: {
    stationActionId?: string
    agentId?: LivingV3AgentId
    motion?: WorkspaceKernelTelemetryMotion
    artifactKind?: WorkspaceArtifactKind
    eventId?: string
  } = {},
): WorkspaceKernelTelemetrySnapshot {
  const artifact = input.artifactKind
    ? run.artifacts.find((candidate) => candidate.kind === input.artifactKind)
    : run.artifacts[0]
  const stationId = run.ownerStationId
  const agentId = input.agentId
    ?? (stationId ? etsyMarketLabStationOperatorId(stationId) : null)
    ?? 'hermes'
  return {
    runId: run.runId,
    blueprintId: run.blueprintId,
    stationActionId: input.stationActionId,
    agentId,
    motion: input.motion ?? 'basic_station_walk',
    roomId: run.ownerRoomId,
    stationId,
    artifactKind: artifact?.kind ?? input.artifactKind ?? 'generic-workspace-packet',
    approvalStatus: run.approvals[0]?.status ?? (run.status === 'waiting_approval' ? 'waiting_operator' : 'not_required'),
    lockedActionCount: artifact?.lockedActions.length ?? run.lockedActions.length,
    safety: 'local-only-locked',
    readback: run.readback,
    eventId: input.eventId,
  }
}
