import {





  buildCandidatesFromLocalEvidence,
  buildMetricsFromLocalEvidence,
  buildSupplierLeadsFromLocalEvidence,
  createFallbackLocalEvidenceResult
} from './etsy-evidence-adapter'
import type {EtsyEvidenceCandidateDraft, EtsyEvidenceDataOrigin, EtsyEvidenceQuality, EtsyEvidenceSearchResult, EtsyEvidenceSupplierLeadDraft} from './etsy-evidence-adapter';
import type { OracleSignalPacket } from './oracle-alura'

export type EtsyPipelineStage =
  | 'request'
  | 'candidates'
  | 'metrics'
  | 'suppliers'
  | 'product_truth'
  | 'qa'
  | 'draft'

export type EtsyProductSearchMode = 'niche' | 'exact' | 'style'
export type EtsySupplierSourceType = 'Etsy' | 'AliExpress' | 'Alibaba'
export type EtsySupplierFilter = 'All' | EtsySupplierSourceType
export type EtsyCandidateStatus = 'new' | 'selected' | 'visual_board' | 'sent_to_thoth' | 'rejected'
export type EtsyQaStatus = 'review' | 'approved' | 'rejected'

export type EtsyProductSearchPacket = {
  packetId: string
  requestText: string
  mode: EtsyProductSearchMode
  createdAtMs: number
  status: 'local_created' | 'candidate_selected' | 'sent_to_metrics'
  sourceRecordIds: Array<string>
  keywordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
  fallbackReason?: string
  oracleSignalPacketId?: string
}

export type EtsyProductCandidate = {
  candidateId: string
  packetId: string
  title: string
  niche: string
  signal: string
  tone: string
  tags: Array<string>
  estimatedPrice: string
  status: EtsyCandidateStatus
  sourceRecordIds: Array<string>
  keywordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
  confidence: number
  evidenceCount: number
  sourceLabels: Array<string>
  metricRows: Array<EtsyMetricRow>
  supplierLeadDrafts: Array<EtsySupplierLead>
}

export type EtsyMetricRow = {
  rowId: string
  product: string
  niche: string
  aluraSales: string
  price: string
  competition: 'Low' | 'Medium' | 'High' | 'missing evidence'
  keywordScore: number | null
  status: string
  sourceRecordIds: Array<string>
  keywordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
}

export type EtsyStagedSheetRow = {
  rowId: string
  candidateId: string
  product: string
  keywordScore: number
  status: 'staged_local_only'
  createdAtMs: number
}

export type EtsyMetricPacket = {
  packetId: string
  candidateId: string
  rows: Array<EtsyMetricRow>
  stagedSheetRow?: EtsyStagedSheetRow
  createdAtMs: number
  updatedAtMs: number
}

export type EtsySupplierLead = {
  leadId: string
  candidateId: string
  sourceType: EtsySupplierSourceType
  title: string
  price: string
  matchScore: number
  risk: string
  saved: boolean
  createdAtMs?: number
  sourceRecordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
}

export type EtsyProductTruthPacket = {
  packetId: string
  candidateId: string
  supplierLeadId?: string
  materials: Array<string>
  dimensions: Array<string>
  colors: Array<string>
  variants: Array<string>
  claimsAllowed: Array<string>
  claimsBlocked: Array<string>
  missingEvidence: Array<string>
  verifiedLocally: Array<string>
  unknowns: Array<string>
  evidenceIds: Array<string>
  sourceRecordIds: Array<string>
  dataOrigin: EtsyEvidenceDataOrigin
  evidenceQuality: EtsyEvidenceQuality
  status: 'draft' | 'ready'
  createdAtMs: number
  updatedAtMs: number
}

export type EtsyVisualQaItem = {
  qaItemId: string
  candidateId: string
  label: string
  tone: string
  status: EtsyQaStatus
  issues: Array<string>
}

export type EtsyVisualQaReport = {
  reportId: string
  candidateId: string
  items: Array<EtsyVisualQaItem>
  approvedCount: number
  rejectedCount: number
  summary: string
  createdAtMs: number
}

export type EtsyDraftPacket = {
  draftId: string
  candidateId: string
  title: string
  tags: Array<string>
  descriptionSummary: string
  imageOrder: Array<string>
  attributesMissing: Array<string>
  price: string
  quantity: number
  evidenceSummary: {
    candidateSource: string
    metricSource: string
    supplierSource: string
    truthPacketId?: string
    qaReportId?: string
    lockedLiveActions: Array<string>
  }
  status: 'preview_local_only' | 'waiting_approval'
  createdAtMs: number
}

export type EtsyDraftApprovalPacket = {
  approvalId: string
  candidateId: string
  draftId: string
  status: 'waiting_operator'
  reason: string
  createdAtMs: number
}

