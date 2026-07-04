import { createDispatchedWarRoomTask, markDispatchedWarRoomTaskStatus } from './task-dispatcher'
import { appendWarRoomEvent } from './event-store'
import { assertWarRoomUsageAllowed } from './usage-guard'
import type {
  AgentIntent,
  WarRoomAgentId,
  WarRoomCorrelationId,
  WarRoomEventSource,
  WarRoomRoomId,
  WarRoomRunId,
  WarRoomStationId,
  WarRoomTaskId,
} from './domain'

export type HermesWorkerDispatchRequest = {
  agentId: WarRoomAgentId
  taskId?: WarRoomTaskId
  label: string
  roomId: WarRoomRoomId
  stationId?: WarRoomStationId
  requestedAction: string
  intentType?: AgentIntent['type']
  runId: WarRoomRunId
  correlationId: WarRoomCorrelationId
  source?: WarRoomEventSource
  explicitOperatorApproval?: boolean
}

export type HermesWorkerDispatchResult =
  | { ok: true; dryRun: true; taskId: WarRoomTaskId; runId: WarRoomRunId; correlationId: WarRoomCorrelationId }
  | { ok: false; dryRun: true; reason: string; blockedAction: string; runId?: WarRoomRunId; correlationId?: WarRoomCorrelationId }

export function blockHermesWorkerDispatch(
  request: Pick<HermesWorkerDispatchRequest, 'agentId' | 'requestedAction' | 'runId' | 'correlationId' | 'source'>,
  reason: string,
): HermesWorkerDispatchResult {
  appendWarRoomEvent({
    type: 'agent.connection.blocked',
    agentId: request.agentId,
    runId: request.runId,
    correlationId: request.correlationId,
    source: request.source ?? 'dispatcher',
    status: 'blocked',
    payload: {
      reason,
      blockedAction: request.requestedAction,
      connector: 'hermes-worker-connector',
      dryRun: true,
    },
  })
  return {
    ok: false,
    dryRun: true,
    reason,
    blockedAction: request.requestedAction,
    runId: request.runId,
    correlationId: request.correlationId,
  }
}

export function prepareHermesWorkerDispatch(request: HermesWorkerDispatchRequest): HermesWorkerDispatchResult {
  const guard = assertWarRoomUsageAllowed({
    agentId: request.agentId,
    intentType: request.intentType ?? 'work_at_station',
    requestedAction: request.requestedAction,
    runId: request.runId,
    correlationId: request.correlationId,
    source: request.source ?? 'dispatcher',
    explicitOperatorApproval: request.explicitOperatorApproval,
  })
  if (!guard.ok) {
    return {
      ok: false,
      dryRun: true,
      reason: guard.reason,
      blockedAction: guard.blockedAction,
      runId: request.runId,
      correlationId: request.correlationId,
    }
  }

  return recordHermesWorkerDryRun(request)
}

export function recordHermesWorkerDryRun(request: HermesWorkerDispatchRequest): HermesWorkerDispatchResult {
  const task = createDispatchedWarRoomTask({
    taskId: request.taskId,
    label: request.label,
    roomId: request.roomId,
    stationId: request.stationId,
    assignedAgentId: request.agentId,
    runId: request.runId,
    correlationId: request.correlationId,
    source: request.source ?? 'dispatcher',
  })
  markDispatchedWarRoomTaskStatus({
    taskId: task.taskId,
    status: 'blocked',
    runId: request.runId,
    correlationId: request.correlationId,
    source: request.source ?? 'dispatcher',
    error: 'Hermes worker connector is dry-run only; no worker was spawned.',
  })
  appendWarRoomEvent({
    type: 'agent.connection.blocked',
    agentId: request.agentId,
    roomId: request.roomId,
    stationId: request.stationId,
    taskId: task.taskId,
    runId: request.runId,
    correlationId: request.correlationId,
    source: request.source ?? 'dispatcher',
    status: 'blocked',
    payload: {
      connector: 'hermes-worker-connector',
      dryRun: true,
      requestedAction: request.requestedAction,
      reason: 'Dry-run scaffold recorded only; real Hermes workers are not connected.',
    },
  })
  return {
    ok: true,
    dryRun: true,
    taskId: task.taskId,
    runId: request.runId,
    correlationId: request.correlationId,
  }
}
