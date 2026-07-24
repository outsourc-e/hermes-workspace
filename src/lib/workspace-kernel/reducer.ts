import { WORKSPACE_WORKER_PROFILES, riskAtLeast } from './blueprints'
import { WORKSPACE_KERNEL_SAFETY } from './contracts'
import type {
  WorkspaceAction,
  WorkspaceApproval,
  WorkspaceArtifact,
  WorkspaceBlueprint,
  WorkspaceEvent,
  WorkspaceKernelState,
  WorkspaceRun,
  WorkspaceRunPacketEventType,
} from './contracts'
import type { ApprovalGrantRecord } from './packets/approval-grant'

export type WorkspaceKernelApprovalDecision = 'approved' | 'rejected' | 'needs_edit'

export type WorkspaceRunCreationOptions = {
  executionPlanPacketId?: string
  runId?: string
}

export type WorkspaceRunPacketRole = 'execution-plan' | 'domain' | 'run-readback'

export type WorkspaceRunPacketEventInput = {
  type: WorkspaceRunPacketEventType
  packetId: string
  packetRole?: WorkspaceRunPacketRole
  ackId?: string
  outcome?: 'accepted' | 'blocked' | 'rejected'
  message?: string
}

function slugFor(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace-run'
}

function eventId(runId: string, type: WorkspaceEvent['type'], createdAtMs: number, suffix = '') {
  const safeSuffix = suffix ? `-${slugFor(suffix).slice(0, 24)}` : ''
  return `${runId}-${type.replace(/\./g, '-')}-${createdAtMs}${safeSuffix}`
}

function profileRoomOverride(workerProfileId: WorkspaceRun['assignedWorkerProfileId']) {
  const profile = WORKSPACE_WORKER_PROFILES.find((candidate) => candidate.profileId === workerProfileId)
  if (profile?.profileScope !== 'council-general') return undefined
  return {
    roomId: profile.roomId,
    stationId: 'council-table' as const,
  }
}

function approvalRequired(action: WorkspaceAction, blueprint: WorkspaceBlueprint) {
  return Boolean(action.requiresApproval)
    || blueprint.approvalPolicy.mode === 'operator_required'
    || (action.riskClass ? riskAtLeast(action.riskClass, 'R3_EXTERNAL_WRITE') : false)
    || riskAtLeast(blueprint.riskClass, 'R3_EXTERNAL_WRITE')
}

