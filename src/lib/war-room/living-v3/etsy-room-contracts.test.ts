import { describe, expect, it } from 'vitest'
import {
  ETSY_ROOM_LOCKED_ACTIONS,
  applyEtsyLiveResearchRunToEtsyRoomLocal,
  applyProductScoutWorkerPacketLocal,
  applySheetIntakeProductToEtsyRoomLocal,
  applySmartIntakeMatchToEtsyRoomLocal,
  createDraftPayloadLocal,
  createInitialEtsyRoomState,
  createSeoPacketLocal,
  createShotLabHandoffLocal,
  prepareProductScoutPacketLocal,
  requestDlvApprovalLocal,
  selectEtsyCandidateLocal,
  validateEtsyRoomPacket,
} from './etsy-room-contracts'
import { createSmartIntakeMission, selectedSmartIntakeMatch } from './smart-intake-v2'
import type { OracleSignalPacket } from './oracle-alura'

const oracleSignal: OracleSignalPacket = {
  packetId: 'oracle-signal-gold-initial',
  selectedKeyword: 'gold initial necklace',
  createdAtMs: 100,
  sourceMode: 'alura_only',
  metrics: {
    keyword: 'gold initial necklace',
    keywordScore: 91,
    searchVolume: 1200,
    competition: 42000,
    sales: null,
    avgSales: null,
    revenue: null,
    avgRevenue: null,
    views: null,
    avgPrice: null,
    competitionLevel: 'medium',
  },
  sourceFile: 'alura-raw-latest.json',
  sourceFilesUsed: ['alura-raw-latest.json'],
  evidenceIds: ['alura-raw-latest.json:kw-gold-initial'],
  missingFields: ['supplier proof'],
  dataOrigin: 'local-alura-cache',
  status: 'local_signal_ready',
}

