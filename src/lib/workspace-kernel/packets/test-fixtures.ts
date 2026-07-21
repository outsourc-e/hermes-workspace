import { sha256Hex } from './canonical-json'
import { createWorkspacePacket } from './factory'
import { EvidenceAllowedClaimsPayloadSchema } from './domain/evidence-allowed-claims'
import type { AssetProductionPayload } from './domain/asset-production'
import type { ContextPayload } from './domain/context'
import type { CostRiskLockPayload } from './domain/cost-risk-lock'
import type { UniversalPacketEnvelope } from './types'
import type { EtsyDraftPayload } from '../../war-room/living-v3/etsy-room-contracts'

export function validTestBlockedAssetPayload(): AssetProductionPayload {
  return {
    contractVersion: 'asset-production-v1',
    executionPlanPacketId: 'packet-plan-test-asset',
    stepId: 'step-test-asset',
    assetSetId: 'asset-set-test-blocked',
    items: [{
      itemId: 'required-test-asset',
      required: true,
      artifactRef: 'file:///test/required-asset.webp',
      artifactChecksum: 'a'.repeat(64),
      lifecycle: 'candidate',
      provenanceRefs: ['test://asset/provenance'],
      visualQa: { status: 'passed', evidenceRefs: ['test://asset/visual-qa'] },
    }],
    setQa: {
      status: 'passed',
      approvedItemIds: ['required-test-asset'],
      evidenceRefs: ['test://asset/set-qa'],
    },
    liveActionsLocked: ['publish', 'external_delivery'],
    readiness: 'blocked',
    hardBlocks: ['items.required-test-asset.lifecycle'],
  }
}

export function sourceRefsForTestAsset(payload: AssetProductionPayload): Array<string> {
  return [payload.executionPlanPacketId, ...payload.items.flatMap((item) => item.provenanceRefs)]
}

export function evidenceRefsForTestAsset(payload: AssetProductionPayload): Array<string> {
  return [
    ...payload.items.map((item) => item.artifactRef),
    ...payload.setQa.evidenceRefs,
    ...payload.items.flatMap((item) => item.visualQa.evidenceRefs),
  ]
}

export function validTestContextPayload(input: {
  mission: string
  receiver: { roomId: string; agentId: string }
  executionPlanPacketId?: string
  stepId?: string
  provenanceRef?: string
}): ContextPayload {
  const provenanceRef = input.provenanceRef ?? 'test://workspace-packet/context-source'
  const freshness = {
    policy: 'revalidate_on_use' as const,
    observedAt: '2026-07-18T17:30:00.000Z',
    expiresAt: null,
  }
  const redaction = {
    state: 'pre_sanitized' as const,
    detail: 'unknown',
  }
  return {
    contractVersion: 'context-v1',
    executionPlanPacketId: input.executionPlanPacketId ?? 'packet-plan-test-context',
    stepId: input.stepId ?? 'step-test-context',
    receiver: {
      roomId: input.receiver.roomId,
      agentId: input.receiver.agentId,
    },
    mission: input.mission,
    sources: [{
      sourceId: 'test-context-source',
      rank: 1,
      title: 'Test context source',
      kind: 'decision',
      status: 'loaded',
      excerpt: input.mission,
      provenanceRefs: [provenanceRef],
      freshness,
      redaction,
    }],
    contextItems: [{
      itemId: 'test-context-item',
      kind: 'decision',
      content: input.mission,
      sourceIds: ['test-context-source'],
      provenanceRefs: [provenanceRef],
      freshness,
      redaction,
    }],
    contradictions: [],
    includedScope: ['unit and integration contract verification'],
    excludedScope: ['live external side effects'],
    localOnly: true,
    writebackAllowed: false,
  }
}

export function sourceRefsForTestContext(payload: ContextPayload): Array<string> {
  return [...new Set([
    payload.executionPlanPacketId,
    ...payload.sources.flatMap((source) => source.provenanceRefs),
    ...payload.contextItems.flatMap((item) => item.provenanceRefs),
  ])]
}

