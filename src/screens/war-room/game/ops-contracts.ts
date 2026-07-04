export type WarRoomSideEffect =
  | 'none'
  | 'workspace-local-write'
  | 'external-read'
  | 'external-write'
  | 'paid-action'
  | 'account-action'

export type WarRoomActionStatus = 'allowed' | 'locked' | 'needs-approval' | 'unavailable'

export type WarRoomHealth = 'idle' | 'active' | 'review' | 'blocked' | 'error'

export type WarRoomMode = 'external-read-only' | 'draft-only' | 'live-approved'

export interface WarRoomPermissionGrant {
  scope: string
  granted: boolean
  source: 'safe-mode' | 'workspace' | 'integration' | 'human-approval' | 'billing' | 'unknown'
  reason: string
}

export interface WarRoomActionPermission {
  id: string
  label: string
  sideEffect: WarRoomSideEffect
  status: WarRoomActionStatus
  requiredScopes: Array<string>
  grants: Array<WarRoomPermissionGrant>
  lockReason?: string
  auditLabel: string
}

export interface WarRoomProductIntelligenceRoom {
  productCount: number
  keywordCount: number
  supplierLinkCount: number
  opportunityCount: number
  actionCount: number
  topScore: number | null
  signalLine: string
  temporaryScoring: boolean
  responsibleRoomPending: boolean
}

export interface WarRoomAgentWorkerSummary {
  id: string
  label: string
  role: string
  model: string
  provider: string
  roomId: string
  status: 'idle' | 'queued' | 'running' | 'review' | 'blocked' | 'done'
  assignmentCount: number
  activeCount: number
  blockedCount: number
  reviewCount: number
  doneCount: number
  qualityRule: string
}

export interface WarRoomAgentRoomOps {
  roomId: string
  leadWorkerId: string
  workerCount: number
  assignmentCount: number
  activeAssignments: number
  queuedAssignments: number
  blockedAssignments: number
  reviewAssignments: number
  doneAssignments: number
  line: string
  workers: Array<WarRoomAgentWorkerSummary>
}

export interface WarRoomApprovalGate {
  id: string
  roomId: string
  stationId: string
  label: string
  owner: 'DLV' | 'Workspace' | 'System'
  status: 'open-read-only' | 'draft-only' | 'blocked-until-dlv' | 'ready-for-review'
  sideEffectClass: WarRoomSideEffect
  trigger: string
  allowedNow: Array<string>
  lockedUntilApproved: Array<string>
  reviewPacket: string
  uiMetaphor: string
  auditLabel: string
}

export interface WarRoomWorkflowPacket {
  id: string
  sourceRoomId: string
  targetRoomId: string
  stationId: string
  title: string
  state: 'source-ready' | 'needs-proof' | 'draft-ready' | 'approval-waiting' | 'archived'
  artifactType: 'opportunity' | 'keyword' | 'supplier-proof' | 'draft' | 'approval' | 'archive'
  input: string
  output: string
  risk: string
  nextHandoff: string
  ownerWorkerId: string
  lockedActions: Array<string>
  sourceFeedId?: string
}

export interface WarRoomDesignNorthStar {
  version: string
  style: string
  promise: string
  bannedPatterns: Array<string>
  interactionRules: Array<string>
  roomUpgradeOrder: Array<string>
  assetPrep: Array<string>
}

export interface WarRoomRoomSummary {
  id: string
  uiRoomId: string
  apiRoomId: string
  label: string
  health: WarRoomHealth
  missionCount: number
  approvalCount: number
  eventCount: number
  workflowPacketCount: number
  primaryAgentId?: string
  source: 'local' | 'workspace' | 'external' | 'mixed'
  productIntelligence?: WarRoomProductIntelligenceRoom
  agentOps?: WarRoomAgentRoomOps
}

export interface WarRoomPulse {
  missions: number
  approvals: number
  blocked: number
  agents: Record<string, number>
}

export interface WarRoomSummaryResponse {
  ok: boolean
  phase: number
  mode: WarRoomMode
  readOnlyExternal: boolean
  workspaceDraftWritesAllowed: boolean
  fetchedAt: number
  rooms: Array<WarRoomRoomSummary>
  pulse: WarRoomPulse
  designNorthStar: WarRoomDesignNorthStar
  approvalGates: Array<WarRoomApprovalGate>
  workflowPackets: Array<WarRoomWorkflowPacket>
  sources: {
    missions: string
    sessions: string
    sessionError: string | null
    productIntelligence?: string
  }
}

export interface WarRoomFeedItem {
  id: string
  kind: 'mission' | 'session' | 'assignment' | 'product-opportunity' | 'keyword-signal' | 'supplier-proof' | 'approval-gate' | 'archive-snapshot'
  title: string
  subtitle: string
  state: string
  updatedAt: number | string | null
  roomId: string
  categoryIds: Array<string>
  sourceId: string
  summary: string
  nextAction: string | null
  blocker: string | null
}

export interface WarRoomProductIntelligenceDetail {
  roomId: string
  label: string
  role: string
  metrics: WarRoomProductIntelligenceRoom
  opportunities: Array<Record<string, unknown>>
  keywordOpportunities: Array<Record<string, unknown>>
  actionQueue: Array<Record<string, unknown>>
  workflowFunnel: Array<Record<string, unknown>>
  rules: {
    temporaryScoring: boolean
    ownerPending: string
    note: string
  }
}

export interface WarRoomRoomDetailResponse {
  ok: boolean
  phase: number
  mode: WarRoomMode
  readOnlyExternal: boolean
  workspaceDraftWritesAllowed: boolean
  fetchedAt: number
  room: WarRoomRoomSummary | null
  feed: Array<WarRoomFeedItem>
  workflowPackets: Array<WarRoomWorkflowPacket>
  /** Station-level permission contracts for the selected UI room. Keyed by station id. */
  actionsByStation: Record<string, Array<WarRoomActionPermission>>
  approvalGates: Array<WarRoomApprovalGate>
  designNorthStar: WarRoomDesignNorthStar
  productIntelligence?: WarRoomProductIntelligenceDetail | null
  sourceLine: string
  sources: WarRoomSummaryResponse['sources']
}
