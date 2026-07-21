import {
  LIVING_V3_HIDDEN_AGENT_DEFINITIONS,
  LIVING_V3_WORLD_CONFIG,
  livingV3AgentById,
  livingV3RoomById,
  livingV3StationById,
} from '../living-v3/living-v3-contract'
import { appendWarRoomEvent, getWarRoomEventStoreInfo, resetWarRoomEventStoreForDev } from './event-store'
import { canAgentPerformIntent, listWarRoomCapabilities } from './capabilities'
import { resetAgentConnectionControlForDev } from './agent-connection-control'
import { DEFAULT_SAFETY_LOCKS } from './safety'
import { assertWarRoomAgentCanReceiveNewAssignment } from './worker-profiles'
import type {
  AgentBodyState,
  AgentIntent,
  ApprovalRequest,
  Task,
  WarRoomAgentId,
  WarRoomAlert,
  WarRoomApprovalId,
  WarRoomBodyState,
  WarRoomEventMetadata,
  WarRoomPacketId,
  WarRoomRoomId,
  WarRoomStationId,
  WarRoomTaskId,
  WorkflowPacket,
} from './domain'

let runtimeCounter = 0

function nextId(prefix: string) {
  runtimeCounter += 1
  return `${prefix}-${runtimeCounter}`
}

function assertKnownAgent(agentId: WarRoomAgentId) {
  const agent = livingV3AgentById(agentId)
  if (!agent) throw new Error(`Unknown agentId: ${agentId}`)
  return agent
}

function assertKnownRoom(roomId: WarRoomRoomId) {
  const room = livingV3RoomById(roomId)
  if (!room) throw new Error(`Unknown roomId: ${roomId}`)
  return room
}

function assertKnownStation(stationId: WarRoomStationId, roomId?: WarRoomRoomId) {
  const station = livingV3StationById(stationId)
  if (!station) throw new Error(`Unknown stationId: ${stationId}`)
  if (roomId && station.roomId !== roomId) {
    throw new Error(`stationId ${stationId} does not belong to roomId ${roomId}`)
  }
  return station
}

function buildInitialBodyState(nowMs = Date.now()): WarRoomBodyState {
  return {
    rooms: LIVING_V3_WORLD_CONFIG.rooms.map((room) => ({
      roomId: room.id,
      label: room.label,
      role: room.role,
    })),
    stations: LIVING_V3_WORLD_CONFIG.stations.map((station) => ({
      stationId: station.id,
      roomId: station.roomId,
      label: station.label,
      role: station.role,
    })),
    agents: [...LIVING_V3_WORLD_CONFIG.agents, ...LIVING_V3_HIDDEN_AGENT_DEFINITIONS].map((agent) => ({
      agentId: agent.id,
      state: 'idle',
      roomId: agent.home.roomId,
      position: agent.home.point,
      badge: 'idle',
      updatedAtMs: nowMs,
    })),
    tasks: [],
    packets: [],
    approvals: [],
    alerts: [],
    safetyLocks: DEFAULT_SAFETY_LOCKS,
    economy: {
      activeAgents: 0,
      profitToday: 0,
      spendToday: 0,
    },
    updatedAtMs: nowMs,
  }
}

let state = buildInitialBodyState()

function recalculateEconomy(next: WarRoomBodyState): WarRoomBodyState {
  const activeAgents = next.agents.filter((agent) => agent.state !== 'idle' && agent.state !== 'resting').length
  return {
    ...next,
    economy: {
      ...next.economy,
      activeAgents,
    },
  }
}

function updateAgent(agentId: WarRoomAgentId, update: (agent: AgentBodyState) => AgentBodyState, nowMs: number) {
  state = recalculateEconomy({
    ...state,
    agents: state.agents.map((agent) => agent.agentId === agentId ? update(agent) : agent),
    updatedAtMs: nowMs,
  })
}

