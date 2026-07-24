import { z } from 'zod'

import { createInitialEtsyPipelineState } from './etsy-pipeline'
import { createInitialEtsyRoomState } from './etsy-room-contracts'
import type {
  EtsyProductCandidate as EtsyPipelineCandidate,
  EtsyPipelineState,
} from './etsy-pipeline'
import type {
  EtsyProductCandidate as EtsyRoomCandidate,
  EtsyRoomState,
} from './etsy-room-contracts'

export const ETSY_PRODUCT_WORKSPACE_SCHEMA_VERSION = 'etsy-product-workspace-v2' as const
export const ETSY_PRODUCT_WORKSPACE_ID = 'etsy-market-lab' as const
const APPLIED_COMMAND_ID_LIMIT = 512
const WORKSPACE_EVENT_LIMIT = 2_000

export type EtsyProductWorkspaceSchemaVersion = typeof ETSY_PRODUCT_WORKSPACE_SCHEMA_VERSION
export type EtsyProductWorkspaceStage = 'intake' | 'truth' | 'images' | 'seo' | 'draft' | 'approval'
export type EtsyVariantEvidenceStatus = 'proposed' | 'observed' | 'verified'
export type EtsyMediaQaStatus = 'unreviewed' | 'approved' | 'rejected'

export type EtsyProductSourceCandidateRef = {
  system: 'room' | 'pipeline' | 'source-record'
  id: string
}

export type EtsyMediaAsset = {
  mediaId: string
  productId: string
  origin: 'source-local' | 'source-remote'
  ref: string
  role: 'primary' | 'source'
  sourceUrl?: string
  evidenceRefs: Array<string>
  variantIds: Array<string>
  qaStatus: EtsyMediaQaStatus
}

export type EtsyVariant = {
  variantId: string
  productId: string
  label: string
  optionName: string
  value: string
  evidenceStatus: EtsyVariantEvidenceStatus
  evidenceRefs: Array<string>
  mediaIds: Array<string>
}

export type EtsyProductRecord = {
  productId: string
  revision: number
  identity: {
    title: string
    niche?: string
    sourceCandidateRefs: Array<EtsyProductSourceCandidateRef>
  }
  research: {
    sourceRecords: Array<string>
    evidenceRefs: Array<string>
    missingFields: Array<string>
    riskFlags: Array<string>
  }
  variantsById: Record<string, EtsyVariant>
  variantOrder: Array<string>
  mediaById: Record<string, EtsyMediaAsset>
  mediaOrder: Array<string>
  primaryMediaId?: string
  truth: {
    materials: Array<string>
    dimensions: Array<string>
    colors: Array<string>
    claimsAllowed: Array<string>
    claimsBlocked: Array<string>
    missingEvidence: Array<string>
    evidenceStatus: 'missing' | 'partial' | 'ready'
  }
  workflow: {
    stage: EtsyProductWorkspaceStage
    shotLabReady: boolean
    seoReady: boolean
    draftReady: boolean
    approvalWaiting: boolean
  }
}

export type EtsyProductWorkspaceEvent = {
  eventId: string
  commandId: string
  type: EtsyProductWorkspaceCommand['type']
  revision: number
  productId?: string
  reason: string
  createdAtMs: number
}

export type EtsyProductWorkspaceStateV2 = {
  schemaVersion: EtsyProductWorkspaceSchemaVersion
  workspaceId: typeof ETSY_PRODUCT_WORKSPACE_ID
  revision: number
  updatedAtMs: number
  activeProductId?: string
  productsById: Record<string, EtsyProductRecord>
  productOrder: Array<string>
  events: Array<EtsyProductWorkspaceEvent>
  appliedCommandIds: Array<string>
  roomState: EtsyRoomState
  pipelineState: EtsyPipelineState
}

export type EtsyProductWorkspaceReplaceProjectionsCommand = {
  type: 'replace_projections'
  commandId: string
  baseRevision: number
  reason: string
  roomState: EtsyRoomState
  pipelineState: EtsyPipelineState
}

