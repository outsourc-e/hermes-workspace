import {
  createWarRoomTask,
  dispatchWarRoomIntent,
  getWarRoomBodyState,
  updateWarRoomTaskStatus,
} from './runtime'
import { assertWarRoomUsageAllowed } from './usage-guard'
import type {
  AgentIntent,
  Task,
  WarRoomAgentId,
  WarRoomCorrelationId,
  WarRoomEventSource,
  WarRoomRoomId,
  WarRoomRunId,
  WarRoomStationId,
  WarRoomTaskId,
} from './domain'

export type WarRoomTaskDispatcherContext = {
  runId?: WarRoomRunId
  correlationId?: WarRoomCorrelationId
  source?: WarRoomEventSource
  usageConsuming?: boolean
  requestedAction?: string
  explicitOperatorApproval?: boolean
}

export function createDispatchedWarRoomTask(input: {
  taskId?: WarRoomTaskId
  label: string
  roomId: WarRoomRoomId
  stationId?: WarRoomStationId
  assignedAgentId?: WarRoomAgentId
} & WarRoomTaskDispatcherContext, nowMs = Date.now()) {
  return createWarRoomTask({
    ...input,
    source: input.source ?? 'dispatcher',
  }, nowMs)
}

export function assignDispatchedWarRoomTask(input: {
  taskId: WarRoomTaskId
  agentId: WarRoomAgentId
  roomId: WarRoomRoomId
  stationId?: WarRoomStationId
} & WarRoomTaskDispatcherContext, nowMs = Date.now()) {
  updateWarRoomTaskStatus({
    taskId: input.taskId,
    status: 'assigned',
    runId: input.runId,
    correlationId: input.correlationId,
    source: input.source ?? 'dispatcher',
  }, nowMs)
  return dispatchWarRoomIntent({
    type: input.stationId ? 'move_to_station' : 'move_to_room',
    agentId: input.agentId,
    roomId: input.roomId,
    stationId: input.stationId,
    runId: input.runId,
    correlationId: input.correlationId,
    source: input.source ?? 'dispatcher',
  } as AgentIntent, nowMs + 1)
}

export function dispatchWarRoomIntentSequence(input: {
  intents: Array<AgentIntent>
} & WarRoomTaskDispatcherContext, nowMs = Date.now()) {
  if (!input.intents.length) return getWarRoomBodyState()
  if (input.usageConsuming) {
    const firstIntent = input.intents[0]
    const guard = assertWarRoomUsageAllowed({
      agentId: firstIntent.agentId,
      intentType: firstIntent.type,
      requestedAction: input.requestedAction ?? firstIntent.type,
      runId: input.runId ?? firstIntent.runId,
      correlationId: input.correlationId ?? firstIntent.correlationId,
      source: input.source ?? firstIntent.source ?? 'dispatcher',
      explicitOperatorApproval: input.explicitOperatorApproval,
    })
    if (!guard.ok) {
      throw new Error(guard.reason)
    }
  }
  let state = getWarRoomBodyState()
  input.intents.forEach((intent, index) => {
    state = dispatchWarRoomIntent({
    ...intent,
    runId: intent.runId ?? input.runId,
    correlationId: intent.correlationId ?? input.correlationId,
    source: intent.source ?? input.source ?? 'dispatcher',
    }, nowMs + index)
  })
  return state
}

export function markDispatchedWarRoomTaskStatus(input: {
  taskId: WarRoomTaskId
  status: Task['status']
  error?: string
} & WarRoomTaskDispatcherContext, nowMs = Date.now()) {
  return updateWarRoomTaskStatus({
    taskId: input.taskId,
    status: input.status,
    runId: input.runId,
    correlationId: input.correlationId,
    source: input.source ?? 'dispatcher',
    error: input.error,
  }, nowMs)
}
