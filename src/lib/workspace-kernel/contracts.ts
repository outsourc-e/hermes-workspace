import type { LivingV3AgentId, LivingV3RoomId, LivingV3StationId } from '../war-room/living-v3/living-v3-contract'

export type WorkspaceDomain =
  | 'command'
  | 'data-vault'
  | 'etsy'
  | 'shotlab'
  | 'seo-alura'
  | 'supplier'
  | 'cad-3d-print'
  | 'content-news'
  | 'gateway-discord'
  | 'approval'
  | 'agent-ops'

export type WorkspaceRiskClass =
  | 'R0_LOCAL_VIEW'
  | 'R1_LOCAL_WRITE'
  | 'R2_EXTERNAL_READ'
  | 'R3_EXTERNAL_WRITE'
  | 'R4_COST_OR_ACCOUNT'
  | 'R5_DESTRUCTIVE'

export type WorkspaceBlueprintId =
  | 'atlantis-vault-governance-v1'
  | 'etsy-smart-product-intake-v1'
  | 'etsy-live-readonly-research-v1'
  | 'etsy-draft-prep-v1'
  | 'shotlab-media-prep-v1'
  | 'seo-alura-keyword-v1'
  | 'supplier-proof-v1'
  | 'cad-3d-print-design-v1'
  | 'daily-news-content-v1'
  | 'discord-readback-v1'
  | 'generic-project-status-v1'
  | 'approval-gate-v1'

export type WorkspaceInputKind =
  | 'freeform-text'
  | 'url'
  | 'local-path'
  | 'image-ref'
  | 'sheet-ref'
  | 'product-packet'
  | 'approval-request'
  | 'generic-payload'

export type WorkspaceArtifactKind =
  | 'data-vault-audit-packet'
  | 'product-candidate-packet'
  | 'live-product-candidate-packet'
  | 'selected-product-packet'
  | 'shotlab-handoff-packet'
  | 'seo-packet'
  | 'etsy-draft-preview-packet'
  | 'supplier-proof-packet'
  | 'cad-design-packet'
  | 'print-prep-packet'
  | 'news-brief-packet'
  | 'discord-readback-packet'
  | 'approval-packet'
  | 'obsidian-context-packet'
  | 'generic-workspace-packet'

export type WorkspaceRunStage =
  | 'intake'
  | 'routed'
  | 'station_handoff'
  | 'artifact_ready'
  | 'approval'
  | 'completed'
  | 'blocked'
  | 'failed'

export type WorkspaceRunStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type WorkspaceActionSource =
  | 'operator'
  | 'hermes'
  | 'controlled-worker'
  | 'codex'
  | 'ui'
  | 'cron'
  | 'discord'
  | 'file'

export type WorkspaceApprovalStatus = 'not_required' | 'waiting_operator' | 'approved' | 'rejected' | 'needs_edit'

export type WorkspaceApprovalPolicy = {
  mode: 'not_required' | 'required_for_live_action' | 'operator_required'
  reason: string
  requiredRiskClasses: Array<WorkspaceRiskClass>
}

export type WorkspaceWorkerProfileId =
  | 'hermes-manager'
  | 'chatgpt-5-5-manager'
  | 'chatgpt-5-3-fast-worker'
  | 'codex-ui-builder'
  | 'kimi-code-worker'
  | 'claude-reviewer-pending-approval'
  | 'council-julius'
  | 'council-alexander'
  | 'council-napoleon'
  | 'council-saladin'
  | 'council-genghis'
  | 'council-hannibal'
  | 'controlled-hermes-v1'
  | 'controlled-scout-v2'
  | 'controlled-terra-v1'
  | 'controlled-poseidon-vault-v1'

export type WorkspaceWorkerProfile = {
  profileId: WorkspaceWorkerProfileId
  label: string
  roomId: LivingV3RoomId
  agentId?: LivingV3AgentId
  connected: boolean
  approvedControlledRunner: boolean
  hermesProfileId?: string
  independentProfile?: boolean
  profileScope?: 'default' | 'shared-worker' | 'council-general' | 'pending-approval'
  localOnly: true
  usageAllowed: false
  workerSpawnAllowed: false
  lockedActions: Array<string>
}

export type WorkspaceBlueprint = {
  blueprintId: WorkspaceBlueprintId
  version: string
  label: string
  domain: WorkspaceDomain
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  acceptedIntents: Array<string>
  inputKinds: Array<WorkspaceInputKind>
  outputKinds: Array<WorkspaceArtifactKind>
  allowedToolIds: Array<string>
  allowedWorkerProfileIds: Array<WorkspaceWorkerProfileId>
  riskClass: WorkspaceRiskClass
  approvalPolicy: WorkspaceApprovalPolicy
  states: Array<WorkspaceRunStage>
  lockedActions: Array<string>
  defaultNextStep: string
}

export type WorkspaceAction = {
  actionId: string
  createdAtMs: number
  source: WorkspaceActionSource
  intent: string
  summary: string
  domain?: WorkspaceDomain
  riskClass?: WorkspaceRiskClass
  requiresApproval?: boolean
  input: {
    text?: string
    urls?: Array<string>
    localPaths?: Array<string>
    files?: Array<string>
    payload?: Record<string, unknown>
  }
  requestedWorkerProfileId?: WorkspaceWorkerProfileId
  preferredBlueprintId?: WorkspaceBlueprintId
  preferredRoomId?: LivingV3RoomId
  preferredStationId?: LivingV3StationId
}

