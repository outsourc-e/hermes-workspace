import { blockWorkspaceRun, completeWorkspaceRun, createWorkspaceRun } from '../reducer'
import { canonicalizeWorkspacePacketContent, sha256Hex } from './canonical-json'
import { verifyDeliveryReadbackRefsForRun } from './delivery-reconciliation'
import { validateContextPayloadForUse } from './domain/context'
import { ExecutionPlanPayloadSchema } from './domain/execution-plan'
import { isRosterAvailabilityFresh } from './domain/roster-availability'
import {
  validateRunReadbackAgainstExecutionPlan,
} from './domain/run-readback'
import { createWorkspacePacket } from './factory'
import {
  createWorkspacePacketLifecycleEvent,
  workspacePacketStatusFromEvents,
} from './lifecycle'
import { safeParseWorkspacePacket } from './schemas'
import {
  WorkspacePacketStoreConflictError,
  loadWorkspacePacketStore,
  persistWorkspacePacketStore,
} from './packet-store'
import type { HandoffAck } from './ack'
import type { RunReadbackPayload } from './domain/run-readback'
import type { WorkspacePacketStoreOptions } from './packet-store'
import type { UniversalPacketEnvelope } from './types'
import type {
  WorkspaceRunCompletionResult,
  WorkspaceVerifiedPacketCompletionProof,
} from '../reducer'
import type {
  WorkspaceAction,
  WorkspaceBlueprint,
  WorkspaceKernelState,
  WorkspaceRun,
} from '../contracts'

function stableRunId(actionId: string) {
  return `workspace-run-${sha256Hex(actionId).slice(0, 32)}`
}

function stableExecutionPlanPacketId(actionId: string) {
  return `packet-execution-plan-${sha256Hex(actionId).slice(0, 32)}`
}

function endpointMatches(
  left: UniversalPacketEnvelope['to'],
  right: UniversalPacketEnvelope['to'],
) {
  return left.roomId === right.roomId && left.agentId === right.agentId
}

function unique(values: ReadonlyArray<string>) {
  return [...new Set(values)]
}

function workspaceRunHasExecutionPlanHistory(run: WorkspaceRun) {
  return Boolean(run.executionPlanPacketId) || run.events.some((event) => (
    event.type.startsWith('packet.')
    && event.payload?.packetRole === 'execution-plan'
  ))
}

function ackAcceptsExactPacket(ack: HandoffAck, packet: UniversalPacketEnvelope) {
  return ack.packetId === packet.packetId
    && ack.outcome === 'accepted'
    && ack.acceptedContentHash === packet.contentHash
    && endpointMatches(ack.receiver, packet.to)
    && ack.missingFields.length === 0
    && packet.acceptanceCriteria
      .filter((criterion) => criterion.required)
      .every((criterion) => ack.checkedCriteriaIds.includes(criterion.criterionId))
}

