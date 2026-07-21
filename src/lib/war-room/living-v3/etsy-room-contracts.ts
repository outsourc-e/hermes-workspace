import type { OracleSignalPacket } from './oracle-alura'
import type { EtsySheetIntakeNormalizedProduct } from './etsy-sheet-intake'
import type { EtsyLiveResearchRun, EtsyLiveSourceDetail } from './etsy-live-research'
import type { ResearchMissionPacket } from './research-atlas-contract'
import type { SmartIntakeMission, SmartIntakeProductMatch } from './smart-intake-v2'

export type EtsyRoomStationId =
  | 'etsy-loki-product-hunt'
  | 'etsy-thor-shotlab-prep'
  | 'etsy-thor-seo-metrics'
  | 'etsy-odin-draft-approval'

export type EtsyRoomHandoffStatus =
  | 'local_draft'
  | 'ready_for_next_station'
  | 'partial_local_only'
  | 'waiting_operator'
  | 'frozen_complete'

export type EtsyRoomStage =
  | 'scout_request'
  | 'candidates_ready'
  | 'candidate_selected'
  | 'shotlab_packet_ready'
  | 'seo_packet_ready'
  | 'draft_payload_ready'
  | 'approval_waiting'
  | 'frozen_complete'

export type EtsyRoomDataOrigin =
  | 'oracle-local-alura'
  | 'future-internet-scout'
  | 'live-readonly-research'
  | 'fallback-local-mock'
  | 'local-user-input'
  | 'sheet-intake-local'
  | 'smart-intake-local'

export type EtsyRoomEventType =
  | 'etsy.scout.request.created'
  | 'etsy.candidates.ready'
  | 'etsy.candidate.selected'
  | 'etsy.candidate.rejected'
  | 'etsy.shotlab.packet.created'
  | 'etsy.seo.packet.created'
  | 'etsy.draft.payload.created'
  | 'etsy.approval.requested'
  | 'etsy.pipeline.frozen'

export type EtsyRoomRun = {
  runId: string
  targetShop: 'DolaroBoutique'
  roomId: 'etsy-market-lab'
  createdAtMs: number
  updatedAtMs: number
  stage: EtsyRoomStage
  usageAllowed: false
  workerSpawnAllowed: false
}

export type EtsyRoomEvent = {
  eventId: string
  type: EtsyRoomEventType
  runId: string
  packetId?: string
  stationId?: EtsyRoomStationId
  stage: EtsyRoomStage
  createdAtMs: number
  readback: string
  payload?: Record<string, unknown>
}

export type EtsyBaseRoomPacket = {
  packetId: string
  runId: string
  createdAtMs: number
  sourceStationId: EtsyRoomStationId
  targetStationId: EtsyRoomStationId
  status: EtsyRoomHandoffStatus
  dataOrigin: EtsyRoomDataOrigin
  sourceRecordIds: Array<string>
  evidenceIds: Array<string>
  missingFields: Array<string>
  lockedActions: Array<string>
  nextHandoff: string
  humanApprovalRequired: boolean
}

export type EtsyProductScoutPacket = EtsyBaseRoomPacket & {
  kind: 'product_scout'
  query: string
  targetShop: 'DolaroBoutique'
  categoryGuard: 'jewelry_only'
  requiredEvidence: Array<string>
  outputSchema: Array<string>
  sourceType: 'oracle_signal' | 'future_internet_scout' | 'fallback_local_mock' | 'local_user_input' | 'sheet_intake_local' | 'smart_intake_local'
    | 'live_readonly_research'
  oracleSignalPacketId?: string
}

export type EtsyProductCandidate = {
  candidateId: string
  packetId: string
  runId: string
  title: string
  niche: string
  score: number | null
  sourceType: 'Oracle local Alura' | 'Future internet scout' | 'Fallback local mock' | 'Sheet intake local' | 'Smart intake local'
    | 'Live read-only research'
  dataOrigin: EtsyRoomDataOrigin
  sourceRecordIds: Array<string>
  sourceDetails?: Array<EtsyLiveSourceDetail>
  imageRefs: Array<string>
  thumbnailRef?: string
  evidenceIds: Array<string>
  missingFields: Array<string>
  riskNotes: Array<string>
  nextHandoff: 'select_etsy_candidate_local'
  selected: boolean
}

export type EtsyScoutWorkerCandidateInput = {
  title: string
  niche: string
  score?: number | null
  sourceUrls?: Array<string>
  imageRefs?: Array<string>
  thumbnailRef?: string
  evidence?: Array<string>
  missingFields?: Array<string>
  riskNotes?: Array<string>
}

export type EtsySelectedProductPacket = EtsyBaseRoomPacket & {
  kind: 'selected_product'
  selectedProductTitle: string
  selectedCandidateId: string
  sourcePacketId: string
  imageRefs: Array<string>
  thumbnailRef?: string
  evidenceSummary: string
  riskFlags: Array<string>
}

export type EtsyShotLabHandoffPacket = EtsyBaseRoomPacket & {
  kind: 'shotlab_handoff'
  selectedProductTitle: string
  imageRefs: Array<string>
  thumbnailRef?: string
  sourceImagesRequired: Array<string>
  imageCount: number
  preset: 'Boutique Premium' | 'Minimalist Zen' | 'Earthy Organic'
  variantTruth: string
  forbiddenClaims: Array<string>
  altTextRequirements: Array<string>
  mediaOrderRequirements: Array<string>
  missingSourceMedia: Array<string>
}

export type EtsySeoPacket = EtsyBaseRoomPacket & {
  kind: 'seo_packet'
  selectedProductTitle: string
  imageRefs: Array<string>
  thumbnailRef?: string
  titleCandidates: Array<string>
  tagCandidates: Array<string>
  descriptionOutline: Array<string>
  keywordEvidenceIds: Array<string>
  metrics: {
    volume: number | null
    competition: number | null
    score: number | null
  }
  missingKeywordMetrics: Array<string>
  complianceWarnings: Array<string>
}

export type EtsyDraftPayload = EtsyBaseRoomPacket & {
  kind: 'draft_payload'
  title: string
  imageRefs: Array<string>
  thumbnailRef?: string
  description: string
  tags: Array<string>
  attributes: Record<string, string>
  personalization: false
  materials: Array<string>
  colors: Array<string>
  variants: Array<string>
  pricePlaceholder: '₪200'
  quantityPlaceholder: 1
  imageOrder: Array<string>
  altTextDrafts: Array<string>
  supplierSourceTruth: string
  missingAttributes: Array<string>
  blockedClaims: Array<string>
}

export type EtsyApprovalPacket = EtsyBaseRoomPacket & {
  kind: 'approval_packet'
  approvalStatus: 'waiting_operator'
  selectedProductTitle: string
  imageRefs: Array<string>
  thumbnailRef?: string
  evidenceQuality: string
  shotLabReadiness: string
  seoReadiness: string
  draftPayloadReadiness: string
  missingBlockers: Array<string>
  nextIfApproved: string
}

export type EtsyRoomState = {
  run: EtsyRoomRun
  stage: EtsyRoomStage
  prompt: string
  oracleSignalPacket?: OracleSignalPacket
  scoutPacket?: EtsyProductScoutPacket
  candidates: Array<EtsyProductCandidate>
  selectedCandidateId?: string
  selectedProductPacket?: EtsySelectedProductPacket
  shotLabHandoffPacket?: EtsyShotLabHandoffPacket
  seoPacket?: EtsySeoPacket
  draftPayload?: EtsyDraftPayload
  approvalPacket?: EtsyApprovalPacket
  researchMissionPacket?: ResearchMissionPacket
  events: Array<EtsyRoomEvent>
  allowedNow: Array<string>
  lockedActions: Array<string>
  lastReceipt?: string
  shotLabDraft: {
    preset: EtsyShotLabHandoffPacket['preset']
    imageCount: number
    sourceImageRequirements: string
    variantNotes: string
  }
}