function upsertPacket(packet: WorkflowPacket) {
  state = {
    ...state,
    packets: [
      ...state.packets.filter((candidate) => candidate.packetId !== packet.packetId),
      packet,
    ],
    updatedAtMs: packet.updatedAtMs,
  }
}

function metadataFrom(input?: WarRoomEventMetadata): WarRoomEventMetadata {
  return {
    runId: input?.runId,
    correlationId: input?.correlationId,
    source: input?.source,
    status: input?.status,
    error: input?.error,
    outputArtifactId: input?.outputArtifactId,
  }
}

function appendRuntimeEvent(
  event: Parameters<typeof appendWarRoomEvent>[0],
  metadata?: WarRoomEventMetadata,
) {
  return appendWarRoomEvent({
    ...metadataFrom(metadata),
    ...event,
  })
}

export function getWarRoomBodyState() {
  return state
}

export function resetWarRoomBodyRuntimeForDev(nowMs = Date.now()) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('War Room Body Runtime reset is disabled in production.')
  }
  runtimeCounter = 0
  state = buildInitialBodyState(nowMs)
  resetWarRoomEventStoreForDev()
  resetAgentConnectionControlForDev(nowMs)
  return state
}

export function dispatchWarRoomIntent(intent: AgentIntent, nowMs = Date.now()) {
  assertWarRoomAgentCanReceiveNewAssignment(intent.agentId)
  assertKnownAgent(intent.agentId)
  const capability = canAgentPerformIntent(intent)
  if (!capability.ok) {
    appendRuntimeEvent({
      type: 'safety.blocked',
      agentId: intent.agentId,
      payload: { reason: capability.reason, intent },
      createdAtMs: nowMs,
    }, { ...metadataFrom(intent), status: 'blocked', error: capability.reason })
    throw new Error(capability.reason)
  }

  appendRuntimeEvent({
    type: 'agent.intent.received',
    agentId: intent.agentId,
    payload: { intent },
    createdAtMs: nowMs,
  }, { ...metadataFrom(intent), source: intent.source ?? 'ui', status: 'received' })

  if (intent.type === 'say') {
    if (intent.roomId) assertKnownRoom(intent.roomId)
    if (intent.stationId) assertKnownStation(intent.stationId, intent.roomId)
    updateAgent(intent.agentId, (agent) => ({
      ...agent,
      state: 'talking',
      roomId: intent.roomId ?? agent.roomId,
      stationId: intent.stationId ?? agent.stationId,
      speech: intent.text,
      badge: 'active-task',
      updatedAtMs: nowMs,
    }), nowMs)
    appendRuntimeEvent({ type: 'agent.said', agentId: intent.agentId, roomId: intent.roomId, stationId: intent.stationId, payload: { text: intent.text }, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'completed' })
    return state
  }

  if (intent.type === 'move_to_room') {
    const room = assertKnownRoom(intent.roomId)
    updateAgent(intent.agentId, (agent) => ({
      ...agent,
      state: 'walking',
      roomId: room.id,
      stationId: undefined,
      position: { x: 50, y: 68 },
      speech: undefined,
      badge: 'idle',
      updatedAtMs: nowMs,
    }), nowMs)
    appendRuntimeEvent({ type: 'agent.moved', agentId: intent.agentId, roomId: room.id, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'in_progress' })
    return state
  }

  if (intent.type === 'move_to_station') {
    assertKnownRoom(intent.roomId)
    const station = assertKnownStation(intent.stationId, intent.roomId)
    updateAgent(intent.agentId, (agent) => ({
      ...agent,
      state: 'walking',
      roomId: intent.roomId,
      stationId: station.id,
      position: station.operatorSpot,
      speech: undefined,
      badge: 'idle',
      updatedAtMs: nowMs,
    }), nowMs)
    appendRuntimeEvent({ type: 'agent.moved', agentId: intent.agentId, roomId: intent.roomId, stationId: station.id, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'in_progress' })
    return state
  }

  if (intent.type === 'work_at_station') {
    assertKnownRoom(intent.roomId)
    const station = assertKnownStation(intent.stationId, intent.roomId)
    updateAgent(intent.agentId, (agent) => ({
      ...agent,
      state: 'working',
      roomId: intent.roomId,
      stationId: station.id,
      position: station.operatorSpot,
      currentTaskId: intent.taskId,
      speech: undefined,
      badge: 'active-task',
      updatedAtMs: nowMs,
    }), nowMs)
    appendRuntimeEvent({ type: 'agent.started_work', agentId: intent.agentId, roomId: intent.roomId, stationId: station.id, taskId: intent.taskId, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'in_progress' })
    return state
  }

  if (intent.type === 'carry_packet') {
    const fromStation = assertKnownStation(intent.fromStationId)
    const toStation = assertKnownStation(intent.toStationId)
    const packet: WorkflowPacket = {
      packetId: intent.packetId,
      label: intent.packetId,
      fromStationId: fromStation.id,
      toStationId: toStation.id,
      carriedByAgentId: intent.agentId,
      status: 'moving',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    }
    upsertPacket(packet)
    updateAgent(intent.agentId, (agent) => ({
      ...agent,
      state: 'carrying_packet',
      roomId: fromStation.roomId,
      stationId: fromStation.id,
      position: fromStation.operatorSpot,
      carriedPacketId: packet.packetId,
      badge: 'active-task',
      updatedAtMs: nowMs,
    }), nowMs)
    appendRuntimeEvent({ type: 'packet.created', agentId: intent.agentId, packetId: packet.packetId, stationId: fromStation.id, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'in_progress' })
    appendRuntimeEvent({ type: 'packet.moved', agentId: intent.agentId, packetId: packet.packetId, stationId: toStation.id, payload: { fromStationId: fromStation.id, toStationId: toStation.id }, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'in_progress' })
    return state
  }

  if (intent.type === 'request_approval') {
    return requestWarRoomApproval({
      agentId: intent.agentId,
      taskId: intent.taskId,
      reason: intent.reason,
      runId: intent.runId,
      correlationId: intent.correlationId,
      source: intent.source,
    }, nowMs)
  }

  if (intent.type === 'raise_alert') {
    const alert: WarRoomAlert = {
      alertId: nextId('alert'),
      agentId: intent.agentId,
      severity: intent.severity,
      text: intent.text,
      createdAtMs: nowMs,
    }
    state = {
      ...state,
      alerts: [alert, ...state.alerts].slice(0, 50),
      updatedAtMs: nowMs,
    }
    updateAgent(intent.agentId, (agent) => ({
      ...agent,
      state: intent.severity === 'blocked' ? 'blocked' : 'talking',
      speech: intent.text,
      badge: intent.severity === 'blocked' ? 'blocked' : 'alert',
      updatedAtMs: nowMs,
    }), nowMs)
    appendRuntimeEvent({ type: 'agent.alert_raised', agentId: intent.agentId, payload: alert, createdAtMs: nowMs }, { ...metadataFrom(intent), status: intent.severity === 'blocked' ? 'blocked' : 'completed' })
    if (intent.severity === 'blocked') {
      appendRuntimeEvent({ type: 'safety.blocked', agentId: intent.agentId, payload: alert, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'blocked' })
    }
    return state
  }

  assertKnownRoom('pantheon-quarters')
  const restStation = assertKnownStation('pantheon-rest-pods', 'pantheon-quarters')
  updateAgent(intent.agentId, (agent) => ({
    ...agent,
    state: 'resting',
    roomId: 'pantheon-quarters',
    stationId: restStation.id,
    position: restStation.operatorSpot,
    speech: undefined,
    badge: 'sleeping',
    updatedAtMs: nowMs,
  }), nowMs)
  appendRuntimeEvent({ type: 'agent.moved', agentId: intent.agentId, roomId: 'pantheon-quarters', stationId: restStation.id, createdAtMs: nowMs }, { ...metadataFrom(intent), status: 'completed' })
  return state
}

