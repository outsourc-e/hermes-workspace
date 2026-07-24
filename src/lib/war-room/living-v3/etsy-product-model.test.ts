import { describe, expect, it } from 'vitest'

import { createInitialEtsyPipelineState } from './etsy-pipeline'
import { createInitialEtsyRoomState } from './etsy-room-contracts'
import {
  applyEtsyProductWorkspaceCommand,
  migrateEtsyProductWorkspaceStateV2,
} from './etsy-product-model'

function legacyFixture() {
  const roomState = createInitialEtsyRoomState(1_000)
  roomState.candidates = [{
    candidateId: 'candidate-stoneware',
    packetId: 'packet-stoneware',
    runId: roomState.run.runId,
    title: 'Stoneware Ceramic Tumbler',
    niche: 'ceramic tumbler',
    score: 91,
    sourceType: 'Live read-only research',
    dataOrigin: 'live-readonly-research',
    sourceRecordIds: ['etsy-listing-123'],
    sourceDetails: [{
      kind: 'etsy',
      label: 'Etsy source',
      url: 'https://www.etsy.com/listing/123/stoneware-tumbler',
      localImageRef: '/war-room/etsy-product-media/stoneware-01.webp',
      imageUrl: 'https://i.etsystatic.com/123/stoneware-01.jpg',
      variantOptions: ['Capacity: 6 fl oz', 'Capacity: 8 fl oz'],
    }],
    imageRefs: [
      '/war-room/etsy-product-media/stoneware-01.webp',
      '/war-room/etsy-product-media/stoneware-02.webp',
    ],
    thumbnailRef: '/war-room/etsy-product-media/stoneware-01.webp',
    evidenceIds: ['evidence-etsy-123'],
    missingFields: [],
    riskNotes: ['supplier match not verified'],
    nextHandoff: 'select_etsy_candidate_local',
    selected: true,
  }]
  roomState.selectedCandidateId = 'candidate-stoneware'

  const pipelineState = createInitialEtsyPipelineState()
  pipelineState.selectedCandidateId = 'candidate-stoneware'
  pipelineState.productTruthPacket = {
    packetId: 'truth-stoneware',
    candidateId: 'candidate-stoneware',
    materials: ['stoneware'],
    dimensions: [],
    colors: [],
    variants: ['Capacity: 6 fl oz', 'Capacity: 8 fl oz'],
    claimsAllowed: [],
    claimsBlocked: [],
    missingEvidence: ['supplier variant proof'],
    verifiedLocally: [],
    unknowns: [],
    evidenceIds: ['evidence-etsy-123'],
    sourceRecordIds: ['etsy-listing-123'],
    dataOrigin: 'product-intelligence',
    evidenceQuality: 'partial-local',
    status: 'draft',
    createdAtMs: 1_100,
    updatedAtMs: 1_100,
  }

  return { roomState, pipelineState }
}

describe('EtsyProductWorkspaceStateV2', () => {
  it('migrates legacy room and pipeline state into one canonical product with stable media and variant IDs', () => {
    const legacy = legacyFixture()
    const first = migrateEtsyProductWorkspaceStateV2({ ...legacy, nowMs: 2_000 })
    const second = migrateEtsyProductWorkspaceStateV2({ ...legacy, nowMs: 3_000 })

    expect(first.schemaVersion).toBe('etsy-product-workspace-v2')
    expect(first.revision).toBe(0)
    expect(first.activeProductId).toBeDefined()
    expect(first.productOrder).toEqual([first.activeProductId])

    const product = first.productsById[first.activeProductId!]
    const repeatedProduct = second.productsById[second.activeProductId!]
    expect(product.identity.title).toBe('Stoneware Ceramic Tumbler')
    expect(Object.keys(product.mediaById)).toHaveLength(2)
    expect(Object.keys(product.variantsById)).toHaveLength(2)
    expect(product.primaryMediaId).toBeDefined()
    expect(Object.keys(product.mediaById)).toEqual(Object.keys(repeatedProduct.mediaById))
    expect(Object.keys(product.variantsById)).toEqual(Object.keys(repeatedProduct.variantsById))
    expect(first.roomState.selectedCandidateId).toBe('candidate-stoneware')
    expect(first.pipelineState.selectedCandidateId).toBe('candidate-stoneware')
  })

  it('applies a revision-bound command once and rejects stale writers', () => {
    const initial = migrateEtsyProductWorkspaceStateV2({ ...legacyFixture(), nowMs: 2_000 })
    const changedRoom = structuredClone(initial.roomState)
    changedRoom.shotLabDraft.imageCount = 12

    const command = {
      type: 'replace_projections' as const,
      commandId: 'command-image-count-12',
      baseRevision: 0,
      reason: 'Set image count to 12',
      roomState: changedRoom,
      pipelineState: initial.pipelineState,
    }
    const applied = applyEtsyProductWorkspaceCommand(initial, command, 2_100)
    const replayed = applyEtsyProductWorkspaceCommand(applied.state, command, 2_200)
    const stale = applyEtsyProductWorkspaceCommand(applied.state, {
      ...command,
      commandId: 'stale-command',
      baseRevision: 0,
    }, 2_300)

    expect(applied.status).toBe('applied')
    expect(applied.state.revision).toBe(1)
    expect(applied.state.roomState.shotLabDraft.imageCount).toBe(12)
    expect(replayed.status).toBe('replayed')
    expect(replayed.state.revision).toBe(1)
    expect(stale.status).toBe('conflict')
    expect(stale.state.revision).toBe(1)
    expect(stale.expectedRevision).toBe(1)
  })
})