export type EtsyPipelineState = {
  stage: EtsyPipelineStage
  searchInput: string
  searchMode: EtsyProductSearchMode
  supplierFilter: EtsySupplierFilter
  oracleSignalPacket?: OracleSignalPacket
  searchPacket?: EtsyProductSearchPacket
  candidates: Array<EtsyProductCandidate>
  selectedCandidateId?: string
  visualBoardCandidateIds: Array<string>
  rejectedCandidateIds: Array<string>
  metricPacket?: EtsyMetricPacket
  supplierLeads: Array<EtsySupplierLead>
  selectedSupplierLeadId?: string
  productTruthPacket?: EtsyProductTruthPacket
  qaItems: Array<EtsyVisualQaItem>
  visualQaReport?: EtsyVisualQaReport
  draftPacket?: EtsyDraftPacket
  draftApprovalPacket?: EtsyDraftApprovalPacket
  lastReceipt?: string
}

const stageOrder: Array<EtsyPipelineStage> = ['request', 'candidates', 'metrics', 'suppliers', 'product_truth', 'qa', 'draft']

const stageLabels: Record<EtsyPipelineStage, string> = {
  request: 'REQUEST',
  candidates: 'CANDIDATES',
  metrics: 'METRICS',
  suppliers: 'SUPPLIERS',
  product_truth: 'TRUTH',
  qa: 'QA',
  draft: 'DRAFT',
}

const nextStationByStage: Record<EtsyPipelineStage, string> = {
  request: 'Product Search',
  candidates: 'SEO & Metrics',
  metrics: 'Source Leads',
  suppliers: 'Source Truth',
  product_truth: 'QA Review',
  qa: 'Draft Approval',
  draft: 'Approval locked',
}

const tones = ['#72e0d4', '#ffc75f', '#ff8b4a', '#9fd5a6', '#8bd8ff']

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 52) || 'local-product'
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function cleanRequest(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function requestKeywords(requestText: string) {
  return cleanRequest(requestText)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !['for', 'the', 'and', 'with'].includes(word))
    .slice(0, 6)
}

function candidateBase(requestText: string) {
  const clean = cleanRequest(requestText)
  return clean ? titleCase(clean) : 'Local Product Idea'
}

function fallbackEvidence(requestText: string) {
  return createFallbackLocalEvidenceResult(requestText)
}

function evidenceLabel(origin: EtsyEvidenceDataOrigin) {
  if (origin === 'local-alura-cache') return 'Oracle local Alura signal'
  if (origin === 'local-product-research') return 'local product research appendix'
  if (origin === 'mixed-local-archive' || origin === 'product-intelligence' || origin === 'seo-db') {
    return 'Fallback mixed local archive — not Oracle/Alura signal'
  }
  if (origin === 'fallback-mock') return 'fallback local mock — no Oracle signal'
  return origin
}

function evidenceFromOracleSignal(packet: OracleSignalPacket): EtsyEvidenceSearchResult {
  const metrics = packet.metrics
  return {
    ok: true,
    query: packet.selectedKeyword,
    dataOrigin: 'local-alura-cache',
    products: [],
    keywords: [{
      id: packet.evidenceIds[0] ?? packet.packetId,
      keyword: packet.selectedKeyword,
      score: metrics.keywordScore,
      searchVolume: metrics.searchVolume,
      competition: metrics.competition,
      avgSales: metrics.avgSales,
      avgPrice: metrics.avgPrice,
      competitionLevel: metrics.competitionLevel,
      currentRoom: 'oracle-signals',
      signalReason: 'Oracle local Alura signal packet',
      rawSourceFile: packet.sourceFile,
      missingFields: packet.missingFields,
    }],
    supplierLinks: [],
    evidenceIds: packet.evidenceIds,
    sourceRecordIds: packet.sourceFilesUsed,
    keywordIds: [packet.evidenceIds[0] ?? packet.packetId],
  }
}

function metricRowsFromDrafts(candidateId: string, drafts: EtsyEvidenceCandidateDraft['metricRows']): Array<EtsyMetricRow> {
  return drafts.map((draft, index) => ({
    rowId: `${candidateId}-metric-${index + 1}`,
    ...draft,
  }))
}

function supplierLeadsFromDrafts(candidateId: string, drafts: Array<EtsyEvidenceSupplierLeadDraft>): Array<EtsySupplierLead> {
  return drafts.map((draft, index) => ({
    leadId: `${candidateId}-source-${index + 1}`,
    candidateId,
    sourceType: draft.sourceType,
    title: draft.title,
    price: draft.price,
    matchScore: draft.matchScore,
    risk: draft.risk,
    saved: false,
    sourceRecordIds: draft.sourceRecordIds,
    evidenceIds: draft.evidenceIds,
    evidenceQuality: draft.evidenceQuality,
    dataOrigin: draft.dataOrigin,
  }))
}

function ensureCandidate(state: EtsyPipelineState) {
  return activeEtsyProductCandidate(state) ?? state.candidates[0]
}