export type PrepareProductScoutPacketLocalIntent = {
  type: 'prepare_product_scout_packet_local'
  prompt: string
  runId?: string
  correlationId?: string
  oracleSignalPacket?: OracleSignalPacket
}

export type ApplyProductScoutWorkerPacketLocalIntent = {
  type: 'apply_product_scout_worker_packet_local'
  prompt: string
  workerRunId: string
  workerSummary: string
  candidates: Array<EtsyScoutWorkerCandidateInput>
  evidenceIds?: Array<string>
  sourceRecordIds?: Array<string>
  missingFields?: Array<string>
  runId?: string
  correlationId?: string
}

export type SelectEtsyCandidateLocalIntent = {
  type: 'select_etsy_candidate_local'
  candidateId: string
  runId?: string
  correlationId?: string
}

export type RejectEtsyCandidateLocalIntent = {
  type: 'reject_etsy_candidate_local'
  candidateId: string
  runId?: string
  correlationId?: string
}

export type CreateShotLabHandoffLocalIntent = {
  type: 'create_shotlab_handoff_local'
  preset?: EtsyShotLabHandoffPacket['preset']
  imageCount?: number
  sourceImageRequirements?: string
  variantNotes?: string
  runId?: string
  correlationId?: string
}

export type CreateSeoPacketLocalIntent = {
  type: 'create_seo_packet_local'
  runId?: string
  correlationId?: string
}

export type CreateDraftPayloadLocalIntent = {
  type: 'create_draft_payload_local'
  runId?: string
  correlationId?: string
}

export type RequestDlvApprovalLocalIntent = {
  type: 'request_dlv_approval_local'
  runId?: string
  correlationId?: string
}

export type EtsyRoomLocalIntent =
  | PrepareProductScoutPacketLocalIntent
  | ApplyProductScoutWorkerPacketLocalIntent
  | SelectEtsyCandidateLocalIntent
  | RejectEtsyCandidateLocalIntent
  | CreateShotLabHandoffLocalIntent
  | CreateSeoPacketLocalIntent
  | CreateDraftPayloadLocalIntent
  | RequestDlvApprovalLocalIntent

export const ETSY_ROOM_STAGE_ORDER: Array<EtsyRoomStage> = [
  'scout_request',
  'candidates_ready',
  'candidate_selected',
  'shotlab_packet_ready',
  'seo_packet_ready',
  'draft_payload_ready',
  'approval_waiting',
]

export const ETSY_ROOM_LOCKED_ACTIONS = [
  'Etsy publish',
  'Etsy upload draft',
  'Etsy edit listing',
  'Etsy renew',
  'Etsy purchase',
  'supplier message',
  'AliExpress/Alibaba live call',
  'Alura live call',
  'Google Sheets write',
  'ShotLab/paid generation',
  'Discord send',
  'Hermes worker spawn/fan-out beyond approved controlled runner',
  'Kanban dispatch',
  'browser automation',
] as const

export const ETSY_ROOM_ALLOWED_INTENTS = [
  'prepare_product_scout_packet_local',
  'apply_product_scout_worker_packet_local',
  'select_etsy_candidate_local',
  'reject_etsy_candidate_local',
  'create_shotlab_handoff_local',
  'create_seo_packet_local',
  'create_draft_payload_local',
  'request_dlv_approval_local',
] as const

export const etsyRoomStageLabels: Record<EtsyRoomStage, string> = {
  scout_request: 'Scout',
  candidates_ready: 'Loki',
  candidate_selected: 'Selected Product',
  shotlab_packet_ready: 'ShotLab',
  seo_packet_ready: 'SEO',
  draft_payload_ready: 'Draft',
  approval_waiting: 'Approval',
  frozen_complete: 'Frozen',
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 58) || 'local-product'
}

