import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const RefSchema = z.string().trim().min(1).max(2_048)
const RefListSchema = z.array(RefSchema).max(500)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const AssetVisualQaSchema = z.object({
  status: z.enum(['passed', 'failed', 'pending']),
  evidenceRefs: RefListSchema,
}).strict().superRefine((qa, context) => {
  if (qa.status === 'passed' && qa.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'Passed Visual QA requires evidence.' })
  }
})

export const AssetProductionItemSchema = z.object({
  itemId: IdSchema,
  required: z.boolean(),
  artifactRef: RefSchema,
  artifactChecksum: Sha256Schema,
  lifecycle: z.enum(['temporary', 'candidate', 'final']),
  provenanceRefs: RefListSchema.min(1),
  visualQa: AssetVisualQaSchema,
}).strict()

export const AssetProductionSetQaSchema = z.object({
  status: z.enum(['passed', 'failed', 'pending']),
  approvedItemIds: z.array(IdSchema).max(500),
  evidenceRefs: RefListSchema,
}).strict().superRefine((qa, context) => {
  if (qa.status === 'passed' && qa.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'Passed set-level QA requires evidence.' })
  }
})

export const AssetProductionPayloadSchema = z.object({
  contractVersion: z.literal('asset-production-v1'),
  executionPlanPacketId: IdSchema,
  stepId: IdSchema,
  assetSetId: IdSchema,
  items: z.array(AssetProductionItemSchema).min(1).max(500),
  setQa: AssetProductionSetQaSchema,
  liveActionsLocked: z.array(z.enum(['publish', 'external_delivery'])).length(2),
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: z.array(z.string().trim().min(1).max(512)).max(500),
}).strict().superRefine((payload, context) => {
  const itemIds = payload.items.map((item) => item.itemId)
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Asset item IDs must be unique.' })
  }
  if (new Set(payload.setQa.approvedItemIds).size !== payload.setQa.approvedItemIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['setQa', 'approvedItemIds'], message: 'Approved item IDs must be unique.' })
  }
  payload.setQa.approvedItemIds.forEach((itemId, index) => {
    if (!itemIds.includes(itemId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['setQa', 'approvedItemIds', index], message: `Unknown approved asset item: ${itemId}.` })
    }
  })
  if (new Set(payload.liveActionsLocked).size !== payload.liveActionsLocked.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['liveActionsLocked'], message: 'Live-action locks must be unique.' })
  }

  const expectedBlocks: Array<string> = []
  for (const item of payload.items.filter((candidate) => candidate.required)) {
    if (item.lifecycle !== 'final') expectedBlocks.push(`items.${item.itemId}.lifecycle`)
    if (item.visualQa.status !== 'passed') expectedBlocks.push(`items.${item.itemId}.visualQa`)
    if (!payload.setQa.approvedItemIds.includes(item.itemId)) expectedBlocks.push(`setQa.approvedItemIds.${item.itemId}`)
  }
  if (payload.setQa.status !== 'passed') expectedBlocks.push('setQa')

  const expected = [...new Set(expectedBlocks)].sort()
  const declared = [...new Set(payload.hardBlocks)].sort()
  if (expected.join('\n') !== declared.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hardBlocks'], message: `hardBlocks must exactly match derived asset blockers: ${expected.join(', ') || 'none'}.` })
  }
  const expectedReadiness = expected.length === 0 ? 'ready' : 'blocked'
  if (payload.readiness !== expectedReadiness) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness'], message: `Asset readiness must be ${expectedReadiness}.` })
  }
})

export type AssetProductionPayload = z.infer<typeof AssetProductionPayloadSchema>
