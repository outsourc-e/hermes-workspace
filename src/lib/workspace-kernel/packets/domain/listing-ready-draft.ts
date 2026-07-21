import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(10_000)
const EvidenceRefSchema = z.string().trim().min(1).max(2_048)
const EvidenceRefsSchema = z.array(EvidenceRefSchema).max(500)

const ListingPriceSchema = z.object({
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  amount: z.number().positive().finite(),
  evidenceRefs: EvidenceRefsSchema.min(1),
}).strict()

const ListingMediaSchema = z.object({
  imageRef: EvidenceRefSchema,
  altText: z.string().trim().min(1).max(500),
  order: z.number().int().positive(),
  evidenceRefs: EvidenceRefsSchema.min(1),
}).strict()

const ListingClaimSchema = z.object({
  claimId: IdSchema,
  wording: z.string().trim().min(1).max(1_000),
  evidenceRefs: EvidenceRefsSchema.min(1),
  conditions: z.array(z.string().trim().min(1).max(2_048)).max(100),
}).strict()

const ListingAttributeSchema = z.object({
  value: z.string().trim().min(1).max(2_048),
  evidenceRefs: EvidenceRefsSchema.min(1),
}).strict()

export const ListingReadyDraftPayloadSchema = z.object({
  contractVersion: z.literal('listing-ready-draft-v1'),
  opportunityPacketId: IdSchema,
  evidenceAllowedClaimsPacketId: IdSchema,
  supplierEvidencePacketId: IdSchema,
  legacyDraftPacketId: IdSchema,
  upstreamReadiness: z.object({
    supplierEvidence: z.enum(['ready', 'blocked']),
    allowedClaims: z.enum(['ready', 'blocked']),
  }).strict(),
  targetShop: z.literal('DolaroBoutique'),
  categoryGuard: z.literal('jewelry_only'),
  title: z.string().trim().max(140),
  description: z.string().trim().max(20_000),
  tags: z.array(z.string().trim().min(1).max(20)).max(13),
  attributes: z.record(z.string().trim().min(1).max(256), ListingAttributeSchema),
  personalization: z.literal(false),
  materials: z.array(z.string().trim().min(1).max(512)).max(100),
  colors: z.array(z.string().trim().min(1).max(512)).max(100),
  variants: z.array(z.string().trim().min(1).max(1_000)).max(200),
  price: ListingPriceSchema.nullable(),
  quantity: z.number().int().positive(),
  media: z.array(ListingMediaSchema).max(20),
  claims: z.array(ListingClaimSchema).max(200),
  blockedClaims: z.array(TextSchema).max(500),
  downstreamConstraints: z.array(TextSchema).max(500),
  approvalRequired: z.literal(true),
  liveActionsLocked: z.array(z.string().trim().min(1).max(512)).max(100),
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: z.array(z.string().trim().min(1).max(512)).max(100),
}).strict().superRefine((value, context) => {
  const expectedBlocks: Array<string> = []
  if (!value.title) expectedBlocks.push('title')
  if (!value.description) expectedBlocks.push('description')
  if (value.tags.length === 0) expectedBlocks.push('tags')
  if (Object.keys(value.attributes).length === 0) expectedBlocks.push('attributes')
  if (value.materials.length === 0) expectedBlocks.push('materials')
  if (value.variants.length === 0) expectedBlocks.push('variants')
  if (!value.price) expectedBlocks.push('price')
  if (value.media.length === 0) expectedBlocks.push('media.altText')
  if (value.upstreamReadiness.supplierEvidence !== 'ready') expectedBlocks.push('supplierEvidence')
  if (value.upstreamReadiness.allowedClaims !== 'ready') expectedBlocks.push('allowedClaims')

  const requiredLocks = ['Etsy upload draft', 'Etsy publish']
  for (const lock of requiredLocks) {
    if (!value.liveActionsLocked.includes(lock)) expectedBlocks.push(`liveActionsLocked.${lock}`)
  }

  const duplicateTags = value.tags.filter((tag, index, tags) => tags.indexOf(tag) !== index)
  if (duplicateTags.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tags'], message: 'Listing tags must be unique.' })
  }
  const mediaRefs = value.media.map((item) => item.imageRef)
  if (new Set(mediaRefs).size !== mediaRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['media'], message: 'Listing media references must be unique.' })
  }
  const mediaOrders = value.media.map((item) => item.order)
  if (new Set(mediaOrders).size !== mediaOrders.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['media'], message: 'Listing media order values must be unique.' })
  }
  const claimIds = value.claims.map((claim) => claim.claimId)
  if (new Set(claimIds).size !== claimIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['claims'], message: 'Listing claim IDs must be unique.' })
  }

  const expected = [...new Set(expectedBlocks)].sort()
  const declared = [...new Set(value.hardBlocks)].sort()
  if (expected.join('\n') !== declared.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hardBlocks'], message: `hardBlocks must exactly match derived listing blockers: ${expected.join(', ') || 'none'}.` })
  }
  const expectedReadiness = expected.length === 0 ? 'ready' : 'blocked'
  if (value.readiness !== expectedReadiness) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness'], message: `Listing readiness must be ${expectedReadiness}.` })
  }
})

export type ListingReadyDraftPayload = z.infer<typeof ListingReadyDraftPayloadSchema>

export function evidenceRefsFromListingReadyDraft(payload: ListingReadyDraftPayload) {
  return [...new Set([
    ...(payload.price?.evidenceRefs ?? []),
    ...Object.values(payload.attributes).flatMap((attribute) => attribute.evidenceRefs),
    ...payload.media.flatMap((media) => [media.imageRef, ...media.evidenceRefs]),
    ...payload.claims.flatMap((claim) => claim.evidenceRefs),
  ])]
}
