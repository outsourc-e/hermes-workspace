import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(4_096)
const CompactTextSchema = z.string().trim().min(1).max(520)
const RefSchema = z.string().trim().min(1).max(2_048)
const RefListSchema = z.array(RefSchema).min(1).max(100)
const TimestampSchema = z.string().datetime({ offset: true })

export const ContextFreshnessSchema = z.object({
  policy: z.enum(['durable', 'ttl', 'revalidate_on_use']),
  observedAt: TimestampSchema.nullable(),
  expiresAt: TimestampSchema.nullable(),
}).strict().superRefine((freshness, context) => {
  if (freshness.policy === 'ttl') {
    if (!freshness.observedAt || !freshness.expiresAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'TTL freshness requires observedAt and expiresAt.' })
      return
    }
    if (Date.parse(freshness.expiresAt) <= Date.parse(freshness.observedAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'TTL expiry must be later than observation.' })
    }
    return
  }
  if (freshness.expiresAt !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Only TTL freshness may declare expiresAt.' })
  }
})

export const ContextRedactionSchema = z.object({
  state: z.enum(['none', 'redacted', 'pre_sanitized']),
  detail: z.string().trim().max(512),
}).strict().superRefine((redaction, context) => {
  if (redaction.state === 'pre_sanitized' && redaction.detail !== 'unknown') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['detail'], message: 'Pre-sanitized legacy context must preserve unknown redaction detail.' })
  }
  if (redaction.state === 'redacted' && !redaction.detail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['detail'], message: 'Redacted context requires a detail.' })
  }
})

export const ContextSourceSchema = z.object({
  sourceId: IdSchema,
  rank: z.number().int().positive().max(100),
  title: z.string().trim().min(1).max(300),
  kind: z.enum(['hot-cache', 'daily', 'project-source-of-truth', 'decision', 'rules']),
  status: z.enum(['loaded', 'missing', 'blocked']),
  excerpt: CompactTextSchema,
  provenanceRefs: RefListSchema,
  freshness: ContextFreshnessSchema,
  redaction: ContextRedactionSchema,
}).strict()

export const ContextItemSchema = z.object({
  itemId: IdSchema,
  kind: z.enum(['decision', 'safety_rail', 'allowed_action', 'forbidden_action', 'artifact', 'blocker', 'next_action', 'source_excerpt']),
  content: CompactTextSchema,
  sourceIds: z.array(IdSchema).min(1).max(12),
  provenanceRefs: RefListSchema,
  freshness: ContextFreshnessSchema,
  redaction: ContextRedactionSchema,
}).strict()

export const ContextContradictionSchema = z.object({
  contradictionId: IdSchema,
  itemIds: z.array(IdSchema).min(2).max(50),
  sourceIds: z.array(IdSchema).min(1).max(12),
  description: TextSchema,
  status: z.enum(['open', 'resolved']),
}).strict()