export const dispatchWarRoomCommand = dispatchWarRoomIntent

export function createWarRoomTask(input: {
  taskId?: WarRoomTaskId
  label: string
  roomId: WarRoomRoomId
  stationId?: WarRoomStationId
  assignedAgentId?: WarRoomAgentId
  runId?: string
  correlationId?: string
  source?: WarRoomEventMetadata['source']
}, nowMs = Date.now()) {
  assertKnownRoom(input.roomId)
  if (input.stationId) assertKnownStation(input.stationId, input.roomId)
  if (input.assignedAgentId) {
    assertWarRoomAgentCanReceiveNewAssignment(input.assignedAgentId)
    assertKnownAgent(input.assignedAgentId)
  }

  const task: Task = {
    taskId: input.taskId ?? nextId('task'),
    label: input.label,
    roomId: input.roomId,
    stationId: input.stationId,
    assignedAgentId: input.assignedAgentId,
    status: input.assignedAgentId ? 'assigned' : 'created',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    runId: input.runId,
    correlationId: input.correlationId,
  }

  state = {
    ...state,
    tasks: [...state.tasks.filter((candidate) => candidate.taskId !== task.taskId), task],
    updatedAtMs: nowMs,
  }
  appendRuntimeEvent({ type: 'task.created', taskId: task.taskId, roomId: task.roomId, stationId: task.stationId, agentId: task.assignedAgentId, payload: { label: task.label }, createdAtMs: nowMs }, { runId: input.runId, correlationId: input.correlationId, source: input.source, status: 'completed' })
  if (task.assignedAgentId) {
    appendRuntimeEvent({ type: 'task.assigned', taskId: task.taskId, roomId: task.roomId, stationId: task.stationId, agentId: task.assignedAgentId, createdAtMs: nowMs }, { runId: input.runId, correlationId: input.correlationId, source: input.source, status: 'completed' })
  }
  return task
}

