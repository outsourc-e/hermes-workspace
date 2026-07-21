import { z } from 'zod'

import { canonicalizeWorkspacePacketContent, sha256Hex } from '../canonical-json'
import { createWorkspacePacket } from '../factory'
import { OpportunityPayloadSchema } from '../domain/opportunity'
import type { UniversalPacketEnvelope } from '../types'
import type { OpportunityPayload } from '../domain/opportunity'

export const GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION = 'goblin-opportunity-packet-v1' as const

const boundedText = (max: number) => z.string().trim().min(1).max(max)
const score = z.number().min(0).max(100)

export const GoblinOpportunityV1SourceSchema = z.object({
  sourceId: boundedText(120),
  label: boundedText(240),
  url: z.string().url().max(2_000).optional(),
  observedAtMs: z.number().int().nonnegative().optional(),
  provenance: boundedText(400),
  caveat: z.string().trim().max(400).optional(),
}).strict()

export const GoblinOpportunityV1InputSchema = z.object({
  schemaVersion: z.literal(GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION),
  packetId: boundedText(120),
  requestId: boundedText(120),
  createdAtMs: z.number().int().nonnegative(),
  status: z.enum(['candidate', 'shortlisted', 'blocked', 'ready_for_oracle']),
  candidate: z.object({
    kind: z.enum(['shop', 'product', 'niche']),
    title: boundedText(300),
    url: z.string().url().max(2_000).optional(),
    imageUrl: z.string().url().max(2_000).optional(),
  }).strict(),
  comparisonBasis: z.array(boundedText(400)).min(1).max(20),
  scores: z.object({
    opportunity: score,
    confidence: score,
    demand: score.optional(),
    competition: score.optional(),
    copyability: score.optional(),
  }).strict(),
  sources: z.array(GoblinOpportunityV1SourceSchema).min(1).max(20),
  caveats: z.array(boundedText(400)).max(20),
  hardBlocks: z.array(boundedText(400)).max(20),
  missingEvidence: z.array(boundedText(400)).max(20),
  recommendation: z.enum(['watch', 'reject', 'needs_more_evidence', 'send_to_oracle']),
  handoff: z.object({
    toRoomId: z.literal('oracle-signals'),
    toStationId: z.literal('oracle-signal-basin'),
    reason: boundedText(600),
  }).strict(),
  lockedActions: z.array(z.enum([
    'live_marketplace_mutation',
    'supplier_or_customer_message',
    'purchase',
    'paid_generation_or_research',
    'final_claim_approval',
    'worker_fan_out',
  ])).min(1),
}).strict()

export type GoblinOpportunityV1Input = z.infer<typeof GoblinOpportunityV1InputSchema>

export interface GoblinOpportunityV1AdapterOptions {
  runId: string
  researchBatchId: string
  idempotencyKey: string
  packetId?: string
  packetLineageId?: string
  createdAt?: string
}

function sourceRef(source: GoblinOpportunityV1Input['sources'][number]) {
  return source.url ?? `goblin-source:${source.sourceId}`
}

function evidenceRef(source: GoblinOpportunityV1Input['sources'][number]) {
  return `goblin-source:${source.sourceId}`
}

function stableCandidateId(legacy: GoblinOpportunityV1Input) {
  const normalizedUrl = legacy.candidate.url
    ? new URL(legacy.candidate.url).toString().toLowerCase()
    : null
  const identity = canonicalizeWorkspacePacketContent({
    kind: legacy.candidate.kind,
    title: legacy.candidate.title.trim().toLowerCase(),
    url: normalizedUrl,
  })
  return `candidate-${sha256Hex(identity).slice(0, 32)}`
}

export function goblinOpportunityV1ToWorkspacePacket(
  input: unknown,
  options: GoblinOpportunityV1AdapterOptions,
): UniversalPacketEnvelope<OpportunityPayload> {
  const legacy = GoblinOpportunityV1InputSchema.parse(input)
  const observedMetrics = legacy.sources.map((source, index) => ({
    metricId: `legacy-source-observation-${index + 1}`,
    label: `Legacy source recorded: ${source.label}`,
    value: true,
    unit: 'boolean',
    observedAt: new Date(source.observedAtMs ?? legacy.createdAtMs).toISOString(),
    sourceRef: sourceRef(source),
    evidenceRef: evidenceRef(source),
  }))
  const observedMetricIds = observedMetrics.map((metric) => metric.metricId)
  const metricEntries = Object.entries(legacy.scores) as Array<[keyof typeof legacy.scores, number | undefined]>
  const scores = metricEntries
    .filter((entry): entry is [keyof typeof legacy.scores, number] => entry[1] !== undefined)
    .map(([name, value]) => ({
      scoreId: `legacy-${name}-score`,
      label: `Legacy Goblin ${name} score`,
      value,
      observedMetricIds,
      reason: `Compatibility-only ${name} score from ${GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION}; per-metric evidence was not present in the legacy shape and remains missing.`,
    }))
  const payload = OpportunityPayloadSchema.parse({
    researchBatchId: options.researchBatchId,
    candidate: {
      candidateId: stableCandidateId(legacy),
      kind: legacy.candidate.kind,
      title: legacy.candidate.title,
      url: legacy.candidate.url ?? null,
      imageUrl: legacy.candidate.imageUrl ?? null,
    },
    observedMetrics,
    scores,
    hypotheses: [],
    comparisonBasis: legacy.comparisonBasis,
    caveats: legacy.caveats,
    hardBlocks: legacy.hardBlocks,
    recommendation: legacy.recommendation,
    oracleHandoffReason: legacy.handoff.reason,
  })
  const packetId = options.packetId ?? legacy.packetId
  const packetLineageId = options.packetLineageId ?? packetId
  return createWorkspacePacket({
    packetId,
    packetLineageId,
    createdAt: options.createdAt ?? new Date(legacy.createdAtMs).toISOString(),
    runId: options.runId,
    schemaVersion: '1.0.0',
    packetType: 'opportunity',
    from: { roomId: 'agora-opportunity', agentId: 'goblin' },
    to: { roomId: legacy.handoff.toRoomId, agentId: null },
    sourceRefs: legacy.sources.map(sourceRef),
    evidenceRefs: legacy.sources.map(evidenceRef),
    assumptions: legacy.caveats,
    missingFields: [...new Set([...legacy.missingEvidence, 'legacy.per_metric_evidence'])],
    lockedActions: legacy.lockedActions,
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      {
        criterionId: 'opportunity-payload-valid',
        description: 'The shared Opportunity payload validates with evidence-linked metrics.',
        required: true,
      },
      {
        criterionId: 'oracle-handoff-required',
        description: 'Oracle must validate provenance and allowed claims before downstream listing work.',
        required: true,
      },
    ],
    idempotencyKey: options.idempotencyKey,
    payload,
  })
}
