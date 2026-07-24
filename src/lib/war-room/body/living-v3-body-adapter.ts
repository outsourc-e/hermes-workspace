import { livingV3AgentById, livingV3StationById } from '../living-v3/living-v3-contract'
import type {
  LivingV3Alert,
  LivingV3ApprovalPacket,
  LivingV3HermesAdapterState,
  LivingV3TaskIntent,
  LivingV3TaskKind,
} from '../living-v3/hermes-adapter'
import type {
  AgentBodyState,
  ApprovalRequest,
  WarRoomAlert,
  WarRoomBodyState,
  WarRoomEvent,
} from './domain'

function taskKindForAgent(agent: AgentBodyState): LivingV3TaskKind | null {
  if (agent.state === 'idle') return null
  if (agent.state === 'walking') return 'move'
  if (agent.state === 'working') return 'work'
  if (agent.state === 'talking') return 'talk'
  if (agent.state === 'carrying_packet') return 'work'
  if (agent.state === 'waiting_approval') return 'approval'
  if (agent.state === 'resting') return 'rest'
  return 'approval'
}

function taskBadgeForAgent(agent: AgentBodyState) {
  if (agent.state === 'waiting_approval') return 'approval' as const
  if (agent.state === 'blocked') return 'blocked' as const
  if (agent.state === 'resting') return 'sleeping' as const
  if (agent.state === 'idle') return 'idle' as const
  return agent.badge
}

function latestEventForAgent(events: Array<WarRoomEvent>, agentId: AgentBodyState['agentId']) {
  return [...events].reverse().find((event) => event.agentId === agentId) ?? null
}

function bodyAgentToTask(agent: AgentBodyState, events: Array<WarRoomEvent>, nowMs: number): LivingV3TaskIntent | null {
  const kind = taskKindForAgent(agent)
  const definition = livingV3AgentById(agent.agentId)
  if (!kind || !definition) return null
  const latest = latestEventForAgent(events, agent.agentId)
  const station = agent.stationId ? livingV3StationById(agent.stationId) : null
  const createdAtMs = latest?.createdAtMs ?? agent.updatedAtMs
  const target = station?.operatorSpot ?? agent.position
  const from = kind === 'move'
    ? definition.home
    : { roomId: agent.roomId, point: target }

  return {
    id: `${agent.agentId}-${kind}-${latest?.eventId ?? agent.updatedAtMs}`,
    agentId: agent.agentId,
    kind,
    label: agent.speech ?? latest?.payload?.text?.toString() ?? agent.currentTaskId ?? definition.role,
    roomId: station?.roomId ?? agent.roomId,
    stationId: agent.stationId,
    from,
    target,
    createdAtMs,
    travelDurationMs: kind === 'move' ? 2400 : 1,
    holdDurationMs: kind === 'rest' ? 90_000 : 60_000,
    badge: taskBadgeForAgent(agent),
    packetLabel: agent.carriedPacketId ?? (agent.state === 'talking' ? 'chat packet' : null),
  }
}

function bodyAlertToLivingAlert(alert: WarRoomAlert, state: WarRoomBodyState): LivingV3Alert {
  const agent = state.agents.find((candidate) => candidate.agentId === alert.agentId)
  return {
    id: alert.alertId,
    roomId: agent?.roomId ?? 'olympus-command',
    stationId: agent?.stationId,
    agentId: alert.agentId,
    badge: alert.severity === 'blocked' ? 'blocked' : 'alert',
    label: alert.text,
    createdAtMs: alert.createdAtMs,
  }
}

function approvalStationId(approval: ApprovalRequest, state: WarRoomBodyState): LivingV3ApprovalPacket['stationId'] {
  if (approval.stationId && livingV3StationById(approval.stationId)) return approval.stationId
  const agent = state.agents.find((candidate) => candidate.agentId === approval.agentId)
  if (agent?.stationId && livingV3StationById(agent.stationId)) return agent.stationId
  return 'mission-router'
}

function bodyApprovalToLivingApproval(approval: ApprovalRequest, state: WarRoomBodyState): LivingV3ApprovalPacket {
  return {
    id: approval.approvalId,
    agentId: approval.agentId,
    stationId: approvalStationId(approval, state),
    label: approval.reason,
    createdAtMs: approval.createdAtMs,
    status: approval.status === 'approved_local_only' ? 'local-only' : 'waiting-operator',
  }
}

function eventToLivingAlert(event: WarRoomEvent): LivingV3Alert | null {
  if (![
    'agent.move.started',
    'agent.work.started',
    'oracle.local_alura_search.started',
    'oracle.local_alura_search.completed',
    'packet.created',
    'packet.sent',
    'etsy.signal.received',
    'run.failed',
  ].includes(event.type)) {
    return null
  }
  const payload = event.payload ?? {}
  const signalPacket = payload.signalPacket && typeof payload.signalPacket === 'object'
    ? payload.signalPacket as { selectedKeyword?: unknown }
    : null
  const selectedKeyword = typeof signalPacket?.selectedKeyword === 'string' ? signalPacket.selectedKeyword : undefined
  const label = typeof payload.readback === 'string'
    ? payload.readback
    : event.type === 'packet.sent'
      ? `Oracle signal packet sent to Etsy${selectedKeyword ? `: ${selectedKeyword}` : ''}`
      : event.type === 'packet.created'
        ? `Oracle signal packet created${selectedKeyword ? `: ${selectedKeyword}` : ''}`
        : event.type === 'oracle.local_alura_search.completed'
          ? `Oracle local Alura search completed${selectedKeyword ? `: ${selectedKeyword}` : ''}`
          : event.type === 'run.failed'
            ? `Oracle local run failed: ${event.error ?? 'unknown error'}`
            : event.type
  return {
    id: `event-${event.eventId}`,
    roomId: event.type === 'etsy.signal.received' ? 'etsy-market-lab' : event.roomId ?? 'oracle-signals',
    stationId: event.type === 'etsy.signal.received' ? 'etsy-loki-product-hunt' : event.stationId,
    agentId: event.agentId,
    badge: event.type === 'run.failed' ? 'blocked' : event.type.includes('completed') || event.type.includes('sent') || event.type.includes('received') ? 'active-task' : 'alert',
    label,
    createdAtMs: event.createdAtMs,
  }
}

export function livingV3AdapterStateFromBodyRuntime(
  state: WarRoomBodyState,
  events: Array<WarRoomEvent> = [],
  nowMs = Date.now(),
): LivingV3HermesAdapterState {
  return {
    epochMs: state.updatedAtMs || nowMs,
    tasks: state.agents
      .map((agent) => bodyAgentToTask(agent, events, nowMs))
      .filter((task): task is LivingV3TaskIntent => Boolean(task)),
    alerts: [
      ...events
        .map(eventToLivingAlert)
        .filter((alert): alert is LivingV3Alert => Boolean(alert))
        .reverse(),
      ...state.alerts.map((alert) => bodyAlertToLivingAlert(alert, state)),
    ].slice(0, 12),
    approvals: state.approvals
      .filter((approval) => approval.status === 'waiting_operator' || approval.status === 'approved_local_only')
      .map((approval) => bodyApprovalToLivingApproval(approval, state))
      .slice(0, 12),
  }
}