export function requestWarRoomApproval(input: {
  agentId: WarRoomAgentId
  taskId?: WarRoomTaskId
  roomId?: WarRoomRoomId
  stationId?: WarRoomStationId
  reason: string
  evidence?: ApprovalRequest['evidence']
  riskLevel?: ApprovalRequest['riskLevel']
  requestedAction?: string
  allowedAction?: string
  lockedAction?: string
  operatorNote?: string
  runId?: string
  correlationId?: string
  source?: WarRoomEventMetadata['source']
}, nowMs = Date.now()) {
  assertWarRoomAgentCanReceiveNewAssignment(input.agentId)
  assertKnownAgent(input.agentId)
  const task = state.tasks.find((candidate) => candidate.taskId === input.taskId)
  const agent = state.agents.find((candidate) => candidate.agentId === input.agentId)
  const roomId = input.roomId ?? task?.roomId ?? agent?.roomId
  const stationId = input.stationId ?? task?.stationId ?? agent?.stationId
  if (roomId) assertKnownRoom(roomId)
  if (stationId) assertKnownStation(stationId, roomId)
  const approval: ApprovalRequest = {
    approvalId: nextId('approval'),
    agentId: input.agentId,
    taskId: input.taskId,
    roomId,
    stationId,
    reason: input.reason,
    evidence: input.evidence ?? [],
    riskLevel: input.riskLevel ?? 'medium',
    requestedAction: input.requestedAction ?? 'operator decision',
    allowedAction: input.allowedAction ?? 'local-only approval packet',
    lockedAction: input.lockedAction ?? 'live external mutation',
    status: 'waiting_operator',
    createdAtMs: nowMs,
    operatorNote: input.operatorNote,
    runId: input.runId,
    correlationId: input.correlationId,
  }
  state = {
    ...state,
    approvals: [approval, ...state.approvals],
    tasks: state.tasks.map((task) => task.taskId === input.taskId ? { ...task, status: 'waiting_approval', updatedAtMs: nowMs } : task),
    updatedAtMs: nowMs,
  }
  updateAgent(input.agentId, (agent) => ({
    ...agent,
    state: 'waiting_approval',
    currentTaskId: input.taskId,
    badge: 'approval',
    updatedAtMs: nowMs,
  }), nowMs)
  appendRuntimeEvent({ type: 'approval.requested', agentId: input.agentId, taskId: input.taskId, roomId, stationId, approvalId: approval.approvalId, payload: { reason: input.reason, requestedAction: approval.requestedAction, lockedAction: approval.lockedAction }, createdAtMs: nowMs }, { runId: input.runId, correlationId: input.correlationId, source: input.source, status: 'waiting_approval' })
  return state
}

