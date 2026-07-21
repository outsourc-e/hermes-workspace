// War Room 10h Event-Driven Run — typed control-spine contracts.
// Source of truth: docs/status/architecture/war-room-10h-connected-rooms-control-spine-contract-20260616.md
// This file is local/read-only scaffolding only. No live shop/supplier/paid/account/Discord actions are enabled.

export type WarRoomId =
  | 'olympus-command'
  | 'agora-opportunity'
  | 'oracle-signals'
  | 'forge-hephaestus'
  | 'merchant-harbor'
  | 'atlantis-vault'
  | 'treasury-commerce'
  | 'roman-dev-studio'
  | 'gateway-discord-cockpit'
  | 'rest-agent-lounge'

export type WarRoomStationKind =
  | 'intake'
  | 'planning'
  | 'implementation'
  | 'qa'
  | 'review'
  | 'approval'
  | 'connector'
  | 'archive'
  | 'asset-workbench'
  | 'rest'

export type WarRoomWorkflowPacketKind =
  | 'task'
  | 'research-request'
  | 'implementation'
  | 'qa-review'
  | 'safety-review'
  | 'asset-request'
  | 'connector-readiness'
  | 'action-draft'
  | 'artifact-handoff'
  | 'approval-lock'

export type WarRoomStationVisualState =
  | 'idle'
  | 'active-work'
  | 'output-ready'
  | 'blocked'
  | 'manual-approval-needed'

export type WarRoomStationStateContract = {
  visualStates: Array<WarRoomStationVisualState>
  allowedActivities: Array<WarRoomStationActivity>
  externalActionCapable: false
  manualApprovalRequiredForLiveAction: true
}

export type WarRoomStation = {
  id: string
  roomId: WarRoomId
  label: string
  kind: WarRoomStationKind
  acceptsPacketKinds: Array<WarRoomWorkflowPacketKind>
  externalActionCapable: boolean
  defaultLocked: true
  stateContract: WarRoomStationStateContract
}

export type WarRoomRoomModuleContract = {
  moduleShape: 'horizontal-rectangle'
  allRoomsViewScale: 'miniature-self-contained-room'
  corridorConnection: 'physical-paved-corridor-or-bridge'
  theme: 'Hermes/Olympus modular pixel room'
  doorSides: Array<'N' | 'S' | 'E' | 'W'>
  visualStates: Array<
    'idle' | 'active' | 'selected' | 'blocked' | 'manual-approval-needed'
  >
}

export type WarRoomCorridor = {
  id: string
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  sourceStationId?: string
  targetStationId?: string
  label: string
  allowedPacketKinds: Array<WarRoomWorkflowPacketKind>
  safetyBoundary: 'local-only' | 'approval-gated-external-boundary'
  direction: 'one-way' | 'two-way'
  visualPriority: 'primary' | 'secondary' | 'background'
}

export type WarRoomRoomGraph = {
  rooms: Array<{
    id: WarRoomId
    label: string
    role: string
    moduleContract: WarRoomRoomModuleContract
    stations: Array<WarRoomStation>
    popupDefaultStationId: string
  }>
  corridors: Array<WarRoomCorridor>
}

export type WarRoomAgentAnimationDirection =
  | 'N'
  | 'S'
  | 'E'
  | 'W'
  | 'NE'
  | 'NW'
  | 'SE'
  | 'SW'

export type WarRoomAgentRoleState =
  | 'idle'
  | 'walk'
  | 'work-use-station'
  | 'talk'
  | 'carry-packet'
  | 'rest-recharge'
  | 'blocked-thinking'

export type WarRoomAgentStateContract = {
  id: string
  roomId: WarRoomId
  label: string
  minimumFrameCount: 50
  targetFrameCount: 96
  movementTempo: 'slow-real-directional'
  directions: Array<WarRoomAgentAnimationDirection>
  roleStates: Array<WarRoomAgentRoleState>
  reducedMotionFallback: 'station-marker-only'
}

export type WarRoomPacketState =
  | 'moving-along-road'
  | 'waiting-at-entrance'
  | 'carried-by-agent'
  | 'opened-at-station'
  | 'approved-sealed'
  | 'blocked'

export type WarRoomPacketStateContract = {
  kind: WarRoomWorkflowPacketKind
  allowedStates: Array<WarRoomPacketState>
  externalMutation: false
  routeConstraint: 'physical-corridor-only'
}

export type WarRoomManualLiveActionSkeletonState =
  | 'draft-preview'
  | 'risk-evidence-summary'
  | 'queued-for-dlv-manual-review'
  | 'approved-by-human-only'
  | 'blocked-by-safety-spine'
  | 'audit-log-local-only'

