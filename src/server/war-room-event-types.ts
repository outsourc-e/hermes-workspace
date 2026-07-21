export type WarRoomEventSource = 'discord' | 'hermes' | 'codex' | 'browser' | 'cron' | 'gateway' | 'user' | 'system'

export type WarRoomEventType =
  | 'message'
  | 'task_started'
  | 'tool_call'
  | 'action'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'artifact_created'
  | 'blocked'
  | 'completed'
  | 'qa_result'
  | 'room_state'
  | 'plan_created'

export type WarRoomRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'blocked'

export type WarRoomEventState = 'queued' | 'running' | 'review' | 'blocked' | 'completed' | 'failed' | 'info'

export type WarRoomRoomId =
  | 'olympus'
  | 'pantheon'
  | 'agora'
  | 'oracle'
  | 'shotlab'
  | 'harbor'
  | 'atlantis'
  | 'treasury'
  | 'comms'
  | 'council'

export type WarRoomArtifactKind = 'image' | 'video' | 'prompt' | 'code' | 'doc' | 'qa' | 'model' | 'screenshot' | 'audio' | 'other'

export type WarRoomEvent = {
  id: string
  timestamp: number
  source: WarRoomEventSource
  sourceRef: string | null
  roomId: WarRoomRoomId
  agentId: string | null
  eventType: WarRoomEventType
  title: string
  summary: string
  state: WarRoomEventState
  riskLevel: WarRoomRiskLevel
  payload: Record<string, unknown>
}

export type WarRoomArtifact = {
  id: string
  eventId: string
  roomId: WarRoomRoomId
  agentId: string | null
  kind: WarRoomArtifactKind
  pathOrUrl: string
  status: 'draft' | 'ready' | 'blocked' | 'archived'
  metadata: Record<string, unknown>
  createdAt: number
}

export type WarRoomApproval = {
  id: string
  eventId: string
  roomId: WarRoomRoomId
  requestedBy: string
  approvalType: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  scope: Record<string, unknown>
  createdAt: number
  resolvedAt: number | null
}

export type WarRoomRoomSnapshot = {
  roomId: WarRoomRoomId
  updatedAt: number
  status: WarRoomEventState
  activeAgentCount: number
  pendingActionCount: number
  blockedCount: number
  lastSignal: string
  snapshot: Record<string, unknown>
}

export type WarRoomEventCreateInput = {
  source: WarRoomEventSource
  sourceRef?: string | null
  roomId: WarRoomRoomId
  agentId?: string | null
  eventType: WarRoomEventType
  title: string
  summary: string
  state?: WarRoomEventState
  riskLevel?: WarRoomRiskLevel
  payload?: Record<string, unknown>
}

export type WarRoomEventListOptions = {
  limit?: number
  roomId?: WarRoomRoomId
  agentId?: string
  source?: WarRoomEventSource
  eventType?: WarRoomEventType
  since?: number
}

export type WarRoomEventListResponse = {
  ok: true
  mode: 'local-jsonl'
  readOnly: true
  fetchedAt: number
  storagePath: string
  count: number
  events: Array<WarRoomEvent>
  roomSnapshots: Array<WarRoomRoomSnapshot>
}

export const WAR_ROOM_EVENT_ROOM_IDS: Array<WarRoomRoomId> = [
  'olympus',
  'pantheon',
  'agora',
  'oracle',
  'shotlab',
  'harbor',
  'atlantis',
  'treasury',
  'comms',
  'council',
]

export function isWarRoomRoomId(value: string | null | undefined): value is WarRoomRoomId {
  return Boolean(value && (WAR_ROOM_EVENT_ROOM_IDS as Array<string>).includes(value))
}