export function createWorkspaceRun(
  action: WorkspaceAction,
  blueprint: WorkspaceBlueprint,
  nowMs = Date.now(),
  options: WorkspaceRunCreationOptions = {},
): WorkspaceRun {
  const runId = options.runId ?? `workspace-run-${nowMs}-${slugFor(action.summary)}`
  const workerProfileId = action.requestedWorkerProfileId ?? blueprint.allowedWorkerProfileIds.at(0)
  if (!workerProfileId) {
    throw new Error(`Workspace blueprint ${blueprint.blueprintId} has no eligible worker profile.`)
  }
  const profileRoom = profileRoomOverride(workerProfileId)
  const ownerRoomId = profileRoom?.roomId ?? blueprint.roomId
  const ownerStationId = profileRoom?.stationId ?? blueprint.stationId
  const needsApproval = approvalRequired(action, blueprint)
  const runCreated: WorkspaceEvent = {
    eventId: eventId(runId, 'run.created', nowMs),
    runId,
    type: 'run.created',
    createdAtMs: nowMs,
    roomId: ownerRoomId,
    stationId: ownerStationId,
    workerProfileId,
    message: `Workspace run created for ${blueprint.label}.`,
    payload: { actionId: action.actionId, blueprintId: blueprint.blueprintId },
  }
  const routeCreatedAtMs = nowMs + (options.executionPlanPacketId ? 3 : 1)
  const packetCreated: WorkspaceEvent | undefined = options.executionPlanPacketId
    ? {
        eventId: eventId(runId, 'packet.created', nowMs + 1, options.executionPlanPacketId),
        runId,
        type: 'packet.created',
        createdAtMs: nowMs + 1,
        roomId: ownerRoomId,
        stationId: ownerStationId,
        workerProfileId,
        message: `ExecutionPlan ${options.executionPlanPacketId} created before room routing.`,
        payload: {
          packetId: options.executionPlanPacketId,
          packetRole: 'execution-plan',
        },
      }
    : undefined
  const packetReady: WorkspaceEvent | undefined = options.executionPlanPacketId
    ? {
        eventId: eventId(runId, 'packet.ready', nowMs + 2, options.executionPlanPacketId),
        runId,
        type: 'packet.ready',
        createdAtMs: nowMs + 2,
        roomId: ownerRoomId,
        stationId: ownerStationId,
        workerProfileId,
        message: `ExecutionPlan ${options.executionPlanPacketId} is ready before room routing.`,
        payload: {
          packetId: options.executionPlanPacketId,
          packetRole: 'execution-plan',
        },
      }
    : undefined
  const runRouted: WorkspaceEvent = {
    eventId: eventId(runId, 'run.routed', routeCreatedAtMs),
    runId,
    type: 'run.routed',
    createdAtMs: routeCreatedAtMs,
    roomId: ownerRoomId,
    stationId: ownerStationId,
    workerProfileId,
    message: `Run routed to ${ownerRoomId}${ownerStationId ? ` / ${ownerStationId}` : ''}.`,
    payload: {
      riskClass: blueprint.riskClass,
      approvalPolicy: blueprint.approvalPolicy.mode,
      lockedActions: blueprint.lockedActions,
    },
  }

  return {
    runId,
    actionId: action.actionId,
    actionSummary: action.summary,
    actionInput: action.input,
    blueprintId: blueprint.blueprintId,
    status: needsApproval ? 'waiting_approval' : 'queued',
    stage: needsApproval ? 'approval' : 'routed',
    ownerRoomId,
    ownerStationId,
    assignedWorkerProfileId: workerProfileId,
    createdAtMs: nowMs,
    updatedAtMs: routeCreatedAtMs,
    events: [
      runCreated,
      ...(packetCreated ? [packetCreated] : []),
      ...(packetReady ? [packetReady] : []),
      runRouted,
    ],
    artifacts: [],
    approvals: [],
    ...(options.executionPlanPacketId
      ? {
          executionPlanPacketId: options.executionPlanPacketId,
          packetRefs: [options.executionPlanPacketId],
        }
      : {}),
    lockedActions: blueprint.lockedActions,
    nextAction: blueprint.defaultNextStep,
    readback: `${blueprint.label}: ${blueprint.defaultNextStep}`,
    safety: WORKSPACE_KERNEL_SAFETY,
  }
}

function packetRoleFor(run: WorkspaceRun, input: WorkspaceRunPacketEventInput): WorkspaceRunPacketRole {
  if (input.packetRole) return input.packetRole
  if (input.packetId === run.executionPlanPacketId) return 'execution-plan'
  if (input.packetId === run.runReadbackPacketId) return 'run-readback'
  return 'domain'
}