export type WarRoomLockContract = {
  readOnlyAllowed: true
  dryRunAllowed: true
  localDraftAllowed: true
  autonomousLiveActionAllowed: false
  externalNetworkWritesAllowed: false
  credentialLoadingAllowedByDefault: false
  manualLiveActionSkeletonStates: Array<WarRoomManualLiveActionSkeletonState>
}

export type WarRoomStateContracts = {
  rooms: Array<WarRoomRoomModuleContract & { roomId: WarRoomId }>
  agents: Array<WarRoomAgentStateContract>
  packets: Array<WarRoomPacketStateContract>
  stations: Array<WarRoomStationStateContract & { stationId: string; roomId: WarRoomId }>
  locks: WarRoomLockContract
}

export type WarRoomReviewLock = {
  required: boolean
  reason: string
  lockedActionIds: Array<string>
  requiredReviewerLane:
    | 'visualqaagent'
    | 'chatgptheavy'
    | 'releaseagent'
    | 'DLV'
    | 'none'
  approvalState:
    | 'not-required'
    | 'required'
    | 'blocked'
    | 'approved-by-human-only'
  externalMutationAllowed: false
}

export type WarRoomArtifactProvenance =
  | 'local-workspace'
  | 'read-only-api'
  | 'dry-run'
  | 'fixture'
export type WarRoomArtifactFinalQualityClaim =
  | 'none'
  | 'prototype'
  | 'qa-evidence-only'
  | 'release-reviewed'

export type WarRoomArtifactRef = {
  id: string
  kind:
    | 'doc'
    | 'screenshot'
    | 'manifest'
    | 'local-file'
    | 'api-evidence'
    | 'draft'
  label: string
  pathOrUrl: string
  provenance: WarRoomArtifactProvenance
  finalQualityClaim: WarRoomArtifactFinalQualityClaim
}

export type WarRoomWorkerRole =
  | 'conductor'
  | 'architect'
  | 'implementer'
  | 'qa'
  | 'reviewer'
  | 'asset-worker'
  | 'connector-worker'

export type WarRoomWorker = {
  id: string
  profile: string
  role: WarRoomWorkerRole
  displayName: string
}

export type WarRoomStationActivity =
  | 'queued'
  | 'in-progress'
  | 'waiting-review'
  | 'blocked'
  | 'complete'
  | 'archived'

export type WarRoomWorkflowPacket = {
  id: string
  kind: WarRoomWorkflowPacketKind
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  sourceStationId: string
  targetStationId: string
  corridorId: string
  worker: WarRoomWorker
  station: {
    currentStationId: string
    targetStationId: string
    activity: WarRoomStationActivity
  }
  artifact: WarRoomArtifactRef | null
  reviewLock: WarRoomReviewLock
  sourceTaskId?: string
  childTaskIds: Array<string>
  connectorId?: string
  createdAt: string
  updatedAt: string
  safety: WarRoomSafetySpine
}

export type WarRoomAgentMovementState =
  | 'idle-at-room'
  | 'queued-at-source'
  | 'walking-corridor'
  | 'working-at-station'
  | 'waiting-review-lock'
  | 'blocked-at-gate'
  | 'returning-with-artifact'
  | 'archived-static'
  | 'degraded-static'

export type WarRoomAgentMovement = {
  packetId: string
  workerId: string
  state: WarRoomAgentMovementState
  sourceRoomId: WarRoomId
  targetRoomId: WarRoomId
  corridorId: string
  currentStationId: string
  targetStationId: string
  progress: number
  motionReason: string
  reducedMotionFallback: 'station-marker-only'
}

export type WarRoomActionClass =
  | 'allowedLocalDraft'
  | 'allowedReadOnly'
  | 'lockedLive'

export type WarRoomActionBlueprint = {
  id: string
  label: string
  actionClass: WarRoomActionClass
  trigger: string
  router: WarRoomId
  packetKind: WarRoomWorkflowPacketKind
  roomId: WarRoomId
  stationId: string
  connectorId?: string
  outputArtifactKind: WarRoomArtifactRef['kind']
  approvalGate: string
  archiveRoomId: WarRoomId
  feedbackLoop: WarRoomId
  payloadPreviewRequired: true
  riskEvidenceSummaryRequired: true
  localAuditLogRequired: true
  liveExecutionEnabled: false
  externalMutation: false
  notes: Array<string>
}

export type WarRoomConnectorMode =
  | 'disabled'
  | 'read-only'
  | 'dry-run'
  | 'draft-only'

export type WarRoomConnectorLockState =
  | 'NOT_CONNECTED'
  | 'READ_ONLY_READY'
  | 'DRY_RUN_ONLY'
  | 'DRAFT_ONLY'
  | 'BLOCKED_FOR_DLV_APPROVAL'

export type WarRoomConnectorCapabilityActionKind =
  | 'read-status'
  | 'read-metrics'
  | 'prepare-draft'
  | 'validate-local-draft'