export function validAssetProductionPayloadFixture() {
  return {
    contractVersion: 'asset-production-v1' as const,
    executionPlanPacketId: 'packet-plan-1',
    stepId: 'step-assets',
    assetSetId: 'set-hannibal-runtime',
    items: [{
      itemId: 'idle-sheet',
      required: true,
      artifactRef: 'file:///rescue/idle.webp',
      artifactChecksum: 'a'.repeat(64),
      lifecycle: 'final' as const,
      provenanceRefs: ['packet-source-art-1'],
      visualQa: { status: 'passed' as const, evidenceRefs: ['qa://visual/idle'] },
    }],
    setQa: {
      status: 'passed' as const,
      approvedItemIds: ['idle-sheet'],
      evidenceRefs: ['qa://set/hannibal-runtime'],
    },
    liveActionsLocked: ['publish', 'external_delivery'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

export function validCodeAutomationPayloadFixture() {
  return {
    contractVersion: 'code-automation-v1' as const,
    executionPlanPacketId: 'packet-plan-code-1',
    stepId: 'step-code-change',
    changeSetId: 'change-set-context-contract',
    objective: 'Implement one bounded Context contract.',
    scope: {
      includedPaths: ['src/lib/workspace-kernel/packets/domain/context.ts'],
      excludedPaths: ['src/lib/war-room/living-v3/living-v3-contract.ts'],
      changedPaths: ['src/lib/workspace-kernel/packets/domain/context.ts'],
    },
    diff: { artifactRef: 'file:///rescue/context-contract.patch', checksum: 'a'.repeat(64) },
    tests: [{
      testId: 'context-focused',
      command: 'pnpm vitest run src/lib/workspace-kernel/packets/domain/context.test.ts',
      required: true,
      status: 'passed' as const,
      evidenceRefs: ['file:///rescue/context-focused.log'],
    }],
    checkpoint: {
      manifestRef: 'file:///rescue/pre-context/manifest.json',
      manifestChecksum: 'b'.repeat(64),
    },
    rollback: {
      procedure: 'Restore only the allowlisted Context files from the pre-task checkpoint.',
      evidenceRefs: ['file:///rescue/pre-context/manifest.json'],
    },
    liveActionsLocked: ['git.commit', 'git.push', 'release.deploy'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

export function validContextPayloadFixture() {
  const freshness = {
    policy: 'revalidate_on_use' as const,
    observedAt: '2026-07-19T08:00:00.000Z',
    expiresAt: null,
  }
  const redaction = { state: 'pre_sanitized' as const, detail: 'unknown' }
  return {
    contractVersion: 'context-v1' as const,
    executionPlanPacketId: 'packet-plan-context-1',
    stepId: 'step-context-1',
    receiver: { roomId: 'olympus-command', stationId: 'command-table', agentId: 'hermes-command' },
    mission: 'Supply scoped decision context for one Step.',
    sources: [
      {
        sourceId: 'decision-note', rank: 1, title: 'Workspace Packet decision', kind: 'decision' as const,
        status: 'loaded' as const, excerpt: 'Milestone C is local-only.',
        provenanceRefs: ['obsidian://04 Decisions/packet.md'], freshness, redaction,
      },
      {
        sourceId: 'project-note', rank: 2, title: 'Workspace project source of truth',
        kind: 'project-source-of-truth' as const, status: 'loaded' as const,
        excerpt: 'Do not start Milestone D.', provenanceRefs: ['obsidian://01 Projects/workspace.md'],
        freshness, redaction,
      },
    ],
    contextItems: [{
      itemId: 'decision-local-only', kind: 'decision' as const,
      content: 'Milestone C remains local-only.', sourceIds: ['decision-note'],
      provenanceRefs: ['obsidian://04 Decisions/packet.md'], freshness, redaction,
    }],
    contradictions: [],
    includedScope: ['Milestone C Packet contracts'],
    excludedScope: ['Milestone D persistence'],
    localOnly: true as const,
    writebackAllowed: false as const,
  }
}

export function validCostRiskLockPayloadFixture(): CostRiskLockPayload {
  const canonicalScope = '{"listingId":"listing-1","shop":"DolaroBoutique"}'
  return {
    contractVersion: 'cost-risk-lock-v1',
    executionPlanPacketId: 'packet-plan-cost-1',
    stepId: 'step-cost-lock',
    action: {
      actionId: 'action-etsy-publish-1', actionType: 'etsy.publish', stage: 'publish',
      target: { system: 'Etsy', accountId: 'DolaroBoutique', resourceId: 'listing-1' },
      scope: { scopeId: 'scope-listing-1-publish', canonicalScope, scopeHash: sha256Hex(canonicalScope) },
    },
    cost: {
      currency: 'USD', maximumMinorUnits: 500, estimatedMinorUnits: 20,
      evidenceRefs: ['evidence://etsy/listing-fee'],
    },
    riskClass: 'R4_COST_OR_ACCOUNT',
    riskReasons: ['Publishing may incur a listing fee.'],
    approvalRequired: true,
    liveActionsLocked: ['execute'],
    readiness: 'ready',
    hardBlocks: [],
  }
}

export function validDeliveryRequestPayloadFixture() {
  return {
    contractVersion: 'delivery-request-v1' as const,
    executionPlanPacketId: 'packet-plan-delivery-1',
    stepId: 'step-deliver-discord',
    requestId: 'delivery-request-1',
    destination: { channel: 'discord' as const, targetId: 'channel-123', addressLabel: '#workspace' },
    account: { system: 'discord', accountId: 'hermes-bot' },
    action: {
      actionId: 'action-send-status', actionType: 'send_message',
      contentRef: 'artifact://message/status-1', contentHash: 'a'.repeat(64),
    },
    approvalGrantId: 'grant-delivery-1',
    batch: null,
    deliveryLocked: true as const,
  }
}

function deliveryRequestPacketFixture() {
  return createWorkspacePacket({
    packetId: 'packet-delivery-request-1',
    packetLineageId: 'lineage-delivery-request-1',
    createdAt: '2026-07-19T08:00:00.000Z',
    runId: 'run-delivery-1',
    schemaVersion: '1.0.0',
    packetType: 'delivery-request',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: 'merchant-harbor', agentId: 'delivery-worker' },
    sourceRefs: ['packet-plan-delivery-1', 'artifact://message/status-1'],
    evidenceRefs: [], assumptions: [], missingFields: [], lockedActions: ['send_message'],
    approval: { required: true, stage: 'send', grantId: 'grant-delivery-1' },
    acceptanceCriteria: [{ criterionId: 'delivery-confirmed', description: 'Read back exact delivery.', required: true }],
    idempotencyKey: 'delivery-request:1',
    payload: validDeliveryRequestPayloadFixture(),
  })
}

export function validDeliveryReadbackPayloadFixture(
  packet: Pick<UniversalPacketEnvelope, 'packetId' | 'contentHash'> = deliveryRequestPacketFixture(),
) {
  const request = validDeliveryRequestPayloadFixture()
  return {
    contractVersion: 'delivery-readback-v1' as const,
    deliveryRequestPacketId: packet.packetId,
    deliveryRequestContentHash: packet.contentHash,
    requestId: request.requestId,
    destination: request.destination,
    account: request.account,
    action: request.action,
    status: 'confirmed_delivered' as const,
    externalHandle: 'discord-message-456',
    authoritativeReadbackRef: 'discord://channel-123/message-456',
    evidenceRefs: ['evidence://discord-readback-456'],
    observedAt: '2026-07-19T08:00:10.000Z',
    retryLock: true,
  }
}

export function validExecutionPlanPayloadFixture() {
  return {
    objective: 'Execute a governed local Packet workflow.',
    requestSummary: 'Validate the Packet foundation without external actions.',
    scope: { included: ['workspace-kernel/packets'], excluded: ['map structure', 'external actions'] },
    constraints: ['local-only', 'no map changes'],
    stopConditions: ['content hash conflict', 'missing receiver ACK'],
    retryPolicy: { maxSafeRetriesPerStep: 1, retryableFailureCodes: ['TRANSIENT_LOCAL_IO'] },
    steps: [
      {
        stepId: 'step-plan', title: 'Create governed plan', roomId: 'olympus-command',
        agentId: 'hermes-command', dependsOnStepIds: [], mayRunInParallel: false,
        inputPacketTypes: [], outputPacketType: 'opportunity' as const,
        approvalGate: null, acceptanceCriteriaIds: ['criterion-plan'],
      },
      {
        stepId: 'step-delivery-proof', title: 'Confirm local readback proof', roomId: 'gateway-cockpit',
        agentId: 'heimdall', dependsOnStepIds: ['step-plan'], mayRunInParallel: false,
        inputPacketTypes: ['opportunity' as const], outputPacketType: 'delivery-readback' as const,
        approvalGate: 'delivery-confirmation', acceptanceCriteriaIds: ['criterion-readback'],
      },
    ],
    planDiffFromPacketId: null,
    planDiffSummary: [],
  }
}

function verifiedTruthFixture(status: 'verified' | 'unknown' = 'verified', evidenceRef = 'evidence-product-truth') {
  return {
    relevant: true,
    status,
    evidenceRefs: status === 'verified' ? [evidenceRef] : [],
    note: status === 'verified' ? 'Verified from local source evidence.' : 'Truth is not known.',
  }
}

export function validEvidenceAllowedClaimsPayloadFixture() {
  return {
    subject: {
      subjectId: 'candidate-1', opportunityPacketId: 'packet-opportunity-1',
      title: 'Ceramic candle warmer',
    },
    productTruth: {
      identity: verifiedTruthFixture(), material: verifiedTruthFixture(), dimensions: verifiedTruthFixture(),
      variant: verifiedTruthFixture(), safety: verifiedTruthFixture(), compliance: verifiedTruthFixture(),
    },
    claims: [
      {
        claimId: 'claim-material', claimText: 'Made from glazed ceramic.', verdict: 'supported' as const,
        evidenceRefs: ['evidence-product-truth'], confidence: 0.96,
        allowedWording: ['Glazed ceramic body.'], forbiddenWording: [], conditions: [],
        caveats: ['Color may vary slightly by batch.'], recheckAt: null,
      },
      {
        claimId: 'claim-handmade', claimText: 'Entirely handmade.', verdict: 'unsupported' as const,
        evidenceRefs: [], confidence: 0.1, allowedWording: [],
        forbiddenWording: ['Entirely handmade.', '100% handmade.'], conditions: [],
        caveats: ['Manufacturing method has not been verified.'], recheckAt: null,
      },
    ],
    downstreamConstraints: [],
    readiness: 'ready' as const,
    hardBlocks: [],
    reviewedAt: '2026-07-18T20:00:00.000Z',
  }
}

export function validOpportunityPayloadFixture() {
  return {
    researchBatchId: 'research-batch-1',
    candidate: {
      candidateId: 'candidate-1', kind: 'product' as const,
      title: 'Evidence-linked product candidate', url: 'https://example.com/product', imageUrl: null,
    },
    observedMetrics: [
      {
        metricId: 'metric-demand', label: 'Observed demand signal', value: 82,
        unit: 'score_0_100', observedAt: '2026-07-18T20:20:00.000Z',
        sourceRef: 'https://example.com/demand', evidenceRef: null,
      },
      {
        metricId: 'metric-competition', label: 'Observed competition signal', value: 55,
        unit: 'score_0_100', observedAt: '2026-07-18T20:20:00.000Z',
        sourceRef: null, evidenceRef: 'local://evidence/competition-1',
      },
    ],
    scores: [{
      scoreId: 'score-opportunity', label: 'Opportunity score', value: 78,
      observedMetricIds: ['metric-demand', 'metric-competition'],
      reason: 'Demand is stronger than the observed competition signal.',
    }],
    hypotheses: [{
      hypothesisId: 'hypothesis-copyability', text: 'The product may be sourceable with a defensible margin.',
      basisMetricIds: ['metric-demand'], confidence: 0.58,
      reason: 'Supplier and landed-cost proof are still missing.',
    }],
    comparisonBasis: ['Compared demand and competition observations from the same research window.'],
    caveats: ['Supplier truth has not been validated.'],
    hardBlocks: [],
    recommendation: 'send_to_oracle' as const,
    oracleHandoffReason: 'Validate identity, provenance and claim-level truth.',
  }
}

export function validPrintReadyPayloadFixture() {
  const modelBinding = {
    modelId: 'piggo-lighthouse', modelVersion: 'v7', modelChecksum: 'b'.repeat(64),
  }
  const configurationBinding = {
    printerId: 'centauri-carbon-2-192-168-1-206',
    printerModel: 'Elegoo Centauri Carbon 2', material: 'PLA', nozzleDiameterMm: 0.4,
    machineProfileId: 'centauri-carbon-2-0.4', processProfileId: 'quality-0.16',
    filamentProfileId: 'pla-standard',
  }
  const passedGate = (evidenceRef: string) => ({
    status: 'passed' as const, modelBinding, configurationBinding, evidenceRefs: [evidenceRef],
  })
  return {
    contractVersion: 'print-ready-v1' as const,
    assetProductionPacketId: 'packet-asset-production-1',
    model: { ...modelBinding, artifactRef: 'file:///rescue/piggo-v7.3mf' },
    configuration: configurationBinding,
    modelQa: passedGate('qa://model/piggo-v7'),
    plateSlicerQa: passedGate('qa://plate/piggo-v7'),
    gcodeValidation: {
      ...passedGate('qa://gcode/piggo-v7'),
      gcodeRef: 'file:///rescue/piggo-v7.gcode', gcodeChecksum: 'c'.repeat(64),
    },
    liveActionsLocked: ['printer.upload', 'printer.start', 'printer.control'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

export function validRosterAvailabilityPayloadFixture() {
  return {
    contractVersion: 'roster-availability-v1' as const,
    executionPlanPacketId: 'packet-plan-roster-1',
    stepId: 'step-roster',
    routingDecisionId: 'routing-decision-1',
    observedAt: '2026-07-19T08:00:00.000Z',
    expiresAt: '2026-07-19T08:01:00.000Z',
    reporter: { roomId: 'pantheon-quarters', agentId: 'pantheon-roster' },
    profiles: [
      {
        profileId: 'kimi-code-worker', availability: 'available' as const,
        observedAt: '2026-07-19T08:00:00.000Z', provenanceRefs: ['runtime://workers/kimi-code-worker'],
      },
      {
        profileId: 'codex-ui-builder', availability: 'busy' as const,
        observedAt: '2026-07-19T08:00:00.000Z', provenanceRefs: ['runtime://workers/codex-ui-builder'],
      },
    ],
    assignmentAuthority: 'hermes' as const,
    reportsAvailabilityOnly: true as const,
  }
}

export function validRunReadbackPayloadFixture() {
  return {
    executionPlanPacketId: 'packet-plan-1',
    executionPlanRevision: 1,
    finalStatus: 'completed' as const,
    steps: [
      {
        stepId: 'step-plan', required: true, packetRefs: ['packet-opportunity-1'],
        ackRefs: ['ack-opportunity-1'], expectedOutput: 'Governed local Packet.',
        actualOutputRefs: ['packet-opportunity-1'], outcome: 'accepted' as const,
      },
      {
        stepId: 'step-delivery-proof', required: true, packetRefs: ['packet-delivery-readback-1'],
        ackRefs: ['ack-delivery-readback-1'], expectedOutput: 'Confirmed local readback.',
        actualOutputRefs: ['packet-delivery-readback-1'], outcome: 'accepted' as const,
      },
    ],
    approvalGrantRefs: [],
    artifactRefs: ['artifact-foundation-1'],
    deliveryReadbackRefs: ['packet-delivery-readback-1'],
    rollbackRefs: [],
    unresolvedItems: [],
    nextActions: ['Review before Milestone B.'],
  }
}

export function validStrategicDecisionPayloadFixture() {
  return {
    contractVersion: 'strategic-decision-v1' as const,
    decisionId: 'decision-packet-persistence',
    question: 'Should Packet persistence begin in Milestone D?',
    expectedAdvisorIds: ['alexander', 'napoleon', 'saladin'],
    responses: [
      {
        advisorId: 'alexander', status: 'answered' as const,
        response: 'Wait for explicit Milestone D approval.', dissent: false,
        evidenceRefs: ['council://turn/alexander'],
      },
      {
        advisorId: 'napoleon', status: 'abstained' as const,
        response: null, dissent: false, evidenceRefs: ['council://turn/napoleon-abstention'],
      },
      {
        advisorId: 'saladin', status: 'answered' as const,
        response: 'Prepare the migration artifact now.', dissent: true,
        evidenceRefs: ['council://turn/saladin'],
      },
    ],
    juliusSynthesis: {
      authorId: 'julius' as const,
      summary: 'Two substantive views and one abstention were preserved.',
      recommendation: 'Wait for DLV approval before Milestone D.',
      dissentAdvisorIds: ['saladin'], abstentionAdvisorIds: ['napoleon'],
    },
    decisionState: 'awaiting_dlv' as const,
    dlvDecision: null,
  }
}

const supplierEvidenceFixture = (status: 'verified' | 'unknown' = 'verified') => ({
  relevant: true,
  status,
  evidenceRefs: status === 'verified' ? ['evidence-supplier-1'] : [],
})

export function supplierInputFixture() {
  return {
    contractVersion: 'supplier-evidence-v1' as const,
    opportunityPacketId: 'packet-opportunity-1',
    evidenceAllowedClaimsPacketId: 'packet-claims-1',
    candidateId: 'candidate-1',
    supplierOfferId: 'supplier-offer-1',
    source: {
      platform: 'AliExpress' as const, sourceRef: 'https://example.com/supplier/1',
      capturedAt: '2026-07-19T00:00:00.000Z', accessMode: 'read_only' as const,
    },
    match: {
      verdict: 'near_exact' as const, confidence: 0.93,
      matchedAttributes: ['shape', 'finish', 'variant'], mismatches: [],
      evidenceRefs: ['evidence-supplier-1'],
    },
    product: {
      title: 'Gold tone initial necklace', materials: ['stainless steel', 'gold tone plating'],
      dimensions: ['chain length 45 cm'], variants: ['A-Z initials'],
      imageRefs: ['image-supplier-hero'],
    },
    economics: {
      currency: 'USD', unitPrice: 8.5, shippingPrice: 2, minimumOrderQuantity: 1,
      observedAt: '2026-07-19T00:00:00.000Z', evidenceRefs: ['evidence-supplier-1'],
    },
    fieldEvidence: {
      identity: supplierEvidenceFixture(), materials: supplierEvidenceFixture(),
      dimensions: supplierEvidenceFixture(), variants: supplierEvidenceFixture(),
      pricing: supplierEvidenceFixture(),
    },
    readiness: 'ready' as const,
    hardBlocks: [] as Array<string>,
  }
}

export function claimsInputFixture() {
  return EvidenceAllowedClaimsPayloadSchema.parse({
    subject: {
      subjectId: 'candidate-1', opportunityPacketId: 'packet-opportunity-1',
      title: 'Gold tone initial necklace',
    },
    productTruth: Object.fromEntries(
      ['identity', 'material', 'dimensions', 'variant', 'safety', 'compliance'].map((key) => [key, {
        relevant: true, status: 'verified', evidenceRefs: ['evidence-claim-1'],
        note: 'Verified from local evidence.',
      }]),
    ),
    claims: [
      {
        claimId: 'claim-material', claimText: 'Gold tone plated stainless steel', verdict: 'supported',
        evidenceRefs: ['evidence-claim-1'], confidence: 0.96,
        allowedWording: ['Gold tone plated stainless steel'], forbiddenWording: ['Solid gold'],
        conditions: [], caveats: [], recheckAt: null,
      },
      {
        claimId: 'claim-waterproof', claimText: 'Waterproof', verdict: 'unsupported',
        evidenceRefs: [], confidence: 0.1, allowedWording: [], forbiddenWording: ['Waterproof'],
        conditions: [], caveats: ['No water-resistance evidence.'], recheckAt: null,
      },
    ],
    downstreamConstraints: [], readiness: 'ready', hardBlocks: [],
    reviewedAt: '2026-07-19T00:00:00.000Z',
  })
}

export function legacyDraftFixture(): EtsyDraftPayload {
  return {
    packetId: 'legacy-draft-1', runId: 'run-1',
    createdAtMs: Date.parse('2026-07-19T00:00:00.000Z'),
    sourceStationId: 'etsy-thor-seo-metrics', targetStationId: 'etsy-odin-draft-approval',
    status: 'waiting_operator', dataOrigin: 'local-user-input',
    sourceRecordIds: ['legacy-source-1'], evidenceIds: ['legacy-evidence-1'], missingFields: [],
    lockedActions: ['Etsy upload draft', 'Etsy publish'], nextHandoff: 'operator approval',
    humanApprovalRequired: true, kind: 'draft_payload', title: 'Initial Necklace Gift',
    imageRefs: ['image-supplier-hero'],
    description: 'A minimal initial necklace drafted from verified evidence.',
    tags: ['initial necklace', 'gift jewelry'],
    attributes: { type: 'Necklace', recipient: 'Women' },
    personalization: false, materials: ['legacy material placeholder'], colors: ['Gold tone'],
    variants: ['legacy variant placeholder'], pricePlaceholder: '₪200', quantityPlaceholder: 1,
    imageOrder: ['image-supplier-hero'],
    altTextDrafts: ['Gold tone initial necklace on a neutral background'],
    supplierSourceTruth: 'legacy prose is not proof',
    missingAttributes: [], blockedClaims: ['Waterproof', 'Solid gold'],
  }
}
