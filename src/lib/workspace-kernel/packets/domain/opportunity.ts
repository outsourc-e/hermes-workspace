import { z } from 'zod'

import type { UniversalPacketEnvelope } from '../types'

const NonEmptyTextSchema = z.string().trim().min(1).max(4_096)
const IdSchema = z.string().trim().min(1).max(256)
const UrlSchema = z.string().url().max(2_000)
const IsoTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
const TextListSchema = z.array(NonEmptyTextSchema).max(500)

export const OpportunityObservedMetricSchema = z.object({
  metricId: IdSchema,
  label: NonEmptyTextSchema,
  value: z.union([z.number().finite(), z.string().trim().min(1).max(4_096), z.boolean()]),
  unit: NonEmptyTextSchema,
  observedAt: IsoTimestampSchema,
  sourceRef: NonEmptyTextSchema.nullable(),
  evidenceRef: NonEmptyTextSchema.nullable(),
}).strict().superRefine((metric, context) => {
  if (!metric.sourceRef && !metric.evidenceRef) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'An observed metric requires a sourceRef or evidenceRef.',
      path: ['sourceRef'],
    })
  }
})

export const OpportunityScoreSchema = z.object({
  scoreId: IdSchema,
  label: NonEmptyTextSchema,
  value: z.number().finite().min(0).max(100),
  observedMetricIds: z.array(IdSchema).min(1).max(500),
  reason: NonEmptyTextSchema,
}).strict()

export const OpportunityHypothesisSchema = z.object({
  hypothesisId: IdSchema,
  text: NonEmptyTextSchema,
  basisMetricIds: z.array(IdSchema).min(1).max(500),
  confidence: z.number().finite().min(0).max(1),
  reason: NonEmptyTextSchema,
}).strict()

export const OpportunityPayloadSchema = z.object({
  researchBatchId: IdSchema,
  candidate: z.object({
    candidateId: IdSchema,
    kind: z.enum(['shop', 'product', 'niche']),
    title: z.string().trim().min(1).max(300),
    url: UrlSchema.nullable(),
    imageUrl: UrlSchema.nullable(),
  }).strict(),
  observedMetrics: z.array(OpportunityObservedMetricSchema).min(1).max(500),
  scores: z.array(OpportunityScoreSchema).max(100),
  hypotheses: z.array(OpportunityHypothesisSchema).max(100),
  comparisonBasis: z.array(NonEmptyTextSchema).min(1).max(100),
  caveats: TextListSchema,
  hardBlocks: TextListSchema,
  recommendation: z.enum(['watch', 'reject', 'needs_more_evidence', 'send_to_oracle']),
  oracleHandoffReason: NonEmptyTextSchema,
}).strict().superRefine((payload, context) => {
  const metricIds = new Set<string>()
  payload.observedMetrics.forEach((metric, index) => {
    if (metricIds.has(metric.metricId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate metricId: ${metric.metricId}.`,
        path: ['observedMetrics', index, 'metricId'],
      })
    }
    metricIds.add(metric.metricId)
  })

  const scoreIds = new Set<string>()
  payload.scores.forEach((score, scoreIndex) => {
    if (scoreIds.has(score.scoreId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate scoreId: ${score.scoreId}.`,
        path: ['scores', scoreIndex, 'scoreId'],
      })
    }
    scoreIds.add(score.scoreId)
    const referenced = new Set<string>()
    score.observedMetricIds.forEach((metricId, metricIndex) => {
      if (referenced.has(metricId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate observed metric reference: ${metricId}.`,
          path: ['scores', scoreIndex, 'observedMetricIds', metricIndex],
        })
      }
      referenced.add(metricId)
      if (!metricIds.has(metricId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown observed metric reference: ${metricId}.`,
          path: ['scores', scoreIndex, 'observedMetricIds', metricIndex],
        })
      }
    })
  })

  const hypothesisIds = new Set<string>()
  payload.hypotheses.forEach((hypothesis, hypothesisIndex) => {
    if (hypothesisIds.has(hypothesis.hypothesisId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate hypothesisId: ${hypothesis.hypothesisId}.`,
        path: ['hypotheses', hypothesisIndex, 'hypothesisId'],
      })
    }
    hypothesisIds.add(hypothesis.hypothesisId)
    const referenced = new Set<string>()
    hypothesis.basisMetricIds.forEach((metricId, metricIndex) => {
      if (referenced.has(metricId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate hypothesis metric reference: ${metricId}.`,
          path: ['hypotheses', hypothesisIndex, 'basisMetricIds', metricIndex],
        })
      }
      referenced.add(metricId)
      if (!metricIds.has(metricId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown observed metric reference: ${metricId}.`,
          path: ['hypotheses', hypothesisIndex, 'basisMetricIds', metricIndex],
        })
      }
    })
  })
})

export type OpportunityObservedMetric = z.infer<typeof OpportunityObservedMetricSchema>
export type OpportunityScore = z.infer<typeof OpportunityScoreSchema>
export type OpportunityHypothesis = z.infer<typeof OpportunityHypothesisSchema>
export type OpportunityPayload = z.infer<typeof OpportunityPayloadSchema>

export function assertUniqueOpportunityCandidates(
  packets: ReadonlyArray<UniversalPacketEnvelope>,
): Array<UniversalPacketEnvelope<OpportunityPayload>> {
  const seen = new Set<string>()
  return packets.map((packet) => {
    if (packet.packetType !== 'opportunity') {
      throw new Error(`Packet ${packet.packetId} is not an Opportunity Packet.`)
    }
    const payload = OpportunityPayloadSchema.parse(packet.payload)
    const candidateKey = `${payload.researchBatchId}:${payload.candidate.candidateId}`
    if (seen.has(candidateKey)) {
      throw new Error(`Duplicate Opportunity candidate in research batch: ${candidateKey}.`)
    }
    seen.add(candidateKey)
    return { ...packet, payload }
  })
}
