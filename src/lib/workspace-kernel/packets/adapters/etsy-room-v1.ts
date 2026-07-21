import { ListingReadyDraftPayloadSchema } from '../domain/listing-ready-draft'
import type { EtsyDraftPayload } from '../../../war-room/living-v3/etsy-room-contracts'
import type { EvidenceAllowedClaimsPayload } from '../domain/evidence-allowed-claims'
import type { ListingReadyDraftPayload } from '../domain/listing-ready-draft'
import type { SupplierEvidencePayload } from '../domain/supplier-evidence'

export type EtsyRoomV1AdapterInput = {
  legacyDraft: EtsyDraftPayload
  supplierEvidence: SupplierEvidencePayload
  allowedClaims: EvidenceAllowedClaimsPayload
  supplierEvidencePacketId: string
  listingPrice?: {
    currency: string
    amount: number
    evidenceRefs: Array<string>
  }
  attributeEvidenceRefs?: Record<string, Array<string>>
}

function unique(values: Array<string>) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function adaptEtsyRoomDraftV1(input: EtsyRoomV1AdapterInput): ListingReadyDraftPayload {
  const { legacyDraft, supplierEvidence, allowedClaims } = input
  const supplierReady = supplierEvidence.readiness === 'ready'
  const claimsReady = allowedClaims.readiness === 'ready'

  const attributes = Object.fromEntries(
    Object.entries(legacyDraft.attributes)
      .map(([key, value]) => [key.trim(), value.trim(), unique(input.attributeEvidenceRefs?.[key] ?? [])] as const)
      .filter(([key, value, evidenceRefs]) => Boolean(key && value && evidenceRefs.length))
      .map(([key, value, evidenceRefs]) => [key, { value, evidenceRefs }]),
  )

  const orderedImages = unique(legacyDraft.imageOrder.length ? legacyDraft.imageOrder : legacyDraft.imageRefs)
    .filter((imageRef) => legacyDraft.imageRefs.includes(imageRef))
  const completeAltText = orderedImages.length > 0
    && orderedImages.every((_, index) => Boolean(legacyDraft.altTextDrafts[index]?.trim()))
  const media = completeAltText
    ? orderedImages.map((imageRef, index) => ({
        imageRef,
        altText: legacyDraft.altTextDrafts[index].trim(),
        order: index + 1,
        evidenceRefs: unique([imageRef, ...supplierEvidence.match.evidenceRefs]),
      }))
    : []

  const claims = claimsReady
    ? allowedClaims.claims
        .filter((claim) => claim.verdict === 'supported' || claim.verdict === 'conditional')
        .filter((claim) => claim.allowedWording.length > 0 && claim.evidenceRefs.length > 0)
        .map((claim) => ({
          claimId: claim.claimId,
          wording: claim.allowedWording[0],
          evidenceRefs: unique(claim.evidenceRefs),
          conditions: unique(claim.conditions),
        }))
    : []

  const materials = supplierEvidence.fieldEvidence.materials.status === 'verified'
    ? unique(supplierEvidence.product.materials)
    : []
  const variants = supplierEvidence.fieldEvidence.variants.status === 'verified'
    ? unique(supplierEvidence.product.variants)
    : []
  const tags = unique(legacyDraft.tags).filter((tag) => tag.length <= 20).slice(0, 13)
  const liveActionsLocked = unique([
    ...legacyDraft.lockedActions,
    'Etsy upload draft',
    'Etsy publish',
    'Etsy edit listing',
    'supplier message',
  ])

  const hardBlocks: Array<string> = []
  if (!legacyDraft.title.trim()) hardBlocks.push('title')
  if (!legacyDraft.description.trim()) hardBlocks.push('description')
  if (tags.length === 0) hardBlocks.push('tags')
  if (Object.keys(attributes).length === 0) hardBlocks.push('attributes')
  if (materials.length === 0) hardBlocks.push('materials')
  if (variants.length === 0) hardBlocks.push('variants')
  if (!input.listingPrice) hardBlocks.push('price')
  if (media.length === 0) hardBlocks.push('media.altText')
  if (!supplierReady) hardBlocks.push('supplierEvidence')
  if (!claimsReady) hardBlocks.push('allowedClaims')

  return ListingReadyDraftPayloadSchema.parse({
    contractVersion: 'listing-ready-draft-v1',
    opportunityPacketId: allowedClaims.subject.opportunityPacketId,
    evidenceAllowedClaimsPacketId: supplierEvidence.evidenceAllowedClaimsPacketId,
    supplierEvidencePacketId: input.supplierEvidencePacketId,
    legacyDraftPacketId: legacyDraft.packetId,
    upstreamReadiness: {
      supplierEvidence: supplierReady ? 'ready' : 'blocked',
      allowedClaims: claimsReady ? 'ready' : 'blocked',
    },
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    title: legacyDraft.title.trim().slice(0, 140),
    description: legacyDraft.description.trim().slice(0, 20_000),
    tags,
    attributes,
    personalization: false,
    materials,
    colors: unique(legacyDraft.colors),
    variants,
    price: input.listingPrice ?? null,
    quantity: Math.max(1, Math.trunc(legacyDraft.quantityPlaceholder)),
    media,
    claims,
    blockedClaims: unique([
      ...legacyDraft.blockedClaims,
      ...allowedClaims.claims.flatMap((claim) => claim.forbiddenWording),
    ]),
    downstreamConstraints: unique(allowedClaims.downstreamConstraints),
    approvalRequired: true,
    liveActionsLocked,
    readiness: hardBlocks.length === 0 ? 'ready' : 'blocked',
    hardBlocks: unique(hardBlocks),
  })
}
