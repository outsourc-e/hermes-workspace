import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(4_096)
const TextListSchema = z.array(TextSchema).max(500)
const EvidenceRefListSchema = z.array(IdSchema).max(500)
const IsoTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)

export const ProductTruthDimensionSchema = z.object({
  relevant: z.boolean(),
  status: z.enum(['verified', 'unknown', 'missing', 'not_applicable']),
  evidenceRefs: EvidenceRefListSchema,
  note: TextSchema,
}).strict().superRefine((truth, context) => {
  if (truth.relevant && truth.status === 'not_applicable') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Relevant Product Truth cannot be marked not_applicable.',
      path: ['status'],
    })
  }
  if (!truth.relevant && truth.status !== 'not_applicable') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Irrelevant Product Truth must be marked not_applicable.',
      path: ['status'],
    })
  }
  if (truth.status === 'verified' && truth.evidenceRefs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Verified Product Truth requires evidence.',
      path: ['evidenceRefs'],
    })
  }
})

export const AllowedClaimSchema = z.object({
  claimId: IdSchema,
  claimText: TextSchema,
  verdict: z.enum(['supported', 'conditional', 'unsupported', 'unknown', 'contradicted']),
  evidenceRefs: EvidenceRefListSchema,
  confidence: z.number().finite().min(0).max(1),
  allowedWording: TextListSchema,
  forbiddenWording: TextListSchema,
  conditions: TextListSchema,
  caveats: TextListSchema,
  recheckAt: IsoTimestampSchema.nullable(),
}).strict().superRefine((claim, context) => {
  const mayBeUsed = claim.verdict === 'supported' || claim.verdict === 'conditional'
  if (mayBeUsed && claim.evidenceRefs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${claim.verdict} wording requires evidence.`,
      path: ['evidenceRefs'],
    })
  }
  if (mayBeUsed && claim.allowedWording.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${claim.verdict} wording requires at least one allowed form.`,
      path: ['allowedWording'],
    })
  }
  if (!mayBeUsed && claim.allowedWording.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${claim.verdict} wording must remain locked.`,
      path: ['allowedWording'],
    })
  }
  if (!mayBeUsed && claim.forbiddenWording.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${claim.verdict} claims require explicit forbidden wording.`,
      path: ['forbiddenWording'],
    })
  }
  if (claim.verdict === 'conditional' && claim.conditions.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Conditional wording requires at least one condition.',
      path: ['conditions'],
    })
  }
  if (claim.verdict !== 'conditional' && claim.conditions.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only conditional claims may declare conditions.',
      path: ['conditions'],
    })
  }
  if (claim.verdict === 'contradicted' && claim.evidenceRefs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A contradicted verdict requires evidence.',
      path: ['evidenceRefs'],
    })
  }
})

export const EvidenceAllowedClaimsPayloadSchema = z.object({
  subject: z.object({
    subjectId: IdSchema,
    opportunityPacketId: IdSchema,
    title: z.string().trim().min(1).max(300),
  }).strict(),
  productTruth: z.object({
    identity: ProductTruthDimensionSchema,
    material: ProductTruthDimensionSchema,
    dimensions: ProductTruthDimensionSchema,
    variant: ProductTruthDimensionSchema,
    safety: ProductTruthDimensionSchema,
    compliance: ProductTruthDimensionSchema,
  }).strict(),
  claims: z.array(AllowedClaimSchema).min(1).max(500),
  downstreamConstraints: TextListSchema,
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: TextListSchema,
  reviewedAt: IsoTimestampSchema,
}).strict().superRefine((payload, context) => {
  const truthEntries = Object.entries(payload.productTruth) as Array<[
    keyof typeof payload.productTruth,
    z.infer<typeof ProductTruthDimensionSchema>,
  ]>
  const requiredTruthHardBlocks = truthEntries
    .filter(([, truth]) => truth.relevant && truth.status !== 'verified')
    .map(([field]) => `productTruth.${field}`)
  const requiredClaimHardBlocks = payload.claims
    .filter((claim) => claim.verdict === 'unknown')
    .map((claim) => `claims.${claim.claimId}`)
  const requiredHardBlocks = [...requiredTruthHardBlocks, ...requiredClaimHardBlocks]
  const hardBlockSet = new Set(payload.hardBlocks)

  requiredHardBlocks.forEach((hardBlock) => {
    if (!hardBlockSet.has(hardBlock)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing required hard block: ${hardBlock}.`,
        path: ['hardBlocks'],
      })
    }
  })
  payload.hardBlocks.forEach((hardBlock, index) => {
    if (!requiredHardBlocks.includes(hardBlock)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unexpected hard block: ${hardBlock}.`,
        path: ['hardBlocks', index],
      })
    }
  })
  if (requiredHardBlocks.length > 0 && payload.readiness !== 'blocked') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Incomplete relevant Product Truth or an unknown claim blocks the whole Packet.',
      path: ['readiness'],
    })
  }
  if (requiredHardBlocks.length === 0 && payload.readiness !== 'ready') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A Packet without unresolved Product Truth or claims must not declare blocked readiness.',
      path: ['readiness'],
    })
  }

  const claimIds = new Set<string>()
  const verdicts = new Set<string>()
  payload.claims.forEach((claim, claimIndex) => {
    if (claimIds.has(claim.claimId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate claimId: ${claim.claimId}.`,
        path: ['claims', claimIndex, 'claimId'],
      })
    }
    claimIds.add(claim.claimId)
    verdicts.add(claim.verdict)
    if (claim.verdict === 'conditional') {
      claim.conditions.forEach((condition, conditionIndex) => {
        if (!payload.downstreamConstraints.includes(condition)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Conditional wording must become a mandatory downstream constraint.',
            path: ['claims', claimIndex, 'conditions', conditionIndex],
          })
        }
      })
    }
  })
  if (requiredHardBlocks.length > 0 && verdicts.size > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Mixed claim verdicts require complete core Product Truth.',
      path: ['claims'],
    })
  }
})

export type ProductTruthDimension = z.infer<typeof ProductTruthDimensionSchema>
export type AllowedClaim = z.infer<typeof AllowedClaimSchema>
export type EvidenceAllowedClaimsPayload = z.infer<typeof EvidenceAllowedClaimsPayloadSchema>

export function evidenceRefsFromAllowedClaims(payload: EvidenceAllowedClaimsPayload) {
  return [...new Set([
    ...Object.values(payload.productTruth).flatMap((truth) => truth.evidenceRefs),
    ...payload.claims.flatMap((claim) => claim.evidenceRefs),
  ])]
}
