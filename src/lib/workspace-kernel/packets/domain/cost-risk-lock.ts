import { z } from 'zod'
import { sha256Hex } from '../canonical-json'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(4_096)
const RefSchema = z.string().trim().min(1).max(2_048)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const COST_RISK_STAGES = [
  'draft_save',
  'publish',
  'upload',
  'start',
  'message_draft',
  'send',
  'purchase',
  'refund',
  'account_change',
] as const

export const CostRiskStageSchema = z.enum(COST_RISK_STAGES)

export const CostRiskActionTargetSchema = z.object({
  system: z.string().trim().min(1).max(256),
  accountId: IdSchema,
  resourceId: IdSchema,
}).strict()

export const CostRiskScopeSchema = z.object({
  scopeId: IdSchema,
  canonicalScope: z.string().trim().min(2).max(10_000),
  scopeHash: Sha256Schema,
}).strict().superRefine((scope, context) => {
  if (sha256Hex(scope.canonicalScope) !== scope.scopeHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['scopeHash'], message: 'Scope hash must match the exact canonical scope string.' })
  }
  try {
    const parsed = JSON.parse(scope.canonicalScope)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['canonicalScope'], message: 'Canonical scope must be a JSON object string.' })
  }
})

export const CostRiskLockPayloadSchema = z.object({
  contractVersion: z.literal('cost-risk-lock-v1'),
  executionPlanPacketId: IdSchema,
  stepId: IdSchema,
  action: z.object({
    actionId: IdSchema,
    actionType: IdSchema,
    stage: CostRiskStageSchema,
    target: CostRiskActionTargetSchema,
    scope: CostRiskScopeSchema,
  }).strict(),
  cost: z.object({
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    maximumMinorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    estimatedMinorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    evidenceRefs: z.array(RefSchema).max(100),
  }).strict(),
  riskClass: z.enum(['R3_EXTERNAL_WRITE', 'R4_COST_OR_ACCOUNT', 'R5_DESTRUCTIVE']),
  riskReasons: z.array(TextSchema).min(1).max(100),
  approvalRequired: z.literal(true),
  liveActionsLocked: z.tuple([z.literal('execute')]),
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: z.array(z.string().trim().min(1).max(512)).max(100),
}).strict().superRefine((payload, context) => {
  const expectedBlocks: Array<string> = []
  if (payload.cost.estimatedMinorUnits === null) expectedBlocks.push('cost.estimatedMinorUnits')
  if (payload.cost.estimatedMinorUnits !== null && payload.cost.estimatedMinorUnits > payload.cost.maximumMinorUnits) {
    expectedBlocks.push('cost.maximumMinorUnits')
  }
  if (payload.cost.evidenceRefs.length === 0) expectedBlocks.push('cost.evidenceRefs')
  const expected = [...new Set(expectedBlocks)].sort()
  const declared = [...new Set(payload.hardBlocks)].sort()
  if (expected.join('\n') !== declared.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hardBlocks'], message: `hardBlocks must exactly match derived cost/risk blockers: ${expected.join(', ') || 'none'}.` })
  }
  const expectedReadiness = expected.length === 0 ? 'ready' : 'blocked'
  if (payload.readiness !== expectedReadiness) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness'], message: `Cost/risk readiness must be ${expectedReadiness}.` })
  }
})

export type CostRiskStage = z.infer<typeof CostRiskStageSchema>
export type CostRiskActionTarget = z.infer<typeof CostRiskActionTargetSchema>
export type CostRiskLockPayload = z.infer<typeof CostRiskLockPayloadSchema>
