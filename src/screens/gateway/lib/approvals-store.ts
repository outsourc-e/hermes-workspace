export type ApprovalRequest = {
  id: string
  agentId: string
  agentName: string
  action: string
  context: string
  requestedAt: number
  status: 'pending' | 'approved' | 'denied'
  resolvedAt?: number
  /** Where this approval came from — 'agent' (parsed from SSE) or 'gateway' (polled from gateway API) */
  source?: 'agent' | 'gateway'
  /** Raw gateway approval ID for resolving via the gateway API */
  gatewayApprovalId?: string
}

const APPROVALS_KEY = 'clawsuite:approvals'

export function loadApprovals(): ApprovalRequest[] {
  try {
    const raw = localStorage.getItem(APPROVALS_KEY)
    if (!raw) return []
    const all = JSON.parse(raw) as ApprovalRequest[]
    // Auto-archive resolved items older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return all.filter(a => a.status === 'pending' || (a.resolvedAt && a.resolvedAt > cutoff))
  } catch { return [] }
}

export function saveApprovals(approvals: ApprovalRequest[]): void {
  try {
    localStorage.setItem(APPROVALS_KEY, JSON.stringify(approvals))
  } catch { /* ignore */ }
}

export function addApproval(req: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'status'>): ApprovalRequest {
  const newReq: ApprovalRequest = {
    ...req,
    id: `apr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    requestedAt: Date.now(),
    status: 'pending',
  }
  const current = loadApprovals()
  saveApprovals([newReq, ...current])
  return newReq
}
