import { describe, expect, it } from 'vitest'
import {
  createDraftPayloadLocal,
  createInitialEtsyRoomState,
  createSeoPacketLocal,
  createShotLabHandoffLocal,
  requestDlvApprovalLocal,
} from './etsy-room-contracts'
import {
  createEtsyProductTruthPacket,
  createInitialEtsyPipelineState,
  syncEtsyPipelineToExternalProduct,
} from './etsy-pipeline'
import { buildEtsyProductMissionList } from './etsy-product-missions'
import type { EtsyProductCandidate as EtsyRoomCandidate, EtsyRoomState } from './etsy-room-contracts'
import type { EtsyPipelineState } from './etsy-pipeline'

const candidate: EtsyRoomCandidate = {
  candidateId: 'mission-product-1',
  packetId: 'candidate-packet-1',
  runId: 'run-1',
  title: 'Minimal Initial Necklace',
  niche: 'personalized jewelry',
  score: 82,
  sourceType: 'Sheet intake local',
  dataOrigin: 'sheet-intake-local',
  sourceRecordIds: ['sheet-row-1'],
  sourceDetails: [
    {
      kind: 'etsy',
      label: 'Etsy reference',
      marketplace: 'Etsy',
      url: 'https://www.etsy.com/listing/1/example',
      imageUrl: 'https://images.example.test/necklace.jpg',
      variantOptions: ['Initial: A', 'Initial: B'],
    },
  ],
  imageRefs: ['https://images.example.test/necklace.jpg'],
  thumbnailRef: 'https://images.example.test/necklace.jpg',
  evidenceIds: ['evidence-1'],
  missingFields: ['weight'],
  riskNotes: ['Supplier material is not yet verified'],
  nextHandoff: 'select_etsy_candidate_local',
  selected: true,
}

function selectedRoomState(): EtsyRoomState {
  const base = createInitialEtsyRoomState(1_000)
  return {
    ...base,
    stage: 'candidate_selected',
    candidates: [candidate],
    selectedCandidateId: candidate.candidateId,
    selectedProductPacket: {
      packetId: 'selected-product-1',
      runId: base.run.runId,
      createdAtMs: 1_010,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-thor-shotlab-prep',
      status: 'ready_for_next_station',
      dataOrigin: candidate.dataOrigin,
      sourceRecordIds: candidate.sourceRecordIds,
      evidenceIds: candidate.evidenceIds,
      missingFields: candidate.missingFields,
      lockedActions: ['Etsy publish'],
      nextHandoff: 'manual truth review',
      humanApprovalRequired: true,
      kind: 'selected_product',
      selectedProductTitle: candidate.title,
      selectedCandidateId: candidate.candidateId,
      sourcePacketId: candidate.packetId,
      imageRefs: candidate.imageRefs,
      thumbnailRef: candidate.thumbnailRef,
      evidenceSummary: 'One local evidence record',
      riskFlags: candidate.riskNotes,
    },
    run: { ...base.run, stage: 'candidate_selected', updatedAtMs: 1_010 },
  }
}

function selectedPipeline(): EtsyPipelineState {
  return syncEtsyPipelineToExternalProduct(createInitialEtsyPipelineState(), {
    candidateId: candidate.candidateId,
    packetId: candidate.packetId,
    title: candidate.title,
    niche: candidate.niche,
    signal: 'sheet intake',
    sourceRecordIds: candidate.sourceRecordIds,
    evidenceIds: candidate.evidenceIds,
    evidenceQuality: 'partial-local',
    dataOrigin: 'local-product-research',
    confidence: 82,
    sourceLabels: ['Sheet intake'],
  })
}

