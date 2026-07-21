import { z } from 'zod'
import { workspacePacketContentHash } from './canonical-json'
import { AssetProductionPayloadSchema } from './domain/asset-production'
import { CodeAutomationPayloadSchema } from './domain/code-automation'
import { ContextPayloadSchema } from './domain/context'
import { CostRiskLockPayloadSchema } from './domain/cost-risk-lock'
import {
  DeliveryReadbackPayloadSchema,
  DeliveryRequestPayloadSchema,
} from './domain/delivery'
import { ExecutionPlanPayloadSchema } from './domain/execution-plan'
import {
  EvidenceAllowedClaimsPayloadSchema,
  evidenceRefsFromAllowedClaims,
} from './domain/evidence-allowed-claims'
import {
  ListingReadyDraftPayloadSchema,
  evidenceRefsFromListingReadyDraft,
} from './domain/listing-ready-draft'
import { OpportunityPayloadSchema } from './domain/opportunity'
import { PrintReadyPayloadSchema } from './domain/print-ready'
import { RosterAvailabilityPayloadSchema } from './domain/roster-availability'
import { RunReadbackPayloadSchema } from './domain/run-readback'
import { StrategicDecisionPayloadSchema } from './domain/strategic-decision'
import {
  SupplierEvidencePayloadSchema,
  evidenceRefsFromSupplierEvidence,
} from './domain/supplier-evidence'
import { WORKSPACE_PACKET_TYPES } from './types'
import type { AssetProductionPayload } from './domain/asset-production'
import type { CodeAutomationPayload } from './domain/code-automation'
import type { ContextPayload } from './domain/context'
import type { CostRiskLockPayload } from './domain/cost-risk-lock'
import type {
  DeliveryReadbackPayload,
  DeliveryRequestPayload,
} from './domain/delivery'
import type { EvidenceAllowedClaimsPayload } from './domain/evidence-allowed-claims'
import type { ListingReadyDraftPayload } from './domain/listing-ready-draft'
import type { OpportunityPayload } from './domain/opportunity'
import type { PrintReadyPayload } from './domain/print-ready'
import type { RosterAvailabilityPayload } from './domain/roster-availability'
import type { RunReadbackPayload } from './domain/run-readback'
import type { StrategicDecisionPayload } from './domain/strategic-decision'
import type { SupplierEvidencePayload } from './domain/supplier-evidence'
import type {
  UniversalPacketEnvelope,
  WorkspacePacketType,
} from './types'

const MAX_ID_LENGTH = 256
const MAX_REF_LENGTH = 4_096
const MAX_LIST_ITEMS = 500

export const WorkspacePacketIdSchema = z.string().trim().min(1).max(MAX_ID_LENGTH)
export const WorkspacePacketSemVerSchema = z.string().regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  'Expected semantic version (SemVer).',
)
export const WorkspacePacketTimestampSchema = z.string().datetime({ offset: true })
export const WorkspacePacketContentHashSchema = z.string().regex(
  /^[a-f0-9]{64}$/,
  'Expected a lowercase SHA-256 hash.',
)
export const WorkspacePacketRefSchema = z.string().trim().min(1).max(MAX_REF_LENGTH)

export const WorkspacePacketEndpointSchema = z.object({
  roomId: WorkspacePacketIdSchema,
  agentId: WorkspacePacketIdSchema.nullable(),
}).strict()

export const WorkspacePacketApprovalBindingSchema = z.object({
  required: z.boolean(),
  stage: WorkspacePacketIdSchema.nullable(),
  grantId: WorkspacePacketIdSchema.nullable(),
}).strict()

export const WorkspacePacketAcceptanceCriterionSchema = z.object({
  criterionId: WorkspacePacketIdSchema,
  description: z.string().trim().min(1).max(MAX_REF_LENGTH),
  required: z.boolean(),
}).strict()

const WorkspacePacketRefListSchema = z.array(WorkspacePacketRefSchema).max(MAX_LIST_ITEMS)