export function recordWorkspaceRunPacketEvent(
  state: WorkspaceKernelState,
  runId: string,
  input: WorkspaceRunPacketEventInput,
  nowMs = Date.now(),
): WorkspaceKernelState {
  return updateRun(state, runId, (run) => {
    const packetRole = packetRoleFor(run, input)
    const packetRefs = input.type === 'packet.superseded'
      ? (run.packetRefs ?? []).filter((packetId) => packetId !== input.packetId)
      : Array.from(new Set([...(run.packetRefs ?? []), input.packetId]))
    const message = input.message ?? `${input.type} recorded for ${input.packetId}.`
    const event: WorkspaceEvent = {
      eventId: eventId(runId, input.type, nowMs, input.packetId),
      runId,
      type: input.type,
      createdAtMs: nowMs,
      roomId: run.ownerRoomId,
      stationId: run.ownerStationId,
      workerProfileId: run.assignedWorkerProfileId,
      message,
      payload: {
        packetId: input.packetId,
        packetRole,
        ...(input.ackId ? { ackId: input.ackId } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
      },
    }
    const isBlocking = input.type === 'packet.blocked' || input.type === 'packet.rejected'
    return {
      ...run,
      ...(packetRole === 'execution-plan'
        ? { executionPlanPacketId: input.type === 'packet.superseded' ? undefined : input.packetId }
        : {}),
      ...(packetRole === 'run-readback'
        ? { runReadbackPacketId: input.type === 'packet.superseded' ? undefined : input.packetId }
        : {}),
      packetRefs,
      status: isBlocking ? 'blocked' : run.status,
      stage: isBlocking ? 'blocked' : run.stage,
      updatedAtMs: nowMs,
      readback: isBlocking ? message : run.readback,
      nextAction: isBlocking
        ? 'Resolve the blocked or rejected Packet before continuing.'
        : run.nextAction,
      events: [...run.events, event],
    }
  })
}

export function createWorkspaceArtifactForRun(run: WorkspaceRun, blueprint: WorkspaceBlueprint, nowMs = Date.now()): WorkspaceArtifact {
  const kind = blueprint.outputKinds[0] ?? 'generic-workspace-packet'
  return {
    artifactId: `workspace-artifact-${nowMs}-${slugFor(kind)}`,
    runId: run.runId,
    kind,
    label: blueprint.label,
    summary: run.actionSummary,
    roomId: run.ownerRoomId,
    stationId: run.ownerStationId,
    dataOrigin: blueprint.riskClass === 'R0_LOCAL_VIEW' || blueprint.riskClass === 'R1_LOCAL_WRITE' ? 'local-only' : 'approval-required',
    evidenceIds: [],
    sourceRecordIds: [run.actionId],
    missingFields: blueprint.riskClass === 'R0_LOCAL_VIEW' ? [] : ['live connector not enabled in Kernel V1'],
    lockedActions: blueprint.lockedActions,
    payload: {
      blueprintId: blueprint.blueprintId,
      nextAction: blueprint.defaultNextStep,
      safety: WORKSPACE_KERNEL_SAFETY,
    },
    createdAtMs: nowMs,
  }
}

export function createWorkspaceApprovalForRun(run: WorkspaceRun, blueprint: WorkspaceBlueprint, nowMs = Date.now()): WorkspaceApproval {
  return {
    approvalId: `workspace-approval-${nowMs}-${slugFor(blueprint.blueprintId)}`,
    runId: run.runId,
    status: 'waiting_operator',
    riskClass: blueprint.riskClass,
    requestedAction: blueprint.defaultNextStep,
    targetSystem: blueprint.domain,
    preview: run.readback,
    evidenceIds: run.artifacts.flatMap((artifact) => artifact.evidenceIds),
    allowedNow: ['local-only packet staging', 'readback', 'manual review'],
    lockedActions: blueprint.lockedActions,
    createdAtMs: nowMs,
  }
}

function updateRun(state: WorkspaceKernelState, runId: string, update: (run: WorkspaceRun) => WorkspaceRun): WorkspaceKernelState {
  return {
    ...state,
    runs: state.runs.map((run) => run.runId === runId ? update(run) : run),
  }
}

export function appendWorkspaceEvent(state: WorkspaceKernelState, runId: string, event: WorkspaceEvent): WorkspaceKernelState {
  return updateRun(state, runId, (run) => ({
    ...run,
    updatedAtMs: event.createdAtMs,
    events: [...run.events, event],
  }))
}

export function attachWorkspaceArtifact(state: WorkspaceKernelState, runId: string, artifact: WorkspaceArtifact): WorkspaceKernelState {
  const event: WorkspaceEvent = {
    eventId: eventId(runId, 'artifact.created', artifact.createdAtMs, artifact.kind),
    runId,
    type: 'artifact.created',
    createdAtMs: artifact.createdAtMs,
    roomId: artifact.roomId,
    stationId: artifact.stationId,
    artifactId: artifact.artifactId,
    message: `${artifact.kind} created locally for ${artifact.label}.`,
    payload: {
      missingFields: artifact.missingFields,
      lockedActions: artifact.lockedActions,
      dataOrigin: artifact.dataOrigin,
    },
  }
  return updateRun(state, runId, (run) => ({
    ...run,
    status: run.status === 'waiting_approval' ? 'waiting_approval' : 'running',
    stage: run.status === 'waiting_approval' ? 'approval' : 'artifact_ready',
    updatedAtMs: artifact.createdAtMs,
    artifacts: [...run.artifacts, artifact],
    events: [...run.events, event],
  }))
}

export function requestWorkspaceApproval(state: WorkspaceKernelState, runId: string, approval: WorkspaceApproval): WorkspaceKernelState {
  const event: WorkspaceEvent = {
    eventId: eventId(runId, 'approval.requested', approval.createdAtMs, approval.targetSystem),
    runId,
    type: 'approval.requested',
    createdAtMs: approval.createdAtMs,
    roomId: 'olympus-command',
    stationId: 'mission-router',
    message: `Approval requested for ${approval.requestedAction}.`,
    payload: {
      riskClass: approval.riskClass,
      targetSystem: approval.targetSystem,
      lockedActions: approval.lockedActions,
    },
  }
  return updateRun(state, runId, (run) => ({
    ...run,
    status: 'waiting_approval',
    stage: 'approval',
    updatedAtMs: approval.createdAtMs,
    approvals: [...run.approvals, approval],
    events: [...run.events, event],
  }))
}

function approvalDecisionEventType(decision: WorkspaceKernelApprovalDecision): WorkspaceEvent['type'] {
  if (decision === 'approved') return 'approval.approved'
  if (decision === 'needs_edit') return 'approval.needs_edit'
  return 'approval.rejected'
}

function approvalDecisionReadback(decision: WorkspaceKernelApprovalDecision, approval: WorkspaceApproval, reason?: string) {
  if (decision === 'approved') {
    return `Approval recorded for ${approval.requestedAction}. Live executor is still gated until a specific approved sender is connected.`
  }
  if (decision === 'needs_edit') {
    return reason || `Approval needs edits before ${approval.requestedAction} can continue.`
  }
  return reason || `Approval rejected for ${approval.requestedAction}. No live action was executed.`
}

export function resolveWorkspaceKernelApproval(
  state: WorkspaceKernelState,
  approvalId: string,
  decision: WorkspaceKernelApprovalDecision,
  options: { reason?: string; nowMs?: number } = {},
): WorkspaceKernelState {
  const nowMs = options.nowMs ?? Date.now()
  if (!state.runs.some((run) => run.approvals.some((approval) => approval.approvalId === approvalId))) {
    return state
  }
  const runs = state.runs.map((run) => {
    const approval = run.approvals.find((candidate) => candidate.approvalId === approvalId)
    if (!approval) return run
    const readback = approvalDecisionReadback(decision, approval, options.reason)
    const eventType = approvalDecisionEventType(decision)
    const event: WorkspaceEvent = {
      eventId: eventId(run.runId, eventType, nowMs, approval.approvalId),
      runId: run.runId,
      type: eventType,
      createdAtMs: nowMs,
      roomId: run.ownerRoomId,
      stationId: run.ownerStationId,
      workerProfileId: run.assignedWorkerProfileId,
      message: readback,
      payload: {
        approvalId,
        decision,
        requestedAction: approval.requestedAction,
        targetSystem: approval.targetSystem,
        liveExecutorConnected: false,
      },
    }
    return {
      ...run,
      status: 'blocked' as const,
      stage: 'blocked' as const,
      updatedAtMs: nowMs,
      approvals: run.approvals.map((candidate) => candidate.approvalId === approvalId ? { ...candidate, status: decision } : candidate),
      readback,
      nextAction: decision === 'approved'
        ? 'Connect the specific live executor/sender and run readback before external execution.'
        : 'Edit or restart the run from Workspace before continuing.',
      events: [...run.events, event],
    }
  })
  return { ...state, runs }
}

export function bindWorkspaceApprovalGrantToRun(
  state: WorkspaceKernelState,
  approvalId: string,
  approvalGrantPacketId: string,
  record: ApprovalGrantRecord,
  nowMs = Date.now(),
): WorkspaceKernelState {
  if (!approvalGrantPacketId.trim()) throw new Error('ApprovalGrant Packet ID is required.')
  const run = state.runs.find((candidate) => candidate.approvals.some((approval) => approval.approvalId === approvalId))
  if (!run) throw new Error(`Workspace approval not found: ${approvalId}.`)
  const approval = run.approvals.find((candidate) => candidate.approvalId === approvalId)
  if (!approval || approval.status !== 'approved') {
    throw new Error('Broad operator approval must be approved before a server Grant can be bound.')
  }
  if (record.status !== 'issued') throw new Error('Only an issued ApprovalGrant may be bound to a Workspace approval.')
  if (record.payload.runId !== run.runId) throw new Error('ApprovalGrant run binding does not match the Workspace run.')
  const binding = {
    grantId: record.payload.grantId,
    approvalGrantPacketId: approvalGrantPacketId.trim(),
    costRiskLockPacketId: record.payload.costRiskLockPacketId,
    costRiskLockContentHash: record.payload.costRiskLockContentHash,
    actionId: record.payload.actionId,
    stage: record.payload.stage,
    scopeHash: record.payload.scopeHash,
    maximumMinorUnits: record.payload.maximumMinorUnits,
    currency: record.payload.currency,
    expiresAt: record.payload.expiresAt,
    status: record.status,
  }
  if (approval.grantBinding) {
    if (JSON.stringify(approval.grantBinding) === JSON.stringify(binding)) return state
    throw new Error('Workspace approval already has a different ApprovalGrant binding.')
  }
  const event: WorkspaceEvent = {
    eventId: eventId(run.runId, 'approval.approved', nowMs, record.payload.grantId),
    runId: run.runId,
    type: 'approval.approved',
    createdAtMs: nowMs,
    roomId: run.ownerRoomId,
    stationId: run.ownerStationId,
    workerProfileId: run.assignedWorkerProfileId,
    message: `Server ApprovalGrant ${record.payload.grantId} bound for audit; live execution remains disabled.`,
    payload: {
      approvalId,
      approvalGrantPacketId: binding.approvalGrantPacketId,
      grantId: binding.grantId,
      costRiskLockPacketId: binding.costRiskLockPacketId,
      costRiskLockContentHash: binding.costRiskLockContentHash,
      stage: binding.stage,
      liveExecutorConnected: false,
    },
  }
  return updateRun(state, run.runId, (candidate) => ({
    ...candidate,
    updatedAtMs: nowMs,
    approvals: candidate.approvals.map((item) => item.approvalId === approvalId
      ? { ...item, grantBinding: binding }
      : item),
    events: [...candidate.events, event],
  }))
}

export function cancelWorkspaceKernelRun(
  state: WorkspaceKernelState,
  runId: string,
  reason = 'Operator cancelled the Workspace run before live execution.',
  nowMs = Date.now(),
): WorkspaceKernelState {
  return updateRun(state, runId, (run) => ({
    ...run,
    status: 'cancelled',
    stage: 'blocked',
    updatedAtMs: nowMs,
    readback: reason,
    nextAction: 'No further action is pending for this cancelled run.',
    approvals: run.approvals.map((approval) => approval.status === 'waiting_operator' || approval.status === 'needs_edit'
      ? { ...approval, status: 'rejected' }
      : approval),
    events: [
      ...run.events,
      {
        eventId: eventId(runId, 'run.cancelled', nowMs),
        runId,
        type: 'run.cancelled',
        createdAtMs: nowMs,
        roomId: run.ownerRoomId,
        stationId: run.ownerStationId,
        workerProfileId: run.assignedWorkerProfileId,
        message: reason,
        payload: { cancelledBy: 'operator', liveExecutorConnected: false },
      },
    ],
  }))
}

export type WorkspaceVerifiedPacketCompletionProof = {
  runId: string
  executionPlanPacketId: string
  runReadbackPacketId: string
  packets: Array<{
    packetId: string
    contentHash: string
    acceptedAckId: string
  }>
  verifiedAtMs: number
}

export type WorkspaceRunCompletionResult =
  | { ok: true; state: WorkspaceKernelState; run: WorkspaceRun }
  | {
      ok: false
      code: 'workspace_run_not_found' | 'workspace_packet_proof_missing'
      missingProof: Array<string>
      state: WorkspaceKernelState
      run: WorkspaceRun | null
    }

function workspaceRunHasExecutionPlanHistory(run: WorkspaceRun) {
  return Boolean(run.executionPlanPacketId) || run.events.some((event) => (
    event.type.startsWith('packet.')
    && event.payload?.packetRole === 'execution-plan'
  ))
}

function missingWorkspacePacketCompletionProof(
  run: WorkspaceRun,
  proof?: WorkspaceVerifiedPacketCompletionProof,
) {
  if (!workspaceRunHasExecutionPlanHistory(run)) return []
  const packetRefs = Array.from(new Set(run.packetRefs ?? []))
  const missingProof: Array<string> = []
  if (!run.executionPlanPacketId) {
    missingProof.push('executionPlanPacketId:active')
  } else if (!packetRefs.includes(run.executionPlanPacketId)) {
    missingProof.push(`packetRef:${run.executionPlanPacketId}`)
  }
  if (!run.runReadbackPacketId) {
    missingProof.push('runReadbackPacketId')
  } else if (!packetRefs.includes(run.runReadbackPacketId)) {
    missingProof.push(`packetRef:${run.runReadbackPacketId}`)
  }
  if (!proof) {
    missingProof.push('verifiedPacketStoreProof')
    return missingProof
  }
  if (proof.runId !== run.runId) missingProof.push(`proofRunId:${run.runId}`)
  if (proof.executionPlanPacketId !== run.executionPlanPacketId) {
    missingProof.push(`proofExecutionPlan:${run.executionPlanPacketId}`)
  }
  if (run.runReadbackPacketId && proof.runReadbackPacketId !== run.runReadbackPacketId) {
    missingProof.push(`proofRunReadback:${run.runReadbackPacketId}`)
  }
  const proofByPacketId = new Map(proof.packets.map((packet) => [packet.packetId, packet]))
  for (const packetId of packetRefs) {
    const packetProof = proofByPacketId.get(packetId)
    if (!packetProof) {
      missingProof.push(`packetStore:${packetId}`)
      continue
    }
    if (!/^[a-f0-9]{64}$/.test(packetProof.contentHash)) missingProof.push(`contentHash:${packetId}`)
    if (!packetProof.acceptedAckId.trim()) missingProof.push(`acceptedAck:${packetId}`)
  }
  return missingProof
}

export function completeWorkspaceRun(
  state: WorkspaceKernelState,
  runId: string,
  readback: string,
  nowMs = Date.now(),
  proof?: WorkspaceVerifiedPacketCompletionProof,
): WorkspaceRunCompletionResult {
  const target = state.runs.find((run) => run.runId === runId)
  if (!target) {
    return { ok: false, code: 'workspace_run_not_found', missingProof: [], state, run: null }
  }
  const missingProof = missingWorkspacePacketCompletionProof(target, proof)
  if (workspaceRunHasExecutionPlanHistory(target) && missingProof.length) {
    const blockedState = updateRun(state, runId, (run) => ({
      ...run,
      status: 'blocked',
      stage: 'blocked',
      updatedAtMs: nowMs,
      readback: `Run completion blocked: missing Packet proof (${missingProof.join(', ')}).`,
      nextAction: 'Attach accepted ACK proof and a linked RunReadback Packet before completion.',
      events: [
        ...run.events,
        {
          eventId: eventId(runId, 'run.blocked', nowMs, 'packet-proof'),
          runId,
          type: 'run.blocked',
          createdAtMs: nowMs,
          roomId: run.ownerRoomId,
          stationId: run.ownerStationId,
          workerProfileId: run.assignedWorkerProfileId,
          message: 'Run completion blocked because required Packet proof is missing.',
          payload: {
            code: 'workspace_packet_proof_missing',
            missingProof,
          },
        },
      ],
    }))
    return {
      ok: false,
      code: 'workspace_packet_proof_missing',
      missingProof,
      state: blockedState,
      run: blockedState.runs.find((run) => run.runId === runId) ?? null,
    }
  }
  const completedState = updateRun(state, runId, (run) => ({
    ...run,
    status: 'completed',
    stage: 'completed',
    updatedAtMs: nowMs,
    readback,
    nextAction: 'No further local action is pending.',
    events: [
      ...run.events,
      {
        eventId: eventId(runId, 'run.completed', nowMs),
        runId,
        type: 'run.completed',
        createdAtMs: nowMs,
        roomId: run.ownerRoomId,
        stationId: run.ownerStationId,
        workerProfileId: run.assignedWorkerProfileId,
        message: readback,
      },
    ],
  }))
  return {
    ok: true,
    state: completedState,
    run: completedState.runs.find((run) => run.runId === runId) ?? target,
  }
}

export function blockWorkspaceRun(state: WorkspaceKernelState, runId: string, reason: string, nowMs = Date.now()): WorkspaceKernelState {
  return updateRun(state, runId, (run) => ({
    ...run,
    status: 'blocked',
    stage: 'blocked',
    updatedAtMs: nowMs,
    readback: reason,
    nextAction: 'Resolve the blocking approval or missing local evidence before continuing.',
    events: [
      ...run.events,
      {
        eventId: eventId(runId, 'run.blocked', nowMs),
        runId,
        type: 'run.blocked',
        createdAtMs: nowMs,
        roomId: run.ownerRoomId,
        stationId: run.ownerStationId,
        workerProfileId: run.assignedWorkerProfileId,
        message: reason,
        payload: { lockedActions: run.lockedActions },
      },
    ],
  }))
}
