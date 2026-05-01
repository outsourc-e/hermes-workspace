// Stub — exec approvals are not used in Hermes Workspace.
// Kept as a no-op to satisfy chat-screen imports without breaking chat.

export interface ApprovalRequest {
  id: string
  sessionKey: string
  command: string
  timestamp: number
  status: 'pending' | 'approved' | 'denied'
  approvalId?: string
  agentId?: string
  agentName?: string
  action?: string
  context?: string
  source?: string
  resolvedAt?: number
}

export function addApproval(
  _approval: Record<string, unknown>,
): ApprovalRequest | null {
  return null
}

export function loadApprovals(): Array<ApprovalRequest> {
  return []
}

export function saveApprovals(_approvals?: Array<ApprovalRequest>): void {}

export function respondToApproval(
  _id: string,
  _status: 'approved' | 'denied',
): void {}