export type EtsyProductWorkspaceResetCommand = {
  type: 'reset_workspace'
  commandId: string
  baseRevision: number
  reason: string
}

export type EtsyProductWorkspaceCommand =
  | EtsyProductWorkspaceReplaceProjectionsCommand
  | EtsyProductWorkspaceResetCommand

export type EtsyProductWorkspaceCommandResult = {
  status: 'applied' | 'replayed' | 'conflict'
  state: EtsyProductWorkspaceStateV2
  expectedRevision?: number
}

export type MigrateEtsyProductWorkspaceInput = {
  roomState?: EtsyRoomState
  pipelineState?: EtsyPipelineState
  nowMs?: number
  previous?: EtsyProductWorkspaceStateV2
  revision?: number
  events?: Array<EtsyProductWorkspaceEvent>
  appliedCommandIds?: Array<string>
}

const RoomProjectionSchema = z.object({
  run: z.object({
    runId: z.string(),
    updatedAtMs: z.number(),
  }).passthrough(),
  candidates: z.array(z.unknown()),
  events: z.array(z.unknown()),
  shotLabDraft: z.object({
    preset: z.string(),
    imageCount: z.number(),
    sourceImageRequirements: z.string(),
    variantNotes: z.string(),
  }).passthrough(),
}).passthrough()

const PipelineProjectionSchema = z.object({
  stage: z.string(),
  candidates: z.array(z.unknown()),
  supplierLeads: z.array(z.unknown()),
  qaItems: z.array(z.unknown()),
}).passthrough()

export const EtsyProductWorkspaceCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('replace_projections'),
    commandId: z.string().trim().min(1).max(200),
    baseRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
    roomState: RoomProjectionSchema,
    pipelineState: PipelineProjectionSchema,
  }),
  z.object({
    type: z.literal('reset_workspace'),
    commandId: z.string().trim().min(1).max(200),
    baseRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
  }),
])

