import { describe, expect, it } from 'vitest'
import { ETSY_MARKET_LAB_STATION_OPERATOR_IDS } from './etsy-station-apps'
import {
  activeEtsyProductCandidate,
  activeEtsySupplierLead,
  applyOracleSignalToEtsyPipeline,
  buildEtsyDraftPreview,
  createEtsyDraftApprovalPacket,
  createEtsyProductSearchPacket,
  createEtsyProductTruthPacket,
  createEtsyVisualQaReport,
  createInitialEtsyPipelineState,
  rejectEtsyCandidate,
  saveEtsySupplierLead,
  selectEtsyCandidate,
  sendEtsyCandidateToThoth,
  sendEtsySupplierLeadToAnubis,
  stageEtsySheetRowLocally,
  syncEtsyPipelineToExternalProduct,
  updateEtsyQaItemStatus,
  visibleEtsySupplierLeads,
} from './etsy-pipeline'
import type { EtsyEvidenceSearchResult } from './etsy-evidence-adapter'
import type { OracleSignalPacket } from './oracle-alura'

const evidenceFixture: EtsyEvidenceSearchResult = {
  ok: true,
  query: 'gold initial necklace for gifts',
  dataOrigin: 'mixed-local-archive',
  products: [{
    id: 'prod_initial_necklace',
    title: 'Custom initial pendant necklace / A-Z charm necklace',
    niche: 'personalized jewelry',
    etsyAngle: 'Personalized initial necklace gift for her / custom initial pendant.',
    status: 'Suggested - source page verification needed before ShotLab import',
    currentRoom: 'agora',
    sourceFile: 'state.json',
    supplierLinkCount: 1,
    keywords: [{
      id: 'kw_initial_necklace',
      keyword: 'initial necklace',
      score: 94,
      competition: 129142,
      avgSales: 142,
      avgPrice: 48.08,
      competitionLevel: 'moderate',
      currentRoom: 'oracle',
    }],
    supplierLinks: [{
      id: 'sup_initial_necklace',
      productId: 'prod_initial_necklace',
      platform: 'Alibaba',
      status: 'needs_review',
      proof: 'local supplier proof text',
      rawTitle: 'Custom initial pendant necklace source lead',
    }],
    confidence: 91,
    matchReason: 'matched Product Intelligence product evidence',
  }],
  keywords: [],
  supplierLinks: [],
  evidenceIds: ['prod_initial_necklace', 'kw_initial_necklace', 'sup_initial_necklace'],
  sourceRecordIds: ['prod_initial_necklace', 'state.json'],
  keywordIds: ['kw_initial_necklace'],
}

const oracleSignalFixture: OracleSignalPacket = {
  packetId: 'oracle-signal-gold-initial-necklace',
  selectedKeyword: 'gold initial necklace',
  createdAtMs: 9_000,
  sourceMode: 'alura_only',
  metrics: {
    keyword: 'gold initial necklace',
    keywordScore: 91,
    searchVolume: 12_000,
    competition: 38_000,
    sales: 420_000,
    avgSales: 154,
    revenue: 1_900_000,
    avgRevenue: 7_700,
    views: 800_000,
    avgPrice: 200,
    competitionLevel: 'moderate',
  },
  sourceFile: 'alura-raw-latest.json',
  sourceFilesUsed: ['alura-raw-latest.json', 'alura-ui-20-keyword-direct-proof.json'],
  evidenceIds: ['alura-raw-latest.json:keyword:kw-gold-initial'],
  missingFields: [],
  dataOrigin: 'local-alura-cache',
  status: 'local_signal_ready',
}