export function resolveWarRoomApproval(input: {
  approvalId: WarRoomApprovalId
  status: 'approved' | 'approved_local_only' | 'rejected' | 'blocked'
  operatorNote?: string
  runId?: string
  correlationId?: string
  source?: WarRoomEventMetadata['source']
}, nowMs = Date.now()) {
  const existing = state.approvals.find((approval) => approval.approvalId === input.approvalId)
  if (!existing) throw new Error(`Unknown approvalId: ${input.approvalId}`)
  const status = input.status === 'approved' ? 'approved_local_only' : input.status
  const resolved: ApprovalRequest = { ...existing, status, resolvedAtMs: nowMs, operatorNote: input.operatorNote ?? existing.operatorNote }
  state = {
    ...state,
    approvals: state.approvals.map((approval) => approval.approvalId === input.approvalId ? resolved : approval),
    updatedAtMs: nowMs,
  }
  appendRuntimeEvent({ type: 'approval.resolved', approvalId: input.approvalId, agentId: resolved.agentId, taskId: resolved.taskId, roomId: resolved.roomId, stationId: resolved.stationId, payload: { status }, createdAtMs: nowMs }, { runId: input.runId, correlationId: input.correlationId, source: input.source, status: status === 'blocked' ? 'blocked' : 'completed' })
  return state
}

export function updateWarRoomTaskStatus(input: {
  taskId: WarRoomTaskId
  status: Task['status']
  runId?: string
  correlationId?: string
  source?: WarRoomEventMetadata['source']
  error?: string
}, nowMs = Date.now()) {
  const existing = state.tasks.find((task) => task.taskId === input.taskId)
  if (!existing) throw new Error(`Unknown taskId: ${input.taskId}`)
  const updated: Task = {
    ...existing,
    status: input.status,
    updatedAtMs: nowMs,
    runId: input.runId ?? existing.runId,
    correlationId: input.correlationId ?? existing.correlationId,
  }
  state = {
    ...state,
    tasks: state.tasks.map((task) => task.taskId === input.taskId ? updated : task),
    updatedAtMs: nowMs,
  }
  appendRuntimeEvent({
    type: input.status === 'completed' ? 'task.completed' : 'task.status_changed',
    taskId: updated.taskId,
    roomId: updated.roomId,
    stationId: updated.stationId,
    agentId: updated.assignedAgentId,
    payload: { status: updated.status },
    createdAtMs: nowMs,
  }, { runId: updated.runId, correlationId: updated.correlationId, source: input.source, status: input.status === 'blocked' ? 'blocked' : input.status === 'completed' ? 'completed' : 'in_progress', error: input.error })
  return updated
}

export function listWarRoomRuntimeCapabilities() {
  return {
    capabilities: listWarRoomCapabilities(),
    safetyLocks: DEFAULT_SAFETY_LOCKS,
    eventStore: getWarRoomEventStoreInfo(),
  }
}

export function bodyObjectExists(type: 'agent' | 'room' | 'station', id: string) {
  if (type === 'agent') return Boolean(livingV3AgentById(id as WarRoomAgentId))
  if (type === 'room') return Boolean(livingV3RoomById(id as WarRoomRoomId))
  return Boolean(livingV3StationById(id as WarRoomStationId))
}

export function createPacketId(label = 'packet'): WarRoomPacketId {
  return `${label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'packet'}-${nextId('packet')}`
}
