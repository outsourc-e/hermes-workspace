import { describe, expect, it } from 'vitest'

import { GoblinOpportunityV1InputSchema } from '../../workspace-kernel/packets/adapters/goblin-opportunity-v1'
import {
  GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION,
  GOBLIN_OPPORTUNITY_REQUEST_SCHEMA_VERSION,
  GoblinOpportunityPacketSchema,
  GoblinOpportunityRequestSchema,
  adaptGoblinOpportunityPacketV1,
} from './goblin-opportunity-packet'

const validPacket = {
  schemaVersion: GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION,
  packetId: 'goblin-packet-1',
  requestId: 'goblin-request-1',
  createdAtMs: 1_789_000_000_000,
  status: 'ready_for_oracle',
  candidate: {
    kind: 'product',
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
  recommendation: 'send_to_oracle',
  handoff: {
    toRoomId: 'oracle-signals',
    toStationId: 'oracle-signal-basin',
    reason: 'Validate provenance, confidence, and allowed claims.',
  },
  lockedActions: ['live_marketplace_mutation', 'final_claim_approval', 'worker_fan_out'],
} as const

describe('Goblin Opportunity Packet contract', () => {
  it('accepts bounded opportunity requests and evidence-linked Oracle handoffs', () => {
    expect(GoblinOpportunityRequestSchema.parse({
      schemaVersion: GOBLIN_OPPORTUNITY_REQUEST_SCHEMA_VERSION,
      requestId: 'goblin-request-1',
      requestedAtMs: 1_789_000_000_000,
      query: 'Find a defensible product opportunity.',
      scope: 'mixed',
    })).toMatchObject({ maxCandidates: 10, constraints: [], sourceHints: [] })

    expect(GoblinOpportunityPacketSchema.parse(validPacket)).toEqual(validPacket)
    expect(GoblinOpportunityPacketSchema).toBe(GoblinOpportunityV1InputSchema)
    expect(adaptGoblinOpportunityPacketV1(validPacket, {
      runId: 'run-goblin-compatibility',
      researchBatchId: 'batch-goblin-compatibility',
      idempotencyKey: 'run-goblin-compatibility:goblin-packet-1',
    })).toMatchObject({
      packetType: 'opportunity',
      packetId: 'goblin-packet-1',
      payload: { researchBatchId: 'batch-goblin-compatibility' },
    })
  })

  it('rejects inflated scores, direct Etsy handoffs, and undeclared live permissions', () => {
    expect(GoblinOpportunityPacketSchema.safeParse({
      ...validPacket,
      scores: { ...validPacket.scores, opportunity: 101 },
    }).success).toBe(false)

    expect(GoblinOpportunityPacketSchema.safeParse({
      ...validPacket,
      handoff: { ...validPacket.handoff, toRoomId: 'etsy-market-lab' },
    }).success).toBe(false)

    expect(GoblinOpportunityPacketSchema.safeParse({
      ...validPacket,
      publishApproved: true,
    }).success).toBe(false)
  })
})
