import type { EtsyPipelineState, EtsyProductCandidate as PipelineCandidate } from './etsy-pipeline'
import type { EtsyRoomState, EtsyProductCandidate as RoomCandidate } from './etsy-room-contracts'
import type { EtsyMarketLabStationId } from './etsy-station-apps'
import type { EtsyLiveSourceDetail } from './etsy-live-research'

export type EtsyProductMissionStageId = 'intake' | 'truth' | 'images' | 'seo' | 'draft' | 'approval'
export type EtsyProductMissionStageStatus = 'complete' | 'ready' | 'waiting' | 'blocked'
export type EtsyProductMissionActionId =
  | 'select-product'
  | 'start-truth'
  | 'start-images'
  | 'start-seo'
  | 'prepare-draft'
  | 'request-approval'
  | 'review-approval'

export type EtsyProductMissionStage = {
  id: EtsyProductMissionStageId
  label: string
  operator: string
  stationId: EtsyMarketLabStationId
  status: EtsyProductMissionStageStatus
  receipt: string
}

export type EtsyProductMissionAction = {
  id: EtsyProductMissionActionId
  label: string
  targetStationId: EtsyMarketLabStationId
  enabled: boolean
  blocker?: string
}

export type EtsyProductMissionRow = {
  id: string
  packetId: string
  title: string
  niche: string
  origin: string
  selected: boolean
  currentStageId: EtsyProductMissionStageId
  progressPercent: number
  stages: Array<EtsyProductMissionStage>
  nextAction: EtsyProductMissionAction
  warnings: Array<string>
  hasBlockingError: boolean
  imageRefs: Array<string>
  thumbnailRef?: string
  score: number | null
  sourceDetails: Array<EtsyLiveSourceDetail>
  variantOptions: Array<string>
}

export type EtsyProductMissionListModel = {
  rows: Array<EtsyProductMissionRow>
  selectedMissionId?: string
  emptyState: 'waiting-for-intake' | 'ready'
  summary: {
    total: number
    active: number
    waitingApproval: number
    warnings: number
  }
}

const stageDefinitions: Array<Omit<EtsyProductMissionStage, 'status' | 'receipt'>> = [
  { id: 'intake', label: 'Intake', operator: 'Loki', stationId: 'etsy-loki-product-hunt' },
  { id: 'truth', label: 'Truth', operator: 'Thor', stationId: 'etsy-thor-source-truth' },
  { id: 'images', label: 'Images', operator: 'Thor · ShotLab', stationId: 'etsy-thor-shotlab-prep' },
  { id: 'seo', label: 'SEO', operator: 'Thor', stationId: 'etsy-thor-seo-metrics' },
  { id: 'draft', label: 'Draft', operator: 'Odin', stationId: 'etsy-odin-draft-approval' },
  { id: 'approval', label: 'Approval', operator: 'DLV', stationId: 'etsy-odin-draft-approval' },
]