describe('Etsy Market Lab local product pipeline', () => {
  it('creates a manual search packet without inventing product cards from operator text', () => {
    const state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
    })

    expect(state.stage).toBe('candidates')
    expect(state.searchPacket?.requestText).toBe('gold initial necklace for gifts')
    expect(state.searchPacket?.dataOrigin).toBe('fallback-mock')
    expect(state.candidates).toHaveLength(0)
    expect(state.lastReceipt).toContain('No fallback product cards')
  })

  it('selects an evidence-backed candidate and sends the same active product to Thoth metrics', () => {
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
      evidence: evidenceFixture,
    })
    const candidate = state.candidates[0]

    state = selectEtsyCandidate(state, candidate.candidateId)
    expect(activeEtsyProductCandidate(state)?.candidateId).toBe(candidate.candidateId)

    state = sendEtsyCandidateToThoth(state, candidate.candidateId, 11_000)
    expect(state.stage).toBe('metrics')
    expect(state.metricPacket?.candidateId).toBe(candidate.candidateId)
    expect(state.metricPacket?.rows[0].product).toBe(candidate.title)
  })

  it('carries mixed archive fallback origin and ids when explicitly supplied', () => {
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
      evidence: evidenceFixture,
    })
    const candidate = state.candidates[0]

    expect(state.searchPacket?.dataOrigin).toBe('mixed-local-archive')
    expect(candidate.dataOrigin).toBe('mixed-local-archive')
    expect(candidate.sourceRecordIds).toContain('prod_initial_necklace')
    expect(candidate.keywordIds).toContain('kw_initial_necklace')

    state = sendEtsyCandidateToThoth(state, candidate.candidateId, 11_000)
    expect(state.metricPacket?.rows[0].dataOrigin).toBe('mixed-local-archive')
    expect(state.metricPacket?.rows[0].evidenceIds).toContain('prod_initial_necklace')
    expect(state.metricPacket?.rows[0].keywordScore).toBe(94)
  })

  it('starts Etsy Market Lab from an Oracle Alura signal packet', () => {
    let state = applyOracleSignalToEtsyPipeline(createInitialEtsyPipelineState(), oracleSignalFixture, 10_000)
    const candidate = state.candidates[0]

    expect(state.oracleSignalPacket?.selectedKeyword).toBe('gold initial necklace')
    expect(state.searchPacket?.oracleSignalPacketId).toBe(oracleSignalFixture.packetId)
    expect(state.searchPacket?.dataOrigin).toBe('local-alura-cache')
    expect(candidate.dataOrigin).toBe('local-alura-cache')
    expect(candidate.sourceRecordIds).toContain('alura-raw-latest.json')

    state = sendEtsyCandidateToThoth(state, candidate.candidateId, 11_000)
    expect(state.metricPacket?.rows[0].keywordScore).toBe(91)
    expect(state.metricPacket?.rows[0].dataOrigin).toBe('local-alura-cache')
  })

  it('stages metrics, saves a supplier lead, and sends it to product truth', () => {
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
      evidence: evidenceFixture,
    })
    state = sendEtsyCandidateToThoth(state, state.candidates[0].candidateId, 11_000)
    state = stageEtsySheetRowLocally(state, 12_000)
    expect(state.stage).toBe('suppliers')
    expect(state.metricPacket?.stagedSheetRow?.status).toBe('staged_local_only')

    const lead = visibleEtsySupplierLeads(state)[0]
    state = saveEtsySupplierLead(state, lead, 13_000)
    expect(activeEtsySupplierLead(state).leadId).toBe(lead.leadId)
    expect(state.supplierLeads[0].saved).toBe(true)

    state = sendEtsySupplierLeadToAnubis(state, lead, 14_000)
    expect(state.stage).toBe('product_truth')
    expect(activeEtsySupplierLead(state).sourceType).toBe(lead.sourceType)
  })

  it('creates product truth, QA report, and a draft approval packet for the active product', () => {
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
      evidence: evidenceFixture,
    })
    state = sendEtsyCandidateToThoth(state, state.candidates[0].candidateId, 11_000)
    state = stageEtsySheetRowLocally(state, 12_000)
    state = sendEtsySupplierLeadToAnubis(state, visibleEtsySupplierLeads(state)[0], 13_000)
    state = createEtsyProductTruthPacket(state, 14_000)

    expect(state.stage).toBe('qa')
    expect(state.productTruthPacket?.status).toBe('ready')
    expect(state.productTruthPacket?.missingEvidence.length).toBeGreaterThan(0)
    expect(state.productTruthPacket?.evidenceIds).toBeDefined()
    expect(state.qaItems.length).toBeGreaterThan(0)

    state = updateEtsyQaItemStatus(state, state.qaItems[0].qaItemId, 'approved')
    state = createEtsyVisualQaReport(state, 15_000)
    expect(state.stage).toBe('draft')
    expect(state.visualQaReport?.candidateId).toBe(state.selectedCandidateId)

    const draftPreview = buildEtsyDraftPreview(state, 16_000)
    expect(draftPreview?.title).toContain(activeEtsyProductCandidate(state)?.title)
    expect(draftPreview?.title).not.toContain('Personalized initial charm bracelet')
    expect(draftPreview?.evidenceSummary.lockedLiveActions).toContain('Etsy publish')
    expect(draftPreview?.status).toBe('preview_local_only')

    state = createEtsyDraftApprovalPacket(state, 17_000)
    expect(state.draftApprovalPacket?.status).toBe('waiting_operator')
    expect(state.draftPacket?.status).toBe('waiting_approval')
  })

  it('deletes a rejected active candidate from the local pipeline staging board', () => {
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
      evidence: evidenceFixture,
    })
    const candidate = state.candidates[0]
    state = sendEtsyCandidateToThoth(state, candidate.candidateId, 11_000)
    expect(state.metricPacket?.candidateId).toBe(candidate.candidateId)

    state = rejectEtsyCandidate(state, candidate.candidateId)

    expect(state.candidates.find((item) => item.candidateId === candidate.candidateId)).toBeUndefined()
    expect(state.visualBoardCandidateIds).not.toContain(candidate.candidateId)
    expect(state.rejectedCandidateIds).toContain(candidate.candidateId)
    expect(state.selectedCandidateId).toBeUndefined()
    expect(state.metricPacket).toBeUndefined()
    expect(state.lastReceipt).toContain('deleted from local staging')
  })

  it('removes every downstream packet that belongs to a different product scope', () => {
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace for gifts',
      mode: 'niche',
      nowMs: 10_000,
      evidence: evidenceFixture,
    })
    const necklaceCandidateId = state.candidates[0].candidateId
    state = sendEtsyCandidateToThoth(state, necklaceCandidateId, 11_000)
    state = stageEtsySheetRowLocally(state, 12_000)
    state = sendEtsySupplierLeadToAnubis(state, visibleEtsySupplierLeads(state)[0], 13_000)
    state = createEtsyProductTruthPacket(state, 14_000)
    state = createEtsyVisualQaReport(state, 15_000)
    state = createEtsyDraftApprovalPacket(state, 16_000)
    expect(state.supplierLeads.length).toBeGreaterThan(0)
    expect(state.productTruthPacket?.candidateId).toBe(necklaceCandidateId)
    expect(state.draftPacket?.candidateId).toBe(necklaceCandidateId)

    state = syncEtsyPipelineToExternalProduct(state, {
      candidateId: 'stoneware-tumbler',
      packetId: 'room-packet-stoneware',
      title: 'Stoneware Ceramic Tumbler',
      niche: 'ceramic drinkware',
      signal: '3 evidence refs; 1 missing field',
      sourceRecordIds: ['source-stoneware'],
      evidenceIds: ['evidence-1', 'evidence-2', 'evidence-3'],
      evidenceQuality: 'partial-local',
      dataOrigin: 'product-intelligence',
      confidence: 72,
      sourceLabels: ['Live read-only research'],
    })

    expect(activeEtsyProductCandidate(state)?.candidateId).toBe('stoneware-tumbler')
    expect(state.stage).toBe('candidates')
    expect(state.metricPacket).toBeUndefined()
    expect(state.supplierLeads).toEqual([])
    expect(visibleEtsySupplierLeads(state)).toEqual([])
    expect(state.selectedSupplierLeadId).toBeUndefined()
    expect(state.productTruthPacket).toBeUndefined()
    expect(state.qaItems).toEqual([])
    expect(state.visualQaReport).toBeUndefined()
    expect(state.draftPacket).toBeUndefined()
    expect(state.draftApprovalPacket).toBeUndefined()
    expect(activeEtsyProductCandidate(state)?.estimatedPrice).toBe('not verified')
  })

  it('keeps Julius out of Etsy station operators', () => {
    expect(Object.values(ETSY_MARKET_LAB_STATION_OPERATOR_IDS)).not.toContain('julius')
  })
})
