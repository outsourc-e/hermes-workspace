import { describe, expect, it } from 'vitest'
import { adaptEtsyRoomDraftV1 } from './adapters/etsy-room-v1'
import { createWorkspacePacket } from './factory'
import { safeParseWorkspacePacket } from './schemas'
import { WORKSPACE_PACKET_TYPES } from './types'
import {
  claimsInputFixture as claimsInput,
  legacyDraftFixture as legacyDraft,
  supplierInputFixture as supplierInput,
  validAssetProductionPayloadFixture as validAssetProductionPayload,
  validCodeAutomationPayloadFixture as validCodeAutomationPayload,
  validContextPayloadFixture as validContextPayload,
  validCostRiskLockPayloadFixture as validCostRiskLockPayload,
  validDeliveryReadbackPayloadFixture as validDeliveryReadbackPayload,
  validDeliveryRequestPayloadFixture as validDeliveryRequestPayload,
  validEvidenceAllowedClaimsPayloadFixture as validEvidenceAllowedClaimsPayload,
  validExecutionPlanPayloadFixture as validExecutionPlanPayload,
  validOpportunityPayloadFixture as validOpportunityPayload,
  validPrintReadyPayloadFixture as validPrintReadyPayload,
  validRosterAvailabilityPayloadFixture as validRosterAvailabilityPayload,
  validRunReadbackPayloadFixture as validRunReadbackPayload,
  validStrategicDecisionPayloadFixture as validStrategicDecisionPayload,
} from './test-fixtures'
import { evidenceRefsFromAllowedClaims } from './domain/evidence-allowed-claims'
import { evidenceRefsFromListingReadyDraft } from './domain/listing-ready-draft'
import {
  SupplierEvidencePayloadSchema,
  evidenceRefsFromSupplierEvidence,
} from './domain/supplier-evidence'
import type { ListingReadyDraftPayload } from './domain/listing-ready-draft'
import type { UniversalPacketEnvelope, WorkspacePacketType } from './types'

type EnvelopeMetadata = {
  sourceRefs: Array<string>
  evidenceRefs: Array<string>
  missingFields: Array<string>
  lockedActions: Array<string>
  approval: UniversalPacketEnvelope['approval']
  from?: UniversalPacketEnvelope['from']
  to?: UniversalPacketEnvelope['to']
}