function packetIsFreshForCompletion(
  packet: UniversalPacketEnvelope,
  acceptedAck: HandoffAck,
  nowMs: number,
) {
  const now = new Date(nowMs).toISOString()
  try {
    if (packet.packetType === 'context') {
      validateContextPayloadForUse(packet.payload, {
        now,
        revalidatedProvenanceRefs: acceptedAck.evidenceRefs,
      })
    }
    if (packet.packetType === 'roster-availability' && !isRosterAvailabilityFresh(packet.payload, now)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function planPayloadForRun(
  action: WorkspaceAction,
  blueprint: WorkspaceBlueprint,
  run: WorkspaceRun,
  receiverAgentId: string,
) {
  const criterionId = `criterion-${sha256Hex(`${action.actionId}:route`).slice(0, 24)}`
  const boundedSummary = action.summary.slice(0, 4_096)
  const canonicalAction = JSON.parse(JSON.stringify(action)) as unknown
  const actionFingerprint = sha256Hex(canonicalizeWorkspacePacketContent(canonicalAction))
  return ExecutionPlanPayloadSchema.parse({
    objective: boundedSummary,
    requestSummary: boundedSummary,
    scope: {
      included: [`Route the local Workspace run through ${blueprint.label}.`],
      excluded: [
        'No external write, publish, purchase or message is authorized by this plan.',
        ...blueprint.lockedActions.map((actionName) => `Locked action: ${actionName}.`),
      ],
    },
    constraints: [
      'Local Packet persistence only.',
      'Exact receiver ACK is required before completion.',
      'Missing evidence or required criteria blocks completion.',
      `Canonical action fingerprint: ${actionFingerprint}.`,
    ],
    stopConditions: [
      'Stop on missing evidence, rejected ACK, hash mismatch or approval gap.',
    ],
    retryPolicy: {
      maxSafeRetriesPerStep: 1,
      retryableFailureCodes: ['local-transient-read'],
    },
    steps: [{
      stepId: `step-${sha256Hex(`${action.actionId}:route`).slice(0, 24)}`,
      title: blueprint.defaultNextStep,
      roomId: run.ownerRoomId,
      agentId: receiverAgentId,
      dependsOnStepIds: [],
      mayRunInParallel: false,
      inputPacketTypes: ['execution-plan'],
      outputPacketType: 'context',
      approvalGate: blueprint.approvalPolicy.mode === 'operator_required' ? 'operator-approval' : null,
      acceptanceCriteriaIds: [criterionId],
    }],
    planDiffFromPacketId: null,
    planDiffSummary: [],
  })
}

export type PacketAwareWorkspaceRunCreation = {
  run: WorkspaceRun
  executionPlanPacket: UniversalPacketEnvelope
  replayed: boolean
}

export async function createWorkspaceRunWithExecutionPlan(
  action: WorkspaceAction,
  blueprint: WorkspaceBlueprint,
  nowMs = Date.now(),
  storeOptions: WorkspacePacketStoreOptions = {},
): Promise<PacketAwareWorkspaceRunCreation> {
  const idempotencyKey = `execution-plan:${action.actionId}`
  const loaded = await loadWorkspacePacketStore(storeOptions)
  if (!loaded.ok) throw new WorkspacePacketStoreConflictError('Local Packet store is corrupt or unavailable.')

  const existing = loaded.state.packets.find((packet) => packet.idempotencyKey === idempotencyKey)
  const executionPlanPacketId = stableExecutionPlanPacketId(action.actionId)
  const run = createWorkspaceRun(action, blueprint, nowMs, {
    runId: stableRunId(action.actionId),
    executionPlanPacketId,
  })
  const receiverAgentId = run.assignedWorkerProfileId
  if (!receiverAgentId) {
    throw new WorkspacePacketStoreConflictError('ExecutionPlan receiver could not be resolved safely.')
  }
  const payload = planPayloadForRun(action, blueprint, run, receiverAgentId)
  const criterionId = payload.steps[0].acceptanceCriteriaIds[0]
  const packet = createWorkspacePacket({
    packetId: executionPlanPacketId,
    packetLineageId: executionPlanPacketId,
    createdAt: existing?.createdAt ?? new Date(nowMs).toISOString(),
    runId: run.runId,
    schemaVersion: '1.0.0',
    packetType: 'execution-plan',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: run.ownerRoomId, agentId: receiverAgentId },
    sourceRefs: [`workspace-action:${action.actionId}`],
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: blueprint.lockedActions,
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{
      criterionId,
      description: `Complete ${payload.steps[0].title} with Packet, ACK and output proof.`,
      required: true,
    }],
    idempotencyKey,
    payload,
  })
  if (existing) {
    if (
      existing.packetType !== 'execution-plan'
      || existing.packetId !== executionPlanPacketId
      || existing.runId !== run.runId
      || existing.contentHash !== packet.contentHash
      || !endpointMatches(existing.to, packet.to)
    ) {
      throw new WorkspacePacketStoreConflictError(
        'ExecutionPlan idempotency key is already bound to different canonical content.',
      )
    }
    await persistWorkspacePacketStore({ activateRunIds: [run.runId] }, storeOptions)
    return { run, executionPlanPacket: existing, replayed: true }
  }

  const created = createWorkspacePacketLifecycleEvent(packet, loaded.state.events, {
    type: 'created',
    actor: packet.from,
    reason: null,
    payload: {},
  }, {
    eventId: `packet-created:${packet.packetId}`,
    createdAt: packet.createdAt,
  })
  const ready = createWorkspacePacketLifecycleEvent(packet, [...loaded.state.events, created], {
    type: 'ready',
    actor: packet.from,
    reason: null,
    payload: {},
  }, {
    eventId: `packet-ready:${packet.packetId}`,
    createdAt: new Date(nowMs + 1).toISOString(),
  })
  await persistWorkspacePacketStore({
    packets: [packet],
    events: [created, ready],
    activateRunIds: [run.runId],
  }, {
    ...storeOptions,
    nowMs: storeOptions.nowMs ?? nowMs + 1,
  })
  return { run, executionPlanPacket: packet, replayed: false }
}

export type WorkspaceRunStoreVerification =
  | { ok: true; proof: WorkspaceVerifiedPacketCompletionProof }
  | { ok: false; code: 'workspace_packet_store_proof_invalid'; missingProof: Array<string> }

export async function verifyWorkspaceRunCompletionFromPacketStore(
  run: WorkspaceRun,
  storeOptions: WorkspacePacketStoreOptions = {},
): Promise<WorkspaceRunStoreVerification> {
  const loaded = await loadWorkspacePacketStore(storeOptions)
  if (!loaded.ok) {
    return { ok: false, code: 'workspace_packet_store_proof_invalid', missingProof: ['packetStore:corrupt'] }
  }
  const state = loaded.state
  const proofNowMs = storeOptions.nowMs ?? Date.now()
  const missing: Array<string> = []
  const packetRefs = unique(run.packetRefs ?? [])
  if (!run.executionPlanPacketId) missing.push('executionPlanPacketId')
  if (!run.runReadbackPacketId) missing.push('runReadbackPacketId')

  const planPacket = run.executionPlanPacketId
    ? state.packets.find((packet) => packet.packetId === run.executionPlanPacketId)
    : undefined
  const readbackPacket = run.runReadbackPacketId
    ? state.packets.find((packet) => packet.packetId === run.runReadbackPacketId)
    : undefined
  if (run.executionPlanPacketId && (!planPacket || planPacket.packetType !== 'execution-plan' || planPacket.runId !== run.runId)) {
    missing.push(`executionPlanPacket:${run.executionPlanPacketId}`)
  }
  if (run.runReadbackPacketId && (!readbackPacket || readbackPacket.packetType !== 'run-readback' || readbackPacket.runId !== run.runId)) {
    missing.push(`runReadbackPacket:${run.runReadbackPacketId}`)
  }
  if (run.executionPlanPacketId && !packetRefs.includes(run.executionPlanPacketId)) {
    missing.push(`executionPlanPacketActive:${run.executionPlanPacketId}`)
  }
  if (run.runReadbackPacketId && !packetRefs.includes(run.runReadbackPacketId)) {
    missing.push(`runReadbackPacketActive:${run.runReadbackPacketId}`)
  }

  let planPayload: ReturnType<typeof ExecutionPlanPayloadSchema.parse> | null = null
  let readbackPayload: RunReadbackPayload | null = null
  if (planPacket && readbackPacket) {
    try {
      const parsedPlanPacket = safeParseWorkspacePacket(planPacket)
      const parsedReadbackPacket = safeParseWorkspacePacket(readbackPacket)
      if (!parsedPlanPacket.success || parsedPlanPacket.data.packetType !== 'execution-plan') {
        throw new Error('ExecutionPlan universal validation failed.')
      }
      if (!parsedReadbackPacket.success || parsedReadbackPacket.data.packetType !== 'run-readback') {
        throw new Error('RunReadback universal validation failed.')
      }
      planPayload = ExecutionPlanPayloadSchema.parse(parsedPlanPacket.data.payload)
      const sideEffectStepIds = planPayload.steps
        .filter((step) => step.outputPacketType === 'delivery-readback')
        .map((step) => step.stepId)
      readbackPayload = validateRunReadbackAgainstExecutionPlan(
        parsedReadbackPacket.data.payload,
        parsedPlanPacket.data.payload,
        { sideEffectStepIds },
      )
      if (readbackPayload.executionPlanPacketId !== planPacket.packetId) {
        missing.push('runReadback:executionPlanPacketId')
      }
      if (readbackPayload.executionPlanRevision !== planPacket.revision) {
        missing.push('runReadback:executionPlanRevision')
      }
      if (readbackPayload.finalStatus !== 'completed') missing.push('runReadback:finalStatus')
      missing.push(...verifyDeliveryReadbackRefsForRun(
        run.runId,
        readbackPayload.deliveryReadbackRefs,
        state.packets,
        packetRefs,
      ))
      const deliveryStepIdSet = new Set(sideEffectStepIds)
      for (const deliveryReadbackRef of readbackPayload.deliveryReadbackRefs) {
        const belongsToDeliveryStep = readbackPayload.steps.some((step) => (
          deliveryStepIdSet.has(step.stepId)
          && step.actualOutputRefs.includes(deliveryReadbackRef)
        ))
        if (!belongsToDeliveryStep) {
          missing.push(`runReadback:unboundDeliveryRef:${deliveryReadbackRef}`)
        }
      }
    } catch {
      missing.push('runReadback:planValidation')
    }
  }

  const packetProofs: WorkspaceVerifiedPacketCompletionProof['packets'] = []
  for (const packetId of packetRefs) {
    const packet = state.packets.find((candidate) => candidate.packetId === packetId)
    if (!packet || packet.runId !== run.runId) {
      missing.push(`packet:${packetId}`)
      continue
    }
    const acceptedAck = state.acks.find((ack) => ackAcceptsExactPacket(ack, packet))
    if (!acceptedAck || workspacePacketStatusFromEvents(packet.packetId, state.events) !== 'accepted') {
      missing.push(`acceptedAck:${packetId}`)
      continue
    }
    if (!packetIsFreshForCompletion(packet, acceptedAck, proofNowMs)) {
      missing.push(`freshUseProof:${packetId}`)
      continue
    }
    packetProofs.push({
      packetId,
      contentHash: packet.contentHash,
      acceptedAckId: acceptedAck.ackId,
    })
  }

  if (planPayload && readbackPayload) {
    const planStepById = new Map(planPayload.steps.map((step) => [step.stepId, step]))
    const validOutputRefs = new Set([
      ...run.artifacts.map((artifact) => artifact.artifactId),
      ...state.packets.filter((packet) => packet.runId === run.runId).map((packet) => packet.packetId),
      ...state.packets.filter((packet) => packet.runId === run.runId).flatMap((packet) => packet.evidenceRefs),
    ])
    for (const step of readbackPayload.steps) {
      const planStep = planStepById.get(step.stepId)
      const packetOutputRefs = step.actualOutputRefs
        .map((outputRef) => state.packets.find((packet) => packet.packetId === outputRef && packet.runId === run.runId))
        .filter((packet): packet is UniversalPacketEnvelope => Boolean(packet))
      if (!planStep || !packetOutputRefs.some((packet) => packet.packetType === planStep.outputPacketType)) {
        missing.push(`readbackOutputPacketType:${step.stepId}:${planStep?.outputPacketType ?? 'unknown'}`)
      }
      for (const outputPacket of packetOutputRefs) {
        if (!step.packetRefs.includes(outputPacket.packetId)) {
          missing.push(`readbackOutputPacketRef:${step.stepId}:${outputPacket.packetId}`)
          continue
        }
        if (planStep && outputPacket.packetType !== planStep.outputPacketType) {
          missing.push(`readbackOutputPacketTypeMismatch:${step.stepId}:${outputPacket.packetId}:${outputPacket.packetType}`)
        }
        const outputAck = state.acks.find((ack) => ackAcceptsExactPacket(ack, outputPacket))
        if (!outputAck || workspacePacketStatusFromEvents(outputPacket.packetId, state.events) !== 'accepted') {
          missing.push(`readbackOutputAcceptedAck:${step.stepId}:${outputPacket.packetId}`)
        } else if (!step.ackRefs.includes(outputAck.ackId)) {
          missing.push(`readbackOutputAckRef:${step.stepId}:${outputPacket.packetId}:${outputAck.ackId}`)
        }
      }
      for (const packetId of step.packetRefs) {
        if (!packetRefs.includes(packetId)) {
          missing.push(`readbackStepPacketActive:${step.stepId}:${packetId}`)
        }
        if (!state.packets.some((packet) => packet.packetId === packetId && packet.runId === run.runId)) {
          missing.push(`readbackStepPacket:${step.stepId}:${packetId}`)
        }
      }
      for (const ackId of step.ackRefs) {
        const stepAck = state.acks.find((ack) => ack.ackId === ackId)
        if (!stepAck) {
          missing.push(`readbackStepAck:${step.stepId}:${ackId}`)
        } else if (!step.packetRefs.includes(stepAck.packetId)) {
          missing.push(`readbackStepAckBinding:${step.stepId}:${ackId}:${stepAck.packetId}`)
        } else {
          const stepPacket = state.packets.find((packet) => (
            packet.packetId === stepAck.packetId
            && packet.runId === run.runId
          ))
          if (!stepPacket || !ackAcceptsExactPacket(stepAck, stepPacket)) {
            missing.push(`readbackStepAckProof:${step.stepId}:${ackId}`)
          }
        }
      }
      for (const outputRef of step.actualOutputRefs) {
        if (!validOutputRefs.has(outputRef)) missing.push(`readbackOutput:${step.stepId}:${outputRef}`)
      }
    }
  }

  if (missing.length > 0) {
    return { ok: false, code: 'workspace_packet_store_proof_invalid', missingProof: unique(missing) }
  }
  if (!run.executionPlanPacketId || !run.runReadbackPacketId) {
    return { ok: false, code: 'workspace_packet_store_proof_invalid', missingProof: ['packetProof:missing-anchor'] }
  }
  return {
    ok: true,
    proof: {
      runId: run.runId,
      executionPlanPacketId: run.executionPlanPacketId,
      runReadbackPacketId: run.runReadbackPacketId,
      packets: packetProofs,
      verifiedAtMs: Date.now(),
    },
  }
}

export async function completeWorkspaceRunWithPacketStore(
  state: WorkspaceKernelState,
  runId: string,
  readback: string,
  nowMs = Date.now(),
  storeOptions: WorkspacePacketStoreOptions = {},
): Promise<WorkspaceRunCompletionResult> {
  const run = state.runs.find((candidate) => candidate.runId === runId)
  if (!run || !workspaceRunHasExecutionPlanHistory(run)) {
    return completeWorkspaceRun(state, runId, readback, nowMs)
  }
  const verification = await verifyWorkspaceRunCompletionFromPacketStore(run, storeOptions)
  if (!verification.ok) {
    const missingProof = unique(verification.missingProof)
    const blockedState = blockWorkspaceRun(
      state,
      runId,
      `Run completion blocked: invalid Packet-store proof (${missingProof.join(', ')}).`,
      nowMs,
    )
    return {
      ok: false,
      code: 'workspace_packet_proof_missing',
      missingProof,
      state: blockedState,
      run: blockedState.runs.find((candidate) => candidate.runId === runId) ?? run,
    }
  }
  const completion = completeWorkspaceRun(state, runId, readback, nowMs, verification.proof)
  if (completion.ok) {
    await persistWorkspacePacketStore({ deactivateRunIds: [runId] }, {
      ...storeOptions,
      nowMs: storeOptions.nowMs ?? nowMs,
    })
  }
  return completion
}