export type WorkspaceRunSafety = {
  localOnly: true
  usageAllowed: false
  workerSpawnAllowed: false
  externalRequestsAllowed: false
  liveActionsAllowed: false
}

export type WorkspaceRunPacketEventType =
  | 'packet.created'
  | 'packet.ready'
  | 'packet.offered'
  | 'packet.acknowledged'
  | 'packet.blocked'
  | 'packet.rejected'
  | 'packet.superseded'

export type WorkspaceEvent = {
  eventId: string
  runId: string
  type:
    | 'run.created'
    | 'run.routed'
    | 'run.started'
    | 'station.focused'
    | 'worker.assigned'
    | 'tool.started'
    | 'artifact.created'
    | 'packet.routed'
    | WorkspaceRunPacketEventType
    | 'approval.requested'
    | 'approval.approved'
    | 'approval.rejected'
    | 'approval.needs_edit'
    | 'run.blocked'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled'
  createdAtMs: number
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  workerProfileId?: WorkspaceWorkerProfileId
  artifactId?: string
  message: string
  payload?: Record<string, unknown>
}

export type WorkspaceArtifact = {
  artifactId: string
  runId: string
  kind: WorkspaceArtifactKind
  label: string
  summary: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  dataOrigin: 'local-only' | 'local-cache' | 'controlled-worker-local' | 'external-read-only-pending' | 'live-readonly-research' | 'approval-required'
  evidenceIds: Array<string>
  sourceRecordIds: Array<string>
  missingFields: Array<string>
  lockedActions: Array<string>
  payload: Record<string, unknown>
  createdAtMs: number
}

export type WorkspaceApprovalGrantBinding = {
  grantId: string
  approvalGrantPacketId: string
  costRiskLockPacketId: string
  costRiskLockContentHash: string
  actionId: string
  stage: string
  scopeHash: string
  maximumMinorUnits: number
  currency: string
  expiresAt: string
  status: 'issued' | 'consumed' | 'revoked'
}

export type WorkspaceApproval = {
  approvalId: string
  runId: string
  status: WorkspaceApprovalStatus
  riskClass: WorkspaceRiskClass
  requestedAction: string
  targetSystem: string
  preview: string
  evidenceIds: Array<string>
  allowedNow: Array<string>
  lockedActions: Array<string>
  grantBinding?: WorkspaceApprovalGrantBinding
  createdAtMs: number
}

export type WorkspaceRun = {
  runId: string
  actionId: string
  actionSummary: string
  actionInput: WorkspaceAction['input']
  blueprintId: WorkspaceBlueprintId
  status: WorkspaceRunStatus
  stage: WorkspaceRunStage
  ownerRoomId: LivingV3RoomId
  ownerStationId?: LivingV3StationId
  assignedWorkerProfileId?: WorkspaceWorkerProfileId
  createdAtMs: number
  updatedAtMs: number
  events: Array<WorkspaceEvent>
  artifacts: Array<WorkspaceArtifact>
  approvals: Array<WorkspaceApproval>
  executionPlanPacketId?: string
  packetRefs?: Array<string>
  runReadbackPacketId?: string
  lockedActions: Array<string>
  nextAction: string
  readback: string
  safety: WorkspaceRunSafety
}

export type WorkspaceKernelState = {
  runs: Array<WorkspaceRun>
  events?: Array<WorkspaceEvent>
  telemetry?: WorkspaceKernelTelemetrySnapshot
  schemaVersion?: 'workspace-kernel-v2'
  stateVersion?: string
  updatedAtMs?: number
}

export type WorkspaceKernelTelemetryMotion =
  | 'basic_station_walk'
  | 'walking'
  | 'working'
  | 'blocked'
  | 'waiting_approval'
  | 'idle'

export type WorkspaceKernelTelemetrySnapshot = {
  runId: string
  blueprintId: WorkspaceBlueprintId
  stationActionId?: string
  agentId: LivingV3AgentId
  motion: WorkspaceKernelTelemetryMotion
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  artifactKind: WorkspaceArtifactKind
  approvalStatus: WorkspaceApprovalStatus
  lockedActionCount: number
  safety: 'local-only-locked'
  readback: string
  eventId?: string
}

export type WorkspaceKernelPersistedState = {
  schemaVersion: 'workspace-kernel-v2'
  stateVersion: string
  updatedAtMs: number
  runs: Array<WorkspaceRun>
  events: Array<WorkspaceEvent>
  telemetry?: WorkspaceKernelTelemetrySnapshot
}

export type WorkspaceActionRouteResult = {
  action: WorkspaceAction
  blueprint: WorkspaceBlueprint
  approvalStatus: WorkspaceApprovalStatus
  requiresApproval: boolean
  reason: string
  artifactKind: WorkspaceArtifactKind
  lockedActions: Array<string>
  safety: WorkspaceRunSafety
  readback: string
}

export const WORKSPACE_KERNEL_SAFETY: WorkspaceRunSafety = {
  localOnly: true,
  usageAllowed: false,
  workerSpawnAllowed: false,
  externalRequestsAllowed: false,
  liveActionsAllowed: false,
}
