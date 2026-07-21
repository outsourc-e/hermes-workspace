import type {
  LivingV3AgentId,
  LivingV3BadgeKind,
  LivingV3Point,
  LivingV3RoomId,
  LivingV3StationId,
} from '../living-v3/living-v3-contract'

export type WarRoomRoomId = LivingV3RoomId
export type WarRoomStationId = LivingV3StationId
export type WarRoomAgentId = LivingV3AgentId
export type WarRoomTaskId = string
export type WarRoomPacketId = string
export type WarRoomApprovalId = string
export type WarRoomEventId = string
export type WarRoomRunId = string
export type WarRoomCorrelationId = string
export type WarRoomEventSource = 'ui' | 'hermes' | 'dispatcher' | 'test'
export type WarRoomEventStatus = 'received' | 'in_progress' | 'completed' | 'waiting_approval' | 'blocked' | 'failed'

export type AgentRole =
  | 'router'
  | 'strategy'
  | 'research'
  | 'forge'
  | 'merchant'
  | 'archivist'
  | 'treasury'
  | 'roster'
  | 'engineering'
  | 'gateway'
  | 'council'

export type AgentState =
  | 'idle'
  | 'walking'
  | 'working'
  | 'talking'
  | 'carrying_packet'
  | 'waiting_approval'
  | 'blocked'
  | 'resting'

export type WarRoomEventMetadata = {
  runId?: WarRoomRunId
  correlationId?: WarRoomCorrelationId
  source?: WarRoomEventSource
  status?: WarRoomEventStatus
  error?: string
  outputArtifactId?: string
}

export type AgentIntentMetadata = Pick<WarRoomEventMetadata, 'runId' | 'correlationId' | 'source'>

export type AgentIntent = AgentIntentMetadata & (
  | { type: 'say'; agentId: WarRoomAgentId; text: string; roomId?: WarRoomRoomId; stationId?: WarRoomStationId }
  | { type: 'move_to_room'; agentId: WarRoomAgentId; roomId: WarRoomRoomId }
  | { type: 'move_to_station'; agentId: WarRoomAgentId; roomId: WarRoomRoomId; stationId: WarRoomStationId }
  | { type: 'work_at_station'; agentId: WarRoomAgentId; roomId: WarRoomRoomId; stationId: WarRoomStationId; taskId?: WarRoomTaskId }
  | { type: 'carry_packet'; agentId: WarRoomAgentId; packetId: WarRoomPacketId; fromStationId: WarRoomStationId; toStationId: WarRoomStationId }
  | { type: 'request_approval'; agentId: WarRoomAgentId; taskId: WarRoomTaskId; reason: string }
  | { type: 'raise_alert'; agentId: WarRoomAgentId; severity: 'info' | 'warning' | 'blocked'; text: string }
  | { type: 'rest'; agentId: WarRoomAgentId }
)

export type WarRoomCapability =
  | 'goToStation'
  | 'say'
  | 'startWork'
  | 'carryPacket'
  | 'requestApproval'
  | 'raiseAlert'
  | 'rest'

export type Room = {
  roomId: WarRoomRoomId
  label: string
  role: string
}

export type Station = {
  stationId: WarRoomStationId
  roomId: WarRoomRoomId
  label: string
  role: string
}

export type Agent = {
  agentId: WarRoomAgentId
  label: string
  role: AgentRole
  homeRoomId: WarRoomRoomId
  capabilities: Array<WarRoomCapability>
}

export type WorkflowPacket = {
  packetId: WarRoomPacketId
  label: string
  fromStationId?: WarRoomStationId
  toStationId?: WarRoomStationId
  carriedByAgentId?: WarRoomAgentId
  status: 'created' | 'moving' | 'delivered' | 'blocked'
  createdAtMs: number
  updatedAtMs: number
}

export type Task = {
  taskId: WarRoomTaskId
  label: string
  roomId: WarRoomRoomId
  stationId?: WarRoomStationId
  assignedAgentId?: WarRoomAgentId
  status: 'created' | 'assigned' | 'in_progress' | 'waiting_approval' | 'completed' | 'blocked'
  createdAtMs: number
  updatedAtMs: number
  runId?: WarRoomRunId
  correlationId?: WarRoomCorrelationId
}

export type ApprovalEvidence = {
  evidenceId: string
  label: string
  kind: 'note' | 'file' | 'url' | 'snapshot' | 'metric'
  uri?: string
}

