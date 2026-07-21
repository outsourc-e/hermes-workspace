import { describe, expect, it } from 'vitest'

import { adaptEtsyRoomDraftV1 } from '../adapters/etsy-room-v1'
import { createWorkspacePacket } from '../factory'
import { safeParseWorkspacePacket } from '../schemas'
import { EvidenceAllowedClaimsPayloadSchema } from './evidence-allowed-claims'
import {
  ListingReadyDraftPayloadSchema,
  evidenceRefsFromListingReadyDraft,
} from './listing-ready-draft'
import { SupplierEvidencePayloadSchema } from './supplier-evidence'
import type { EtsyDraftPayload } from '../../../war-room/living-v3/etsy-room-contracts'

const evidence = (status: 'verified' | 'unknown' = 'verified') => ({
  relevant: true,
  status,
  evidenceRefs: status === 'verified' ? ['evidence-supplier-1'] : [],
})

export function supplierInput() {
  return {
    contractVersion: 'supplier-evidence-v1' as const,
    opportunityPacketId: 'packet-opportunity-1',
    evidenceAllowedClaimsPacketId: 'packet-claims-1',
    candidateId: 'candidate-1',
    supplierOfferId: 'supplier-offer-1',
    source: {
      platform: 'AliExpress' as const,
      sourceRef: 'https://example.com/supplier/1',
      capturedAt: '2026-07-19T00:00:00.000Z',
      accessMode: 'read_only' as const,
    },
    match: {
      verdict: 'near_exact' as const,
      confidence: 0.93,
      matchedAttributes: ['shape', 'finish', 'variant'],
      mismatches: [],
      evidenceRefs: ['evidence-supplier-1'],
    },
    product: {
      title: 'Gold tone initial necklace',
      materials: ['stainless steel', 'gold tone plating'],
      dimensions: ['chain length 45 cm'],
      variants: ['A-Z initials'],
      imageRefs: ['image-supplier-hero'],
    },
    economics: {
      currency: 'USD',
      unitPrice: 8.5,
      shippingPrice: 2,
      minimumOrderQuantity: 1,
      observedAt: '2026-07-19T00:00:00.000Z',
      evidenceRefs: ['evidence-supplier-1'],
    },
    fieldEvidence: {
      identity: evidence(),
      materials: evidence(),
      dimensions: evidence(),
      variants: evidence(),
      pricing: evidence(),
    },
    readiness: 'ready' as const,
    hardBlocks: [] as Array<string>,
  }
}

export function claimsInput() {
  return EvidenceAllowedClaimsPayloadSchema.parse({
    subject: {
      subjectId: 'candidate-1',
      opportunityPacketId: 'packet-opportunity-1',
      title: 'Gold tone initial necklace',
    },
    productTruth: Object.fromEntries(
      ['identity', 'material', 'dimensions', 'variant', 'safety', 'compliance'].map((key) => [key, {
        relevant: true,
        status: 'verified',
        evidenceRefs: ['evidence-claim-1'],
        note: 'Verified from local evidence.',
      }]),
    ),
    claims: [
      {
        claimId: 'claim-material',
        claimText: 'Gold tone plated stainless steel',
        verdict: 'supported',
        evidenceRefs: ['evidence-claim-1'],
        confidence: 0.96,
        allowedWording: ['Gold tone plated stainless steel'],
        forbiddenWording: ['Solid gold'],
        conditions: [],
        caveats: [],
        recheckAt: null,
      },
      {
        claimId: 'claim-waterproof',
        claimText: 'Waterproof',
        verdict: 'unsupported',
        evidenceRefs: [],
        confidence: 0.1,
        allowedWording: [],
        forbiddenWording: ['Waterproof'],
        conditions: [],
        caveats: ['No water-resistance evidence.'],
        recheckAt: null,
      },
    ],
    downstreamConstraints: [],
    readiness: 'ready',
    hardBlocks: [],
    reviewedAt: '2026-07-19T00:00:00.000Z',
  })
}

export function legacyDraft(): EtsyDraftPayload {
  return {
    packetId: 'legacy-draft-1',
    runId: 'run-1',
    createdAtMs: Date.parse('2026-07-19T00:00:00.000Z'),
    sourceStationId: 'etsy-thor-seo-metrics',
    targetStationId: 'etsy-odin-draft-approval',
    status: 'waiting_operator',
    dataOrigin: 'local-user-input',
    sourceRecordIds: ['legacy-source-1'],
    evidenceIds: ['legacy-evidence-1'],
    missingFields: [],
    lockedActions: ['Etsy upload draft', 'Etsy publish'],
    nextHandoff: 'operator approval',
    humanApprovalRequired: true,
    kind: 'draft_payload',
    title: 'Initial Necklace Gift',
    imageRefs: ['image-supplier-hero'],
    description: 'A minimal initial necklace drafted from verified evidence.',
    tags: ['initial necklace', 'gift jewelry'],
    attributes: { type: 'Necklace', recipient: 'Women' },
    personalization: false,
    materials: ['legacy material placeholder'],
    colors: ['Gold tone'],
    variants: ['legacy variant placeholder'],
    pricePlaceholder: '₪200',
    quantityPlaceholder: 1,
    imageOrder: ['image-supplier-hero'],
    altTextDrafts: ['Gold tone initial necklace on a neutral background'],
    supplierSourceTruth: 'legacy prose is not proof',
    missingAttributes: [],
    blockedClaims: ['Waterproof', 'Solid gold'],
  }
}

