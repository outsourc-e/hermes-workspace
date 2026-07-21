import { describe, expect, it } from 'vitest'

import { safeParseWorkspacePacket } from '../schemas'
import {
  GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION,
  GoblinOpportunityV1InputSchema,
  goblinOpportunityV1ToWorkspacePacket,
} from './goblin-opportunity-v1'

export const validGoblinOpportunityV1 = {
  schemaVersion: GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION,
  packetId: 'goblin-packet-1',
  requestId: 'goblin-request-1',
  createdAtMs: 1_789_000_000_000,
  status: 'ready_for_oracle',
  candidate: {
    kind: 'product' as const,
    title: 'Evidence-linked candidate',
    url: 'https://example.com/product',
  },
  comparisonBasis: ['Compared demand signal, competition, source freshness, and copyability.'],
  scores: {
    opportunity: 78,
    confidence: 64,
    demand: 82,
    competition: 55,
    copyability: 71,
  },
  sources: [{
    sourceId: 'source-1',
    label: 'Observed product source',
    url: 'https://example.com/source',
    observedAtMs: 1_789_000_000_000,
    provenance: 'Direct source URL recorded by the current research run.',
  }],
  caveats: ['Supplier truth has not been validated.'],
  hardBlocks: [],
  missingEvidence: ['Oracle provenance review.'],
  recommendation: 'send_to_oracle' as const,
  handoff: {
    toRoomId: 'oracle-signals' as const,
    toStationId: 'oracle-signal-basin' as const,
    reason: 'Validate provenance, confidence, and allowed claims.',
  },
  lockedActions: ['live_marketplace_mutation', 'final_claim_approval', 'worker_fan_out'] as const,
}

describe('Goblin Opportunity V1 adapter', () => {
  it('maps one legacy candidate into one strict shared Opportunity Packet', () => {
    const packet = goblinOpportunityV1ToWorkspacePacket(validGoblinOpportunityV1, {
      runId: 'run-goblin-1',
      researchBatchId: 'research-batch-1',
      idempotencyKey: 'run-goblin-1:goblin-packet-1',
    })

    expect(packet).toMatchObject({
      packetId: 'goblin-packet-1',
      packetLineageId: 'goblin-packet-1',
      revision: 1,
      runId: 'run-goblin-1',
      packetType: 'opportunity',
      from: { roomId: 'agora-opportunity', agentId: 'goblin' },
      to: { roomId: 'oracle-signals', agentId: null },
      missingFields: ['Oracle provenance review.', 'legacy.per_metric_evidence'],
      lockedActions: ['live_marketplace_mutation', 'final_claim_approval', 'worker_fan_out'],
      payload: {
        researchBatchId: 'research-batch-1',
        recommendation: 'send_to_oracle',
      },
    })
    expect(packet.payload.candidate.candidateId).toMatch(/^candidate-[a-f0-9]{32}$/)
    expect(packet.missingFields).toEqual(['Oracle provenance review.', 'legacy.per_metric_evidence'])
    expect(packet.sourceRefs).toContain('https://example.com/source')
    expect(packet.evidenceRefs).toContain('goblin-source:source-1')
    expect(packet.payload.observedMetrics).toHaveLength(1)
    expect(packet.payload.scores).toHaveLength(5)
    expect(packet.payload.observedMetrics.every((metric) => (
      Boolean(metric.unit)
      && Boolean(metric.observedAt)
      && Boolean(metric.sourceRef || metric.evidenceRef)
    ))).toBe(true)
    expect(packet.payload.scores.every((score) => score.observedMetricIds.length > 0 && score.reason.length > 0)).toBe(true)
    expect(packet.payload).not.toHaveProperty('status')
    expect(packet.payload).not.toHaveProperty('handoff')
    expect(packet.payload).not.toHaveProperty('lockedActions')
    expect(safeParseWorkspacePacket(packet).success).toBe(true)

    const sameCandidateNewPacket = goblinOpportunityV1ToWorkspacePacket({
      ...validGoblinOpportunityV1,
      packetId: 'goblin-packet-2',
    }, {
      runId: 'run-goblin-1',
      researchBatchId: 'research-batch-1',
      idempotencyKey: 'run-goblin-1:goblin-packet-2',
    })
    expect(sameCandidateNewPacket.payload.candidate.candidateId).toBe(packet.payload.candidate.candidateId)
  })

  it('preserves strict legacy parsing for one migration release', () => {
    expect(GoblinOpportunityV1InputSchema.parse(validGoblinOpportunityV1)).toEqual(validGoblinOpportunityV1)
    expect(GoblinOpportunityV1InputSchema.safeParse({
      ...validGoblinOpportunityV1,
      handoff: { ...validGoblinOpportunityV1.handoff, toRoomId: 'etsy-market-lab' },
    }).success).toBe(false)
    expect(GoblinOpportunityV1InputSchema.safeParse({
      ...validGoblinOpportunityV1,
      publishApproved: true,
    }).success).toBe(false)
  })

  it('rejects invalid legacy scores before creating a shared Packet', () => {
    expect(() => goblinOpportunityV1ToWorkspacePacket({
      ...validGoblinOpportunityV1,
      scores: { ...validGoblinOpportunityV1.scores, opportunity: 101 },
    }, {
      runId: 'run-goblin-1',
      researchBatchId: 'research-batch-1',
      idempotencyKey: 'run-goblin-1:goblin-packet-invalid',
    })).toThrow()
  })
})