function titleCase(value: string) {
  return value.trim().split(/\s+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function cleanPrompt(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function newRunId(nowMs: number) {
  return `etsy-market-lab-${nowMs.toString(36)}`
}

function packetId(kind: string, runId: string, nowMs: number, seed?: string) {
  return `etsy-${kind}-${slug(seed ?? runId)}-${nowMs.toString(36)}`
}

function makeRun(nowMs: number, runId = newRunId(nowMs), stage: EtsyRoomStage = 'scout_request'): EtsyRoomRun {
  return {
    runId,
    targetShop: 'DolaroBoutique',
    roomId: 'etsy-market-lab',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    stage,
    usageAllowed: false,
    workerSpawnAllowed: false,
  }
}

function basePacket(input: {
  kind: string
  runId: string
  nowMs: number
  sourceStationId: EtsyRoomStationId
  targetStationId: EtsyRoomStationId
  status: EtsyRoomHandoffStatus
  dataOrigin: EtsyRoomDataOrigin
  sourceRecordIds?: Array<string>
  evidenceIds?: Array<string>
  missingFields?: Array<string>
  nextHandoff: string
  humanApprovalRequired?: boolean
  seed?: string
}): EtsyBaseRoomPacket {
  return {
    packetId: packetId(input.kind, input.runId, input.nowMs, input.seed),
    runId: input.runId,
    createdAtMs: input.nowMs,
    sourceStationId: input.sourceStationId,
    targetStationId: input.targetStationId,
    status: input.status,
    dataOrigin: input.dataOrigin,
    sourceRecordIds: input.sourceRecordIds ?? [],
    evidenceIds: input.evidenceIds ?? [],
    missingFields: input.missingFields ?? [],
    lockedActions: [...ETSY_ROOM_LOCKED_ACTIONS],
    nextHandoff: input.nextHandoff,
    humanApprovalRequired: input.humanApprovalRequired ?? true,
  }
}

function addEvent(state: EtsyRoomState, event: Omit<EtsyRoomEvent, 'eventId' | 'runId'>): EtsyRoomState {
  const eventId = `${event.type}-${state.run.runId}-${event.createdAtMs.toString(36)}-${state.events.length + 1}`
  return {
    ...state,
    events: [
      ...state.events,
      {
        eventId,
        runId: state.run.runId,
        ...event,
      },
    ],
  }
}

function updateStage(state: EtsyRoomState, stage: EtsyRoomStage, nowMs: number, allowedNow: Array<string>) {
  return {
    ...state,
    stage,
    allowedNow,
    run: {
      ...state.run,
      stage,
      updatedAtMs: nowMs,
    },
  }
}

function candidatesFromScout(scout: EtsyProductScoutPacket, signal?: OracleSignalPacket): Array<EtsyProductCandidate> {
  const query = signal?.selectedKeyword ?? scout.query
  const base = titleCase(query.replace(/^find\s+/i, '').replace(/\s+opportunities$/i, ''))
  const evidenceIds = signal?.evidenceIds ?? scout.evidenceIds
  const sourceRecordIds = signal?.sourceFilesUsed ?? scout.sourceRecordIds
  const metricScore = signal?.metrics.keywordScore ?? null
  const origin = scout.dataOrigin
  const sourceType = origin === 'oracle-local-alura'
    ? 'Oracle local Alura'
    : origin === 'future-internet-scout'
      ? 'Future internet scout'
      : origin === 'live-readonly-research'
        ? 'Live read-only research'
        : 'Fallback local mock'
  const missingBase = scout.missingFields.length ? scout.missingFields : [
    'supplier proof',
    'source product images',
    'materials proof',
    'variant truth',
  ]

  return [
    {
      title: base || query || 'Oracle product signal',
      niche: signal ? 'Oracle product signal' : 'local product packet',
      score: metricScore,
      riskNotes: [
        'Use as a product card only; visual/source proof must be attached before ShotLab.',
        'No material, stone, personalization, recycled, or handmade claims until source truth proves them.',
      ],
    },
  ].map((candidate, index) => ({
    candidateId: `${scout.packetId}-candidate-${index + 1}`,
    packetId: scout.packetId,
    runId: scout.runId,
    title: candidate.title,
    niche: candidate.niche,
    score: candidate.score,
    sourceType,
    dataOrigin: origin,
    sourceRecordIds,
    imageRefs: [],
    thumbnailRef: undefined,
    evidenceIds,
    missingFields: missingBase,
    riskNotes: candidate.riskNotes,
    nextHandoff: 'select_etsy_candidate_local',
    selected: false,
  }))
}

function cleanList(values: Array<string | null | undefined> | undefined, fallback: Array<string> = [], limit = 8) {
  const cleaned = (values ?? [])
    .map((item) => item?.trim() ?? '')
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, limit)
  return cleaned.length ? cleaned : fallback
}

function firstImageRef(imageRefs: Array<string>, fallback?: string) {
  return imageRefs[0] ?? fallback
}

function imageRefsFromSourceDetails(details: Array<EtsyLiveSourceDetail> | undefined, fallback: Array<string> = []) {
  return cleanList(details?.map((detail) => detail.imageUrl), fallback, 10)
}

function imageRefsFromSmartIntake(input: {
  mission: SmartIntakeMission
  match: SmartIntakeProductMatch
  selectedImageIds?: Array<string>
}) {
  const imageSets = input.mission.imageSets.filter((set) => input.match.imageSetIds.includes(set.imageSetId) || set.matchId === input.match.matchId)
  const items = imageSets.flatMap((set) => set.items)
  const selectedIds = new Set(input.selectedImageIds ?? [])
  const preferred = items.filter((item) => selectedIds.size ? selectedIds.has(item.imageId) : item.selected || imageSets.some((set) => set.bestImageId === item.imageId))
  return cleanList(preferred.map((item) => item.ref), items.map((item) => item.ref), 12)
}

function clampScore(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function candidatesFromScoutWorker(input: {
  scoutPacket: EtsyProductScoutPacket
  candidates: Array<EtsyScoutWorkerCandidateInput>
  fallbackEvidenceIds: Array<string>
  fallbackSourceRecordIds: Array<string>
  fallbackMissingFields: Array<string>
}): Array<EtsyProductCandidate> {
  return input.candidates.slice(0, 5).map((candidate, index) => {
    const sourceRecordIds = cleanList(candidate.sourceUrls, input.fallbackSourceRecordIds, 6)
    const imageRefs = cleanList(candidate.imageRefs, candidate.thumbnailRef ? [candidate.thumbnailRef] : [], 8)
    const evidenceIds = cleanList(candidate.evidence, input.fallbackEvidenceIds, 8)
    const missingFields = cleanList(candidate.missingFields, input.fallbackMissingFields, 8)
    return {
      candidateId: `${input.scoutPacket.packetId}-worker-candidate-${index + 1}`,
      packetId: input.scoutPacket.packetId,
      runId: input.scoutPacket.runId,
      title: candidate.title.trim().slice(0, 160) || `Controlled Scout Candidate ${index + 1}`,
      niche: candidate.niche.trim().slice(0, 140) || 'jewelry opportunity',
      score: clampScore(candidate.score),
      sourceType: 'Future internet scout',
      dataOrigin: 'future-internet-scout',
      sourceRecordIds,
      imageRefs,
      thumbnailRef: firstImageRef(imageRefs, candidate.thumbnailRef),
      evidenceIds,
      missingFields,
      riskNotes: cleanList(candidate.riskNotes, ['No live Etsy/supplier action; verify source truth before handoff.'], 6),
      nextHandoff: 'select_etsy_candidate_local',
      selected: false,
    }
  })
}

export function applyEtsyLiveResearchRunToEtsyRoomLocal(
  state: EtsyRoomState,
  input: {
    liveRun: EtsyLiveResearchRun
    nowMs?: number
    runId?: string
  },
): EtsyRoomState {
  if (input.liveRun.status !== 'completed' || input.liveRun.candidates.length === 0) return state
  const nowMs = input.nowMs ?? Date.now()
  const query = cleanPrompt(input.liveRun.query)
  const existingRun = state.run.runId ? state.run : makeRun(nowMs, input.runId)
  const run = { ...existingRun, runId: input.runId ?? existingRun.runId, updatedAtMs: nowMs }
  const sourceRecordIds = cleanList(input.liveRun.candidates.flatMap((candidate) => candidate.sourceUrls), [`etsy-live:${input.liveRun.runId}`], 20)
  const evidenceIds = cleanList(input.liveRun.candidates.flatMap((candidate) => candidate.evidenceIds), [`etsy-live:${input.liveRun.runId}`], 20)
  const missingFields = cleanList(input.liveRun.candidates.flatMap((candidate) => candidate.missingEvidence), [
    'supplier proof',
    'source product images',
    'materials proof',
    'variant truth',
  ], 14)

  const scoutPacket: EtsyProductScoutPacket = {
    ...basePacket({
      kind: 'scout',
      runId: run.runId,
      nowMs,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-loki-product-hunt',
      status: 'partial_local_only',
      dataOrigin: 'live-readonly-research',
      sourceRecordIds,
      evidenceIds,
      missingFields,
      nextHandoff: 'select_etsy_candidate_local',
      seed: `${query}-${input.liveRun.runId}`,
    }),
    kind: 'product_scout',
    query,
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    requiredEvidence: [
      'public read-only source URLs',
      'evidence notes tied to sources',
      'supplier/source proof before handoff',
      'source product images before ShotLab',
      'materials and variant truth before claims',
    ],
    outputSchema: [
      'EtsyLiveResearchRun',
      'EtsyLiveCandidate[]',
      'sourceUrls',
      'evidenceIds',
      'missingEvidence',
      'riskFlags',
    ],
    sourceType: 'live_readonly_research',
  }

  const candidates = input.liveRun.candidates.slice(0, 5).map((candidate, index) => ({
    candidateId: `${scoutPacket.packetId}-live-candidate-${index + 1}`,
    packetId: scoutPacket.packetId,
    runId: scoutPacket.runId,
    title: candidate.title,
    niche: candidate.summary,
    score: clampScore(candidate.score),
    sourceType: 'Live read-only research' as const,
    dataOrigin: 'live-readonly-research' as const,
    sourceRecordIds: cleanList(candidate.sourceUrls, [`etsy-live:${candidate.candidateId}`], 8),
    sourceDetails: candidate.sourceDetails,
    imageRefs: imageRefsFromSourceDetails(candidate.sourceDetails),
    thumbnailRef: firstImageRef(imageRefsFromSourceDetails(candidate.sourceDetails)),
    evidenceIds: cleanList(candidate.evidenceIds, [`etsy-live:${candidate.candidateId}`], 10),
    missingFields: cleanList(candidate.missingEvidence, missingFields, 10),
    riskNotes: cleanList(candidate.riskFlags, ['No live action; verify source truth before handoff.'], 10),
    nextHandoff: 'select_etsy_candidate_local' as const,
    selected: false,
  }))

  let next = updateStage({
    ...state,
    run,
    prompt: query,
    scoutPacket,
    candidates,
    selectedCandidateId: undefined,
    selectedProductPacket: undefined,
    shotLabHandoffPacket: undefined,
    seoPacket: undefined,
    draftPayload: undefined,
    approvalPacket: undefined,
    lastReceipt: `Live read-only scout applied ${candidates.length} source-backed candidate${candidates.length === 1 ? '' : 's'} into Loki.`,
  }, 'candidates_ready', nowMs, ['select_etsy_candidate_local'])

  next = addEvent(next, {
    type: 'etsy.scout.request.created',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Live read-only research packet applied for ${query}. Live actions remain locked.`,
    payload: { query, liveRunId: input.liveRun.runId },
  })
  next = addEvent(next, {
    type: 'etsy.candidates.ready',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs + 1,
    readback: `${candidates.length} live read-only candidate${candidates.length === 1 ? '' : 's'} ready in Loki.`,
    payload: { candidateIds: candidates.map((candidate) => candidate.candidateId), dataOrigin: 'live-readonly-research', liveRunId: input.liveRun.runId },
  })
  return next
}

export function createInitialEtsyRoomState(nowMs = Date.now()): EtsyRoomState {
  const run = makeRun(nowMs)
  return {
    run,
    stage: 'scout_request',
    prompt: '',
    candidates: [],
    events: [],
    allowedNow: ['prepare_product_scout_packet_local'],
    lockedActions: [...ETSY_ROOM_LOCKED_ACTIONS],
    shotLabDraft: {
      preset: 'Boutique Premium',
      imageCount: 6,
      sourceImageRequirements: 'front, clasp/detail, scale/context, variant proof, packaging-safe crop',
      variantNotes: 'Treat personalization, stone, and recycled material as No unless evidence proves otherwise.',
    },
  }
}

export function prepareProductScoutPacketLocal(
  state: EtsyRoomState,
  input: { prompt: string; oracleSignalPacket?: OracleSignalPacket; nowMs?: number; runId?: string },
): EtsyRoomState {
  const nowMs = input.nowMs ?? Date.now()
  const query = cleanPrompt(input.oracleSignalPacket?.selectedKeyword ?? input.prompt)
  const existingRun = state.run.runId ? state.run : makeRun(nowMs, input.runId)
  const run = { ...existingRun, runId: input.runId ?? existingRun.runId, updatedAtMs: nowMs }
  const dataOrigin: EtsyRoomDataOrigin = input.oracleSignalPacket ? 'oracle-local-alura' : 'local-user-input'
  const sourceType = input.oracleSignalPacket ? 'oracle_signal' : 'local_user_input'
  const sourceRecordIds = input.oracleSignalPacket?.sourceFilesUsed ?? []
  const evidenceIds = input.oracleSignalPacket?.evidenceIds ?? []
  const missingFields = input.oracleSignalPacket?.missingFields.length
    ? input.oracleSignalPacket.missingFields
    : [
      'Oracle product signal',
      'source product images',
      'supplier proof',
      'materials proof',
      'variant truth',
    ]
  const scoutPacket: EtsyProductScoutPacket = {
    ...basePacket({
      kind: 'scout',
      runId: run.runId,
      nowMs,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-loki-product-hunt',
      status: input.oracleSignalPacket ? 'ready_for_next_station' : 'partial_local_only',
      dataOrigin,
      sourceRecordIds,
      evidenceIds,
      missingFields,
      nextHandoff: input.oracleSignalPacket ? 'select_etsy_candidate_local' : 'wait_for_oracle_product_signal',
      seed: query || 'oracle-product-signal-required',
    }),
    kind: 'product_scout',
    query,
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    requiredEvidence: [
      'local Alura/Oracle keyword signal',
      'supplier/source proof',
      'source product images',
      'materials and variant truth',
      'SEO metrics or missing metric declaration',
    ],
    outputSchema: [
      'EtsyProductCandidate[]',
      'sourceRecordIds',
      'evidenceIds',
      'missingFields',
      'riskNotes',
      'nextHandoff',
    ],
    sourceType,
    oracleSignalPacketId: input.oracleSignalPacket?.packetId,
  }
  let next = updateStage({
    ...state,
    run,
    prompt: query,
    oracleSignalPacket: input.oracleSignalPacket ?? state.oracleSignalPacket,
    scoutPacket,
    candidates: input.oracleSignalPacket ? candidatesFromScout(scoutPacket, input.oracleSignalPacket) : [],
    selectedCandidateId: undefined,
    selectedProductPacket: undefined,
    shotLabHandoffPacket: undefined,
    seoPacket: undefined,
    draftPayload: undefined,
    approvalPacket: undefined,
    lastReceipt: input.oracleSignalPacket
      ? `Oracle signal packet staged locally for "${query}".`
      : 'Etsy Market Lab is waiting for an Oracle product signal. No fallback product cards were created.',
  }, input.oracleSignalPacket ? 'candidates_ready' : 'scout_request', nowMs, input.oracleSignalPacket ? ['select_etsy_candidate_local'] : ['open_oracle_product_search'])

  next = addEvent(next, {
    type: 'etsy.scout.request.created',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: input.oracleSignalPacket
      ? `Oracle signal received for ${query}. Product cards are sourced from the Oracle packet.`
      : 'Manual/local text was not converted into products. Open Oracle Product Search to create product cards.',
    payload: { query, targetShop: scoutPacket.targetShop, categoryGuard: scoutPacket.categoryGuard, dataOrigin },
  })
  if (input.oracleSignalPacket) {
    next = addEvent(next, {
      type: 'etsy.candidates.ready',
      packetId: scoutPacket.packetId,
      stationId: 'etsy-loki-product-hunt',
      stage: next.stage,
      createdAtMs: nowMs + 1,
      readback: `${next.candidates.length} Oracle product card${next.candidates.length === 1 ? '' : 's'} ready in Etsy Market Lab.`,
      payload: { candidateIds: next.candidates.map((candidate) => candidate.candidateId), dataOrigin },
    })
  }
  return next
}

export function applyProductScoutWorkerPacketLocal(
  state: EtsyRoomState,
  input: {
    prompt: string
    workerRunId: string
    workerSummary: string
    candidates: Array<EtsyScoutWorkerCandidateInput>
    evidenceIds?: Array<string>
    sourceRecordIds?: Array<string>
    missingFields?: Array<string>
    nowMs?: number
    runId?: string
  },
): EtsyRoomState {
  const nowMs = input.nowMs ?? Date.now()
  const query = cleanPrompt(input.prompt)
  const existingRun = state.run.runId ? state.run : makeRun(nowMs, input.runId)
  const run = { ...existingRun, runId: input.runId ?? existingRun.runId, updatedAtMs: nowMs }
  const sourceRecordIds = cleanList(input.sourceRecordIds, [`controlled-scout:${input.workerRunId}`], 12)
  const evidenceIds = cleanList(input.evidenceIds, [`controlled-scout:${input.workerRunId}`], 12)
  const missingFields = cleanList(input.missingFields, [
    'supplier proof',
    'source product images',
    'materials proof',
    'variant truth',
  ], 10)

  const scoutPacket: EtsyProductScoutPacket = {
    ...basePacket({
      kind: 'scout',
      runId: run.runId,
      nowMs,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-loki-product-hunt',
      status: 'partial_local_only',
      dataOrigin: 'future-internet-scout',
      sourceRecordIds,
      evidenceIds,
      missingFields,
      nextHandoff: 'select_etsy_candidate_local',
      seed: `${query}-${input.workerRunId}`,
    }),
    kind: 'product_scout',
    query,
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    requiredEvidence: [
      'controlled read-only public source evidence',
      'supplier/source proof before handoff',
      'source product images before ShotLab',
      'materials and variant truth before claims',
      'SEO metrics or explicit missing metric declaration',
    ],
    outputSchema: [
      'Controlled Scout candidates',
      'sourceRecordIds',
      'evidenceIds',
      'missingFields',
      'riskNotes',
      'nextHandoff',
    ],
    sourceType: 'future_internet_scout',
  }

  const candidates = candidatesFromScoutWorker({
    scoutPacket,
    candidates: input.candidates,
    fallbackEvidenceIds: evidenceIds,
    fallbackSourceRecordIds: sourceRecordIds,
    fallbackMissingFields: missingFields,
  })

  let next = updateStage({
    ...state,
    run,
    prompt: query,
    scoutPacket,
    candidates,
    selectedCandidateId: undefined,
    selectedProductPacket: undefined,
    shotLabHandoffPacket: undefined,
    seoPacket: undefined,
    draftPayload: undefined,
    approvalPacket: undefined,
    lastReceipt: `Scout V2 applied ${candidates.length} read-only candidate${candidates.length === 1 ? '' : 's'} into Loki.`,
  }, 'candidates_ready', nowMs, ['select_etsy_candidate_local'])

  next = addEvent(next, {
    type: 'etsy.scout.request.created',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Controlled Scout V2 packet applied for ${query}. ${input.workerSummary}`,
    payload: { query, workerRunId: input.workerRunId, workerSummary: input.workerSummary },
  })
  next = addEvent(next, {
    type: 'etsy.candidates.ready',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs + 1,
    readback: `${candidates.length} controlled read-only Scout V2 candidates ready in Loki.`,
    payload: { candidateIds: candidates.map((candidate) => candidate.candidateId), dataOrigin: 'future-internet-scout', workerRunId: input.workerRunId },
  })
  return next
}

export function applySheetIntakeProductToEtsyRoomLocal(
  state: EtsyRoomState,
  input: {
    product: EtsySheetIntakeNormalizedProduct
    sheetRunId: string
    manifestPath?: string
    nowMs?: number
    runId?: string
  },
): EtsyRoomState {
  const nowMs = input.nowMs ?? Date.now()
  const query = cleanPrompt(input.product.title)
  const existingRun = state.run.runId ? state.run : makeRun(nowMs, input.runId)
  const run = { ...existingRun, runId: input.runId ?? existingRun.runId, updatedAtMs: nowMs }
  const sourceRecordIds = cleanList([
    input.product.sourceRowId,
    input.product.sourceRef,
    input.manifestPath,
    `sheet-intake:${input.sheetRunId}`,
  ], [], 12)
  const evidenceIds = cleanList([
    ...input.product.evidenceIds,
    input.product.dossierPath,
    input.product.sourceUrl,
    input.product.supplierUrl,
  ], [`sheet-intake:${input.sheetRunId}`], 12)
  const missingFields = cleanList(input.product.missingFields, [
    'source product images',
    'supplier proof',
    'materials proof',
    'variant truth',
  ], 12)
  const imageRefs = cleanList(input.product.imageRefs, input.product.thumbnailRef ? [input.product.thumbnailRef] : [], 12)

  const scoutPacket: EtsyProductScoutPacket = {
    ...basePacket({
      kind: 'scout',
      runId: run.runId,
      nowMs,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-loki-product-hunt',
      status: input.product.shotLabReadiness === 'ready' ? 'ready_for_next_station' : 'partial_local_only',
      dataOrigin: 'sheet-intake-local',
      sourceRecordIds,
      evidenceIds,
      missingFields,
      nextHandoff: 'select_etsy_candidate_local',
      seed: `${query}-${input.sheetRunId}`,
    }),
    kind: 'product_scout',
    query,
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    requiredEvidence: [
      'sheet intake dossier',
      'source/supplier URL when present',
      'source product image refs',
      'materials and variant truth before claims',
      'SEO metrics or explicit missing metric declaration',
    ],
    outputSchema: [
      'Sheet intake normalized product',
      'EtsyProductCandidate',
      'sourceRecordIds',
      'evidenceIds',
      'missingFields',
      'riskNotes',
    ],
    sourceType: 'sheet_intake_local',
  }

  const candidateId = `${scoutPacket.packetId}-sheet-candidate-1`
  const candidate: EtsyProductCandidate = {
    candidateId,
    packetId: scoutPacket.packetId,
    runId: run.runId,
    title: input.product.title,
    niche: input.product.notes.find((note) => note.toLowerCase().includes('niche')) ?? 'sheet intake product',
    score: input.product.score,
    sourceType: 'Sheet intake local',
    dataOrigin: 'sheet-intake-local',
    sourceRecordIds,
    imageRefs,
    thumbnailRef: firstImageRef(imageRefs, input.product.thumbnailRef),
    evidenceIds,
    missingFields,
    riskNotes: cleanList([
      ...input.product.riskFlags,
      ...input.product.warnings.map((item) => item.label),
    ], ['Review sheet dossier before any live handoff.'], 10),
    nextHandoff: 'select_etsy_candidate_local',
    selected: false,
  }

  let next = updateStage({
    ...state,
    run,
    prompt: query,
    scoutPacket,
    candidates: [candidate],
    selectedCandidateId: undefined,
    selectedProductPacket: undefined,
    shotLabHandoffPacket: undefined,
    seoPacket: undefined,
    draftPayload: undefined,
    approvalPacket: undefined,
    lastReceipt: `Sheet Intake product staged in Loki: ${input.product.title}.`,
  }, 'candidates_ready', nowMs, ['select_etsy_candidate_local'])

  next = addEvent(next, {
    type: 'etsy.scout.request.created',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Sheet Intake scout packet created locally for ${input.product.title}.`,
    payload: { sheetRunId: input.sheetRunId, productId: input.product.productId, dossierPath: input.product.dossierPath },
  })
  next = addEvent(next, {
    type: 'etsy.candidates.ready',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs + 1,
    readback: '1 Sheet Intake product candidate ready in Loki.',
    payload: { candidateIds: [candidateId], dataOrigin: 'sheet-intake-local', sheetRunId: input.sheetRunId },
  })

  return selectEtsyCandidateLocal(next, candidateId, nowMs + 2)
}

export function applySmartIntakeMatchToEtsyRoomLocal(
  state: EtsyRoomState,
  input: {
    mission: SmartIntakeMission
    match: SmartIntakeProductMatch
    selectedImageIds?: Array<string>
    nowMs?: number
    runId?: string
  },
): EtsyRoomState {
  const nowMs = input.nowMs ?? Date.now()
  const query = cleanPrompt(input.match.title)
  const existingRun = state.run.runId ? state.run : makeRun(nowMs, input.runId)
  const run = { ...existingRun, runId: input.runId ?? existingRun.runId, updatedAtMs: nowMs }
  const matchSources = input.mission.sources.filter((source) => input.match.sourceIds.includes(source.sourceId))
  const sourceRecordIds = cleanList([
    `smart-intake:${input.mission.missionId}`,
    ...matchSources.map((source) => source.normalizedRef),
  ], [`smart-intake:${input.mission.missionId}`], 14)
  const evidenceIds = cleanList([
    ...input.match.evidenceIds,
    ...input.match.imageSetIds,
    ...(input.selectedImageIds ?? []),
    `dossier-${input.match.matchId}`,
  ], [`smart-intake:${input.mission.missionId}`], 14)
  const missingFields = cleanList(input.match.missingEvidence, [
    'verified supplier/material truth',
    'source product image proof',
    'SEO demand metrics',
  ], 14)
  const imageRefs = imageRefsFromSmartIntake(input)

  const scoutPacket: EtsyProductScoutPacket = {
    ...basePacket({
      kind: 'scout',
      runId: run.runId,
      nowMs,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-loki-product-hunt',
      status: input.match.readiness === 'ready' ? 'ready_for_next_station' : 'partial_local_only',
      dataOrigin: 'smart-intake-local',
      sourceRecordIds,
      evidenceIds,
      missingFields,
      nextHandoff: 'select_etsy_candidate_local',
      seed: `${query}-${input.mission.missionId}`,
    }),
    kind: 'product_scout',
    query,
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    requiredEvidence: [
      'Smart Intake mission source refs',
      'best image selection',
      'markdown dossier review',
      'supplier/material truth before customer-facing claims',
      'operator approval before live or paid actions',
    ],
    outputSchema: [
      'SmartIntakeMission',
      'SmartIntakeProductMatch',
      'EtsyProductCandidate',
      'SelectedProductPacket',
      'sourceRecordIds',
      'evidenceIds',
      'missingFields',
    ],
    sourceType: 'smart_intake_local',
  }

  const candidateId = `${scoutPacket.packetId}-smart-candidate-1`
  const candidate: EtsyProductCandidate = {
    candidateId,
    packetId: scoutPacket.packetId,
    runId: run.runId,
    title: input.match.title,
    niche: input.match.niche,
    score: input.match.score,
    sourceType: 'Smart intake local',
    dataOrigin: 'smart-intake-local',
    sourceRecordIds,
    imageRefs,
    thumbnailRef: firstImageRef(imageRefs),
    evidenceIds,
    missingFields,
    riskNotes: cleanList(input.match.riskFlags, ['Review Smart Intake dossier before any live handoff.'], 12),
    nextHandoff: 'select_etsy_candidate_local',
    selected: false,
  }

  let next = updateStage({
    ...state,
    run,
    prompt: query,
    scoutPacket,
    candidates: [candidate],
    selectedCandidateId: undefined,
    selectedProductPacket: undefined,
    shotLabHandoffPacket: undefined,
    seoPacket: undefined,
    draftPayload: undefined,
    approvalPacket: undefined,
    lastReceipt: `Smart Intake match staged in Loki: ${input.match.title}.`,
  }, 'candidates_ready', nowMs, ['select_etsy_candidate_local'])

  next = addEvent(next, {
    type: 'etsy.scout.request.created',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Smart Intake mission packet created locally for ${input.match.title}.`,
    payload: { missionId: input.mission.missionId, matchId: input.match.matchId, selectedImageIds: input.selectedImageIds ?? [] },
  })
  next = addEvent(next, {
    type: 'etsy.candidates.ready',
    packetId: scoutPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs + 1,
    readback: '1 Smart Intake product match ready in Loki.',
    payload: { candidateIds: [candidateId], dataOrigin: 'smart-intake-local', missionId: input.mission.missionId },
  })

  return selectEtsyCandidateLocal(next, candidateId, nowMs + 2)
}

export function activeEtsyRoomCandidate(state: EtsyRoomState) {
  return state.candidates.find((candidate) => candidate.candidateId === state.selectedCandidateId) ?? state.candidates[0]
}

export function selectEtsyCandidateLocal(state: EtsyRoomState, candidateId: string, nowMs = Date.now()): EtsyRoomState {
  const candidate = state.candidates.find((item) => item.candidateId === candidateId)
  if (!candidate || !state.scoutPacket) {
    return {
      ...state,
      lastReceipt: 'Select a candidate after creating a local scout packet.',
    }
  }
  const selectedPacket: EtsySelectedProductPacket = {
    ...basePacket({
      kind: 'selected',
      runId: state.run.runId,
      nowMs,
      sourceStationId: 'etsy-loki-product-hunt',
      targetStationId: 'etsy-thor-shotlab-prep',
      status: candidate.missingFields.length ? 'partial_local_only' : 'ready_for_next_station',
      dataOrigin: candidate.dataOrigin,
      sourceRecordIds: candidate.sourceRecordIds,
      evidenceIds: candidate.evidenceIds,
      missingFields: candidate.missingFields,
      nextHandoff: 'create_shotlab_handoff_local',
      seed: candidate.title,
    }),
    kind: 'selected_product',
    selectedProductTitle: candidate.title,
    selectedCandidateId: candidate.candidateId,
    sourcePacketId: state.scoutPacket.packetId,
    imageRefs: candidate.imageRefs,
    thumbnailRef: firstImageRef(candidate.imageRefs, candidate.thumbnailRef),
    evidenceSummary: `${candidate.sourceType}; ${candidate.evidenceIds.length} evidence ids; missing: ${candidate.missingFields.join(', ') || 'none'}`,
    riskFlags: candidate.riskNotes,
  }
  const switchingCandidate = state.selectedCandidateId !== candidateId
  let next = updateStage({
    ...state,
    candidates: state.candidates.map((item) => ({ ...item, selected: item.candidateId === candidateId })),
    selectedCandidateId: candidateId,
    selectedProductPacket: selectedPacket,
    shotLabHandoffPacket: switchingCandidate ? undefined : state.shotLabHandoffPacket,
    seoPacket: switchingCandidate ? undefined : state.seoPacket,
    draftPayload: switchingCandidate ? undefined : state.draftPayload,
    approvalPacket: switchingCandidate ? undefined : state.approvalPacket,
    lastReceipt: `Product selected: ${candidate.title}. Next step is source/image proof before ShotLab.`,
  }, 'candidate_selected', nowMs, ['create_shotlab_handoff_local'])
  next = addEvent(next, {
    type: 'etsy.candidate.selected',
    packetId: selectedPacket.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Selected product packet created: ${candidate.title}.`,
    payload: { selectedCandidateId: candidateId, selectedProductTitle: candidate.title },
  })
  return next
}

export function rejectEtsyCandidateLocal(state: EtsyRoomState, candidateId: string, nowMs = Date.now()): EtsyRoomState {
  const candidate = state.candidates.find((item) => item.candidateId === candidateId)
  if (!candidate) {
    return {
      ...state,
      lastReceipt: 'Candidate was already removed from the local staging board.',
    }
  }

  const remainingCandidates = state.candidates.filter((item) => item.candidateId !== candidateId)
  const rejectedSelectedCandidate = state.selectedCandidateId === candidateId
    || state.selectedProductPacket?.selectedCandidateId === candidateId
  const nextStage: EtsyRoomStage = rejectedSelectedCandidate
    ? remainingCandidates.length
      ? 'candidates_ready'
      : 'scout_request'
    : state.stage
  const nextAllowed = rejectedSelectedCandidate
    ? remainingCandidates.length
      ? ['select_etsy_candidate_local']
      : ['prepare_product_scout_packet_local']
    : state.allowedNow

  let next = updateStage({
    ...state,
    run: { ...state.run, updatedAtMs: nowMs },
    candidates: remainingCandidates.map((item) => ({ ...item, selected: false })),
    selectedCandidateId: rejectedSelectedCandidate ? undefined : state.selectedCandidateId,
    selectedProductPacket: rejectedSelectedCandidate ? undefined : state.selectedProductPacket,
    shotLabHandoffPacket: rejectedSelectedCandidate ? undefined : state.shotLabHandoffPacket,
    seoPacket: rejectedSelectedCandidate ? undefined : state.seoPacket,
    draftPayload: rejectedSelectedCandidate ? undefined : state.draftPayload,
    approvalPacket: rejectedSelectedCandidate ? undefined : state.approvalPacket,
    lastReceipt: `Rejected candidate was deleted from local staging: ${candidate.title}.`,
  }, nextStage, nowMs, nextAllowed)

  next = addEvent(next, {
    type: 'etsy.candidate.rejected',
    packetId: candidate.packetId,
    stationId: 'etsy-loki-product-hunt',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Candidate deleted from local staging after DLV rejection: ${candidate.title}.`,
    payload: {
      candidateId,
      deletedFromLocalStaging: true,
      remainingCandidateIds: next.candidates.map((item) => item.candidateId),
      selectedPacketCleared: rejectedSelectedCandidate,
    },
  })
  return next
}

export function createShotLabHandoffLocal(state: EtsyRoomState, input: {
  preset?: EtsyShotLabHandoffPacket['preset']
  imageCount?: number
  sourceImageRequirements?: string
  variantNotes?: string
  nowMs?: number
} = {}): EtsyRoomState {
  const nowMs = input.nowMs ?? Date.now()
  const selected = state.selectedProductPacket
  const candidate = activeEtsyRoomCandidate(state)
  if (!selected || !candidate) return { ...state, lastReceipt: 'Select a product before creating a ShotLab handoff packet.' }
  const sourceImagesRequired = (input.sourceImageRequirements ?? state.shotLabDraft.sourceImageRequirements)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const packet: EtsyShotLabHandoffPacket = {
    ...basePacket({
      kind: 'shotlab',
      runId: state.run.runId,
      nowMs,
      sourceStationId: 'etsy-thor-shotlab-prep',
      targetStationId: 'etsy-thor-seo-metrics',
      status: 'partial_local_only',
      dataOrigin: selected.dataOrigin,
      sourceRecordIds: selected.sourceRecordIds,
      evidenceIds: selected.evidenceIds,
      missingFields: [...new Set([...selected.missingFields, 'real source media mapped for ShotLab'])],
      nextHandoff: 'create_seo_packet_local',
      seed: selected.selectedProductTitle,
    }),
    kind: 'shotlab_handoff',
    selectedProductTitle: selected.selectedProductTitle,
    imageRefs: selected.imageRefs,
    thumbnailRef: firstImageRef(selected.imageRefs, selected.thumbnailRef),
    sourceImagesRequired,
    imageCount: Math.max(1, Math.min(12, input.imageCount ?? state.shotLabDraft.imageCount)),
    preset: input.preset ?? state.shotLabDraft.preset,
    variantTruth: input.variantNotes ?? state.shotLabDraft.variantNotes,
    forbiddenClaims: [
      'hypoallergenic',
      'waterproof',
      'recycled material',
      'real stone',
      'personalized',
      'handmade',
    ],
    altTextRequirements: [
      'truthful product subject',
      'no keyword stuffing',
      'no supplier/internal facts',
      'describe visible material only if proven',
    ],
    mediaOrderRequirements: [
      'hero product image',
      'detail image',
      'scale/context image',
      'variant proof',
      'safe lifestyle/mockup only after source proof',
    ],
    missingSourceMedia: ['real product source images not mapped in V3'],
  }
  let next = updateStage({
    ...state,
    shotLabDraft: {
      preset: packet.preset,
      imageCount: packet.imageCount,
      sourceImageRequirements: sourceImagesRequired.join(', '),
      variantNotes: packet.variantTruth,
    },
    shotLabHandoffPacket: packet,
    lastReceipt: `ShotLab handoff packet staged locally for ${packet.selectedProductTitle}.`,
  }, 'shotlab_packet_ready', nowMs, ['create_seo_packet_local'])
  next = addEvent(next, {
    type: 'etsy.shotlab.packet.created',
    packetId: packet.packetId,
    stationId: 'etsy-thor-shotlab-prep',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `ShotLab handoff packet created locally for ${packet.selectedProductTitle}. Paid generation remains locked.`,
    payload: { preset: packet.preset, imageCount: packet.imageCount, missingSourceMedia: packet.missingSourceMedia },
  })
  return next
}

export function createSeoPacketLocal(state: EtsyRoomState, nowMs = Date.now()): EtsyRoomState {
  const selected = state.selectedProductPacket
  const candidate = activeEtsyRoomCandidate(state)
  if (!selected || !candidate) return { ...state, lastReceipt: 'Select a product before creating an SEO packet.' }
  const titleBase = selected.selectedProductTitle.replace(/\s+/g, ' ').trim()
  const tags = [
    'gold necklace',
    'initial necklace',
    'gift for her',
    'minimal jewelry',
    'boutique jewelry',
    'everyday necklace',
    'letter charm',
  ].filter((tag) => titleBase.toLowerCase().includes(tag.split(' ')[0]) || tag.length < 17).slice(0, 8)
  const packet: EtsySeoPacket = {
    ...basePacket({
      kind: 'seo',
      runId: state.run.runId,
      nowMs,
      sourceStationId: 'etsy-thor-seo-metrics',
      targetStationId: 'etsy-odin-draft-approval',
      status: 'partial_local_only',
      dataOrigin: selected.dataOrigin,
      sourceRecordIds: selected.sourceRecordIds,
      evidenceIds: selected.evidenceIds,
      missingFields: [...new Set([...selected.missingFields, 'safe local SEO metric source not connected'])],
      nextHandoff: 'create_draft_payload_local',
      seed: titleBase,
    }),
    kind: 'seo_packet',
    selectedProductTitle: titleBase,
    imageRefs: selected.imageRefs,
    thumbnailRef: firstImageRef(selected.imageRefs, selected.thumbnailRef),
    titleCandidates: [
      `${titleBase} for Everyday Gifts`,
      `Minimal ${titleBase} Gift Jewelry`,
      `${titleBase} Boutique Necklace`,
    ],
    tagCandidates: tags,
    descriptionOutline: [
      'Open with the visible product style and gift use.',
      'Describe only verified material, color, and variant facts.',
      'Mention personalization only if evidence proves it.',
      'Close with care/fit notes that do not overclaim.',
    ],
    keywordEvidenceIds: candidate.evidenceIds,
    metrics: {
      volume: null,
      competition: null,
      score: candidate.score,
    },
    missingKeywordMetrics: [
      'search volume missing from safe local SEO source',
      'competition missing from safe local SEO source',
      ...(candidate.score === null ? ['keyword score missing'] : []),
    ],
    complianceWarnings: [
      'No lookalike language.',
      'No material/stone/personalized claim without evidence.',
      'No stuffing in title or alt text.',
    ],
  }
  let next = updateStage({
    ...state,
    seoPacket: packet,
    lastReceipt: `SEO packet staged locally for ${titleBase}. Missing metrics are explicit.`,
  }, 'seo_packet_ready', nowMs, ['create_draft_payload_local'])
  next = addEvent(next, {
    type: 'etsy.seo.packet.created',
    packetId: packet.packetId,
    stationId: 'etsy-thor-seo-metrics',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `SEO packet created locally; missing keyword metrics remain marked as missing evidence.`,
    payload: { titleCandidates: packet.titleCandidates, missingKeywordMetrics: packet.missingKeywordMetrics },
  })
  return next
}

export function createDraftPayloadLocal(state: EtsyRoomState, nowMs = Date.now()): EtsyRoomState {
  const selected = state.selectedProductPacket
  const seo = state.seoPacket
  if (!selected || !seo) return { ...state, lastReceipt: 'Create SEO packet before building Odin approval draft approval preview.' }
  const title = seo.titleCandidates[0]
  const blockedClaims = [
    'lookalike',
    'recycled material',
    'real stone',
    'personalized',
    'hypoallergenic',
    'waterproof',
    'handmade',
  ]
  const packet: EtsyDraftPayload = {
    ...basePacket({
      kind: 'draft',
      runId: state.run.runId,
      nowMs,
      sourceStationId: 'etsy-odin-draft-approval',
      targetStationId: 'etsy-odin-draft-approval',
      status: 'partial_local_only',
      dataOrigin: selected.dataOrigin,
      sourceRecordIds: selected.sourceRecordIds,
      evidenceIds: selected.evidenceIds,
      missingFields: [...new Set([...seo.missingFields, 'real images', 'materials proof', 'supplier/source truth'])],
      nextHandoff: 'request_dlv_approval_local',
      seed: title,
    }),
    kind: 'draft_payload',
    title,
    imageRefs: seo.imageRefs,
    thumbnailRef: firstImageRef(seo.imageRefs, seo.thumbnailRef),
    description: `${selected.selectedProductTitle} prepared as a local DolaroBoutique draft preview. This copy stays truthful: jewelry only, no lookalikes, no personalized claim unless proven, unknown recycled material = No, unknown stone = No, and no source/SKU/internal facts in customer-facing text.`,
    tags: seo.tagCandidates,
    attributes: {
      shop: 'DolaroBoutique',
      category: 'Jewelry',
      recycledMaterial: 'No - unknown/unproven',
      stone: 'No - unknown/unproven',
      personalized: 'No - not explicitly proven',
    },
    personalization: false,
    materials: ['unknown until supplier/source evidence is attached'],
    colors: ['gold tone pending source proof'],
    variants: ['no variant claim until proof exists'],
    pricePlaceholder: '₪200',
    quantityPlaceholder: 1,
    imageOrder: ['hero source image required', 'detail image required', 'scale image required', 'variant proof required'],
    altTextDrafts: [
      `Gold-tone ${selected.selectedProductTitle.toLowerCase()} shown as a jewelry gift preview.`,
      `${selected.selectedProductTitle} detail view, material claims pending source proof.`,
    ],
    supplierSourceTruth: 'No live supplier/source proof connected yet; source truth remains local-only and partial.',
    missingAttributes: ['materials proof', 'dimensions', 'real source images', 'supplier proof'],
    blockedClaims,
  }
  let next = updateStage({
    ...state,
    draftPayload: packet,
    lastReceipt: `Draft payload preview created locally for ${title}. Upload and publish remain locked.`,
  }, 'draft_payload_ready', nowMs, ['request_dlv_approval_local'])
  next = addEvent(next, {
    type: 'etsy.draft.payload.created',
    packetId: packet.packetId,
    stationId: 'etsy-odin-draft-approval',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `Odin approval draft approval preview created locally: ${title}.`,
    payload: { title: packet.title, lockedActions: packet.lockedActions, missingAttributes: packet.missingAttributes },
  })
  return next
}

export function requestDlvApprovalLocal(state: EtsyRoomState, nowMs = Date.now()): EtsyRoomState {
  const selected = state.selectedProductPacket
  const draft = state.draftPayload
  if (!selected || !draft) return { ...state, lastReceipt: 'Create a draft payload before requesting DLV approval.' }
  const missingBlockers = [...new Set([
    ...draft.missingFields,
    ...draft.missingAttributes,
    ...(!state.shotLabHandoffPacket ? ['ShotLab handoff packet missing'] : []),
    ...(!state.seoPacket ? ['SEO packet missing'] : []),
  ])]
  const packet: EtsyApprovalPacket = {
    ...basePacket({
      kind: 'approval',
      runId: state.run.runId,
      nowMs,
      sourceStationId: 'etsy-odin-draft-approval',
      targetStationId: 'etsy-odin-draft-approval',
      status: 'waiting_operator',
      dataOrigin: draft.dataOrigin,
      sourceRecordIds: draft.sourceRecordIds,
      evidenceIds: draft.evidenceIds,
      missingFields: missingBlockers,
      nextHandoff: 'operator_review_only',
      seed: selected.selectedProductTitle,
    }),
    kind: 'approval_packet',
    approvalStatus: 'waiting_operator',
    selectedProductTitle: selected.selectedProductTitle,
    imageRefs: draft.imageRefs,
    thumbnailRef: firstImageRef(draft.imageRefs, draft.thumbnailRef),
    evidenceQuality: draft.evidenceIds.length ? 'partial local evidence' : 'missing evidence',
    shotLabReadiness: state.shotLabHandoffPacket ? 'local handoff packet ready; paid generation locked' : 'missing local handoff packet',
    seoReadiness: state.seoPacket ? 'local SEO packet ready; missing metrics explicit' : 'missing local SEO packet',
    draftPayloadReadiness: 'local draft payload ready; upload/publish locked',
    missingBlockers,
    nextIfApproved: 'Future Hermes can continue only through typed local intent/event contract. No live action is enabled.',
  }
  let next = updateStage({
    ...state,
    approvalPacket: packet,
    lastReceipt: `DLV approval packet waiting for operator. No live action can run.`,
  }, 'approval_waiting', nowMs, ['operator_review_only'])
  next = addEvent(next, {
    type: 'etsy.approval.requested',
    packetId: packet.packetId,
    stationId: 'etsy-odin-draft-approval',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: `DLV approval packet waiting_operator for ${packet.selectedProductTitle}.`,
    payload: { approvalStatus: packet.approvalStatus, missingBlockers: packet.missingBlockers },
  })
  return next
}

export function freezeEtsyRoomPipelineLocal(state: EtsyRoomState, nowMs = Date.now()): EtsyRoomState {
  let next = updateStage({
    ...state,
    lastReceipt: 'Etsy Market Lab pipeline frozen local-only.',
  }, 'frozen_complete', nowMs, [])
  next = addEvent(next, {
    type: 'etsy.pipeline.frozen',
    packetId: state.approvalPacket?.packetId,
    stationId: 'etsy-odin-draft-approval',
    stage: next.stage,
    createdAtMs: nowMs,
    readback: 'Etsy pipeline frozen complete. Usage and worker spawn remain disabled.',
  })
  return next
}

export function reduceEtsyRoomLocalIntent(state: EtsyRoomState, intent: EtsyRoomLocalIntent, nowMs = Date.now()): EtsyRoomState {
  switch (intent.type) {
    case 'prepare_product_scout_packet_local':
      return prepareProductScoutPacketLocal(state, {
        prompt: intent.prompt,
        oracleSignalPacket: intent.oracleSignalPacket,
        runId: intent.runId,
        nowMs,
      })
    case 'apply_product_scout_worker_packet_local':
      return applyProductScoutWorkerPacketLocal(state, {
        prompt: intent.prompt,
        workerRunId: intent.workerRunId,
        workerSummary: intent.workerSummary,
        candidates: intent.candidates,
        evidenceIds: intent.evidenceIds,
        sourceRecordIds: intent.sourceRecordIds,
        missingFields: intent.missingFields,
        runId: intent.runId,
        nowMs,
      })
    case 'select_etsy_candidate_local':
      return selectEtsyCandidateLocal(state, intent.candidateId, nowMs)
    case 'reject_etsy_candidate_local':
      return rejectEtsyCandidateLocal(state, intent.candidateId, nowMs)
    case 'create_shotlab_handoff_local':
      return createShotLabHandoffLocal(state, {
        preset: intent.preset,
        imageCount: intent.imageCount,
        sourceImageRequirements: intent.sourceImageRequirements,
        variantNotes: intent.variantNotes,
        nowMs,
      })
    case 'create_seo_packet_local':
      return createSeoPacketLocal(state, nowMs)
    case 'create_draft_payload_local':
      return createDraftPayloadLocal(state, nowMs)
    case 'request_dlv_approval_local':
      return requestDlvApprovalLocal(state, nowMs)
    default: {
      const _exhaustive: never = intent
      return _exhaustive
    }
  }
}

export function validateEtsyRoomPacket(packet: EtsyBaseRoomPacket) {
  return Boolean(
    packet.packetId
    && packet.runId
    && packet.createdAtMs
    && packet.sourceStationId
    && packet.targetStationId
    && packet.status
    && packet.dataOrigin
    && Array.isArray(packet.sourceRecordIds)
    && Array.isArray(packet.evidenceIds)
    && Array.isArray(packet.missingFields)
    && Array.isArray(packet.lockedActions)
    && packet.nextHandoff
    && typeof packet.humanApprovalRequired === 'boolean',
  )
}