function listingReadyPayload(): ListingReadyDraftPayload {
  return adaptEtsyRoomDraftV1({
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
}

function defaultMetadata(): EnvelopeMetadata {
  return {
    sourceRefs: [], evidenceRefs: [], missingFields: [], lockedActions: [],
    approval: { required: false, stage: null, grantId: null },
  }
}

function metadataFor(packetType: WorkspacePacketType, payload: any): EnvelopeMetadata {
  const base = defaultMetadata()
  switch (packetType) {
    case 'opportunity':
      return {
        ...base,
        sourceRefs: payload.observedMetrics.flatMap((metric: any) => metric.sourceRef ? [metric.sourceRef] : []),
        evidenceRefs: payload.observedMetrics.flatMap((metric: any) => metric.evidenceRef ? [metric.evidenceRef] : []),
      }
    case 'evidence-allowed-claims':
      return {
        ...base,
        sourceRefs: [payload.subject.opportunityPacketId],
        evidenceRefs: evidenceRefsFromAllowedClaims(payload),
        missingFields: payload.hardBlocks,
      }
    case 'supplier-evidence':
      return {
        ...base,
        sourceRefs: [payload.opportunityPacketId, payload.evidenceAllowedClaimsPacketId, payload.source.sourceRef],
        evidenceRefs: evidenceRefsFromSupplierEvidence(payload),
        missingFields: payload.hardBlocks,
      }
    case 'listing-ready-draft':
      return {
        sourceRefs: [payload.opportunityPacketId, payload.evidenceAllowedClaimsPacketId, payload.supplierEvidencePacketId, payload.legacyDraftPacketId],
        evidenceRefs: evidenceRefsFromListingReadyDraft(payload),
        missingFields: payload.hardBlocks,
        lockedActions: payload.liveActionsLocked,
        approval: { required: true, stage: 'draft-approval', grantId: null },
      }
    case 'asset-production':
      return {
        ...base,
        sourceRefs: [payload.executionPlanPacketId, ...payload.items.flatMap((item: any) => item.provenanceRefs)],
        evidenceRefs: [
          ...payload.items.map((item: any) => item.artifactRef),
          ...payload.setQa.evidenceRefs,
          ...payload.items.flatMap((item: any) => item.visualQa.evidenceRefs),
        ],
        missingFields: payload.hardBlocks,
        lockedActions: payload.liveActionsLocked,
      }
    case 'print-ready':
      return {
        ...base,
        sourceRefs: [payload.assetProductionPacketId],
        evidenceRefs: [
          payload.model.artifactRef,
          payload.gcodeValidation.gcodeRef,
          ...payload.modelQa.evidenceRefs,
          ...payload.plateSlicerQa.evidenceRefs,
          ...payload.gcodeValidation.evidenceRefs,
        ],
        missingFields: payload.hardBlocks,
        lockedActions: payload.liveActionsLocked,
      }
    case 'context':
      return {
        ...base,
        sourceRefs: [
          payload.executionPlanPacketId,
          ...payload.sources.flatMap((source: any) => source.provenanceRefs),
          ...payload.contextItems.flatMap((item: any) => item.provenanceRefs),
        ],
        to: {
          roomId: payload.receiver.roomId,
          agentId: payload.receiver.agentId,
        },
      }
    case 'cost-risk-lock':
      return {
        ...base,
        sourceRefs: [payload.executionPlanPacketId],
        evidenceRefs: payload.cost.evidenceRefs,
        missingFields: payload.hardBlocks,
        lockedActions: payload.liveActionsLocked,
        approval: { required: true, stage: payload.action.stage, grantId: 'grant-server-1' },
      }
    case 'roster-availability':
      return {
        ...base,
        sourceRefs: [payload.executionPlanPacketId, ...payload.profiles.flatMap((profile: any) => profile.provenanceRefs)],
        from: {
          roomId: payload.reporter.roomId,
          agentId: payload.reporter.agentId,
        },
      }
    case 'code-automation':
      return {
        ...base,
        sourceRefs: [payload.executionPlanPacketId, payload.diff.artifactRef, payload.checkpoint.manifestRef],
        evidenceRefs: [
          ...payload.tests.flatMap((test: any) => test.evidenceRefs),
          ...payload.rollback.evidenceRefs,
        ],
        missingFields: payload.hardBlocks,
        lockedActions: payload.liveActionsLocked,
      }
    case 'strategic-decision':
      return {
        ...base,
        evidenceRefs: payload.responses.flatMap((response: any) => response.evidenceRefs),
      }
    case 'delivery-request':
      return {
        ...base,
        sourceRefs: [payload.executionPlanPacketId, payload.action.contentRef],
        lockedActions: [payload.action.actionType],
        approval: { required: true, stage: 'send', grantId: payload.approvalGrantId },
      }
    case 'delivery-readback':
      return {
        ...base,
        sourceRefs: [payload.deliveryRequestPacketId],
        evidenceRefs: payload.evidenceRefs,
      }
    case 'run-readback':
      return {
        ...base,
        sourceRefs: [
          payload.executionPlanPacketId,
          ...payload.approvalGrantRefs,
          ...payload.steps.flatMap((step: any) => [...step.packetRefs, ...step.actualOutputRefs]),
        ],
        evidenceRefs: [
          ...payload.artifactRefs,
          ...payload.deliveryReadbackRefs,
          ...payload.rollbackRefs,
        ],
        missingFields: payload.unresolvedItems,
      }
    case 'execution-plan':
      return base
  }
}

function packetFor(packetType: WorkspacePacketType, payload: unknown) {
  const metadata = metadataFor(packetType, payload)
  return createWorkspacePacket({
    packetId: `packet-registry-${packetType}`,
    packetLineageId: `lineage-registry-${packetType}`,
    createdAt: '2026-07-19T08:00:00.000Z',
    runId: 'run-contract-registry',
    schemaVersion: '1.0.0',
    packetType,
    from: metadata.from ?? { roomId: 'olympus-command', agentId: 'hermes' },
    to: metadata.to ?? { roomId: 'olympus-command', agentId: 'contract-verifier' },
    sourceRefs: [...new Set(metadata.sourceRefs)],
    evidenceRefs: [...new Set(metadata.evidenceRefs)],
    assumptions: [],
    missingFields: [...new Set(metadata.missingFields)],
    lockedActions: [...new Set(metadata.lockedActions)],
    approval: metadata.approval,
    acceptanceCriteria: [{ criterionId: 'strict-payload', description: 'Strict payload validates.', required: true }],
    idempotencyKey: `registry:${packetType}`,
    payload,
  })
}

function fixtureMap() {
  const deliveryRequestPayload = validDeliveryRequestPayload()
  const deliveryRequestPacket = packetFor('delivery-request', deliveryRequestPayload)
  return {
    'execution-plan': validExecutionPlanPayload(),
    opportunity: validOpportunityPayload(),
    'evidence-allowed-claims': validEvidenceAllowedClaimsPayload(),
    'supplier-evidence': supplierInput(),
    'listing-ready-draft': listingReadyPayload(),
    'asset-production': validAssetProductionPayload(),
    'print-ready': validPrintReadyPayload(),
    context: validContextPayload(),
    'cost-risk-lock': validCostRiskLockPayload(),
    'roster-availability': validRosterAvailabilityPayload(),
    'code-automation': validCodeAutomationPayload(),
    'strategic-decision': validStrategicDecisionPayload(),
    'delivery-request': deliveryRequestPayload,
    'delivery-readback': validDeliveryReadbackPayload(deliveryRequestPacket),
    'run-readback': validRunReadbackPayload(),
  } satisfies Record<WorkspacePacketType, unknown>
}

describe('complete Workspace Packet registry', () => {
  it('has one strict valid fixture for every canonical Packet type', () => {
    const fixtures = fixtureMap()
    expect(Object.keys(fixtures).sort()).toEqual([...WORKSPACE_PACKET_TYPES].sort())
    for (const packetType of WORKSPACE_PACKET_TYPES) {
      const result = safeParseWorkspacePacket(packetFor(packetType, fixtures[packetType]))
      expect(result.success, `${packetType} valid fixture`).toBe(true)
    }
  })

  it('rejects an unknown nested payload field for every canonical Packet type', () => {
    const fixtures = fixtureMap()
    for (const packetType of WORKSPACE_PACKET_TYPES) {
      const payload = fixtures[packetType] as Record<string, unknown>
      const packet = packetFor(packetType, payload)
      const result = safeParseWorkspacePacket({
        ...packet,
        payload: { ...payload, __unknownContractField: true },
      })
      expect(result.success, `${packetType} unknown field`).toBe(false)
    }
  })
})