describe('Etsy Product Mission List view model', () => {
  it('shows no fictional products when no intake packet exists', () => {
    const model = buildEtsyProductMissionList(createInitialEtsyRoomState(100), createInitialEtsyPipelineState())

    expect(model.rows).toEqual([])
    expect(model.emptyState).toBe('waiting-for-intake')
    expect(model.summary.total).toBe(0)
  })

  it('derives a selected mission from real packet state and requires a manual truth start', () => {
    const model = buildEtsyProductMissionList(selectedRoomState(), selectedPipeline())
    const row = model.rows[0]

    expect(row.title).toBe(candidate.title)
    expect(row.selected).toBe(true)
    expect(row.currentStageId).toBe('truth')
    expect(row.nextAction).toMatchObject({ id: 'start-truth', enabled: true, targetStationId: 'etsy-thor-source-truth' })
    expect(row.stages.find((stage) => stage.id === 'intake')?.status).toBe('complete')
    expect(row.stages.find((stage) => stage.id === 'truth')?.status).toBe('ready')
    expect(row.warnings).toEqual(expect.arrayContaining(['weight', 'Supplier material is not yet verified']))
    expect(row.hasBlockingError).toBe(false)
    expect(row.variantOptions).toEqual(['Initial: A', 'Initial: B'])
    expect(row.sourceDetails[0]).toMatchObject({ label: 'Etsy reference', marketplace: 'Etsy' })
  })

  it('advances only when each existing local packet is explicitly created', () => {
    let room = selectedRoomState()
    let pipeline = selectedPipeline()

    pipeline = createEtsyProductTruthPacket(pipeline, 1_020)
    let row = buildEtsyProductMissionList(room, pipeline).rows[0]
    expect(row.nextAction.id).toBe('start-images')
    expect(row.stages.find((stage) => stage.id === 'truth')?.status).toBe('complete')

    room = createShotLabHandoffLocal(room, { ...room.shotLabDraft, nowMs: 1_030 })
    row = buildEtsyProductMissionList(room, pipeline).rows[0]
    expect(row.nextAction.id).toBe('start-seo')
    expect(row.stages.find((stage) => stage.id === 'images')?.status).toBe('complete')

    room = createSeoPacketLocal(room, 1_040)
    row = buildEtsyProductMissionList(room, pipeline).rows[0]
    expect(row.nextAction.id).toBe('prepare-draft')

    room = createDraftPayloadLocal(room, 1_050)
    row = buildEtsyProductMissionList(room, pipeline).rows[0]
    expect(row.nextAction.id).toBe('request-approval')

    room = requestDlvApprovalLocal(room, 1_060)
    row = buildEtsyProductMissionList(room, pipeline).rows[0]
    expect(row.currentStageId).toBe('approval')
    expect(row.nextAction).toMatchObject({ id: 'review-approval', enabled: true })
  })

  it('survives the existing JSON persistence round trip without inventing progress', () => {
    const persisted = JSON.stringify({ room: selectedRoomState(), pipeline: selectedPipeline() })
    const restored = JSON.parse(persisted) as { room: EtsyRoomState; pipeline: EtsyPipelineState }
    const row = buildEtsyProductMissionList(restored.room, restored.pipeline).rows[0]

    expect(row.id).toBe(candidate.candidateId)
    expect(row.nextAction.id).toBe('start-truth')
    expect(row.progressPercent).toBe(17)
  })

  it('keeps missing product detail as a visible warning, not a false hard blocker', () => {
    const row = buildEtsyProductMissionList(selectedRoomState(), selectedPipeline()).rows[0]

    expect(row.warnings.some((warning) => warning.toLowerCase().includes('weight'))).toBe(true)
    expect(row.hasBlockingError).toBe(false)
    expect(row.nextAction.enabled).toBe(true)
  })

  it('normalizes product packets restored from an older persisted schema', () => {
    const room = selectedRoomState()
    const legacyRoom = {
      ...room,
      candidates: room.candidates.map((roomCandidate) => ({
        ...roomCandidate,
        imageRefs: undefined,
        missingFields: undefined,
        riskNotes: undefined,
      })),
    } as unknown as EtsyRoomState

    const row = buildEtsyProductMissionList(legacyRoom, selectedPipeline()).rows[0]

    expect(row.imageRefs).toEqual([])
    expect(Array.isArray(row.warnings)).toBe(true)
    expect(row.warnings.some((warning) => warning.toLowerCase().includes('weight'))).toBe(true)
  })
})