function ensureMetricPacket(state: EtsyPipelineState, nowMs = Date.now()): EtsyMetricPacket | undefined {
  const candidate = ensureCandidate(state)
  if (!candidate) return undefined
  if (state.metricPacket?.candidateId === candidate.candidateId) return state.metricPacket
  return {
    packetId: `metrics-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    rows: createEtsyMetricRows(candidate),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  }
}

export function createInitialEtsyPipelineState(): EtsyPipelineState {
  return {
    stage: 'request',
    searchInput: '',
    searchMode: 'niche',
    supplierFilter: 'All',
    candidates: [],
    visualBoardCandidateIds: [],
    rejectedCandidateIds: [],
    supplierLeads: [],
    qaItems: [],
  }
}

export function etsyPipelineStageLabels() {
  return stageOrder.map((stage) => ({ stage, label: stageLabels[stage] }))
}

export function etsyPipelineStageLabel(stage: EtsyPipelineStage) {
  return stageLabels[stage]
}

export function nextEtsyPipelineStationLabel(stage: EtsyPipelineStage) {
  return nextStationByStage[stage]
}

export function activeEtsyProductCandidate(state: EtsyPipelineState) {
  return state.candidates.find((candidate) => candidate.candidateId === state.selectedCandidateId) ?? null
}

export function activeEtsySupplierLead(state: EtsyPipelineState) {
  return state.supplierLeads.find((lead) => lead.leadId === state.selectedSupplierLeadId) ?? state.supplierLeads[0] ?? null
}

export type EtsyExternalProductSyncInput = {
  candidateId: string
  packetId: string
  title: string
  niche: string
  signal: string
  sourceRecordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
  confidence: number
  sourceLabels: Array<string>
}

export function syncEtsyPipelineToExternalProduct(state: EtsyPipelineState, input: EtsyExternalProductSyncInput): EtsyPipelineState {
  const existingCandidate = state.candidates.find((candidate) => candidate.candidateId === input.candidateId)
  const candidate: EtsyProductCandidate = {
    candidateId: input.candidateId,
    packetId: input.packetId,
    title: input.title,
    niche: input.niche,
    signal: input.signal,
    tone: existingCandidate?.tone ?? '#72e0d4',
    tags: existingCandidate?.tags ?? [],
    estimatedPrice: existingCandidate?.estimatedPrice ?? 'not verified',
    status: 'selected',
    sourceRecordIds: input.sourceRecordIds,
    keywordIds: existingCandidate?.keywordIds ?? [],
    evidenceIds: input.evidenceIds,
    evidenceQuality: input.evidenceQuality,
    dataOrigin: input.dataOrigin,
    confidence: input.confidence,
    evidenceCount: input.evidenceIds.length,
    sourceLabels: input.sourceLabels,
    metricRows: existingCandidate?.metricRows ?? [],
    supplierLeadDrafts: existingCandidate?.supplierLeadDrafts ?? [],
  }
  const supplierLeads = state.supplierLeads.filter((lead) => lead.candidateId === input.candidateId)
  const selectedSupplierLeadId = supplierLeads.some((lead) => lead.leadId === state.selectedSupplierLeadId)
    ? state.selectedSupplierLeadId
    : supplierLeads[0]?.leadId
  const metricPacket = state.metricPacket?.candidateId === input.candidateId ? state.metricPacket : undefined
  const productTruthPacket = state.productTruthPacket?.candidateId === input.candidateId ? state.productTruthPacket : undefined
  const qaItems = state.qaItems.filter((item) => item.candidateId === input.candidateId)
  const visualQaReport = state.visualQaReport?.candidateId === input.candidateId ? state.visualQaReport : undefined
  const draftPacket = state.draftPacket?.candidateId === input.candidateId ? state.draftPacket : undefined
  const draftApprovalPacket = state.draftApprovalPacket?.candidateId === input.candidateId ? state.draftApprovalPacket : undefined
  const stage: EtsyPipelineStage = draftPacket
    ? 'draft'
    : visualQaReport || qaItems.length
      ? 'qa'
      : productTruthPacket
        ? 'product_truth'
        : supplierLeads.length
          ? 'suppliers'
          : metricPacket
            ? 'metrics'
            : 'candidates'

  return {
    ...state,
    stage,
    oracleSignalPacket: state.searchPacket?.packetId === input.packetId ? state.oracleSignalPacket : undefined,
    searchPacket: state.searchPacket?.packetId === input.packetId ? state.searchPacket : undefined,
    candidates: [candidate, ...state.candidates
      .filter((item) => item.candidateId !== input.candidateId)
      .map((item) => ({ ...item, status: item.status === 'selected' ? 'new' : item.status }))],
    selectedCandidateId: input.candidateId,
    visualBoardCandidateIds: state.visualBoardCandidateIds.filter((candidateId) => candidateId === input.candidateId),
    metricPacket,
    supplierLeads,
    selectedSupplierLeadId,
    productTruthPacket,
    qaItems,
    visualQaReport,
    draftPacket,
    draftApprovalPacket,
    lastReceipt: `${input.title} synchronized as the only active product scope. Unrelated downstream packets were removed.`,
  }
}

export function visibleEtsySupplierLeads(state: EtsyPipelineState) {
  const candidate = ensureCandidate(state)
  if (!candidate) return []
  const saved = state.supplierLeads.filter((lead) => lead.candidateId === candidate.candidateId)
  const knownIds = new Set(saved.map((lead) => lead.leadId))
  const candidates = createEtsySupplierCandidates(candidate).filter((lead) => !knownIds.has(lead.leadId))
  const merged = [...saved, ...candidates]
  return state.supplierFilter === 'All'
    ? merged
    : merged.filter((lead) => lead.sourceType === state.supplierFilter)
}

export function setEtsySearchInput(state: EtsyPipelineState, searchInput: string): EtsyPipelineState {
  return { ...state, searchInput }
}

export function setEtsySearchMode(state: EtsyPipelineState, searchMode: EtsyProductSearchMode): EtsyPipelineState {
  return { ...state, searchMode }
}

export function setEtsySupplierFilter(state: EtsyPipelineState, supplierFilter: EtsySupplierFilter): EtsyPipelineState {
  return { ...state, supplierFilter }
}

export function createEtsyProductSearchPacket(
  state: EtsyPipelineState,
  input: { requestText: string; mode: EtsyProductSearchMode; nowMs?: number; evidence?: EtsyEvidenceSearchResult; oracleSignalPacket?: OracleSignalPacket },
): EtsyPipelineState {
  const nowMs = input.nowMs ?? Date.now()
  const requestText = cleanRequest(input.requestText) || 'local Etsy product idea'
  const oracleSignalPacket = input.oracleSignalPacket ?? state.oracleSignalPacket
  const evidence = input.evidence ?? (oracleSignalPacket ? evidenceFromOracleSignal(oracleSignalPacket) : fallbackEvidence(requestText))
  const packetId = `search-${slugify(requestText)}-${nowMs}`
  const searchPacket: EtsyProductSearchPacket = {
    packetId,
    requestText,
    mode: input.mode,
    createdAtMs: nowMs,
    status: 'local_created',
    sourceRecordIds: evidence.sourceRecordIds,
    keywordIds: evidence.keywordIds,
    evidenceIds: evidence.evidenceIds,
    evidenceQuality: evidence.dataOrigin === 'fallback-mock' ? 'fallback-local-mock' : evidence.evidenceIds.length >= 4 ? 'verified-local' : evidence.evidenceIds.length ? 'partial-local' : 'missing-evidence',
    dataOrigin: evidence.dataOrigin,
    fallbackReason: evidence.fallbackReason,
    oracleSignalPacketId: oracleSignalPacket?.packetId,
  }
  return {
    ...state,
    stage: 'candidates',
    searchInput: requestText,
    searchMode: input.mode,
    searchPacket,
    candidates: createEtsyCandidatesFromRequest(requestText, packetId, evidence),
    selectedCandidateId: undefined,
    visualBoardCandidateIds: [],
    rejectedCandidateIds: [],
    metricPacket: undefined,
    supplierLeads: [],
    selectedSupplierLeadId: undefined,
    productTruthPacket: undefined,
    qaItems: [],
    visualQaReport: undefined,
    draftPacket: undefined,
    draftApprovalPacket: undefined,
    lastReceipt: evidence.dataOrigin === 'fallback-mock'
      ? 'Oracle Product Search required. No fallback product cards were created from manual text.'
      : `Local search packet created from ${evidenceLabel(evidence.dataOrigin)}. Select a candidate to continue.`,
  }
}

export function applyOracleSignalToEtsyPipeline(state: EtsyPipelineState, packet: OracleSignalPacket, nowMs = Date.now()): EtsyPipelineState {
  return createEtsyProductSearchPacket(
    { ...state, oracleSignalPacket: packet },
    {
      requestText: packet.selectedKeyword,
      mode: 'exact',
      nowMs,
      oracleSignalPacket: packet,
    },
  )
}

export function createEtsyCandidatesFromRequest(requestText: string, packetId = `search-${slugify(requestText)}`, evidence = fallbackEvidence(requestText)): Array<EtsyProductCandidate> {
  const evidenceCandidates = buildCandidatesFromLocalEvidence(requestText, evidence)
  if (evidenceCandidates.length) {
    return evidenceCandidates.map((candidate, index) => {
      const candidateId = `${packetId}-candidate-${index + 1}`
      return {
        candidateId,
        packetId,
        title: candidate.title,
        niche: candidate.niche,
        signal: candidate.signal,
        tone: tones[index % tones.length],
        tags: candidate.tags,
        estimatedPrice: candidate.estimatedPrice,
        status: 'new',
        sourceRecordIds: candidate.sourceRecordIds,
        keywordIds: candidate.keywordIds,
        evidenceIds: candidate.evidenceIds,
        evidenceQuality: candidate.evidenceQuality,
        dataOrigin: candidate.dataOrigin,
        confidence: candidate.confidence,
        evidenceCount: candidate.evidenceCount,
        sourceLabels: candidate.sourceLabels,
        metricRows: metricRowsFromDrafts(candidateId, buildMetricsFromLocalEvidence(candidate)),
        supplierLeadDrafts: supplierLeadsFromDrafts(candidateId, buildSupplierLeadsFromLocalEvidence(candidate)),
      }
    })
  }
  const base = candidateBase(requestText)
  if (evidence.dataOrigin === 'fallback-mock') {
    return []
  }
  const keywords = requestKeywords(requestText)
  const subject = keywords.slice(0, 3).join(' ') || 'product'
  const niche = keywords.includes('gift') || keywords.includes('gifts') ? 'giftable jewelry' : keywords.includes('necklace') ? 'necklace niche' : 'etsy product niche'
  const variants = [
    `${base} Gift Set`,
    `Personalized ${titleCase(subject)}`,
    `Minimal ${base}`,
    `Boutique ${base} Bundle`,
    `${base} Premium Mockup Concept`,
  ]
  return variants.slice(0, 5).map((title, index) => ({
    candidateId: `${packetId}-candidate-${index + 1}`,
    packetId,
    title,
    niche: index === 0 ? niche : index === 1 ? 'personalized gift angle' : index === 2 ? 'minimal everyday style' : index === 3 ? 'bundle / upsell angle' : 'visual testing angle',
    signal: index === 0 ? 'Strong gift intent' : index === 1 ? 'Personalization hook' : index === 2 ? 'Clean SEO fit' : index === 3 ? 'Margin bundle test' : 'Needs proof before media',
    tone: tones[index % tones.length],
    tags: [...keywords, index === 1 ? 'personalized' : index === 3 ? 'bundle' : 'etsy'].slice(0, 6),
    estimatedPrice: index === 3 ? '$28-42' : index === 4 ? '$22-35' : '$18-32',
    status: 'new',
    sourceRecordIds: [],
    keywordIds: [],
    evidenceIds: [],
    evidenceQuality: 'fallback-local-mock',
    dataOrigin: 'fallback-mock',
    confidence: 35 + index * 4,
    evidenceCount: 0,
    sourceLabels: ['fallback local mock — no evidence match'],
    metricRows: [],
    supplierLeadDrafts: [],
  }))
}

export function selectEtsyCandidate(state: EtsyPipelineState, candidateId: string): EtsyPipelineState {
  const candidate = state.candidates.find((item) => item.candidateId === candidateId)
  if (!candidate) return state
  return {
    ...state,
    stage: state.stage === 'request' ? 'candidates' : state.stage,
    selectedCandidateId: candidateId,
    searchPacket: state.searchPacket ? { ...state.searchPacket, status: 'candidate_selected' } : state.searchPacket,
    candidates: state.candidates.map((item) => ({
      ...item,
      status: item.candidateId === candidateId ? 'selected' : item.status === 'selected' ? 'new' : item.status,
    })),
    lastReceipt: `${candidate.title} selected as the active local product packet.`,
  }
}

export function addEtsyCandidateToVisualBoard(state: EtsyPipelineState, candidateId: string): EtsyPipelineState {
  const selected = selectEtsyCandidate(state, candidateId)
  return {
    ...selected,
    visualBoardCandidateIds: Array.from(new Set([...selected.visualBoardCandidateIds, candidateId])),
    candidates: selected.candidates.map((item) => item.candidateId === candidateId ? { ...item, status: 'visual_board' } : item),
    lastReceipt: 'Candidate added to the local visual board.',
  }
}

export function sendEtsyCandidateToThoth(state: EtsyPipelineState, candidateId: string, nowMs = Date.now()): EtsyPipelineState {
  const selected = selectEtsyCandidate(state, candidateId)
  const candidate = activeEtsyProductCandidate(selected)
  if (!candidate) return selected
  const metricPacket = ensureMetricPacket(selected, nowMs)
  return {
    ...selected,
    stage: 'metrics',
    searchPacket: selected.searchPacket ? { ...selected.searchPacket, status: 'sent_to_metrics' } : selected.searchPacket,
    candidates: selected.candidates.map((item) => item.candidateId === candidateId ? { ...item, status: 'sent_to_thoth' } : item),
    metricPacket,
    lastReceipt: `${candidate.title} sent to Thor for local metric staging.`,
  }
}

export function rejectEtsyCandidate(state: EtsyPipelineState, candidateId: string): EtsyPipelineState {
  const candidate = state.candidates.find((item) => item.candidateId === candidateId)
  const rejectedActiveCandidate = state.selectedCandidateId === candidateId
  return {
    ...state,
    selectedCandidateId: rejectedActiveCandidate ? undefined : state.selectedCandidateId,
    visualBoardCandidateIds: state.visualBoardCandidateIds.filter((id) => id !== candidateId),
    rejectedCandidateIds: Array.from(new Set([...state.rejectedCandidateIds, candidateId])),
    candidates: state.candidates.filter((item) => item.candidateId !== candidateId),
    metricPacket: rejectedActiveCandidate && state.metricPacket?.candidateId === candidateId ? undefined : state.metricPacket,
    supplierLeads: state.supplierLeads.filter((lead) => lead.candidateId !== candidateId),
    selectedSupplierLeadId: rejectedActiveCandidate ? undefined : state.selectedSupplierLeadId,
    productTruthPacket: rejectedActiveCandidate && state.productTruthPacket?.candidateId === candidateId ? undefined : state.productTruthPacket,
    qaItems: state.qaItems.filter((item) => item.candidateId !== candidateId),
    visualQaReport: rejectedActiveCandidate && state.visualQaReport?.candidateId === candidateId ? undefined : state.visualQaReport,
    draftPacket: rejectedActiveCandidate && state.draftPacket?.candidateId === candidateId ? undefined : state.draftPacket,
    draftApprovalPacket: rejectedActiveCandidate && state.draftApprovalPacket?.candidateId === candidateId ? undefined : state.draftApprovalPacket,
    lastReceipt: candidate ? `${candidate.title} rejected and deleted from local staging.` : 'Candidate was already removed from local staging.',
  }
}

export function createEtsyMetricRows(candidate: EtsyProductCandidate): Array<EtsyMetricRow> {
  if (candidate.metricRows.length) return candidate.metricRows
  return [
    {
      rowId: `${candidate.candidateId}-demand`,
      product: candidate.title,
      niche: candidate.niche,
      aluraSales: 'local mock 1.4k',
      price: candidate.estimatedPrice,
      competition: 'Medium',
      keywordScore: Math.min(94, 72 + candidate.tags.length * 3),
      status: 'active candidate',
      sourceRecordIds: candidate.sourceRecordIds,
      keywordIds: candidate.keywordIds,
      evidenceIds: candidate.evidenceIds,
      evidenceQuality: candidate.evidenceQuality,
      dataOrigin: candidate.dataOrigin,
    },
    {
      rowId: `${candidate.candidateId}-gift`,
      product: `${candidate.title} gift angle`,
      niche: 'gift buyer intent',
      aluraSales: 'local mock 860',
      price: '$20-36',
      competition: 'High',
      keywordScore: Math.min(90, 66 + candidate.tags.length * 2),
      status: 'needs supplier proof',
      sourceRecordIds: candidate.sourceRecordIds,
      keywordIds: candidate.keywordIds,
      evidenceIds: candidate.evidenceIds,
      evidenceQuality: candidate.evidenceQuality,
      dataOrigin: candidate.dataOrigin,
    },
    {
      rowId: `${candidate.candidateId}-seo`,
      product: `${candidate.title} SEO variant`,
      niche: candidate.tags.slice(0, 3).join(' / ') || 'keyword cluster',
      aluraSales: 'local mock 540',
      price: candidate.estimatedPrice,
      competition: 'Low',
      keywordScore: Math.min(88, 70 + candidate.title.length % 12),
      status: 'sheet row candidate',
      sourceRecordIds: candidate.sourceRecordIds,
      keywordIds: candidate.keywordIds,
      evidenceIds: candidate.evidenceIds,
      evidenceQuality: candidate.evidenceQuality,
      dataOrigin: candidate.dataOrigin,
    },
  ]
}

export function stageEtsySheetRowLocally(state: EtsyPipelineState, nowMs = Date.now()): EtsyPipelineState {
  const metricPacket = ensureMetricPacket(state, nowMs)
  const candidate = ensureCandidate(state)
  if (!metricPacket || !candidate) return { ...state, lastReceipt: 'Select a candidate before staging a sheet row.' }
  const strongest = [...metricPacket.rows].sort((a, b) => (b.keywordScore ?? -1) - (a.keywordScore ?? -1))[0]
  const stagedSheetRow: EtsyStagedSheetRow = {
    rowId: `sheet-row-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    product: candidate.title,
    keywordScore: strongest?.keywordScore ?? 0,
    status: 'staged_local_only',
    createdAtMs: nowMs,
  }
  return {
    ...state,
    stage: 'suppliers',
    metricPacket: { ...metricPacket, stagedSheetRow, updatedAtMs: nowMs },
    lastReceipt: 'Metrics staged locally. Google Sheets remains locked.',
  }
}

