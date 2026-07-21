import { describe, expect, it } from 'vitest'
import {
  ExecutionPlanPayloadSchema,
} from './execution-plan'

export function validExecutionPlanPayload() {
  return {
    objective: 'Execute a governed local Packet workflow.',
    requestSummary: 'Validate the Packet foundation without external actions.',
    scope: {
      included: ['workspace-kernel/packets'],
      excluded: ['map structure', 'external actions'],
    },
    constraints: ['local-only', 'no map changes'],
    stopConditions: ['content hash conflict', 'missing receiver ACK'],
    retryPolicy: {
      maxSafeRetriesPerStep: 1,
      retryableFailureCodes: ['TRANSIENT_LOCAL_IO'],
    },
    steps: [
      {
        stepId: 'step-plan',
        title: 'Create governed plan',
        roomId: 'olympus-command',
        agentId: 'hermes-command',
        dependsOnStepIds: [],
        mayRunInParallel: false,
        inputPacketTypes: [],
        outputPacketType: 'opportunity' as const,
        approvalGate: null,
        acceptanceCriteriaIds: ['criterion-plan'],
      },
      {
        stepId: 'step-delivery-proof',
        title: 'Confirm local readback proof',
        roomId: 'gateway-cockpit',
        agentId: 'heimdall',
        dependsOnStepIds: ['step-plan'],
        mayRunInParallel: false,
        inputPacketTypes: ['opportunity' as const],
        outputPacketType: 'delivery-readback' as const,
        approvalGate: 'delivery-confirmation',
        acceptanceCriteriaIds: ['criterion-readback'],
      },
    ],
    planDiffFromPacketId: null,
    planDiffSummary: [],
  }
}

describe('ExecutionPlanPayloadSchema', () => {
  it('accepts the locked typed execution plan contract', () => {
    expect(ExecutionPlanPayloadSchema.parse(validExecutionPlanPayload())).toEqual(validExecutionPlanPayload())
  })

  it('rejects empty plans, unknown fields and unknown Packet types', () => {
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...validExecutionPlanPayload(),
      steps: [],
    })).toThrow()
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...validExecutionPlanPayload(),
      silentOwnerOverride: 'not-allowed',
    })).toThrow()
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...validExecutionPlanPayload(),
      steps: [{
        ...validExecutionPlanPayload().steps[0],
        outputPacketType: 'mystery-packet',
      }],
    })).toThrow()
  })

  it('rejects duplicate, missing, self and cyclic Step dependencies', () => {
    const plan = validExecutionPlanPayload()
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...plan,
      steps: [plan.steps[0], { ...plan.steps[0] }],
    })).toThrow(/stepId/i)
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...plan,
      steps: [{ ...plan.steps[0], dependsOnStepIds: ['missing-step'] }],
    })).toThrow(/dependency/i)
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...plan,
      steps: [{ ...plan.steps[0], dependsOnStepIds: ['step-plan'] }],
    })).toThrow(/depend/i)
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...plan,
      steps: [
        { ...plan.steps[0], dependsOnStepIds: ['step-delivery-proof'] },
        { ...plan.steps[1], dependsOnStepIds: ['step-plan'] },
      ],
    })).toThrow(/cycle/i)
  })

  it('requires a visible summary whenever a plan revision points to a prior Packet', () => {
    expect(() => ExecutionPlanPayloadSchema.parse({
      ...validExecutionPlanPayload(),
      planDiffFromPacketId: 'packet-plan-v1',
      planDiffSummary: [],
    })).toThrow(/diff/i)
  })
})