export type ApprovalRequest = {
  approvalId: WarRoomApprovalId
  agentId: WarRoomAgentId
  taskId?: WarRoomTaskId
  roomId?: WarRoomRoomId
  stationId?: WarRoomStationId
  reason: string
  evidence: Array<ApprovalEvidence>
  riskLevel: 'low' | 'medium' | 'high' | 'blocked'
  requestedAction: string
  allowedAction: string
  lockedAction: string
  status: 'waiting_operator' | 'approved_local_only' | 'rejected' | 'blocked'
  createdAtMs: number
  resolvedAtMs?: number
  operatorNote?: string
  runId?: WarRoomRunId
  correlationId?: WarRoomCorrelationId
}

export type SafetyLock = {
  liveExternalMutation: false
  autonomousLiveActionAllowed: false
  paidGenerationEnabled: false
  liveEtsyEnabled: false
  supplierMessagingEnabled: false
  purchasesEnabled: false
}

export type AgentBodyState = {
  agentId: WarRoomAgentId
  state: AgentState
  roomId: WarRoomRoomId
  stationId?: WarRoomStationId
  position: LivingV3Point
  currentTaskId?: WarRoomTaskId
  carriedPacketId?: WarRoomPacketId
  speech?: string
  badge: LivingV3BadgeKind
  updatedAtMs: number
}

export type WarRoomAlert = {
  alertId: string
  agentId: WarRoomAgentId
  severity: 'info' | 'warning' | 'blocked'
  text: string
  createdAtMs: number
}

export type WarRoomEconomyStats = {
  activeAgents: number
  profitToday: number
  spendToday: number
}

export type WarRoomBodyState = {
  rooms: Array<Room>
  stations: Array<Station>
  agents: Array<AgentBodyState>
  tasks: Array<Task>
  packets: Array<WorkflowPacket>
  approvals: Array<ApprovalRequest>
  alerts: Array<WarRoomAlert>
  safetyLocks: SafetyLock
  economy: WarRoomEconomyStats
  updatedAtMs: number
}

export type WarRoomEventType =
  | 'agent.intent.received'
  | 'control.local_only'
  | 'control.frozen'
  | 'agent.move.started'
  | 'agent.work.started'
  | 'agent.work.completed'
  | 'oracle.local_alura_search.started'
  | 'oracle.local_alura_search.completed'
  | 'packet.sent'
  | 'etsy.signal.received'
  | 'etsy.scout.request.created'
  | 'etsy.candidates.ready'
  | 'etsy.candidate.selected'
  | 'etsy.candidate.rejected'
  | 'etsy.shotlab.packet.created'
  | 'etsy.seo.packet.created'
  | 'etsy.draft.payload.created'
  | 'etsy.approval.requested'
  | 'etsy.pipeline.frozen'
  | 'run.failed'
  | 'agent.moved'
  | 'agent.said'
  | 'agent.started_work'
  | 'agent.completed_work'
  | 'agent.alert_raised'
  | 'agent.connection.frozen'
  | 'agent.connection.local_only'
  | 'agent.connection.armed'
  | 'agent.connection.disconnected'
  | 'agent.connection.blocked'
  | 'packet.created'
  | 'packet.moved'
  | 'approval.requested'
  | 'approval.resolved'
  | 'safety.blocked'
  | 'task.created'
  | 'task.assigned'
  | 'task.status_changed'
  | 'task.completed'

export type WarRoomEvent = {
  eventId: WarRoomEventId
  type: WarRoomEventType
  createdAtMs: number
  agentId?: WarRoomAgentId
  roomId?: WarRoomRoomId
  stationId?: WarRoomStationId
  taskId?: WarRoomTaskId
  packetId?: WarRoomPacketId
  approvalId?: WarRoomApprovalId
  payload?: Record<string, unknown>
} & WarRoomEventMetadata

export type WarRoomEventDraft = Omit<WarRoomEvent, 'eventId' | 'createdAtMs'> & { createdAtMs?: number }

export type WarRoomEventStoreInfo = {
  mode: 'memory' | 'file'
  path?: string
  warning?: string
}

export type WarRoomEventStore = {
  appendEvent: (event: WarRoomEventDraft) => WarRoomEvent
  listEvents: () => Array<WarRoomEvent>
  listEventsByAgent: (agentId: WarRoomAgentId) => Array<WarRoomEvent>
  listEventsByTask: (taskId: WarRoomTaskId) => Array<WarRoomEvent>
  resetForDev: () => void
  getInfo: () => WarRoomEventStoreInfo
}

export type WorkerProfile = {
  agentId: WarRoomAgentId
  profileId: string
  displayName: string
  roomId: WarRoomRoomId
  role: AgentRole
  description: string
  hermesProfileKey: string
}