describe('Etsy Market Lab Hermes-ready room contracts', () => {
  it('creates required packet fields and stage transitions through approval', () => {
    let state = createInitialEtsyRoomState(1_000)
    state = prepareProductScoutPacketLocal(state, {
      prompt: 'find gold initial necklace opportunities',
      oracleSignalPacket: oracleSignal,
      nowMs: 1_010,
    })
    expect(state.stage).toBe('candidates_ready')
    expect(validateEtsyRoomPacket(state.scoutPacket!)).toBe(true)
    expect(state.scoutPacket).toMatchObject({
      targetShop: 'DolaroBoutique',
      categoryGuard: 'jewelry_only',
      dataOrigin: 'oracle-local-alura',
      humanApprovalRequired: true,
    })
    expect(state.candidates.length).toBeGreaterThan(0)

    state = selectEtsyCandidateLocal(state, state.candidates[0].candidateId, 1_020)
    expect(state.stage).toBe('candidate_selected')
    expect(validateEtsyRoomPacket(state.selectedProductPacket!)).toBe(true)

    state = createShotLabHandoffLocal(state, { nowMs: 1_030, imageCount: 6, preset: 'Boutique Premium' })
    expect(state.stage).toBe('shotlab_packet_ready')
    expect(state.shotLabHandoffPacket?.lockedActions).toContain('ShotLab/paid generation')
    expect(validateEtsyRoomPacket(state.shotLabHandoffPacket!)).toBe(true)

    state = createSeoPacketLocal(state, 1_040)
    expect(state.stage).toBe('seo_packet_ready')
    expect(state.seoPacket?.missingKeywordMetrics).toContain('search volume missing from safe local SEO source')
    expect(state.seoPacket?.metrics.volume).toBeNull()

    state = createDraftPayloadLocal(state, 1_050)
    expect(state.stage).toBe('draft_payload_ready')
    expect(state.draftPayload?.personalization).toBe(false)
    expect(state.draftPayload?.pricePlaceholder).toBe('₪200')
    expect(state.draftPayload?.lockedActions).toEqual(expect.arrayContaining(['Etsy upload draft', 'Etsy publish']))

    state = requestDlvApprovalLocal(state, 1_060)
    expect(state.stage).toBe('approval_waiting')
    expect(state.approvalPacket?.approvalStatus).toBe('waiting_operator')
    expect(state.approvalPacket?.nextIfApproved).toContain('typed local intent/event contract')
    expect(state.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'etsy.scout.request.created',
      'etsy.candidates.ready',
      'etsy.candidate.selected',
      'etsy.shotlab.packet.created',
      'etsy.seo.packet.created',
      'etsy.draft.payload.created',
      'etsy.approval.requested',
    ]))
  })

  it('does not create fallback product cards when no Oracle signal exists', () => {
    const state = prepareProductScoutPacketLocal(createInitialEtsyRoomState(2_000), {
      prompt: 'find celestial charm necklace opportunities',
      nowMs: 2_010,
    })
    expect(state.stage).toBe('scout_request')
    expect(state.scoutPacket?.dataOrigin).toBe('local-user-input')
    expect(state.scoutPacket?.nextHandoff).toBe('wait_for_oracle_product_signal')
    expect(state.allowedNow).toContain('open_oracle_product_search')
    expect(state.candidates).toHaveLength(0)
    expect(state.lastReceipt).toContain('No fallback product cards')
  })

  it('applies controlled Loki Scout V2 worker candidates into Loki without unlocking live actions', () => {
    const state = applyProductScoutWorkerPacketLocal(createInitialEtsyRoomState(2_200), {
      prompt: 'gold initial necklace gifts',
      workerRunId: 'scout-ui-test',
      workerSummary: 'Scout found read-only public trend evidence.',
      candidates: [
        {
          title: 'Gold Initial Pendant Gift Necklace',
          niche: 'personalized-look jewelry gifts',
          score: 84,
          sourceUrls: ['https://example.com/public-trend'],
          evidence: ['example-public-trend: initial necklaces appear in gift trend page'],
          missingFields: ['supplier proof', 'source product images', 'materials proof'],
          riskNotes: ['Personalization remains No until variant proof exists.'],
        },
      ],
      nowMs: 2_210,
    })

    expect(state.stage).toBe('candidates_ready')
    expect(state.scoutPacket?.dataOrigin).toBe('future-internet-scout')
    expect(validateEtsyRoomPacket(state.scoutPacket!)).toBe(true)
    expect(state.candidates).toHaveLength(1)
    expect(state.candidates[0]).toMatchObject({
      sourceType: 'Future internet scout',
      dataOrigin: 'future-internet-scout',
      nextHandoff: 'select_etsy_candidate_local',
      selected: false,
    })
    expect(state.candidates[0].sourceRecordIds).toContain('https://example.com/public-trend')
    expect(state.lockedActions).toContain('Etsy publish')
    expect(state.run.usageAllowed).toBe(false)
    expect(state.run.workerSpawnAllowed).toBe(false)
  })

  it('applies live read-only candidates into Loki and selection stays local-only', () => {
    let state = applyEtsyLiveResearchRunToEtsyRoomLocal(createInitialEtsyRoomState(2_300), {
      nowMs: 2_310,
      liveRun: {
        runId: 'etsy-live-run-test',
        status: 'completed',
        query: 'gold initial necklace gift',
        candidates: [
          {
            candidateId: 'live-candidate-1',
            title: 'Gold Initial Pendant Gift Necklace',
            summary: 'Read-only public trend evidence for initial pendant gifts.',
            sourceUrls: ['https://www.etsy.com/listing/123/gold-initial-necklace', 'https://www.aliexpress.com/item/1005000000000000.html'],
            sourceDetails: [
              {
                kind: 'etsy',
                label: 'מתחרה',
                marketplace: 'Etsy',
                url: 'https://www.etsy.com/listing/123/gold-initial-necklace',
                title: 'Gold Initial Pendant Gift Necklace',
                priceText: '$38.00',
                salesText: '420 sales',
                tags: ['gold', 'initial', 'necklace'],
              },
              {
                kind: 'supplier',
                label: 'ספק',
                marketplace: 'AliExpress',
                url: 'https://www.aliexpress.com/item/1005000000000000.html',
                title: 'Gold initial necklace supplier lead',
                priceText: '$4.20',
              },
            ],
            evidenceIds: ['example-public-trend'],
            evidenceQuality: 'partial',
            score: 82,
            missingEvidence: ['supplier proof', 'materials proof'],
            riskFlags: ['No personalization claim until variant truth exists.'],
            dataOrigin: 'live-readonly-research',
            suggestedNextStep: 'select_product',
          },
        ],
        startedAt: '1970-01-01T00:00:02.300Z',
        completedAt: '1970-01-01T00:00:02.310Z',
        safety: {
          localOnly: true,
          usageAllowed: false,
          workerSpawnAllowed: false,
          externalRequestsAllowed: false,
          liveActionsAllowed: false,
        },
        liveReadOnlyResearchAttempted: true,
        connectorStatus: 'available',
      },
    })

    expect(state.stage).toBe('candidates_ready')
    expect(state.scoutPacket?.dataOrigin).toBe('live-readonly-research')
    expect(state.scoutPacket?.sourceType).toBe('live_readonly_research')
    expect(state.candidates[0]).toMatchObject({
      title: 'Gold Initial Pendant Gift Necklace',
      sourceType: 'Live read-only research',
      dataOrigin: 'live-readonly-research',
      nextHandoff: 'select_etsy_candidate_local',
      selected: false,
    })
    expect(state.candidates[0].sourceDetails?.[0]).toMatchObject({ priceText: '$38.00', salesText: '420 sales', tags: ['gold', 'initial', 'necklace'] })
    expect(state.candidates[0].sourceDetails?.[1]).toMatchObject({ marketplace: 'AliExpress', priceText: '$4.20' })

    state = selectEtsyCandidateLocal(state, state.candidates[0].candidateId, 2_320)
    expect(state.stage).toBe('candidate_selected')
    expect(state.selectedProductPacket?.selectedProductTitle).toBe('Gold Initial Pendant Gift Necklace')
    expect(state.selectedProductPacket?.lockedActions).toEqual(expect.arrayContaining([
      'Etsy publish',
      'Etsy upload draft',
      'ShotLab/paid generation',
    ]))
    expect(state.run.usageAllowed).toBe(false)
    expect(state.run.workerSpawnAllowed).toBe(false)
  })

  it('turns a Sheet Intake product into a selected Loki product packet', () => {
    const state = applySheetIntakeProductToEtsyRoomLocal(createInitialEtsyRoomState(2_500), {
      sheetRunId: 'sheet-intake-test',
      manifestPath: 'data/etsy-market-lab/sheet-intake/sheet-intake-test/manifest.json',
      nowMs: 2_510,
      product: {
        productId: 'gold-bow-necklace-1',
        rowId: 'row-1',
        sourceRowId: 'row-1',
        sourceLabel: 'Unit test paste',
        sourceRef: 'operator-paste',
        slug: 'gold-bow-necklace',
        title: 'Gold Bow Necklace',
        proposedTitle: 'Gold Bow Necklace',
        imageRefs: ['/images/bow.png'],
        thumbnailRef: '/images/bow.png',
        sourceUrl: 'https://example.com/source',
        supplierUrl: 'https://example.com/supplier',
        variants: ['gold'],
        priceFields: { price: '22' },
        costFields: { cost: '7' },
        metricsFields: { search_volume: '1200' },
        demandFields: {},
        evidenceIds: ['https://example.com/source'],
        notes: ['proof note'],
        missingFields: [],
        riskFlags: [],
        warnings: [],
        score: 88,
        scoreExplanation: 'image evidence present; source URL present',
        shotLabReadiness: 'ready',
        seoReadiness: 'ready',
        recommendedNextStep: 'Choose product / ShotLab prep local packet.',
        approvalNotes: 'Local-only dossier.',
        dossierPath: 'data/etsy-market-lab/sheet-intake/sheet-intake-test/products/gold-bow-necklace.md',
      },
    })

    expect(state.stage).toBe('candidate_selected')
    expect(state.scoutPacket?.sourceType).toBe('sheet_intake_local')
    expect(state.scoutPacket?.dataOrigin).toBe('sheet-intake-local')
    expect(state.candidates).toHaveLength(1)
    expect(state.candidates[0]).toMatchObject({
      title: 'Gold Bow Necklace',
      score: 88,
      selected: true,
      sourceType: 'Sheet intake local',
    })
    expect(validateEtsyRoomPacket(state.selectedProductPacket!)).toBe(true)
    expect(state.selectedProductPacket?.selectedProductTitle).toBe('Gold Bow Necklace')
    expect(state.selectedProductPacket?.nextHandoff).toBe('create_shotlab_handoff_local')
    expect(state.run.usageAllowed).toBe(false)
    expect(state.run.workerSpawnAllowed).toBe(false)
  })

  it('turns a Smart Intake match into a selected Loki product packet', () => {
    const mission = createSmartIntakeMission([
      'gold bow necklace with delicate gift styling',
      'https://www.aliexpress.com/item/1005000000000000.html',
      'data/etsy-market-lab/imports/bow-necklace.png',
    ].join('\n'), 2_700)
    const match = selectedSmartIntakeMatch(mission)!
    const imageIds = mission.imageSets[0]?.items.map((item) => item.imageId) ?? []

    const state = applySmartIntakeMatchToEtsyRoomLocal(createInitialEtsyRoomState(2_700), {
      mission,
      match,
      selectedImageIds: imageIds,
      nowMs: 2_710,
    })

    expect(state.stage).toBe('candidate_selected')
    expect(state.scoutPacket?.sourceType).toBe('smart_intake_local')
    expect(state.scoutPacket?.dataOrigin).toBe('smart-intake-local')
    expect(state.candidates[0]).toMatchObject({
      title: match.title,
      score: match.score,
      selected: true,
      sourceType: 'Smart intake local',
    })
    expect(validateEtsyRoomPacket(state.selectedProductPacket!)).toBe(true)
    expect(state.selectedProductPacket?.selectedProductTitle).toBe(match.title)
    expect(state.selectedProductPacket?.evidenceIds).toEqual(expect.arrayContaining(imageIds))
    expect(state.run.usageAllowed).toBe(false)
    expect(state.run.workerSpawnAllowed).toBe(false)
  })

  it('keeps all live and worker actions locked by default', () => {
    const state = createInitialEtsyRoomState(3_000)
    expect(state.run.usageAllowed).toBe(false)
    expect(state.run.workerSpawnAllowed).toBe(false)
    expect(state.lockedActions).toEqual(expect.arrayContaining([
      'Etsy publish',
      'Hermes worker spawn/fan-out beyond approved controlled runner',
      'Kanban dispatch',
      'browser automation',
    ]))
    expect(ETSY_ROOM_LOCKED_ACTIONS).toContain('Alura live call')
  })
})