export function createEtsySupplierCandidates(candidate: EtsyProductCandidate): Array<EtsySupplierLead> {
  return candidate.supplierLeadDrafts
}

export function saveEtsySupplierLead(state: EtsyPipelineState, lead: EtsySupplierLead, nowMs = Date.now()): EtsyPipelineState {
  const savedLead: EtsySupplierLead = { ...lead, saved: true, createdAtMs: nowMs }
  return {
    ...state,
    stage: 'suppliers',
    supplierLeads: [
      ...state.supplierLeads.filter((candidate) => candidate.leadId !== savedLead.leadId),
      savedLead,
    ],
    selectedSupplierLeadId: savedLead.leadId,
    lastReceipt: `${savedLead.sourceType} source lead saved locally.`,
  }
}

export function sendEtsySupplierLeadToAnubis(state: EtsyPipelineState, lead: EtsySupplierLead, nowMs = Date.now()): EtsyPipelineState {
  const saved = saveEtsySupplierLead(state, lead, nowMs)
  return {
    ...saved,
    stage: 'product_truth',
    lastReceipt: 'Supplier lead sent to Thor for local product truth.',
  }
}

export const etsyTruthFields = [
  'Materials',
  'Dimensions',
  'Colors',
  'Variants',
  'Source evidence',
  'Claims allowed',
  'Claims blocked',
] as const

