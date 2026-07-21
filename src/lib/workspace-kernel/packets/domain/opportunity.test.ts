import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { workspacePacketContentHash } from '../canonical-json'

import { createWorkspacePacket } from '../factory'
import { persistWorkspacePacketStore } from '../packet-store'
import { safeParseWorkspacePacket } from '../schemas'
import {
  OpportunityPayloadSchema,
  assertUniqueOpportunityCandidates,
} from './opportunity'

export function validOpportunityPayload() {
  return {
    researchBatchId: 'research-batch-1',
    candidate: {
      candidateId: 'candidate-1',
      kind: 'product' as const,
      title: 'Evidence-linked product candidate',
      url: 'https://example.com/product',
      imageUrl: null,
    },
    observedMetrics: [
      {
        metricId: 'metric-demand',
        label: 'Observed demand signal',
        value: 82,
        unit: 'score_0_100',
        observedAt: '2026-07-18T20:20:00.000Z',
        sourceRef: 'https://example.com/demand',
        evidenceRef: null,
      },
      {
        metricId: 'metric-competition',
        label: 'Observed competition signal',
        value: 55,
        unit: 'score_0_100',
        observedAt: '2026-07-18T20:20:00.000Z',
        sourceRef: null,
        evidenceRef: 'local://evidence/competition-1',
      },
    ],
    scores: [
      {
        scoreId: 'score-opportunity',
        label: 'Opportunity score',
        value: 78,
        observedMetricIds: ['metric-demand', 'metric-competition'],
        reason: 'Demand is stronger than the observed competition signal.',
      },
    ],
    hypotheses: [
      {
        hypothesisId: 'hypothesis-copyability',
        text: 'The product may be sourceable with a defensible margin.',
        basisMetricIds: ['metric-demand'],
        confidence: 0.58,
        reason: 'Supplier and landed-cost proof are still missing.',
      },
    ],
    comparisonBasis: ['Compared demand and competition observations from the same research window.'],
    caveats: ['Supplier truth has not been validated.'],
    hardBlocks: [],
    recommendation: 'send_to_oracle' as const,
    oracleHandoffReason: 'Validate identity, provenance and claim-level truth.',
  }
}

function opportunityPacket(packetId: string, candidateId = 'candidate-1') {
  const payload = {
    ...validOpportunityPayload(),
    candidate: { ...validOpportunityPayload().candidate, candidateId },
  }
  return createWorkspacePacket({
    packetId,
    packetLineageId: packetId,
    createdAt: '2026-07-18T20:21:00.000Z',
    runId: 'run-opportunity-1',
    schemaVersion: '1.0.0',
    packetType: 'opportunity',
    from: { roomId: 'agora-opportunity', agentId: 'goblin' },
    to: { roomId: 'oracle-signals', agentId: null },
    sourceRefs: ['https://example.com/demand'],
    evidenceRefs: ['local://evidence/competition-1'],
    assumptions: [],
    missingFields: [],
    lockedActions: ['publish', 'purchase', 'supplier-message'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'criterion-opportunity', description: 'Opportunity payload validates.', required: true },
    ],
    idempotencyKey: `run-opportunity-1:${packetId}`,
    payload,
  })
}

describe('Opportunity domain Packet payload', () => {
  it('accepts evidence-linked observations, metric-backed scores and separate hypotheses', () => {
    expect(OpportunityPayloadSchema.parse(validOpportunityPayload())).toEqual(validOpportunityPayload())
  })

  it('requires value/unit/time plus source or evidence for every observed metric', () => {
    const payload = validOpportunityPayload()
    expect(OpportunityPayloadSchema.safeParse({
      ...payload,
      observedMetrics: [{
        metricId: 'metric-invalid',
        label: 'Invalid metric',
        value: 1,
        unit: 'count',
        observedAt: '2026-07-18T20:20:00.000Z',
        sourceRef: null,
        evidenceRef: null,
      }],
      scores: [],
      hypotheses: [],
    }).success).toBe(false)

    const { unit: _unit, ...withoutUnit } = payload.observedMetrics[0]
    expect(OpportunityPayloadSchema.safeParse({
      ...payload,
      observedMetrics: [withoutUnit],
    }).success).toBe(false)
  })

  it('rejects scores and hypotheses that reference unknown observed metrics', () => {
    const payload = validOpportunityPayload()
    expect(OpportunityPayloadSchema.safeParse({
      ...payload,
      scores: [{
        ...payload.scores[0],
        observedMetricIds: ['metric-unknown'],
      }],
    }).success).toBe(false)
    expect(OpportunityPayloadSchema.safeParse({
      ...payload,
      hypotheses: [{
        ...payload.hypotheses[0],
        basisMetricIds: ['metric-unknown'],
      }],
    }).success).toBe(false)
  })

  it('registers Opportunity as a strict shared payload schema', () => {
    const packet = opportunityPacket('packet-opportunity-strict')
    const invalid = {
      ...packet,
      payload: { ...packet.payload, publishApproved: true },
    }
    expect(safeParseWorkspacePacket(invalid).success).toBe(false)
  })

  it('rejects metric references that are not declared by the Envelope', () => {
    const packet = opportunityPacket('packet-opportunity-reference-mismatch')
    const { contentHash: _contentHash, ...changedContent } = {
      ...packet,
      sourceRefs: ['https://example.com/different-source'],
    }
    const parsed = safeParseWorkspacePacket({
      ...changedContent,
      contentHash: workspacePacketContentHash(changedContent),
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('Expected undeclared sourceRef rejection.')
    expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'payload.observedMetrics.0.sourceRef')).toBe(true)
  })

  it('enforces one Packet per candidate inside a research batch', () => {
    const first = opportunityPacket('packet-opportunity-1')
    const secondCandidate = opportunityPacket('packet-opportunity-2', 'candidate-2')
    expect(assertUniqueOpportunityCandidates([first, secondCandidate])).toEqual([first, secondCandidate])

    const duplicate = opportunityPacket('packet-opportunity-duplicate')
    expect(() => assertUniqueOpportunityCandidates([first, duplicate])).toThrow(/research-batch-1:candidate-1/)
  })

  it('enforces candidate uniqueness in the persisted store', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-opportunity-store-'))
    try {
      const first = opportunityPacket('packet-store-candidate-1', 'candidate-store-1')
      const duplicateLineage = opportunityPacket('packet-store-candidate-2', 'candidate-store-1')
      await persistWorkspacePacketStore({ packets: [first] }, { rootDir, nowMs: 1 })
      await expect(persistWorkspacePacketStore(
        { packets: [duplicateLineage] },
        { rootDir, nowMs: 2 },
      )).rejects.toThrow(/Opportunity candidate conflict/)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