function uniqueWarnings(values: Array<string | undefined>) {
  const seen = new Set<string>()
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function stringArray(value: unknown): Array<string> {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function pipelineCandidateToRoomShape(candidate: PipelineCandidate): RoomCandidate {
  return {
    candidateId: candidate.candidateId,
    packetId: candidate.packetId,
    runId: candidate.packetId,
    title: candidate.title,
    niche: candidate.niche,
    score: candidate.confidence,
    sourceType: 'Smart intake local',
    dataOrigin: 'smart-intake-local',
    sourceRecordIds: candidate.sourceRecordIds,
    imageRefs: [],
    evidenceIds: candidate.evidenceIds,
    missingFields: candidate.evidenceQuality === 'verified-local' ? [] : ['source truth verification'],
    riskNotes: candidate.evidenceQuality === 'verified-local' ? [] : [`Evidence quality: ${candidate.evidenceQuality}`],
    nextHandoff: 'select_etsy_candidate_local',
    selected: candidate.status === 'selected',
  }
}

function missionCandidates(roomState: EtsyRoomState, pipeline: EtsyPipelineState) {
  const rows = [...roomState.candidates]
  const knownIds = new Set(rows.map((candidate) => candidate.candidateId))
  for (const candidate of pipeline.candidates) {
    if (knownIds.has(candidate.candidateId)) continue
    rows.push(pipelineCandidateToRoomShape(candidate))
    knownIds.add(candidate.candidateId)
  }
  const selected = roomState.selectedProductPacket
  if (selected && !knownIds.has(selected.selectedCandidateId)) {
    rows.push({
      candidateId: selected.selectedCandidateId,
      packetId: selected.sourcePacketId,
      runId: selected.runId,
      title: selected.selectedProductTitle,
      niche: 'selected product packet',
      score: null,
      sourceType: 'Smart intake local',
      dataOrigin: selected.dataOrigin,
      sourceRecordIds: selected.sourceRecordIds,
      imageRefs: selected.imageRefs,
      thumbnailRef: selected.thumbnailRef,
      evidenceIds: selected.evidenceIds,
      missingFields: selected.missingFields,
      riskNotes: selected.riskFlags,
      nextHandoff: 'select_etsy_candidate_local',
      selected: true,
    })
  }
  return rows
}

function stageReceipt(input: {
  stageId: EtsyProductMissionStageId
  complete: boolean
  selected: boolean
  roomState: EtsyRoomState
  pipeline: EtsyPipelineState
}) {
  const { stageId, complete, selected, roomState, pipeline } = input
  if (!selected && stageId !== 'intake') return 'Select product to enter this stage'
  if (stageId === 'intake') return complete ? 'Product packet received' : 'Waiting for external intake'
  if (stageId === 'truth') return complete ? `${pipeline.productTruthPacket?.evidenceIds.length ?? 0} evidence links · truth packet ready` : 'Manual truth review required'
  if (stageId === 'images') return complete ? `${roomState.shotLabHandoffPacket?.imageCount ?? 0} image handoff slots · local packet ready` : 'Manual ShotLab handoff required'
  if (stageId === 'seo') return complete ? `${roomState.seoPacket?.tagCandidates.length ?? 0} tag candidates · local packet ready` : 'Manual SEO start required'
  if (stageId === 'draft') return complete ? 'Local draft payload ready' : 'Manual draft preparation required'
  return roomState.approvalPacket ? 'Waiting for DLV decision' : 'Manual approval request required'
}

function currentStage(input: {
  selected: boolean
  truthComplete: boolean
  imagesComplete: boolean
  seoComplete: boolean
  draftComplete: boolean
}): EtsyProductMissionStageId {
  if (!input.selected) return 'intake'
  if (!input.truthComplete) return 'truth'
  if (!input.imagesComplete) return 'images'
  if (!input.seoComplete) return 'seo'
  if (!input.draftComplete) return 'draft'
  return 'approval'
}

function nextAction(input: {
  candidateId: string
  selected: boolean
  pipelineScoped: boolean
  selectedPacketReady: boolean
  truthComplete: boolean
  imagesComplete: boolean
  seoComplete: boolean
  draftComplete: boolean
  approvalWaiting: boolean
}): EtsyProductMissionAction {
  if (!input.selected) {
    return { id: 'select-product', label: 'Select product', targetStationId: 'etsy-loki-product-hunt', enabled: Boolean(input.candidateId) }
  }
  if (!input.truthComplete) {
    return {
      id: 'start-truth',
      label: 'Start Truth',
      targetStationId: 'etsy-thor-source-truth',
      enabled: input.pipelineScoped,
      blocker: input.pipelineScoped ? undefined : 'Waiting for the selected packet to synchronize into the local truth pipeline.',
    }
  }
  if (!input.imagesComplete) {
    return {
      id: 'start-images',
      label: 'Start Images',
      targetStationId: 'etsy-thor-shotlab-prep',
      enabled: input.selectedPacketReady,
      blocker: input.selectedPacketReady ? undefined : 'Selected Product Packet is required before ShotLab prep.',
    }
  }
  if (!input.seoComplete) {
    return { id: 'start-seo', label: 'Start SEO', targetStationId: 'etsy-thor-seo-metrics', enabled: input.imagesComplete }
  }
  if (!input.draftComplete) {
    return { id: 'prepare-draft', label: 'Prepare Draft', targetStationId: 'etsy-odin-draft-approval', enabled: true }
  }
  if (!input.approvalWaiting) {
    return { id: 'request-approval', label: 'Request Approval', targetStationId: 'etsy-odin-draft-approval', enabled: true }
  }
  return { id: 'review-approval', label: 'Review Approval', targetStationId: 'etsy-odin-draft-approval', enabled: true }
}

function buildMissionRow(candidate: RoomCandidate, roomState: EtsyRoomState, pipeline: EtsyPipelineState): EtsyProductMissionRow {
  const selected = candidate.candidateId === roomState.selectedCandidateId
    || candidate.candidateId === roomState.selectedProductPacket?.selectedCandidateId
    || candidate.candidateId === pipeline.selectedCandidateId
  const roomScoped = selected && roomState.selectedProductPacket?.selectedCandidateId === candidate.candidateId
  const pipelineScoped = selected && pipeline.selectedCandidateId === candidate.candidateId
  const truthComplete = Boolean(pipelineScoped && pipeline.productTruthPacket?.candidateId === candidate.candidateId && pipeline.productTruthPacket.status === 'ready')
  const imagesComplete = Boolean(roomScoped && roomState.shotLabHandoffPacket)
  const seoComplete = Boolean(roomScoped && roomState.seoPacket)
  const draftComplete = Boolean(roomScoped && roomState.draftPayload)
  const approvalWaiting = Boolean(roomScoped && roomState.approvalPacket)
  const activeStageId = currentStage({ selected, truthComplete, imagesComplete, seoComplete, draftComplete })
  const completion = {
    intake: true,
    truth: truthComplete,
    images: imagesComplete,
    seo: seoComplete,
    draft: draftComplete,
    approval: false,
  } satisfies Record<EtsyProductMissionStageId, boolean>
  const action = nextAction({
    candidateId: candidate.candidateId,
    selected,
    pipelineScoped,
    selectedPacketReady: roomScoped,
    truthComplete,
    imagesComplete,
    seoComplete,
    draftComplete,
    approvalWaiting,
  })
  const stages = stageDefinitions.map<EtsyProductMissionStage>((stage) => {
    const isApprovalWaiting = stage.id === 'approval' && approvalWaiting
    const isCurrent = stage.id === activeStageId
    const blocked = isCurrent && !action.enabled
    const status: EtsyProductMissionStageStatus = completion[stage.id]
      ? 'complete'
      : blocked
        ? 'blocked'
        : isCurrent || isApprovalWaiting
          ? 'ready'
          : 'waiting'
    return {
      ...stage,
      status,
      receipt: stageReceipt({ stageId: stage.id, complete: completion[stage.id], selected, roomState, pipeline }),
    }
  })
  const selectedPacket = roomScoped ? roomState.selectedProductPacket : undefined
  const imageRefs = stringArray(candidate.imageRefs)
  const sourceDetails = Array.isArray(candidate.sourceDetails) ? candidate.sourceDetails : []
  const variantOptions = uniqueWarnings(sourceDetails.flatMap((detail) => stringArray(detail.variantOptions)))
  const warnings = uniqueWarnings([
    ...stringArray(candidate.missingFields),
    ...stringArray(candidate.riskNotes),
    ...(selectedPacket?.missingFields ?? []),
    ...(selectedPacket?.riskFlags ?? []),
    ...(roomScoped ? roomState.shotLabHandoffPacket?.missingSourceMedia ?? [] : []),
    ...(roomScoped ? roomState.seoPacket?.complianceWarnings ?? [] : []),
    ...(roomScoped ? roomState.seoPacket?.missingKeywordMetrics ?? [] : []),
    ...(roomScoped ? roomState.draftPayload?.missingAttributes ?? [] : []),
  ])
  const completeCount = Object.values(completion).filter(Boolean).length
  return {
    id: candidate.candidateId,
    packetId: candidate.packetId,
    title: candidate.title,
    niche: candidate.niche,
    origin: candidate.dataOrigin,
    selected,
    currentStageId: activeStageId,
    progressPercent: Math.round((completeCount / stageDefinitions.length) * 100),
    stages,
    nextAction: action,
    warnings,
    hasBlockingError: !action.enabled,
    imageRefs,
    thumbnailRef: typeof candidate.thumbnailRef === 'string' ? candidate.thumbnailRef : imageRefs.at(0),
    score: candidate.score,
    sourceDetails,
    variantOptions,
  }
}

export function buildEtsyProductMissionList(roomState: EtsyRoomState, pipeline: EtsyPipelineState): EtsyProductMissionListModel {
  const rows = missionCandidates(roomState, pipeline).map((candidate) => buildMissionRow(candidate, roomState, pipeline))
  const selectedMissionId = rows.find((row) => row.selected)?.id
  return {
    rows,
    selectedMissionId,
    emptyState: rows.length ? 'ready' : 'waiting-for-intake',
    summary: {
      total: rows.length,
      active: rows.filter((row) => row.selected && row.nextAction.id !== 'review-approval').length,
      waitingApproval: rows.filter((row) => row.nextAction.id === 'review-approval').length,
      warnings: rows.reduce((count, row) => count + row.warnings.length, 0),
    },
  }
}
