import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorkspacePacket, reviseWorkspacePacket } from '../factory'
import { persistWorkspacePacketStore } from '../packet-store'
import { safeParseWorkspacePacket } from '../schemas'
import {
  RunReadbackPayloadSchema,
  assertSingleRunReadbackLineage,
  validateRunReadbackAgainstExecutionPlan,
} from './run-readback'

function validExecutionPlanPayload() {
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

export function validRunReadbackPayload() {
  return {
    executionPlanPacketId: 'packet-plan-1',
    executionPlanRevision: 1,
    finalStatus: 'completed' as const,
    steps: [
      {
        stepId: 'step-plan',
        required: true,
        packetRefs: ['packet-opportunity-1'],
        ackRefs: ['ack-opportunity-1'],
        expectedOutput: 'Governed local Packet.',
        actualOutputRefs: ['packet-opportunity-1'],
        outcome: 'accepted' as const,
      },
      {
        stepId: 'step-delivery-proof',
        required: true,
        packetRefs: ['packet-delivery-readback-1'],
        ackRefs: ['ack-delivery-readback-1'],
        expectedOutput: 'Confirmed local readback.',
        actualOutputRefs: ['packet-delivery-readback-1'],
        outcome: 'accepted' as const,
      },
    ],
    approvalGrantRefs: [],
    artifactRefs: ['artifact-foundation-1'],
    deliveryReadbackRefs: ['packet-delivery-readback-1'],
    rollbackRefs: [],
    unresolvedItems: [],
    nextActions: ['Review before Milestone B.'],
  }
}

describe('RunReadbackPayloadSchema', () => {
  it('accepts a truthful completed Run readback', () => {
    expect(RunReadbackPayloadSchema.parse(validRunReadbackPayload())).toEqual(validRunReadbackPayload())
  })

  it('blocks completed when a required Step is not accepted or unresolved work remains', () => {
    const payload = validRunReadbackPayload()
    expect(() => RunReadbackPayloadSchema.parse({
      ...payload,
      steps: [{ ...payload.steps[0], outcome: 'blocked' }, payload.steps[1]],
    })).toThrow(/completed/i)
    expect(() => RunReadbackPayloadSchema.parse({
      ...payload,
      unresolvedItems: ['Missing proof.'],
    })).toThrow(/completed/i)
    expect(() => RunReadbackPayloadSchema.parse({
      ...payload,
      steps: [{
        ...payload.steps[0],
        packetRefs: [],
        ackRefs: [],
        actualOutputRefs: [],
      }, payload.steps[1]],
    })).toThrow(/proof|ref|ack/i)
    expect(() => RunReadbackPayloadSchema.parse({
      ...payload,
      steps: [{
        ...payload.steps[0],
        required: false,
        outcome: 'skipped',
        ackRefs: [],
      }, payload.steps[1]],
    })).toThrow(/every planned Step.*required and accepted/i)
  })

  it('requires mixed outcomes and unresolved items for partial completion', () => {
    const payload = validRunReadbackPayload()
    expect(() => RunReadbackPayloadSchema.parse({
      ...payload,
      finalStatus: 'partially_completed',
      unresolvedItems: [],
    })).toThrow(/partial/i)
    expect(RunReadbackPayloadSchema.parse({
      ...payload,
      finalStatus: 'partially_completed',
      steps: [payload.steps[0], { ...payload.steps[1], outcome: 'failed' }],
      unresolvedItems: ['Delivery readback failed.'],
    }).finalStatus).toBe('partially_completed')
  })

  it('cross-validates plan Step IDs and side-effect readbacks', () => {
    const plan = validExecutionPlanPayload()
    const readback = validRunReadbackPayload()
    expect(validateRunReadbackAgainstExecutionPlan(readback, plan, {
      sideEffectStepIds: ['step-delivery-proof'],
    })).toEqual(readback)

    expect(() => validateRunReadbackAgainstExecutionPlan({
      ...readback,
      deliveryReadbackRefs: [],
    }, plan, {
      sideEffectStepIds: ['step-delivery-proof'],
    })).toThrow(/readback/i)
  })
})

describe('Milestone A domain Packet registry and Run lineage', () => {
  function runReadbackPacket(packetId: string, lineageId: string) {
    return createWorkspacePacket({
      packetId,
      packetLineageId: lineageId,
      createdAt: '2026-07-18T17:50:00.000Z',
      runId: 'run-readback-1',
      schemaVersion: '1.0.0',
      packetType: 'run-readback',
      from: { roomId: 'olympus-command', agentId: 'hermes-command' },
      to: { roomId: 'olympus-command', agentId: 'hermes-command' },
      sourceRefs: [
        validRunReadbackPayload().executionPlanPacketId,
        ...validRunReadbackPayload().steps.flatMap((step) => [...step.packetRefs, ...step.actualOutputRefs]),
      ],
      evidenceRefs: [
        ...validRunReadbackPayload().artifactRefs,
        ...validRunReadbackPayload().deliveryReadbackRefs,
      ],
      assumptions: [],
      missingFields: [],
      lockedActions: [],
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [],
      idempotencyKey: `${packetId}:1`,
      payload: validRunReadbackPayload(),
    })
  }

  it('uses strict domain validation through the default Packet registry', () => {
    const valid = runReadbackPacket('packet-readback-valid', 'lineage-readback-valid')
    expect(safeParseWorkspacePacket(valid).success).toBe(true)
    expect(safeParseWorkspacePacket({
      ...valid,
      payload: { ...valid.payload, finalStatus: 'completed', unresolvedItems: ['hidden blocker'] },
    }).success).toBe(false)
  })

  it('allows revisions in one lineage but rejects a second RunReadback lineage for the Run', () => {
    const first = runReadbackPacket('packet-readback-1', 'lineage-readback-1')
    const revision = reviseWorkspacePacket(first, {
      packetId: 'packet-readback-2',
      createdAt: '2026-07-18T18:00:00.000Z',
      idempotencyKey: 'packet-readback-2:2',
      payload: { ...validRunReadbackPayload(), nextActions: ['Late reconciliation recorded.'] },
    })
    expect(() => assertSingleRunReadbackLineage([first], revision)).not.toThrow()

    const conflicting = runReadbackPacket('packet-readback-other', 'lineage-readback-other')
    expect(() => assertSingleRunReadbackLineage([first], conflicting)).toThrow(/lineage/i)
  })

  it('enforces one RunReadback lineage per Run in the persistent store', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-run-readback-store-'))
    try {
      const first = runReadbackPacket('packet-readback-store-1', 'lineage-readback-store-1')
      const conflicting = runReadbackPacket('packet-readback-store-2', 'lineage-readback-store-2')
      await persistWorkspacePacketStore({ packets: [first] }, { rootDir, nowMs: 1 })
      await expect(persistWorkspacePacketStore({ packets: [conflicting] }, { rootDir, nowMs: 2 }))
        .rejects.toThrow(/lineage/i)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
