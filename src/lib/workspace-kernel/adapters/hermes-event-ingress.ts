import { livingV3AgentById, livingV3RoomById, livingV3StationById } from '../../war-room/living-v3/living-v3-contract'
import { etsyMarketLabStationOperatorId } from '../../war-room/living-v3/etsy-station-apps'
import { getWorkspaceBlueprintById } from '../blueprints'
import {
  attachWorkspaceArtifact,
  blockWorkspaceRun,
  completeWorkspaceRun,
  createWorkspaceApprovalForRun,
  createWorkspaceArtifactForRun,
  createWorkspaceRun,
  requestWorkspaceApproval,
} from '../reducer'
import { createWorkspaceAction } from '../router'
import {
  WORKSPACE_KERNEL_SAFETY








} from '../contracts'
import type {WorkspaceApproval, WorkspaceArtifact, WorkspaceBlueprintId, WorkspaceEvent, WorkspaceKernelPersistedState, WorkspaceKernelTelemetryMotion, WorkspaceKernelTelemetrySnapshot, WorkspaceRun} from '../contracts';

export type WorkspaceKernelIngressProducer =
  | 'ui'
  | 'hermes'
  | 'controlled-worker'
  | 'codex-report'
  | 'cron'
  | 'discord-readback'

export type WorkspaceKernelIngressEventType =
  | 'run.started'
  | 'artifact.created'
  | 'approval.requested'
  | 'run.completed'
  | 'run.blocked'

export type WorkspaceKernelEventIngressInput = {
  producer: WorkspaceKernelIngressProducer
  runId?: string
  blueprintId?: WorkspaceBlueprintId
  eventType: WorkspaceKernelIngressEventType
  summary: string
  artifact?: WorkspaceArtifact
  approval?: WorkspaceApproval
  telemetry?: {
    agentId?: string
    targetRoomId?: string
    targetStationId?: string
    motion?: WorkspaceKernelTelemetryMotion
  }
}

export type WorkspaceKernelEventIngressResult = {
  ok: boolean
  state: WorkspaceKernelPersistedState
  event?: WorkspaceEvent
  run?: WorkspaceRun
  telemetry?: WorkspaceKernelTelemetrySnapshot
  reason: string
  safety: typeof WORKSPACE_KERNEL_SAFETY & {
    externalRequestsAllowed: false
    liveActionsAllowed: false
  }
  lockedActions: Array<string>
}

const producers: Array<WorkspaceKernelIngressProducer> = ['ui', 'hermes', 'controlled-worker', 'codex-report', 'cron', 'discord-readback']
const eventTypes: Array<WorkspaceKernelIngressEventType> = ['run.started', 'artifact.created', 'approval.requested', 'run.completed', 'run.blocked']
const liveRiskTerms = [
  'publish',
  'upload',
  'purchase',
  'buy ',
  'pay ',
  'paid generation',
  'supplier message',
  'message supplier',
  'google oauth',
  'private google',
  'browser automation',
  'discord send',
  'printer control',
  'edit live',
  'live listing',
]

function safeString(value: unknown, max = 8_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function eventId(runId: string, eventType: WorkspaceEvent['type'], nowMs: number) {
  return `${runId}-${eventType.replace(/\./g, '-')}-${nowMs}`
}

function hasLiveRisk(summary: string) {
  const text = summary.toLowerCase()
  return liveRiskTerms.some((term) => text.includes(term))
}

function normalizeInput(input: unknown): WorkspaceKernelEventIngressInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const candidate = input as Partial<WorkspaceKernelEventIngressInput>
  if (!producers.includes(candidate.producer as WorkspaceKernelIngressProducer)) return null
  if (!eventTypes.includes(candidate.eventType as WorkspaceKernelIngressEventType)) return null
  const summary = safeString(candidate.summary)
  if (!summary) return null
  const blueprint = candidate.blueprintId && getWorkspaceBlueprintById(candidate.blueprintId) ? candidate.blueprintId : undefined
  return {
    producer: candidate.producer as WorkspaceKernelIngressProducer,
    runId: safeString(candidate.runId, 180) || undefined,
    blueprintId: blueprint,
    eventType: candidate.eventType as WorkspaceKernelIngressEventType,
    summary,
    artifact: candidate.artifact,
    approval: candidate.approval,
    telemetry: candidate.telemetry,
  }
}

function actionSourceFor(producer: WorkspaceKernelIngressProducer) {
  if (producer === 'codex-report') return 'codex'
  if (producer === 'discord-readback') return 'discord'
  return producer
}

