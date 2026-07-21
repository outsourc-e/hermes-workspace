export const WORKSPACE_PACKET_STATUSES = [
  'draft',
  'ready',
  'offered',
  'accepted',
  'blocked',
  'rejected',
  'superseded',
  'cancelled',
] as const

export type WorkspacePacketStatus = (typeof WORKSPACE_PACKET_STATUSES)[number]

export const WORKSPACE_PACKET_TYPES = [
  'execution-plan',
  'opportunity',
  'evidence-allowed-claims',
  'supplier-evidence',
  'listing-ready-draft',
  'asset-production',
  'print-ready',
  'context',
  'cost-risk-lock',
  'roster-availability',
  'code-automation',
  'strategic-decision',
  'delivery-request',
  'delivery-readback',
  'run-readback',
] as const

export type WorkspacePacketType = (typeof WORKSPACE_PACKET_TYPES)[number]

export function createWorkspacePacketRandomId() {
  return globalThis.crypto.randomUUID()
}

export type WorkspacePacketEndpoint = {
  roomId: string
  agentId: string | null
}

export type WorkspacePacketApprovalBinding = {
  required: boolean
  stage: string | null
  grantId: string | null
}

export type WorkspacePacketAcceptanceCriterion = {
  criterionId: string
  description: string
  required: boolean
}

export type UniversalPacketEnvelope<TPayload = unknown> = {
  packetId: string
  packetLineageId: string
  revision: number
  supersedesPacketId: string | null
  runId: string
  schemaVersion: string
  packetType: WorkspacePacketType
  from: WorkspacePacketEndpoint
  to: WorkspacePacketEndpoint
  createdAt: string
  sourceRefs: Array<string>
  evidenceRefs: Array<string>
  assumptions: Array<string>
  missingFields: Array<string>
  lockedActions: Array<string>
  approval: WorkspacePacketApprovalBinding
  acceptanceCriteria: Array<WorkspacePacketAcceptanceCriterion>
  idempotencyKey: string
  contentHash: string
  payload: TPayload
}