export const EtsyProductWorkspaceStateV2Schema = z.object({
  schemaVersion: z.literal(ETSY_PRODUCT_WORKSPACE_SCHEMA_VERSION),
  workspaceId: z.literal(ETSY_PRODUCT_WORKSPACE_ID),
  revision: z.number().int().nonnegative(),
  updatedAtMs: z.number().finite(),
  activeProductId: z.string().optional(),
  productsById: z.record(z.string(), z.unknown()),
  productOrder: z.array(z.string()),
  events: z.array(z.unknown()),
  appliedCommandIds: z.array(z.string()),
  roomState: RoomProjectionSchema,
  pipelineState: PipelineProjectionSchema,
}).passthrough()

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function slug(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item'
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${slug(value)}-${stableHash(value)}`
}

function renderableMediaRef(value: string | undefined): value is string {
  return Boolean(value && (/^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith('/')))
}

function candidateIds(roomState: EtsyRoomState, pipelineState: EtsyPipelineState) {
  return uniqueStrings([
    ...roomState.candidates.map((candidate) => candidate.candidateId),
    ...pipelineState.candidates.map((candidate) => candidate.candidateId),
    roomState.selectedProductPacket?.selectedCandidateId,
    roomState.selectedCandidateId,
    pipelineState.selectedCandidateId,
  ])
}

function existingProductId(previous: EtsyProductWorkspaceStateV2 | undefined, candidateId: string) {
  if (!previous) return undefined
  return previous.productOrder.find((productId) => previous.productsById[productId].identity.sourceCandidateRefs.some(
    (ref) => (ref.system === 'room' || ref.system === 'pipeline') && ref.id === candidateId,
  ))
}

function productIdFor(previous: EtsyProductWorkspaceStateV2 | undefined, candidateId: string) {
  return existingProductId(previous, candidateId) ?? stableId('etsy-product', candidateId)
}

function roomCandidateFor(roomState: EtsyRoomState, candidateId: string) {
  return roomState.candidates.find((candidate) => candidate.candidateId === candidateId)
}

function pipelineCandidateFor(pipelineState: EtsyPipelineState, candidateId: string) {
  return pipelineState.candidates.find((candidate) => candidate.candidateId === candidateId)
}

function selectedRoomCandidate(roomState: EtsyRoomState, candidateId: string) {
  return roomState.selectedCandidateId === candidateId
    || roomState.selectedProductPacket?.selectedCandidateId === candidateId
}

function collectMediaRefs(roomState: EtsyRoomState, candidateId: string, candidate?: EtsyRoomCandidate) {
  const selected = selectedRoomCandidate(roomState, candidateId)
  const detailRefs = candidate?.sourceDetails?.map((detail) => detail.localImageRef ?? detail.imageUrl) ?? []
  return uniqueStrings([
    candidate?.thumbnailRef,
    ...(candidate?.imageRefs ?? []),
    ...detailRefs,
    ...(selected ? roomState.selectedProductPacket?.imageRefs ?? [] : []),
    selected ? roomState.selectedProductPacket?.thumbnailRef : undefined,
    ...(selected ? roomState.shotLabHandoffPacket?.imageRefs ?? [] : []),
    ...(selected ? roomState.seoPacket?.imageRefs ?? [] : []),
    ...(selected ? roomState.draftPayload?.imageRefs ?? [] : []),
    ...(selected ? roomState.approvalPacket?.imageRefs ?? [] : []),
  ]).filter(renderableMediaRef)
}

function sourceUrlForMedia(candidate: EtsyRoomCandidate | undefined, mediaRef: string) {
  const detail = candidate?.sourceDetails?.find((item) => item.localImageRef === mediaRef || item.imageUrl === mediaRef)
  return detail?.url
}

function previousMediaId(previousProduct: EtsyProductRecord | undefined, ref: string) {
  return previousProduct?.mediaOrder.find((mediaId) => previousProduct.mediaById[mediaId].ref === ref)
}

function mediaRecords(
  productId: string,
  roomState: EtsyRoomState,
  candidateId: string,
  candidate: EtsyRoomCandidate | undefined,
  evidenceRefs: Array<string>,
  previousProduct: EtsyProductRecord | undefined,
) {
  const refs = collectMediaRefs(roomState, candidateId, candidate)
  const primaryRef = candidate?.thumbnailRef ?? refs[0]
  const mediaById: Record<string, EtsyMediaAsset> = {}
  const mediaOrder: Array<string> = []
  for (const ref of refs) {
    const mediaId = previousMediaId(previousProduct, ref) ?? stableId('etsy-media', `${productId}\u0000${ref}`)
    mediaById[mediaId] = {
      mediaId,
      productId,
      origin: ref.startsWith('/') ? 'source-local' : 'source-remote',
      ref,
      role: ref === primaryRef ? 'primary' : 'source',
      sourceUrl: sourceUrlForMedia(candidate, ref),
      evidenceRefs,
      variantIds: previousProduct?.mediaById[mediaId]?.variantIds ?? [],
      qaStatus: previousProduct?.mediaById[mediaId]?.qaStatus ?? 'unreviewed',
    }
    mediaOrder.push(mediaId)
  }
  const primaryMediaId = mediaOrder.find((mediaId) => mediaById[mediaId].role === 'primary') ?? mediaOrder[0]
  return { mediaById, mediaOrder, primaryMediaId }
}

function parseVariantLabel(label: string) {
  const separator = label.indexOf(':')
  if (separator < 1 || separator >= label.length - 1) {
    return { optionName: 'Variant', value: label.trim() }
  }
  return {
    optionName: label.slice(0, separator).trim(),
    value: label.slice(separator + 1).trim(),
  }
}

function previousVariantId(previousProduct: EtsyProductRecord | undefined, label: string) {
  return previousProduct?.variantOrder.find((variantId) => previousProduct.variantsById[variantId].label === label)
}

function variantRecords(
  productId: string,
  candidate: EtsyRoomCandidate | undefined,
  pipelineCandidate: EtsyPipelineCandidate | undefined,
  pipelineState: EtsyPipelineState,
  previousProduct: EtsyProductRecord | undefined,
) {
  const sourceVariants = uniqueStrings(candidate?.sourceDetails?.flatMap((detail) => detail.variantOptions ?? []) ?? [])
  const truthPacket = pipelineState.productTruthPacket?.candidateId === pipelineCandidate?.candidateId
    ? pipelineState.productTruthPacket
    : undefined
  const truthVariants = uniqueStrings(truthPacket?.variants ?? [])
  const labels = uniqueStrings([...sourceVariants, ...truthVariants]).filter((label) => !/^no\s/i.test(label))
  const variantsById: Record<string, EtsyVariant> = {}
  const variantOrder: Array<string> = []
  for (const label of labels) {
    const { optionName, value } = parseVariantLabel(label)
    const variantId = previousVariantId(previousProduct, label) ?? stableId('etsy-variant', `${productId}\u0000${label}`)
    variantsById[variantId] = {
      variantId,
      productId,
      label,
      optionName,
      value,
      evidenceStatus: sourceVariants.includes(label) ? 'observed' : 'proposed',
      evidenceRefs: uniqueStrings([
        ...(candidate?.evidenceIds ?? []),
        ...(truthPacket?.evidenceIds ?? []),
      ]),
      mediaIds: previousProduct?.variantsById[variantId]?.mediaIds ?? [],
    }
    variantOrder.push(variantId)
  }
  return { variantsById, variantOrder }
}

function workflowStage(roomState: EtsyRoomState, pipelineState: EtsyPipelineState, candidateId: string): EtsyProductWorkspaceStage {
  if (!selectedRoomCandidate(roomState, candidateId) && pipelineState.selectedCandidateId !== candidateId) return 'intake'
  if (roomState.approvalPacket) return 'approval'
  if (roomState.draftPayload || pipelineState.draftPacket?.candidateId === candidateId) return 'draft'
  if (roomState.seoPacket) return 'seo'
  if (roomState.shotLabHandoffPacket) return 'images'
  return 'truth'
}

function candidateSourceRefs(candidateId: string, roomCandidate?: EtsyRoomCandidate, pipelineCandidate?: EtsyPipelineCandidate) {
  return [
    ...(roomCandidate ? [{ system: 'room' as const, id: candidateId }] : []),
    ...(pipelineCandidate ? [{ system: 'pipeline' as const, id: candidateId }] : []),
    ...uniqueStrings([
      ...(roomCandidate?.sourceRecordIds ?? []),
      ...(pipelineCandidate?.sourceRecordIds ?? []),
    ]).map((id) => ({ system: 'source-record' as const, id })),
  ]
}

function buildProductRecord(
  candidateId: string,
  roomState: EtsyRoomState,
  pipelineState: EtsyPipelineState,
  previous?: EtsyProductWorkspaceStateV2,
): EtsyProductRecord {
  const roomCandidate = roomCandidateFor(roomState, candidateId)
  const pipelineCandidate = pipelineCandidateFor(pipelineState, candidateId)
  const productId = productIdFor(previous, candidateId)
  const previousProduct = previous?.productsById[productId]
  const selectedPacket = roomState.selectedProductPacket?.selectedCandidateId === candidateId
    ? roomState.selectedProductPacket
    : undefined
  const sourceRecords = uniqueStrings([
    ...(roomCandidate?.sourceRecordIds ?? []),
    ...(pipelineCandidate?.sourceRecordIds ?? []),
    ...(selectedPacket?.sourceRecordIds ?? []),
    ...(roomCandidate?.sourceDetails?.map((detail) => detail.url) ?? []),
  ])
  const evidenceRefs = uniqueStrings([
    ...(roomCandidate?.evidenceIds ?? []),
    ...(pipelineCandidate?.evidenceIds ?? []),
    ...(selectedPacket?.evidenceIds ?? []),
  ])
  const media = mediaRecords(productId, roomState, candidateId, roomCandidate, evidenceRefs, previousProduct)
  const variants = variantRecords(productId, roomCandidate, pipelineCandidate, pipelineState, previousProduct)
  const truthPacket = pipelineState.productTruthPacket?.candidateId === candidateId
    ? pipelineState.productTruthPacket
    : undefined
  const selected = selectedRoomCandidate(roomState, candidateId)
  const title = roomCandidate?.title ?? pipelineCandidate?.title ?? selectedPacket?.selectedProductTitle ?? 'Untitled Etsy product'

  return {
    productId,
    revision: previousProduct?.revision ?? 0,
    identity: {
      title,
      niche: roomCandidate?.niche ?? pipelineCandidate?.niche,
      sourceCandidateRefs: candidateSourceRefs(candidateId, roomCandidate, pipelineCandidate),
    },
    research: {
      sourceRecords,
      evidenceRefs,
      missingFields: uniqueStrings([
        ...(roomCandidate?.missingFields ?? []),
        ...(truthPacket?.missingEvidence ?? []),
      ]),
      riskFlags: uniqueStrings([
        ...(roomCandidate?.riskNotes ?? []),
        ...(selectedPacket?.riskFlags ?? []),
      ]),
    },
    ...variants,
    ...media,
    truth: {
      materials: truthPacket?.materials ?? [],
      dimensions: truthPacket?.dimensions ?? [],
      colors: truthPacket?.colors ?? [],
      claimsAllowed: truthPacket?.claimsAllowed ?? [],
      claimsBlocked: truthPacket?.claimsBlocked ?? [],
      missingEvidence: truthPacket?.missingEvidence ?? [],
      evidenceStatus: !truthPacket ? 'missing' : truthPacket.status === 'ready' ? 'ready' : 'partial',
    },
    workflow: {
      stage: workflowStage(roomState, pipelineState, candidateId),
      shotLabReady: Boolean(selected && roomState.shotLabHandoffPacket),
      seoReady: Boolean(selected && roomState.seoPacket),
      draftReady: Boolean((selected && roomState.draftPayload) || pipelineState.draftPacket?.candidateId === candidateId),
      approvalWaiting: Boolean((selected && roomState.approvalPacket) || pipelineState.draftApprovalPacket?.candidateId === candidateId),
    },
  }
}

function activeCandidateId(roomState: EtsyRoomState, pipelineState: EtsyPipelineState) {
  return roomState.selectedCandidateId
    ?? roomState.selectedProductPacket?.selectedCandidateId
    ?? pipelineState.selectedCandidateId
}

export function migrateEtsyProductWorkspaceStateV2(input: MigrateEtsyProductWorkspaceInput = {}): EtsyProductWorkspaceStateV2 {
  const nowMs = input.nowMs ?? Date.now()
  const roomState = input.roomState ?? createInitialEtsyRoomState(nowMs)
  const pipelineState = input.pipelineState ?? createInitialEtsyPipelineState()
  const ids = candidateIds(roomState, pipelineState)
  const productsById: Record<string, EtsyProductRecord> = {}
  const productOrder = ids.map((candidateId) => {
    const product = buildProductRecord(candidateId, roomState, pipelineState, input.previous)
    productsById[product.productId] = product
    return product.productId
  })
  const activeCandidate = activeCandidateId(roomState, pipelineState)
  const activeProductId = activeCandidate
    ? productIdFor(input.previous, activeCandidate)
    : undefined

  return {
    schemaVersion: ETSY_PRODUCT_WORKSPACE_SCHEMA_VERSION,
    workspaceId: ETSY_PRODUCT_WORKSPACE_ID,
    revision: input.revision ?? input.previous?.revision ?? 0,
    updatedAtMs: nowMs,
    activeProductId,
    productsById,
    productOrder,
    events: (input.events ?? input.previous?.events ?? []).slice(-WORKSPACE_EVENT_LIMIT),
    appliedCommandIds: uniqueStrings(input.appliedCommandIds ?? input.previous?.appliedCommandIds ?? []).slice(-APPLIED_COMMAND_ID_LIMIT),
    roomState,
    pipelineState,
  }
}

export function parseEtsyProductWorkspaceStateV2(value: unknown, nowMs = Date.now()) {
  const parsed = EtsyProductWorkspaceStateV2Schema.safeParse(value)
  if (!parsed.success) return undefined
  const stored = parsed.data as unknown as EtsyProductWorkspaceStateV2
  return migrateEtsyProductWorkspaceStateV2({
    roomState: stored.roomState,
    pipelineState: stored.pipelineState,
    nowMs: Number.isFinite(stored.updatedAtMs) ? stored.updatedAtMs : nowMs,
    previous: stored,
    revision: stored.revision,
    events: stored.events,
    appliedCommandIds: stored.appliedCommandIds,
  })
}

export function replaceEtsyProductWorkspaceProjectionsLocally(
  current: EtsyProductWorkspaceStateV2,
  projections: { roomState?: EtsyRoomState; pipelineState?: EtsyPipelineState },
  nowMs = Date.now(),
) {
  return migrateEtsyProductWorkspaceStateV2({
    roomState: projections.roomState ?? current.roomState,
    pipelineState: projections.pipelineState ?? current.pipelineState,
    nowMs,
    previous: current,
    revision: current.revision,
    events: current.events,
    appliedCommandIds: current.appliedCommandIds,
  })
}

function commandEvent(command: EtsyProductWorkspaceCommand, revision: number, activeProductId: string | undefined, nowMs: number): EtsyProductWorkspaceEvent {
  return {
    eventId: stableId('etsy-workspace-event', `${command.commandId}\u0000${revision}`),
    commandId: command.commandId,
    type: command.type,
    revision,
    productId: activeProductId,
    reason: command.reason.trim().slice(0, 500) || command.type,
    createdAtMs: nowMs,
  }
}

export function applyEtsyProductWorkspaceCommand(
  current: EtsyProductWorkspaceStateV2,
  command: EtsyProductWorkspaceCommand,
  nowMs = Date.now(),
): EtsyProductWorkspaceCommandResult {
  if (current.appliedCommandIds.includes(command.commandId)) {
    return { status: 'replayed', state: current }
  }
  if (command.baseRevision !== current.revision) {
    return { status: 'conflict', state: current, expectedRevision: current.revision }
  }

  const revision = current.revision + 1
  const projections = command.type === 'reset_workspace'
    ? {
        roomState: createInitialEtsyRoomState(nowMs),
        pipelineState: createInitialEtsyPipelineState(),
      }
    : {
        roomState: command.roomState,
        pipelineState: command.pipelineState,
      }
  const next = migrateEtsyProductWorkspaceStateV2({
    ...projections,
    nowMs,
    previous: current,
    revision,
    appliedCommandIds: [...current.appliedCommandIds, command.commandId],
  })
  const event = commandEvent(command, revision, next.activeProductId, nowMs)
  next.events = [...current.events, event].slice(-WORKSPACE_EVENT_LIMIT)
  for (const product of Object.values(next.productsById)) {
    const previousProduct: EtsyProductRecord | undefined = Object.hasOwn(current.productsById, product.productId)
      ? current.productsById[product.productId]
      : undefined
    product.revision = previousProduct !== undefined && JSON.stringify(previousProduct) === JSON.stringify(product)
      ? previousProduct.revision
      : revision
  }
  return { status: 'applied', state: next }
}
