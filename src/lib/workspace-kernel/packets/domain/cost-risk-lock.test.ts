import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../canonical-json'
import { CostRiskLockPayloadSchema } from './cost-risk-lock'
import type { CostRiskLockPayload } from './cost-risk-lock'

const canonicalScope = '{"listingId":"listing-1","shop":"DolaroBoutique"}'

export function validCostRiskLockPayload(): CostRiskLockPayload {
  return {
    contractVersion: 'cost-risk-lock-v1' as const,
    executionPlanPacketId: 'packet-plan-cost-1',
    stepId: 'step-cost-lock',
    action: {
      actionId: 'action-etsy-publish-1',
      actionType: 'etsy.publish',
      stage: 'publish' as const,
      target: {
        system: 'Etsy',
        accountId: 'DolaroBoutique',
        resourceId: 'listing-1',
      },
      scope: {
        scopeId: 'scope-listing-1-publish',
        canonicalScope,
        scopeHash: sha256Hex(canonicalScope),
      },
    },
    cost: {
      currency: 'USD',
      maximumMinorUnits: 500,
      estimatedMinorUnits: 20,
      evidenceRefs: ['evidence://etsy/listing-fee'],
    },
    riskClass: 'R4_COST_OR_ACCOUNT' as const,
    riskReasons: ['Publishing may incur a listing fee.'],
    approvalRequired: true as const,
    liveActionsLocked: ['execute'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

describe('CostRiskLockPayloadSchema', () => {
  it('binds canonical action/target/scope/stage and integer minor-unit cost', () => {
    const payload = validCostRiskLockPayload()
    expect(CostRiskLockPayloadSchema.parse(payload)).toEqual(payload)
    expect(CostRiskLockPayloadSchema.safeParse({ ...payload, executeNow: true }).success).toBe(false)
    expect(CostRiskLockPayloadSchema.safeParse({
      ...payload,
      cost: { ...payload.cost, maximumMinorUnits: 5.5 },
    }).success).toBe(false)
  })

  it('rejects a scope hash that does not match canonical scope', () => {
    const payload = validCostRiskLockPayload()
    expect(CostRiskLockPayloadSchema.safeParse({
      ...payload,
      action: {
        ...payload.action,
        scope: { ...payload.action.scope, scopeHash: 'a'.repeat(64) },
      },
    }).success).toBe(false)
  })

  it('derives a hard block when estimate exceeds the approved maximum or evidence is missing', () => {
    const payload = validCostRiskLockPayload()
    expect(CostRiskLockPayloadSchema.safeParse({
      ...payload,
      cost: { ...payload.cost, estimatedMinorUnits: 700 },
      readiness: 'blocked',
      hardBlocks: ['cost.maximumMinorUnits'],
    }).success).toBe(true)
    expect(CostRiskLockPayloadSchema.safeParse({
      ...payload,
      cost: { ...payload.cost, evidenceRefs: [] },
      readiness: 'ready',
      hardBlocks: [],
    }).success).toBe(false)
  })

  it('keeps approval stages non-interchangeable', () => {
    expect(CostRiskLockPayloadSchema.safeParse({
      ...validCostRiskLockPayload(),
      action: { ...validCostRiskLockPayload().action, stage: 'draft_save', publish: true },
    }).success).toBe(false)
  })
})
