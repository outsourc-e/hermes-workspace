import { describe, expect, it } from 'vitest'
import { workspacePacketContentHash } from '../canonical-json'

import { createWorkspacePacket } from '../factory'
import { safeParseWorkspacePacket } from '../schemas'
import { EvidenceAllowedClaimsPayloadSchema } from './evidence-allowed-claims'
import type { EvidenceAllowedClaimsPayload } from './evidence-allowed-claims'

function truth(status: 'verified' | 'unknown' = 'verified', evidenceRef = 'evidence-product-truth') {
  return {
    relevant: true,
    status,
    evidenceRefs: status === 'verified' ? [evidenceRef] : [],
    note: status === 'verified' ? 'Verified from local source evidence.' : 'Truth is not known.',
  }
}

export function payload(): EvidenceAllowedClaimsPayload {
  return {
    subject: {
      subjectId: 'candidate-1',
      opportunityPacketId: 'packet-opportunity-1',
      title: 'Ceramic candle warmer',
    },
    productTruth: {
      identity: truth(),
      material: truth(),
      dimensions: truth(),
      variant: truth(),
      safety: truth(),
      compliance: truth(),
    },
    claims: [
      {
        claimId: 'claim-material',
        claimText: 'Made from glazed ceramic.',
        verdict: 'supported',
        evidenceRefs: ['evidence-product-truth'],
        confidence: 0.96,
        allowedWording: ['Glazed ceramic body.'],
        forbiddenWording: [],
        conditions: [],
        caveats: ['Color may vary slightly by batch.'],
        recheckAt: null,
      },
      {
        claimId: 'claim-handmade',
        claimText: 'Entirely handmade.',
        verdict: 'unsupported',
        evidenceRefs: [],
        confidence: 0.1,
        allowedWording: [],
        forbiddenWording: ['Entirely handmade.', '100% handmade.'],
        conditions: [],
        caveats: ['Manufacturing method has not been verified.'],
        recheckAt: null,
      },
    ],
    downstreamConstraints: [],
    readiness: 'ready',
    hardBlocks: [],
    reviewedAt: '2026-07-18T20:00:00.000Z',
  }
}

describe('EvidenceAllowedClaimsPayloadSchema', () => {
  it('accepts mixed claim verdicts only when all relevant core Product Truth is complete', () => {
    const parsed = EvidenceAllowedClaimsPayloadSchema.parse(payload())
    expect(parsed.readiness).toBe('ready')
    expect(parsed.claims.map((claim) => claim.verdict)).toEqual(['supported', 'unsupported'])
  })

  it('blocks the whole Packet when relevant core Product Truth is missing', () => {
    const input = payload()
    input.productTruth.material = truth('unknown')
    input.claims = [input.claims[0]]

    expect(() => EvidenceAllowedClaimsPayloadSchema.parse(input)).toThrow()

    input.readiness = 'blocked'
    input.hardBlocks = ['productTruth.material']
    expect(EvidenceAllowedClaimsPayloadSchema.parse(input).readiness).toBe('blocked')
  })

  it('requires conditional wording to become a mandatory downstream constraint', () => {
    const input = payload()
    input.claims[0] = {
      ...input.claims[0],
      verdict: 'conditional',
      conditions: ['Use only when the exact glazed ceramic variant is selected.'],
    }

    expect(() => EvidenceAllowedClaimsPayloadSchema.parse(input)).toThrow()

    input.downstreamConstraints = ['Use only when the exact glazed ceramic variant is selected.']
    expect(EvidenceAllowedClaimsPayloadSchema.parse(input).claims[0].verdict).toBe('conditional')
  })

  it('locks unsupported or unknown wording instead of allowing it downstream', () => {
    const unsupported = payload()
    unsupported.claims[1].allowedWording = ['Entirely handmade.']
    expect(() => EvidenceAllowedClaimsPayloadSchema.parse(unsupported)).toThrow()

    const unknown = payload()
    unknown.claims[1] = {
      ...unknown.claims[1],
      verdict: 'unknown',
      forbiddenWording: [],
    }
    expect(() => EvidenceAllowedClaimsPayloadSchema.parse(unknown)).toThrow()
  })

  it('requires an unknown claim to block readiness until the claim is resolved', () => {
    const input = payload()
    input.claims = [{
      ...input.claims[1],
      verdict: 'unknown',
      forbiddenWording: ['Entirely handmade.'],
    }]

    expect(() => EvidenceAllowedClaimsPayloadSchema.parse(input)).toThrow()

    input.readiness = 'blocked'
    input.hardBlocks = ['claims.claim-handmade']
    expect(EvidenceAllowedClaimsPayloadSchema.parse(input).readiness).toBe('blocked')
  })

  it('rejects duplicate claim IDs and undeclared Envelope evidence refs', () => {
    const duplicate = payload()
    duplicate.claims.push({ ...duplicate.claims[0] })
    expect(() => EvidenceAllowedClaimsPayloadSchema.parse(duplicate)).toThrow()

    const packet = createWorkspacePacket({
      packetId: 'packet-evidence-claims-1',
      packetLineageId: 'packet-evidence-claims-1',
      createdAt: '2026-07-18T20:00:00.000Z',
      runId: 'run-evidence-claims-1',
      schemaVersion: '1.0.0',
      packetType: 'evidence-allowed-claims',
      from: { roomId: 'oracle-signals', agentId: 'oracle' },
      to: { roomId: 'merchant-harbor', agentId: 'thor' },
      sourceRefs: ['source-oracle-local', 'packet-opportunity-1'],
      evidenceRefs: ['evidence-product-truth'],
      assumptions: [],
      missingFields: [],
      lockedActions: ['publish-listing'],
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [],
      idempotencyKey: 'evidence-claims-1',
      payload: payload(),
    })

    const { contentHash: _contentHash, ...changedContent } = { ...packet, evidenceRefs: [] }
    const parsed = safeParseWorkspacePacket({
      ...changedContent,
      contentHash: workspacePacketContentHash(changedContent),
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.').includes('evidenceRefs'))).toBe(true)
    }
  })

  it('requires blocked domain truth to be represented by Envelope missingFields', () => {
    const blocked = payload()
    blocked.productTruth.safety = truth('unknown')
    blocked.claims = [blocked.claims[0]]
    blocked.readiness = 'blocked'
    blocked.hardBlocks = ['productTruth.safety']
    const packet = createWorkspacePacket({
      packetId: 'packet-evidence-claims-blocked',
      packetLineageId: 'packet-evidence-claims-blocked',
      createdAt: '2026-07-18T20:00:00.000Z',
      runId: 'run-evidence-claims-1',
      schemaVersion: '1.0.0',
      packetType: 'evidence-allowed-claims',
      from: { roomId: 'oracle-signals', agentId: 'oracle' },
      to: { roomId: 'merchant-harbor', agentId: 'thor' },
      sourceRefs: ['source-oracle-local', 'packet-opportunity-1'],
      evidenceRefs: ['evidence-product-truth'],
      assumptions: [],
      missingFields: ['productTruth.safety'],
      lockedActions: ['publish-listing'],
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [],
      idempotencyKey: 'evidence-claims-blocked',
      payload: blocked,
    })

    expect(safeParseWorkspacePacket({ ...packet, missingFields: [] }).success).toBe(false)
    expect(safeParseWorkspacePacket(packet).success).toBe(true)
  })
})