function ensureRun(
  state: WorkspaceKernelPersistedState,
  input: WorkspaceKernelEventIngressInput,
  nowMs: number,
  forceBlueprintId?: WorkspaceBlueprintId,
) {
  const existing = input.runId ? state.runs.find((run) => run.runId === input.runId) : undefined
  if (existing) return { state, run: existing, created: false }
  const blueprintId = forceBlueprintId ?? input.blueprintId ?? 'generic-project-status-v1'
  const blueprint = getWorkspaceBlueprintById(blueprintId) ?? getWorkspaceBlueprintById('generic-project-status-v1')
  if (!blueprint) throw new Error('Workspace blueprint registry is missing generic-project-status-v1')
  const action = createWorkspaceAction({
    actionId: `kernel-ingress-${nowMs}`,
    source: actionSourceFor(input.producer),
    intent: input.eventType,
    summary: input.summary,
    input: { text: input.summary },
    preferredBlueprintId: blueprint.blueprintId,
    preferredRoomId: blueprint.roomId,
    preferredStationId: blueprint.stationId,
    requiresApproval: blueprint.blueprintId === 'approval-gate-v1',
  }, nowMs)
  const run = createWorkspaceRun(action, blueprint, nowMs)
  return {
    state: {
      ...state,
      runs: [run, ...state.runs],
    },
    run,
    created: true,
  }
}

function replaceRun(state: WorkspaceKernelPersistedState, run: WorkspaceRun): WorkspaceKernelPersistedState {
  return {
    ...state,
    runs: [run, ...state.runs.filter((candidate) => candidate.runId !== run.runId)],
  }
}

function normalizeArtifact(input: WorkspaceKernelEventIngressInput, run: WorkspaceRun, nowMs: number) {
  if (input.artifact) {
    return {
      ...input.artifact,
      runId: run.runId,
      roomId: input.artifact.roomId,
      stationId: input.artifact.stationId ?? run.ownerStationId,
      lockedActions: input.artifact.lockedActions.length ? input.artifact.lockedActions : run.lockedActions,
      createdAtMs: input.artifact.createdAtMs || nowMs,
    } satisfies WorkspaceArtifact
  }
  const blueprint = getWorkspaceBlueprintById(run.blueprintId) ?? getWorkspaceBlueprintById('generic-project-status-v1')
  if (!blueprint) throw new Error('Workspace blueprint registry is missing generic-project-status-v1')
  return createWorkspaceArtifactForRun(run, blueprint, nowMs)
}

function normalizeApproval(input: WorkspaceKernelEventIngressInput, run: WorkspaceRun, nowMs: number) {
  if (input.approval && input.approval.approvalId) {
    return {
      ...input.approval,
      runId: run.runId,
      lockedActions: input.approval.lockedActions.length ? input.approval.lockedActions : run.lockedActions,
      createdAtMs: input.approval.createdAtMs || nowMs,
    } satisfies WorkspaceApproval
  }
  const blueprint = getWorkspaceBlueprintById(run.blueprintId) ?? getWorkspaceBlueprintById('approval-gate-v1')
  if (!blueprint) throw new Error('Workspace blueprint registry is missing approval-gate-v1')
  return createWorkspaceApprovalForRun(run, blueprint, nowMs)
}

function motionFor(eventType: WorkspaceKernelIngressEventType): WorkspaceKernelTelemetryMotion {
  switch (eventType) {
    case 'run.started':
      return 'basic_station_walk'
    case 'artifact.created':
      return 'working'
    case 'approval.requested':
      return 'waiting_approval'
    case 'run.blocked':
      return 'blocked'
    case 'run.completed':
      return 'idle'
    default: {
      const _exhaustive: never = eventType
      return _exhaustive
    }
  }
}

function telemetryFrom(input: WorkspaceKernelEventIngressInput, run: WorkspaceRun, event: WorkspaceEvent | undefined): WorkspaceKernelTelemetrySnapshot {
  const roomId = input.telemetry?.targetRoomId && livingV3RoomById(input.telemetry.targetRoomId as never)
    ? input.telemetry.targetRoomId as WorkspaceRun['ownerRoomId']
    : run.ownerRoomId
  const stationId = input.telemetry?.targetStationId && livingV3StationById(input.telemetry.targetStationId as never)
    ? input.telemetry.targetStationId as WorkspaceRun['ownerStationId']
    : run.ownerStationId
  const agentId = input.telemetry?.agentId && livingV3AgentById(input.telemetry.agentId as never)
    ? input.telemetry.agentId as WorkspaceKernelTelemetrySnapshot['agentId']
    : stationId
      ? etsyMarketLabStationOperatorId(stationId) ?? 'hermes'
      : 'hermes'
  const artifact = event?.artifactId
    ? run.artifacts.find((candidate) => candidate.artifactId === event.artifactId)
    : run.artifacts[0]
  return {
    runId: run.runId,
    blueprintId: run.blueprintId,
    eventId: event?.eventId,
    agentId,
    motion: input.telemetry?.motion ?? motionFor(input.eventType),
    roomId,
    stationId,
    artifactKind: artifact?.kind ?? 'generic-workspace-packet',
    approvalStatus: run.approvals[0]?.status ?? (run.status === 'waiting_approval' ? 'waiting_operator' : 'not_required'),
    lockedActionCount: artifact?.lockedActions.length ?? run.lockedActions.length,
    safety: 'local-only-locked',
    readback: event?.message ?? run.readback,
  }
}