describe('SupplierEvidence and ListingReadyDraft V1', () => {
  it('accepts a provenance-complete near-exact supplier offer', () => {
    expect(SupplierEvidencePayloadSchema.parse(supplierInput()).readiness).toBe('ready')
  })

  it('blocks variant-family matches and unknown pricing from readiness', () => {
    const variantFamily = supplierInput()
    variantFamily.match.verdict = 'variant_family' as 'near_exact'
    expect(SupplierEvidencePayloadSchema.safeParse(variantFamily).success).toBe(false)

    const unknownPrice = supplierInput()
    unknownPrice.fieldEvidence.pricing = evidence('unknown')
    unknownPrice.readiness = 'blocked' as 'ready'
    unknownPrice.hardBlocks = ['fieldEvidence.pricing']
    expect(SupplierEvidencePayloadSchema.safeParse(unknownPrice).success).toBe(true)
  })

  it('adapts only verified supplier facts and Oracle-allowed claims into a locked local draft', () => {
    const result = adaptEtsyRoomDraftV1({
      legacyDraft: legacyDraft(),
      supplierEvidence: SupplierEvidencePayloadSchema.parse(supplierInput()),
      supplierEvidencePacketId: 'packet-supplier-evidence-1',
      allowedClaims: claimsInput(),
      listingPrice: { currency: 'ILS', amount: 200, evidenceRefs: ['evidence-price-approval'] },
      attributeEvidenceRefs: {
        type: ['evidence-claim-1'],
        recipient: ['evidence-claim-1'],
      },
    })

    expect(result.readiness).toBe('ready')
    expect(result.materials).toEqual(['stainless steel', 'gold tone plating'])
    expect(result.variants).toEqual(['A-Z initials'])
    expect(result.claims).toEqual([expect.objectContaining({ claimId: 'claim-material' })])
    expect(result.claims.some((claim) => claim.wording === 'Waterproof')).toBe(false)
    expect(result.liveActionsLocked).toEqual(expect.arrayContaining(['Etsy upload draft', 'Etsy publish']))
    expect(result.approvalRequired).toBe(true)
    expect(ListingReadyDraftPayloadSchema.parse(result).readiness).toBe('ready')
  })

  it('does not trust the legacy price placeholder or invent missing alt text', () => {
    const draft = legacyDraft()
    draft.altTextDrafts = []
    const result = adaptEtsyRoomDraftV1({
      legacyDraft: draft,
      supplierEvidence: SupplierEvidencePayloadSchema.parse(supplierInput()),
      supplierEvidencePacketId: 'packet-supplier-evidence-1',
      allowedClaims: claimsInput(),
    })

    expect(result.readiness).toBe('blocked')
    expect(result.hardBlocks).toEqual(expect.arrayContaining(['price', 'media.altText']))
    expect(result.price).toBeNull()
    expect(result.media).toEqual([])
    expect(ListingReadyDraftPayloadSchema.safeParse(result).success).toBe(true)
  })

  it('requires listing evidence, source chain, locks, and approval in the Universal Envelope', () => {
    const result = adaptEtsyRoomDraftV1({
      legacyDraft: legacyDraft(),
      supplierEvidence: SupplierEvidencePayloadSchema.parse(supplierInput()),
      supplierEvidencePacketId: 'packet-supplier-evidence-1',
      allowedClaims: claimsInput(),
      listingPrice: { currency: 'ILS', amount: 200, evidenceRefs: ['evidence-price-approval'] },
      attributeEvidenceRefs: {
        type: ['evidence-claim-1'],
        recipient: ['evidence-claim-1'],
      },
    })
    const packet = createWorkspacePacket({
      packetId: 'packet-listing-ready-1',
      packetLineageId: 'packet-listing-ready-1',
      createdAt: '2026-07-19T00:00:00.000Z',
      runId: 'run-1',
      schemaVersion: '1.0.0',
      packetType: 'listing-ready-draft',
      from: { roomId: 'etsy-market-lab', agentId: 'thor' },
      to: { roomId: 'etsy-market-lab', agentId: 'odin' },
      sourceRefs: [
        result.opportunityPacketId,
        result.evidenceAllowedClaimsPacketId,
        result.supplierEvidencePacketId,
        result.legacyDraftPacketId,
      ],
      evidenceRefs: evidenceRefsFromListingReadyDraft(result),
      assumptions: [],
      missingFields: [],
      lockedActions: result.liveActionsLocked,
      approval: { required: true, stage: 'draft-approval', grantId: null },
      acceptanceCriteria: [],
      idempotencyKey: 'listing-ready-1',
      payload: result,
    })

    expect(safeParseWorkspacePacket(packet).success).toBe(true)
    expect(safeParseWorkspacePacket({ ...packet, evidenceRefs: [] }).success).toBe(false)
    expect(safeParseWorkspacePacket({ ...packet, approval: { required: false, stage: null, grantId: null } }).success).toBe(false)
  })
})