export type EtsyTruthField = typeof etsyTruthFields[number]

function defaultTruthPacket(state: EtsyPipelineState, nowMs = Date.now()): EtsyProductTruthPacket | undefined {
  const candidate = ensureCandidate(state)
  if (!candidate) return undefined
  const lead = activeEtsySupplierLead(state)
  const hasSupplierEvidence = Boolean(lead?.evidenceIds.length)
  const hasMetricEvidence = Boolean(candidate.metricRows.some((row) => row.evidenceQuality !== 'missing-evidence' && row.evidenceQuality !== 'fallback-local-mock'))
  const verifiedLocally = [
    candidate.evidenceIds.length ? 'candidate evidence id linked' : '',
    hasMetricEvidence ? 'metric/keyword evidence linked' : '',
    hasSupplierEvidence ? 'supplier lead evidence linked' : '',
  ].filter(Boolean)
  const unknowns = [
    'exact materials',
    'exact dimensions',
    hasSupplierEvidence ? '' : 'source evidence',
    'claim permissions',
  ].filter(Boolean)
  const missingEvidence = [
    'Materials',
    'Dimensions',
    hasSupplierEvidence ? '' : 'Source evidence',
    'Claims allowed',
  ].filter(Boolean)
  return {
    packetId: `truth-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    supplierLeadId: lead?.leadId,
    materials: ['gold-tone finish', 'supplier proof required'],
    dimensions: ['exact dimensions missing'],
    colors: ['gold', 'custom variant pending'],
    variants: candidate.tags.includes('personalized') ? ['initial letters', 'gift packaging'] : ['primary style', 'variant proof pending'],
    claimsAllowed: ['giftable', 'minimal style', 'personalized if source supports variants'],
    claimsBlocked: ['hypoallergenic', 'waterproof', 'handmade', 'solid gold'],
    missingEvidence,
    verifiedLocally,
    unknowns,
    evidenceIds: Array.from(new Set([...candidate.evidenceIds, ...(lead?.evidenceIds ?? [])])),
    sourceRecordIds: Array.from(new Set([...candidate.sourceRecordIds, ...(lead?.sourceRecordIds ?? [])])),
    dataOrigin: lead?.dataOrigin ?? candidate.dataOrigin,
    evidenceQuality: hasSupplierEvidence && hasMetricEvidence ? 'verified-local' : candidate.evidenceQuality === 'fallback-local-mock' ? 'fallback-local-mock' : 'partial-local',
    status: 'draft',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  }
}

export function toggleEtsyTruthField(state: EtsyPipelineState, field: EtsyTruthField, checked: boolean, nowMs = Date.now()): EtsyPipelineState {
  const packet = state.productTruthPacket ?? defaultTruthPacket(state, nowMs)
  if (!packet) return state
  const missingEvidence = checked
    ? packet.missingEvidence.filter((item) => item !== field)
    : Array.from(new Set([...packet.missingEvidence, field]))
  return {
    ...state,
    stage: 'product_truth',
    productTruthPacket: { ...packet, missingEvidence, updatedAtMs: nowMs },
    lastReceipt: 'Product truth checklist updated locally.',
  }
}

export function createEtsyProductTruthPacket(state: EtsyPipelineState, nowMs = Date.now()): EtsyPipelineState {
  const packet = state.productTruthPacket ?? defaultTruthPacket(state, nowMs)
  if (!packet) return { ...state, lastReceipt: 'Select a product before creating a truth packet.' }
  const readyPacket = {
    ...packet,
    status: 'ready' as const,
    updatedAtMs: nowMs,
  }
  return {
    ...state,
    stage: 'qa',
    productTruthPacket: readyPacket,
    qaItems: state.qaItems.length ? state.qaItems : createEtsyQaItems(state, readyPacket),
    lastReceipt: 'Product Truth Packet created locally.',
  }
}

export function createEtsyQaItems(state: EtsyPipelineState, packet = state.productTruthPacket): Array<EtsyVisualQaItem> {
  const candidate = ensureCandidate(state)
  if (!candidate || !packet) return []
  return [
    { qaItemId: `${candidate.candidateId}-hero`, candidateId: candidate.candidateId, label: `${candidate.title} hero image`, tone: '#72e0d4', status: 'review', issues: [] },
    { qaItemId: `${candidate.candidateId}-variant`, candidateId: candidate.candidateId, label: 'Variant proof image', tone: '#ffc75f', status: packet.missingEvidence.includes('Variants') ? 'rejected' : 'review', issues: packet.missingEvidence.includes('Variants') ? ['bad variant'] : [] },
    { qaItemId: `${candidate.candidateId}-scale`, candidateId: candidate.candidateId, label: 'Scale and dimensions image', tone: '#ff8b4a', status: 'review', issues: packet.missingEvidence.includes('Dimensions') ? ['claim risk'] : [] },
    { qaItemId: `${candidate.candidateId}-text`, candidateId: candidate.candidateId, label: 'Text safety crop', tone: '#8bd8ff', status: 'review', issues: ['fake text'] },
  ]
}

export function updateEtsyQaItemStatus(state: EtsyPipelineState, qaItemId: string, status: EtsyQaStatus): EtsyPipelineState {
  const items = state.qaItems.length ? state.qaItems : createEtsyQaItems(state)
  return {
    ...state,
    stage: 'qa',
    qaItems: items.map((item) => item.qaItemId === qaItemId ? { ...item, status } : item),
    lastReceipt: `QA item marked ${status} locally.`,
  }
}

export function createEtsyVisualQaReport(state: EtsyPipelineState, nowMs = Date.now()): EtsyPipelineState {
  const candidate = ensureCandidate(state)
  const items = state.qaItems.length ? state.qaItems : createEtsyQaItems(state)
  if (!candidate || !items.length) return { ...state, lastReceipt: 'Create a product truth packet before QA.' }
  const approvedCount = items.filter((item) => item.status === 'approved').length
  const rejectedCount = items.filter((item) => item.status === 'rejected').length
  const report: EtsyVisualQaReport = {
    reportId: `qa-report-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    items,
    approvedCount,
    rejectedCount,
    summary: `${approvedCount} approved, ${rejectedCount} rejected, ${items.length - approvedCount - rejectedCount} still in review.`,
    createdAtMs: nowMs,
  }
  return {
    ...state,
    stage: 'draft',
    qaItems: items,
    visualQaReport: report,
    lastReceipt: 'Visual QA report created locally.',
  }
}