export function applyWorkspaceKernelEventIngress(
  rawInput: unknown,
  state: WorkspaceKernelPersistedState,
  nowMs = Date.now(),
): WorkspaceKernelEventIngressResult {
  const input = normalizeInput(rawInput)
  if (!input) {
    return {
      ok: false,
      state,
      reason: 'Invalid or unsupported kernel ingress event.',
      safety: WORKSPACE_KERNEL_SAFETY,
      lockedActions: [],
    }
  }

  const liveRisk = hasLiveRisk(input.summary)
  const ensured = ensureRun(state, input, nowMs, liveRisk ? 'approval-gate-v1' : undefined)
  let nextState = ensured.state
  let run = ensured.run

  if (liveRisk && input.eventType !== 'approval.requested') {
    const approval = normalizeApproval({ ...input, eventType: 'approval.requested' }, run, nowMs + 1)
    const runState = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    run = runState.runs[0]
    nextState = replaceRun(nextState, run)
    const event = run.events[run.events.length - 1]
    return {
      ok: true,
      state: nextState,
      event,
      run,
      telemetry: telemetryFrom({ ...input, eventType: 'approval.requested', telemetry: { ...input.telemetry, motion: 'waiting_approval' } }, run, event),
      reason: 'Live-risk event was converted to a local approval gate.',
      safety: WORKSPACE_KERNEL_SAFETY,
      lockedActions: run.lockedActions,
    }
  }

  if (input.eventType === 'run.started') {
    const event: WorkspaceEvent = {
      eventId: eventId(run.runId, 'run.started', nowMs + 1),
      runId: run.runId,
      type: 'run.started',
      createdAtMs: nowMs + 1,
      roomId: run.ownerRoomId,
      stationId: run.ownerStationId,
      workerProfileId: run.assignedWorkerProfileId,
      message: input.summary,
      payload: { producer: input.producer, localOnly: true },
    }
    run = {
      ...run,
      status: 'running',
      stage: run.stage === 'intake' ? 'routed' : run.stage,
      updatedAtMs: event.createdAtMs,
      events: [...run.events, event],
    }
    nextState = replaceRun(nextState, run)
    return {
      ok: true,
      state: nextState,
      event,
      run,
      telemetry: telemetryFrom(input, run, event),
      reason: 'Kernel run started locally.',
      safety: WORKSPACE_KERNEL_SAFETY,
      lockedActions: run.lockedActions,
    }
  }

  if (input.eventType === 'artifact.created') {
    const artifact = normalizeArtifact(input, run, nowMs + 1)
    const runState = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
    run = runState.runs[0]
    const event = run.events[run.events.length - 1]
    nextState = replaceRun(nextState, run)
    return {
      ok: true,
      state: nextState,
      event,
      run,
      telemetry: telemetryFrom(input, run, event),
      reason: 'Kernel artifact recorded locally.',
      safety: WORKSPACE_KERNEL_SAFETY,
      lockedActions: run.lockedActions,
    }
  }

  if (input.eventType === 'approval.requested') {
    const approval = normalizeApproval(input, run, nowMs + 1)
    const runState = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    run = runState.runs[0]
    const event = run.events[run.events.length - 1]
    nextState = replaceRun(nextState, run)
    return {
      ok: true,
      state: nextState,
      event,
      run,
      telemetry: telemetryFrom(input, run, event),
      reason: 'Kernel approval recorded locally.',
      safety: WORKSPACE_KERNEL_SAFETY,
      lockedActions: run.lockedActions,
    }
  }

  if (input.eventType === 'run.completed') {
    const completion = completeWorkspaceRun({ runs: [run] }, run.runId, input.summary, nowMs + 1)
    run = completion.run ?? run
    const event = run.events[run.events.length - 1]
    nextState = replaceRun(nextState, run)
    return {
      ok: true,
      state: nextState,
      event,
      run,
      telemetry: telemetryFrom(input, run, event),
      reason: 'Kernel run completed locally.',
      safety: WORKSPACE_KERNEL_SAFETY,
      lockedActions: run.lockedActions,
    }
  }

  const runState = blockWorkspaceRun({ runs: [run] }, run.runId, input.summary, nowMs + 1)
  run = runState.runs[0]
  const event = run.events[run.events.length - 1]
  nextState = replaceRun(nextState, run)
  return {
    ok: true,
    state: nextState,
    event,
    run,
    telemetry: telemetryFrom(input, run, event),
    reason: 'Kernel run blocked locally.',
    safety: WORKSPACE_KERNEL_SAFETY,
    lockedActions: run.lockedActions,
  }
}