export const UniversalPacketEnvelopeSchema = z.object({
  packetId: WorkspacePacketIdSchema,
  packetLineageId: WorkspacePacketIdSchema,
  revision: z.number().int().positive(),
  supersedesPacketId: WorkspacePacketIdSchema.nullable(),
  runId: WorkspacePacketIdSchema,
  schemaVersion: WorkspacePacketSemVerSchema,
  packetType: z.enum(WORKSPACE_PACKET_TYPES),
  from: WorkspacePacketEndpointSchema,
  to: WorkspacePacketEndpointSchema,
  createdAt: WorkspacePacketTimestampSchema,
  sourceRefs: WorkspacePacketRefListSchema,
  evidenceRefs: WorkspacePacketRefListSchema,
  assumptions: WorkspacePacketRefListSchema,
  missingFields: WorkspacePacketRefListSchema,
  lockedActions: WorkspacePacketRefListSchema,
  approval: WorkspacePacketApprovalBindingSchema,
  acceptanceCriteria: z.array(WorkspacePacketAcceptanceCriterionSchema).max(MAX_LIST_ITEMS),
  idempotencyKey: WorkspacePacketIdSchema,
  contentHash: WorkspacePacketContentHashSchema,
  payload: z.unknown(),
}).strict().superRefine((packet, context) => {
  if (packet.revision === 1 && packet.supersedesPacketId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Revision 1 cannot supersede another Packet.',
      path: ['supersedesPacketId'],
    })
  }
  if (packet.revision > 1 && packet.supersedesPacketId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A revision greater than 1 requires supersedesPacketId.',
      path: ['supersedesPacketId'],
    })
  }
  if (packet.supersedesPacketId === packet.packetId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A Packet cannot supersede itself.',
      path: ['supersedesPacketId'],
    })
  }
  if (!packet.approval.required && (packet.approval.stage !== null || packet.approval.grantId !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Approval stage and grantId must be null when approval is not required.',
      path: ['approval'],
    })
  }
  if (packet.approval.required && packet.approval.stage === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Approval-required Packets must declare the exact approval stage.',
      path: ['approval', 'stage'],
    })
  }

  const seen = new Set<string>()
  packet.acceptanceCriteria.forEach((criterion, index) => {
    if (seen.has(criterion.criterionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate criterionId: ${criterion.criterionId}`,
        path: ['acceptanceCriteria', index, 'criterionId'],
      })
    }
    seen.add(criterion.criterionId)
  })
})

export type WorkspacePacketPayloadSchemaRegistry = Record<WorkspacePacketType, z.ZodTypeAny>

const DefaultWorkspacePacketPayloadSchemaRegistry = {
  'asset-production': AssetProductionPayloadSchema,
  'code-automation': CodeAutomationPayloadSchema,
  context: ContextPayloadSchema,
  'cost-risk-lock': CostRiskLockPayloadSchema,
  'delivery-readback': DeliveryReadbackPayloadSchema,
  'delivery-request': DeliveryRequestPayloadSchema,
  'evidence-allowed-claims': EvidenceAllowedClaimsPayloadSchema,
  'execution-plan': ExecutionPlanPayloadSchema,
  'listing-ready-draft': ListingReadyDraftPayloadSchema,
  opportunity: OpportunityPayloadSchema,
  'print-ready': PrintReadyPayloadSchema,
  'roster-availability': RosterAvailabilityPayloadSchema,
  'run-readback': RunReadbackPayloadSchema,
  'strategic-decision': StrategicDecisionPayloadSchema,
  'supplier-evidence': SupplierEvidencePayloadSchema,
} satisfies WorkspacePacketPayloadSchemaRegistry

export function createWorkspacePacketPayloadSchemaRegistry(
  overrides: Partial<WorkspacePacketPayloadSchemaRegistry> = {},
): WorkspacePacketPayloadSchemaRegistry {
  return {
    ...DefaultWorkspacePacketPayloadSchemaRegistry,
    ...overrides,
  }
}

export const WorkspacePacketPayloadSchemaRegistry = createWorkspacePacketPayloadSchemaRegistry()

export type WorkspacePacketParseResult =
  | { success: true; data: UniversalPacketEnvelope }
  | { success: false; error: z.ZodError }

function domainEnvelopeReferenceIssues(input: {
  envelope: z.infer<typeof UniversalPacketEnvelopeSchema>
  requiredSourceRefs: Array<string>
  requiredEvidenceRefs: Array<string>
  hardBlocks: Array<string>
  requiredLockedActions?: Array<string>
  approvalRequired?: boolean
}): Array<z.ZodIssue> {
  const declaredSources = new Set(input.envelope.sourceRefs)
  const declaredEvidence = new Set(input.envelope.evidenceRefs)
  const declaredMissing = new Set(input.envelope.missingFields)
  const declaredLocks = new Set(input.envelope.lockedActions)
  const issues: Array<z.ZodIssue> = []
  input.requiredSourceRefs.forEach((sourceRef) => {
    if (!declaredSources.has(sourceRef)) issues.push({
      code: z.ZodIssueCode.custom,
      message: `Domain sourceRef is not declared by the Envelope: ${sourceRef}.`,
      path: ['payload', 'sourceRefs'],
    })
  })
  input.requiredEvidenceRefs.forEach((evidenceRef) => {
    if (!declaredEvidence.has(evidenceRef)) issues.push({
      code: z.ZodIssueCode.custom,
      message: `Domain evidenceRef is not declared by the Envelope: ${evidenceRef}.`,
      path: ['payload', 'evidenceRefs'],
    })
  })
  input.hardBlocks.forEach((hardBlock, index) => {
    if (!declaredMissing.has(hardBlock)) issues.push({
      code: z.ZodIssueCode.custom,
      message: `Domain hard block is not declared by Envelope missingFields: ${hardBlock}.`,
      path: ['payload', 'hardBlocks', index],
    })
  })
  for (const lockedAction of input.requiredLockedActions ?? []) {
    if (!declaredLocks.has(lockedAction)) issues.push({
      code: z.ZodIssueCode.custom,
      message: `Domain locked action is not declared by the Envelope: ${lockedAction}.`,
      path: ['payload', 'liveActionsLocked'],
    })
  }
  if (input.approvalRequired && !input.envelope.approval.required) issues.push({
    code: z.ZodIssueCode.custom,
    message: 'Domain requires approval but the Envelope does not bind an approval.',
    path: ['approval', 'required'],
  })
  return issues
}

function customParseFailure(path: Array<string | number>, message: string): WorkspacePacketParseResult {
  return {
    success: false,
    error: new z.ZodError([{ code: z.ZodIssueCode.custom, path, message }]),
  }
}

export function safeParseWorkspacePacket(
  input: unknown,
  registry: WorkspacePacketPayloadSchemaRegistry = WorkspacePacketPayloadSchemaRegistry,
): WorkspacePacketParseResult {
  const envelopeResult = UniversalPacketEnvelopeSchema.safeParse(input)
  if (!envelopeResult.success) return envelopeResult
  const envelope = envelopeResult.data
  let expectedContentHash: string
  try {
    expectedContentHash = workspacePacketContentHash(envelope)
  } catch (error) {
    return customParseFailure(
      ['contentHash'],
      `Packet canonical content could not be hashed: ${error instanceof Error ? error.message : String(error)}.`,
    )
  }
  if (envelope.contentHash !== expectedContentHash) {
    return customParseFailure(
      ['contentHash'],
      `contentHash does not match the exact canonical Packet content; expected ${expectedContentHash}.`,
    )
  }
  const payloadSchema = registry[envelope.packetType]
  const payloadResult = payloadSchema.safeParse(envelope.payload)
  if (!payloadResult.success) {
    return {
      success: false,
      error: new z.ZodError(payloadResult.error.issues.map((issue) => ({
        ...issue,
        path: ['payload', ...issue.path],
      }))),
    }
  }

  if (envelopeResult.data.packetType === 'opportunity') {
    const payload = payloadResult.data as OpportunityPayload
    const declaredSources = new Set(envelopeResult.data.sourceRefs)
    const declaredEvidence = new Set(envelopeResult.data.evidenceRefs)
    const referenceIssues = payload.observedMetrics.flatMap((metric, index) => {
      const issues: Array<z.ZodIssue> = []
      if (metric.sourceRef && !declaredSources.has(metric.sourceRef)) {
        issues.push({
          code: z.ZodIssueCode.custom,
          message: `Observed metric sourceRef is not declared by the Envelope: ${metric.sourceRef}.`,
          path: ['payload', 'observedMetrics', index, 'sourceRef'],
        })
      }
      if (metric.evidenceRef && !declaredEvidence.has(metric.evidenceRef)) {
        issues.push({
          code: z.ZodIssueCode.custom,
          message: `Observed metric evidenceRef is not declared by the Envelope: ${metric.evidenceRef}.`,
          path: ['payload', 'observedMetrics', index, 'evidenceRef'],
        })
      }
      return issues
    })
    if (referenceIssues.length > 0) {
      return { success: false, error: new z.ZodError(referenceIssues) }
    }
  }

  if (envelopeResult.data.packetType === 'evidence-allowed-claims') {
    const payload = payloadResult.data as EvidenceAllowedClaimsPayload
    const declaredSources = new Set(envelopeResult.data.sourceRefs)
    const declaredEvidence = new Set(envelopeResult.data.evidenceRefs)
    const declaredMissing = new Set(envelopeResult.data.missingFields)
    const referenceIssues: Array<z.ZodIssue> = []
    if (!declaredSources.has(payload.subject.opportunityPacketId)) {
      referenceIssues.push({
        code: z.ZodIssueCode.custom,
        message: 'The source Opportunity Packet must be declared by the Envelope.',
        path: ['payload', 'subject', 'opportunityPacketId'],
      })
    }
    evidenceRefsFromAllowedClaims(payload).forEach((evidenceRef) => {
      if (!declaredEvidence.has(evidenceRef)) {
        referenceIssues.push({
          code: z.ZodIssueCode.custom,
          message: `Claim evidenceRef is not declared by the Envelope: ${evidenceRef}.`,
          path: ['payload', 'claims', 'evidenceRefs'],
        })
      }
    })
    payload.hardBlocks.forEach((hardBlock, index) => {
      if (!declaredMissing.has(hardBlock)) {
        referenceIssues.push({
          code: z.ZodIssueCode.custom,
          message: `Domain hard block is not declared by Envelope missingFields: ${hardBlock}.`,
          path: ['payload', 'hardBlocks', index],
        })
      }
    })
    if (referenceIssues.length > 0) {
      return { success: false, error: new z.ZodError(referenceIssues) }
    }
  }

  if (envelopeResult.data.packetType === 'supplier-evidence') {
    const payload = payloadResult.data as SupplierEvidencePayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.opportunityPacketId,
        payload.evidenceAllowedClaimsPacketId,
        payload.source.sourceRef,
      ],
      requiredEvidenceRefs: evidenceRefsFromSupplierEvidence(payload),
      hardBlocks: payload.hardBlocks,
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'listing-ready-draft') {
    const payload = payloadResult.data as ListingReadyDraftPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.opportunityPacketId,
        payload.evidenceAllowedClaimsPacketId,
        payload.supplierEvidencePacketId,
        payload.legacyDraftPacketId,
      ],
      requiredEvidenceRefs: evidenceRefsFromListingReadyDraft(payload),
      hardBlocks: payload.hardBlocks,
      requiredLockedActions: payload.liveActionsLocked,
      approvalRequired: payload.approvalRequired,
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'asset-production') {
    const payload = payloadResult.data as AssetProductionPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.executionPlanPacketId,
        ...payload.items.flatMap((item) => item.provenanceRefs),
      ],
      requiredEvidenceRefs: [
        ...payload.items.map((item) => item.artifactRef),
        ...payload.setQa.evidenceRefs,
        ...payload.items.flatMap((item) => item.visualQa.evidenceRefs),
      ],
      hardBlocks: payload.hardBlocks,
      requiredLockedActions: payload.liveActionsLocked,
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'print-ready') {
    const payload = payloadResult.data as PrintReadyPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [payload.assetProductionPacketId],
      requiredEvidenceRefs: [
        payload.model.artifactRef,
        payload.gcodeValidation.gcodeRef,
        ...payload.modelQa.evidenceRefs,
        ...payload.plateSlicerQa.evidenceRefs,
        ...payload.gcodeValidation.evidenceRefs,
      ],
      hardBlocks: payload.hardBlocks,
      requiredLockedActions: payload.liveActionsLocked,
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'context') {
    const payload = payloadResult.data as ContextPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.executionPlanPacketId,
        ...payload.sources.flatMap((source) => source.provenanceRefs),
        ...payload.contextItems.flatMap((item) => item.provenanceRefs),
      ],
      requiredEvidenceRefs: [],
      hardBlocks: [],
    })
    if (
      envelopeResult.data.to.roomId !== payload.receiver.roomId
      || envelopeResult.data.to.agentId !== payload.receiver.agentId
    ) {
      referenceIssues.push({
        code: z.ZodIssueCode.custom,
        message: 'Context receiver must match the Envelope destination exactly.',
        path: ['to'],
      })
    }
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'cost-risk-lock') {
    const payload = payloadResult.data as CostRiskLockPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [payload.executionPlanPacketId],
      requiredEvidenceRefs: payload.cost.evidenceRefs,
      hardBlocks: payload.hardBlocks,
      requiredLockedActions: payload.liveActionsLocked,
      approvalRequired: true,
    })
    if (envelopeResult.data.approval.stage !== payload.action.stage) {
      referenceIssues.push({
        code: z.ZodIssueCode.custom,
        message: 'CostRiskLock approval stage must match its exact action stage.',
        path: ['approval', 'stage'],
      })
    }
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'roster-availability') {
    const payload = payloadResult.data as RosterAvailabilityPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.executionPlanPacketId,
        ...payload.profiles.flatMap((profile) => profile.provenanceRefs),
      ],
      requiredEvidenceRefs: [],
      hardBlocks: [],
    })
    if (
      envelopeResult.data.from.roomId !== payload.reporter.roomId
      || envelopeResult.data.from.agentId !== payload.reporter.agentId
    ) {
      referenceIssues.push({
        code: z.ZodIssueCode.custom,
        message: 'Roster reporter must match the Envelope producer exactly.',
        path: ['from'],
      })
    }
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'code-automation') {
    const payload = payloadResult.data as CodeAutomationPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.executionPlanPacketId,
        payload.diff.artifactRef,
        payload.checkpoint.manifestRef,
      ],
      requiredEvidenceRefs: [
        ...payload.tests.flatMap((test) => test.evidenceRefs),
        ...payload.rollback.evidenceRefs,
      ],
      hardBlocks: payload.hardBlocks,
      requiredLockedActions: payload.liveActionsLocked,
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'strategic-decision') {
    const payload = payloadResult.data as StrategicDecisionPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [],
      requiredEvidenceRefs: payload.responses.flatMap((response) => response.evidenceRefs),
      hardBlocks: [],
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'run-readback') {
    const payload = payloadResult.data as RunReadbackPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [
        payload.executionPlanPacketId,
        ...payload.approvalGrantRefs,
        ...payload.steps.flatMap((step) => [...step.packetRefs, ...step.actualOutputRefs]),
      ],
      requiredEvidenceRefs: [
        ...payload.artifactRefs,
        ...payload.deliveryReadbackRefs,
        ...payload.rollbackRefs,
      ],
      hardBlocks: payload.unresolvedItems,
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'delivery-request') {
    const payload = payloadResult.data as DeliveryRequestPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [payload.executionPlanPacketId, payload.action.contentRef],
      requiredEvidenceRefs: [],
      hardBlocks: [],
      requiredLockedActions: [payload.action.actionType],
      approvalRequired: true,
    })
    if (envelopeResult.data.approval.grantId !== payload.approvalGrantId) {
      referenceIssues.push({
        code: z.ZodIssueCode.custom,
        message: 'DeliveryRequest must bind the exact server-issued ApprovalGrant.',
        path: ['approval', 'grantId'],
      })
    }
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  if (envelopeResult.data.packetType === 'delivery-readback') {
    const payload = payloadResult.data as DeliveryReadbackPayload
    const referenceIssues = domainEnvelopeReferenceIssues({
      envelope: envelopeResult.data,
      requiredSourceRefs: [payload.deliveryRequestPacketId],
      requiredEvidenceRefs: payload.evidenceRefs,
      hardBlocks: [],
    })
    if (referenceIssues.length > 0) return { success: false, error: new z.ZodError(referenceIssues) }
  }

  return {
    success: true,
    data: {
      ...envelopeResult.data,
      payload: payloadResult.data,
    } as UniversalPacketEnvelope,
  }
}

export function parseWorkspacePacket(
  input: unknown,
  registry: WorkspacePacketPayloadSchemaRegistry = WorkspacePacketPayloadSchemaRegistry,
): UniversalPacketEnvelope {
  const result = safeParseWorkspacePacket(input, registry)
  if (!result.success) throw result.error
  return result.data
}
