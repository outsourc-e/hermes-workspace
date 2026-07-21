import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(4_096)
const EvidenceRefSchema = z.string().trim().min(1).max(2_048)
const EvidenceRefsSchema = z.array(EvidenceRefSchema).max(500)

export const SupplierEvidenceFieldSchema = z.object({
  relevant: z.boolean(),
  status: z.enum(['verified', 'unknown', 'missing', 'not_applicable']),
  evidenceRefs: EvidenceRefsSchema,
}).strict().superRefine((value, context) => {
  if (value.relevant && value.status !== 'verified') return
  if (value.relevant && value.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'Verified relevant supplier truth requires evidence.' })
  }
  if (!value.relevant && value.status !== 'not_applicable') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Irrelevant supplier truth must be not_applicable.' })
  }
})

export const SupplierEvidencePayloadSchema = z.object({
  contractVersion: z.literal('supplier-evidence-v1'),
  opportunityPacketId: IdSchema,
  evidenceAllowedClaimsPacketId: IdSchema,
  candidateId: IdSchema,
  supplierOfferId: IdSchema,
  source: z.object({
    platform: z.enum(['AliExpress', 'Alibaba', 'Etsy', 'Other']),
    sourceRef: EvidenceRefSchema,
    capturedAt: z.string().datetime({ offset: true }),
    accessMode: z.literal('read_only'),
  }).strict(),
  match: z.object({
    verdict: z.enum(['exact', 'near_exact', 'variant_family', 'rejected', 'unknown']),
    confidence: z.number().min(0).max(1),
    matchedAttributes: z.array(TextSchema).max(200),
    mismatches: z.array(TextSchema).max(200),
    evidenceRefs: EvidenceRefsSchema,
  }).strict(),
  product: z.object({
    title: TextSchema,
    materials: z.array(TextSchema).max(100),
    dimensions: z.array(TextSchema).max(100),
    variants: z.array(TextSchema).max(200),
    imageRefs: EvidenceRefsSchema,
  }).strict(),
  economics: z.object({
    currency: z.string().trim().regex(/^[A-Z]{3}$/).nullable(),
    unitPrice: z.number().nonnegative().finite().nullable(),
    shippingPrice: z.number().nonnegative().finite().nullable(),
    minimumOrderQuantity: z.number().int().positive().nullable(),
    observedAt: z.string().datetime({ offset: true }).nullable(),
    evidenceRefs: EvidenceRefsSchema,
  }).strict(),
  fieldEvidence: z.object({
    identity: SupplierEvidenceFieldSchema,
    materials: SupplierEvidenceFieldSchema,
    dimensions: SupplierEvidenceFieldSchema,
    variants: SupplierEvidenceFieldSchema,
    pricing: SupplierEvidenceFieldSchema,
  }).strict(),
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: z.array(z.string().trim().min(1).max(512)).max(100),
}).strict().superRefine((value, context) => {
  const expectedBlocks: Array<string> = []
  if (value.match.verdict !== 'exact' && value.match.verdict !== 'near_exact') expectedBlocks.push('match.verdict')
  if ((value.match.verdict === 'exact' || value.match.verdict === 'near_exact') && value.match.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['match', 'evidenceRefs'], message: 'Accepted supplier matches require evidence.' })
  }

  for (const [field, truth] of Object.entries(value.fieldEvidence)) {
    if (truth.relevant && truth.status !== 'verified') expectedBlocks.push(`fieldEvidence.${field}`)
  }

  if (value.fieldEvidence.identity.status === 'verified' && !value.product.title) expectedBlocks.push('product.title')
  if (value.fieldEvidence.materials.status === 'verified' && value.product.materials.length === 0) expectedBlocks.push('product.materials')
  if (value.fieldEvidence.dimensions.status === 'verified' && value.product.dimensions.length === 0) expectedBlocks.push('product.dimensions')
  if (value.fieldEvidence.variants.status === 'verified' && value.product.variants.length === 0) expectedBlocks.push('product.variants')
  if (value.fieldEvidence.pricing.status === 'verified') {
    if (!value.economics.currency) expectedBlocks.push('economics.currency')
    if (value.economics.unitPrice === null) expectedBlocks.push('economics.unitPrice')
    if (value.economics.shippingPrice === null) expectedBlocks.push('economics.shippingPrice')
    if (value.economics.minimumOrderQuantity === null) expectedBlocks.push('economics.minimumOrderQuantity')
    if (!value.economics.observedAt) expectedBlocks.push('economics.observedAt')
    if (value.economics.evidenceRefs.length === 0) expectedBlocks.push('economics.evidenceRefs')
  }

  const expected = [...new Set(expectedBlocks)].sort()
  const declared = [...new Set(value.hardBlocks)].sort()
  if (expected.join('\n') !== declared.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hardBlocks'], message: `hardBlocks must exactly match derived supplier blockers: ${expected.join(', ') || 'none'}.` })
  }
  const expectedReadiness = expected.length === 0 ? 'ready' : 'blocked'
  if (value.readiness !== expectedReadiness) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness'], message: `Supplier readiness must be ${expectedReadiness}.` })
  }
})

export type SupplierEvidencePayload = z.infer<typeof SupplierEvidencePayloadSchema>

export function evidenceRefsFromSupplierEvidence(payload: SupplierEvidencePayload) {
  return [...new Set([
    ...payload.match.evidenceRefs,
    ...payload.product.imageRefs,
    ...payload.economics.evidenceRefs,
    ...Object.values(payload.fieldEvidence).flatMap((field) => field.evidenceRefs),
  ])]
}