export function buildEtsyDraftPreview(state: EtsyPipelineState, nowMs = Date.now()): EtsyDraftPacket | undefined {
  const candidate = ensureCandidate(state)
  if (!candidate) return undefined
  const truth = state.productTruthPacket
  const qa = state.visualQaReport
  const lead = activeEtsySupplierLead(state)
  const missing = [
    ...(truth?.missingEvidence ?? ['materials proof', 'dimensions proof']),
    ...(qa && qa.rejectedCount > 0 ? ['QA rejected images need replacement'] : []),
  ]
  return {
    draftId: `draft-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    title: `${candidate.title} | Personalized Gift Ready Listing`,
    tags: Array.from(new Set([...candidate.tags, 'gift', 'minimal jewelry', 'custom'])).slice(0, 8),
    descriptionSummary: `${candidate.title} draft based on local candidate, metric, supplier, truth, and QA packets. Live upload remains locked.`,
    imageOrder: state.qaItems.length ? state.qaItems.map((item) => item.label) : ['Hero placeholder', 'Variant placeholder', 'Scale placeholder'],
    attributesMissing: missing.length ? missing : ['final SKU', 'shipping profile'],
    price: candidate.estimatedPrice.replace('$', '₪'),
    quantity: 1,
    evidenceSummary: {
      candidateSource: `${candidate.dataOrigin} · ${candidate.evidenceQuality} · ${candidate.evidenceCount} evidence ids`,
      metricSource: state.metricPacket?.rows.some((row) => row.evidenceQuality !== 'fallback-local-mock')
        ? 'local evidence metrics linked'
        : 'missing evidence / fallback metrics only',
      supplierSource: lead ? `${lead.sourceType} · ${lead.dataOrigin} · ${lead.evidenceQuality}` : 'no saved supplier evidence',
      truthPacketId: truth?.packetId,
      qaReportId: qa?.reportId,
      lockedLiveActions: ['Etsy upload', 'Etsy publish', 'supplier messaging', 'Google Sheets sync', 'ShotLab generation'],
    },
    status: state.draftApprovalPacket ? 'waiting_approval' : 'preview_local_only',
    createdAtMs: nowMs,
  }
}

export function createEtsyDraftApprovalPacket(state: EtsyPipelineState, nowMs = Date.now()): EtsyPipelineState {
  const draftPacket = buildEtsyDraftPreview(state, nowMs)
  const candidate = ensureCandidate(state)
  if (!draftPacket || !candidate) return { ...state, lastReceipt: 'Select a product before creating a draft approval packet.' }
  const waitingDraft = { ...draftPacket, status: 'waiting_approval' as const }
  return {
    ...state,
    stage: 'draft',
    draftPacket: waitingDraft,
    draftApprovalPacket: {
      approvalId: `draft-approval-${candidate.candidateId}`,
      candidateId: candidate.candidateId,
      draftId: waitingDraft.draftId,
      status: 'waiting_operator',
      reason: `${candidate.title} draft is waiting for local operator approval. Upload and publish remain locked.`,
      createdAtMs: nowMs,
    },
    lastReceipt: 'Draft approval packet created locally. Upload and publish remain locked.',
  }
}