export const ContextPayloadSchema = z.object({
  contractVersion: z.literal('context-v1'),
  executionPlanPacketId: IdSchema,
  stepId: IdSchema,
  receiver: z.object({
    roomId: IdSchema,
    stationId: IdSchema.optional(),
    agentId: IdSchema,
  }).strict(),
  mission: z.string().trim().min(1).max(360),
  sources: z.array(ContextSourceSchema).min(1).max(12),
  contextItems: z.array(ContextItemSchema).max(50),
  contradictions: z.array(ContextContradictionSchema).max(25),
  includedScope: z.array(TextSchema).min(1).max(25),
  excludedScope: z.array(TextSchema).max(25),
  localOnly: z.literal(true),
  writebackAllowed: z.literal(false),
}).strict().superRefine((payload, context) => {
  const sourceIds = payload.sources.map((source) => source.sourceId)
  const sourceById = new Map(payload.sources.map((source) => [source.sourceId, source]))
  const itemIds = payload.contextItems.map((item) => item.itemId)
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'Context source IDs must be unique.' })
  }
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['contextItems'], message: 'Context item IDs must be unique.' })
  }
  payload.sources.forEach((source, index) => {
    if (source.rank !== index + 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources', index, 'rank'], message: 'Context sources must be ordered by contiguous unique rank.' })
    }
  })
  payload.contextItems.forEach((item, itemIndex) => {
    const referencedSources = item.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source) => source !== undefined)
    const allowedProvenanceRefs = new Set(referencedSources.flatMap((source) => source.provenanceRefs))
    item.sourceIds.forEach((sourceId, sourceIndex) => {
      if (!sourceById.has(sourceId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['contextItems', itemIndex, 'sourceIds', sourceIndex], message: `Unknown Context source: ${sourceId}.` })
      }
    })
    item.provenanceRefs.forEach((provenanceRef, refIndex) => {
      if (!allowedProvenanceRefs.has(provenanceRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contextItems', itemIndex, 'provenanceRefs', refIndex],
          message: `Context item provenance is not declared by its referenced sources: ${provenanceRef}.`,
        })
      }
    })
  })
  payload.contradictions.forEach((contradiction, contradictionIndex) => {
    contradiction.itemIds.forEach((itemId, itemIndex) => {
      if (!itemIds.includes(itemId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['contradictions', contradictionIndex, 'itemIds', itemIndex], message: `Unknown Context item: ${itemId}.` })
      }
    })
    contradiction.sourceIds.forEach((sourceId, sourceIndex) => {
      if (!sourceIds.includes(sourceId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['contradictions', contradictionIndex, 'sourceIds', sourceIndex], message: `Unknown Context source: ${sourceId}.` })
      }
    })
  })
  const included = new Set(payload.includedScope.map((item) => item.toLowerCase()))
  payload.excludedScope.forEach((item, index) => {
    if (included.has(item.toLowerCase())) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['excludedScope', index], message: 'Included and excluded Context scope must not overlap.' })
    }
  })
})

export type ContextFreshness = z.infer<typeof ContextFreshnessSchema>
export type ContextRedaction = z.infer<typeof ContextRedactionSchema>
export type ContextPayload = z.infer<typeof ContextPayloadSchema>

function freshnessUseIssue(
  freshness: ContextFreshness,
  provenanceRefs: ReadonlyArray<string>,
  nowMs: number,
  revalidatedRefs: ReadonlySet<string>,
) {
  if (freshness.observedAt !== null && Date.parse(freshness.observedAt) > nowMs) return 'observed-in-future'
  if (freshness.policy === 'ttl' && (freshness.expiresAt === null || Date.parse(freshness.expiresAt) <= nowMs)) return 'expired'
  if (freshness.policy === 'revalidate_on_use' && !provenanceRefs.every((ref) => revalidatedRefs.has(ref))) return 'revalidation-required'
  return null
}

export function validateContextPayloadForUse(
  input: unknown,
  options: { now: string; revalidatedProvenanceRefs?: ReadonlyArray<string> },
): ContextPayload {
  const payload = ContextPayloadSchema.parse(input)
  const nowMs = Date.parse(options.now)
  if (!Number.isFinite(nowMs)) throw new Error('Context use-time validation requires a valid current timestamp.')
  const revalidatedRefs = new Set(options.revalidatedProvenanceRefs ?? [])
  const issues: Array<string> = []
  for (const source of payload.sources) {
    if (source.status !== 'loaded') issues.push(`source:${source.sourceId}:status-${source.status}`)
    const issue = freshnessUseIssue(source.freshness, source.provenanceRefs, nowMs, revalidatedRefs)
    if (issue) issues.push(`source:${source.sourceId}:${issue}`)
  }
  for (const item of payload.contextItems) {
    const issue = freshnessUseIssue(item.freshness, item.provenanceRefs, nowMs, revalidatedRefs)
    if (issue) issues.push(`item:${item.itemId}:${issue}`)
  }
  if (issues.length > 0) throw new Error(`Context is not fresh for use: ${issues.join(', ')}.`)
  return payload
}