export type WarRoomConnectorCapability = {
  id: string
  label: string
  actionKind: WarRoomConnectorCapabilityActionKind
  externalMutation: false
  requiresDlvApproval: true
  allowedModes: Array<WarRoomConnectorMode>
}

export type WarRoomConnectorCategory =
  | 'store'
  | 'supplier'
  | 'analytics'
  | 'asset-tool'
  | 'workspace-tool'

export type WarRoomConnectorStatusEvidence = {
  label: string
  provenance: 'local-fixture' | 'local-dry-run' | 'read-only-local-cache'
  value: string
}

export type WarRoomConnectorRegistryEntry = {
  id: string
  label: string
  roomId: WarRoomId
  category: WarRoomConnectorCategory
  lockState: WarRoomConnectorLockState
  mode: WarRoomConnectorMode
  credentialsRequired: boolean
  credentialsLoaded: false
  liveApiCallsEnabled: false
  networkWritesEnabled: false
  capabilities: Array<WarRoomConnectorCapability>
  statusEvidence: Array<WarRoomConnectorStatusEvidence>
}

export type WarRoomConnectorActionDraftStatus =
  | 'draft'
  | 'queued-for-human-review'
  | 'rejected-by-safety-spine'

export type WarRoomConnectorActionDraft = {
  id: string
  connectorId: string
  roomId: WarRoomId
  packetId: string
  actionKind: string
  mode: 'dry-run' | 'draft-only'
  status: WarRoomConnectorActionDraftStatus
  externalMutation: false
  requiresDlvApproval: true
  evidence: Array<string>
}

export type WarRoomActionDraftQueue = {
  queueId: string
  roomId: WarRoomId
  mode: WarRoomConnectorMode
  externalMutation: false
  liveEnabled: false
  drafts: Array<WarRoomConnectorActionDraft>
}

export type WarRoomApprovalQueueEntryStatus =
  | 'pending'
  | 'approved-by-human-only'
  | 'rejected'
  | 'blocked-by-safety-spine'

export type WarRoomApprovalQueueEntry = {
  id: string
  roomId: WarRoomId
  packetId: string
  actionDraftId: string
  connectorId: string
  requestedAction: string
  status: WarRoomApprovalQueueEntryStatus
  externalMutation: false
  requiresDlvApproval: true
  reviewerLane: 'DLV' | 'chatgptheavy' | 'releaseagent' | 'visualqaagent'
  reason: string
}

export type WarRoomApprovalQueue = {
  queueId: string
  externalMutation: false
  autoApprovalEnabled: false
  entries: Array<WarRoomApprovalQueueEntry>
}

export type WarRoomSafetySpine = {
  externalActionsEnabled: false
  liveEtsyEnabled: false
  liveSupplierEnabled: false
  paidGenerationEnabled: false
  discordSideEffectsEnabled: false
  credentialsLoadedByDefault: false
  connectorLiveModeEnabled: false
  workspaceWritesAllowed: true
  kanbanUiMutationsAllowed: false
  approvalRequiredForExternalActions: true
  noAutoApproval: true
  noOverclaimFinalQuality: true
}

export type WarRoomSafetyEvidence = {
  externalActionsEnabled: false
  liveEtsyEnabled: false
  liveSupplierEnabled: false
  paidGenerationEnabled: false
  connectorLiveModeEnabled: false
  credentialsLoadedByDefault: false
  kanbanUiMutationsAllowed: false
  noEnabledLiveActionControls: true
  defaultConnectorLockState: 'NOT_CONNECTED' | 'DRY_RUN_ONLY' | 'DRAFT_ONLY'
  allowedConnectorModes: Array<WarRoomConnectorMode>
  forbiddenWithoutDlvApproval: Array<string>
}

export type WarRoomOpenRoomState = {
  mode: 'atlas' | 'room-popup'
  activeRoomId: WarRoomId | null
  openedFrom: 'room-cell' | 'corridor' | 'packet' | 'restored-state'
  focusedPacketId?: string
}

export type WarRoomControlSpineState = {
  ok: true
  version: 'war-room-10h-control-spine-v1'
  generatedAt: string
  roomGraph: WarRoomRoomGraph
  safety: WarRoomSafetySpine
  safetyEvidence: WarRoomSafetyEvidence
  stateContracts: WarRoomStateContracts
  actionBlueprintRegistry: Array<WarRoomActionBlueprint>
  connectorRegistry: Array<WarRoomConnectorRegistryEntry>
  actionDraftQueues: Array<WarRoomActionDraftQueue>
  approvalQueue: WarRoomApprovalQueue
  packets: Array<WarRoomWorkflowPacket>
  agentMovements: Array<WarRoomAgentMovement>
  openRoom: WarRoomOpenRoomState
}
