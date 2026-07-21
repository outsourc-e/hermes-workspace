import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { recordWorkspaceRunPacketEvent } from '../reducer'
import { routeWorkspaceActionToBlueprint } from '../router'
import { acknowledgeWorkspacePacket } from './ack'
import { createWorkspacePacket, reviseWorkspacePacket } from './factory'
import {
  createWorkspacePacketLifecycleEvent,
  workspacePacketStatusFromEvents,
} from './lifecycle'
import {
  loadWorkspacePacketStore,
  persistWorkspacePacketStore,
} from './packet-store'
import {
  completeWorkspaceRunWithPacketStore,
  createWorkspaceRunWithExecutionPlan,
  verifyWorkspaceRunCompletionFromPacketStore,
} from './run-bridge'
import {
  sourceRefsForTestContext,
  validTestContextPayload,
} from './test-fixtures'
import type { UniversalPacketEnvelope } from './types'

const roots: Array<string> = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function handoffPacket(
  packet: UniversalPacketEnvelope,
  rootDir: string,
  nowMs: number,
  outcome: 'accepted' | 'blocked' | 'rejected' = 'accepted',
) {
  const trustedNowMs = nowMs
  const loaded = await loadWorkspacePacketStore({ rootDir, nowMs })
  if (!loaded.ok) throw new Error('Expected readable Packet store.')
  let events = loaded.state.events
  const additions = []
  if (!events.some((event) => event.packetId === packet.packetId)) {
    const created = createWorkspacePacketLifecycleEvent(packet, events, {
      type: 'created', actor: packet.from, reason: null, payload: {},
    }, { eventId: `${packet.packetId}:created`, createdAt: new Date(nowMs).toISOString() })
    additions.push(created)
    events = [...events, created]
  }
  if (workspacePacketStatusFromEvents(packet.packetId, events) === 'draft') {
    const ready = createWorkspacePacketLifecycleEvent(packet, events, {
      type: 'ready', actor: packet.from, reason: null, payload: {},
    }, { eventId: `${packet.packetId}:ready`, createdAt: new Date(nowMs + 1).toISOString() })
    additions.push(ready)
    events = [...events, ready]
  }
  const offered = createWorkspacePacketLifecycleEvent(packet, events, {
    type: 'offered', actor: packet.from, reason: null, payload: {},
  }, { eventId: `${packet.packetId}:offered`, createdAt: new Date(nowMs + 2).toISOString() })
  additions.push(offered)
  events = [...events, offered]
  const acknowledged = acknowledgeWorkspacePacket(packet, events, {
    receiver: packet.to,
    outcome,
    acceptedContentHash: packet.contentHash,
    checkedCriteriaIds: packet.acceptanceCriteria.filter((criterion) => criterion.required).map((criterion) => criterion.criterionId),
    missingFields: outcome === 'blocked'
      ? (packet.missingFields.length > 0 ? packet.missingFields : ['receiver-review-required'])
      : [],
    evidenceRefs: packet.packetType === 'context' ? packet.sourceRefs : packet.evidenceRefs,
    reason: outcome === 'blocked'
      ? 'Required truth remains unknown.'
      : outcome === 'rejected'
        ? 'Receiver rejected the Packet after local review.'
        : null,
  }, {
    ackId: `${packet.packetId}:ack`,
    eventId: `${packet.packetId}:${outcome}`,
    createdAt: new Date(trustedNowMs + 3).toISOString(),
    nowMs: trustedNowMs + 3,
    supportedSchemaMajors: [1],
  })
  additions.push(acknowledged.event)
  await persistWorkspacePacketStore({
    packets: [packet],
    events: additions,
    acks: [acknowledged.ack],
    activePacketIds: [...loaded.state.packets.map((item) => item.packetId), packet.packetId],
  }, { rootDir, nowMs: nowMs + 3 })
  return acknowledged.ack
}

const criterion = (id: string) => [{ criterionId: id, description: `${id} verified.`, required: true }]

function packetBase(input: {
  packetId: string
  runId: string
  packetType: UniversalPacketEnvelope['packetType']
  from: UniversalPacketEnvelope['from']
  to: UniversalPacketEnvelope['to']
  sourceRefs: Array<string>
  evidenceRefs: Array<string>
  missingFields?: Array<string>
  lockedActions?: Array<string>
  approvalRequired?: boolean
  payload: unknown
}) {
  return createWorkspacePacket({
    packetId: input.packetId,
    packetLineageId: input.packetId,
    createdAt: '2026-07-19T00:00:00.000Z',
    runId: input.runId,
    schemaVersion: '1.0.0',
    packetType: input.packetType,
    from: input.from,
    to: input.to,
    sourceRefs: input.sourceRefs,
    evidenceRefs: input.evidenceRefs,
    assumptions: [],
    missingFields: input.missingFields ?? [],
    lockedActions: input.lockedActions ?? [],
    approval: input.approvalRequired
      ? { required: true, stage: 'draft-approval', grantId: null }
      : { required: false, stage: null, grantId: null },
    acceptanceCriteria: criterion(`criterion-${input.packetId}`),
    idempotencyKey: `vertical:${input.packetId}`,
    payload: input.payload,
  })
}

describe('Workspace Packet V1 local vertical slice', () => {
  it('completes only after the exact Packet chain, receiver ACKs, and RunReadback are persisted', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-packet-vertical-'))
    roots.push(rootDir)
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'vertical-slice-action-1',
      createdAtMs: 1_000,
      source: 'hermes',
      intent: 'local product research and Etsy draft',
      summary: 'Build a local evidence-backed listing draft without live execution.',
      input: { text: 'Local-only vertical slice.' },
    })
    const created = await createWorkspaceRunWithExecutionPlan(route.action, route.blueprint, 1_000, { rootDir })
    let state = { runs: [created.run] }
    const runId = created.run.runId

    const opportunity = packetBase({
      packetId: 'packet-opportunity-vertical', runId, packetType: 'opportunity',
      from: { roomId: 'agora-opportunity', agentId: 'goblin' },
      to: { roomId: 'oracle-signals', agentId: 'oracle' },
      sourceRefs: ['source-demand-vertical'], evidenceRefs: [],
      payload: {
        researchBatchId: 'batch-vertical',
        candidate: { candidateId: 'candidate-vertical', kind: 'product', title: 'Initial necklace', url: 'https://example.com/product', imageUrl: null },
        observedMetrics: [{ metricId: 'metric-demand', label: 'Demand', value: 82, unit: 'score_0_100', observedAt: '2026-07-19T00:00:00.000Z', sourceRef: 'source-demand-vertical', evidenceRef: null }],
        scores: [{ scoreId: 'score-opportunity', label: 'Opportunity', value: 82, observedMetricIds: ['metric-demand'], reason: 'Observed local demand signal.' }],
        hypotheses: [], comparisonBasis: ['Single local evidence window.'], caveats: [], hardBlocks: [],
        recommendation: 'send_to_oracle', oracleHandoffReason: 'Validate Product Truth and claims.',
      },
    })

    const blockedOpportunity = packetBase({
      packetId: 'packet-opportunity-blocked-vertical', runId, packetType: 'opportunity',
      from: { roomId: 'agora-opportunity', agentId: 'goblin' },
      to: { roomId: 'oracle-signals', agentId: 'oracle' },
      sourceRefs: ['source-demand-vertical'], evidenceRefs: [], missingFields: ['supplier-match'],
      payload: {
        researchBatchId: 'batch-vertical',
        candidate: { candidateId: 'candidate-blocked-vertical', kind: 'product', title: 'Lookalike necklace', url: 'https://example.com/lookalike', imageUrl: null },
        observedMetrics: [{ metricId: 'metric-demand-blocked', label: 'Demand', value: 76, unit: 'score_0_100', observedAt: '2026-07-19T00:00:00.000Z', sourceRef: 'source-demand-vertical', evidenceRef: null }],
        scores: [{ scoreId: 'score-opportunity-blocked', label: 'Opportunity', value: 76, observedMetricIds: ['metric-demand-blocked'], reason: 'Demand exists but exact supplier identity is not proven.' }],
        hypotheses: [], comparisonBasis: ['Same local evidence window.'], caveats: ['Visual similarity is not source proof.'], hardBlocks: [],
        recommendation: 'watch', oracleHandoffReason: 'Receiver must validate exact or near-exact supplier evidence before continuation.',
      },
    })

    const rejectedOpportunity = packetBase({
      packetId: 'packet-opportunity-rejected-vertical', runId, packetType: 'opportunity',
      from: { roomId: 'agora-opportunity', agentId: 'goblin' },
      to: { roomId: 'oracle-signals', agentId: 'oracle' },
      sourceRefs: ['source-demand-vertical'], evidenceRefs: [],
      payload: {
        researchBatchId: 'batch-vertical',
        candidate: { candidateId: 'candidate-rejected-vertical', kind: 'product', title: 'Unrelated necklace', url: 'https://example.com/unrelated', imageUrl: null },
        observedMetrics: [{ metricId: 'metric-demand-rejected', label: 'Demand', value: 40, unit: 'score_0_100', observedAt: '2026-07-19T00:00:00.000Z', sourceRef: 'source-demand-vertical', evidenceRef: null }],
        scores: [{ scoreId: 'score-opportunity-rejected', label: 'Opportunity', value: 40, observedMetricIds: ['metric-demand-rejected'], reason: 'Visual resemblance did not survive exact-identity review.' }],
        hypotheses: [], comparisonBasis: ['Receiver-side local review.'], caveats: ['Identity requires receiver review.'], hardBlocks: [],
        recommendation: 'reject', oracleHandoffReason: 'Receiver should reject if exact-identity review confirms a different product.',
      },
    })

    const claims = packetBase({
      packetId: 'packet-claims-vertical', runId, packetType: 'evidence-allowed-claims',
      from: { roomId: 'oracle-signals', agentId: 'oracle' },
      to: { roomId: 'merchant-harbor', agentId: 'thor' },
      sourceRefs: [opportunity.packetId], evidenceRefs: ['evidence-truth-vertical'], lockedActions: ['Etsy publish'],
      payload: {
        subject: { subjectId: 'candidate-vertical', opportunityPacketId: opportunity.packetId, title: 'Initial necklace' },
        productTruth: Object.fromEntries(['identity', 'material', 'dimensions', 'variant', 'safety', 'compliance'].map((key) => [key, {
          relevant: true, status: 'verified', evidenceRefs: ['evidence-truth-vertical'], note: 'Verified local evidence.',
        }])),
        claims: [{
          claimId: 'claim-material-vertical', claimText: 'Gold tone plated stainless steel.', verdict: 'supported',
          evidenceRefs: ['evidence-truth-vertical'], confidence: 0.95,
          allowedWording: ['Gold tone plated stainless steel'], forbiddenWording: ['Solid gold'],
          conditions: [], caveats: [], recheckAt: null,
        }],
        downstreamConstraints: [], readiness: 'ready', hardBlocks: [], reviewedAt: '2026-07-19T00:00:00.000Z',
      },
    })

    const supplier = packetBase({
      packetId: 'packet-supplier-vertical', runId, packetType: 'supplier-evidence',
      from: { roomId: 'supplier-verification', agentId: 'anubis' },
      to: { roomId: 'merchant-harbor', agentId: 'thor' },
      sourceRefs: [opportunity.packetId, claims.packetId, 'source-supplier-vertical'],
      evidenceRefs: ['evidence-supplier-vertical', 'image-supplier-vertical'],
      payload: {
        contractVersion: 'supplier-evidence-v1', opportunityPacketId: opportunity.packetId,
        evidenceAllowedClaimsPacketId: claims.packetId, candidateId: 'candidate-vertical', supplierOfferId: 'offer-vertical',
        source: { platform: 'AliExpress', sourceRef: 'source-supplier-vertical', capturedAt: '2026-07-19T00:00:00.000Z', accessMode: 'read_only' },
        match: { verdict: 'near_exact', confidence: 0.93, matchedAttributes: ['identity', 'variant'], mismatches: [], evidenceRefs: ['evidence-supplier-vertical'] },
        product: { title: 'Initial necklace', materials: ['stainless steel', 'gold tone plating'], dimensions: ['45 cm chain'], variants: ['A-Z initials'], imageRefs: ['image-supplier-vertical'] },
        economics: { currency: 'USD', unitPrice: 8.5, shippingPrice: 2, minimumOrderQuantity: 1, observedAt: '2026-07-19T00:00:00.000Z', evidenceRefs: ['evidence-supplier-vertical'] },
        fieldEvidence: Object.fromEntries(['identity', 'materials', 'dimensions', 'variants', 'pricing'].map((key) => [key, { relevant: true, status: 'verified', evidenceRefs: ['evidence-supplier-vertical'] }])),
        readiness: 'ready', hardBlocks: [],
      },
    })

    const legacyDraftTo = { roomId: 'etsy-market-lab', agentId: 'odin' }
    const legacyDraftPayload = validTestContextPayload({
      mission: 'Preserve the local legacy draft as explicit upstream context.',
      receiver: legacyDraftTo,
      executionPlanPacketId: created.executionPlanPacket.packetId,
      stepId: 'step-legacy-draft-context',
      provenanceRef: supplier.packetId,
    })
    const legacyDraft = packetBase({
      packetId: 'packet-legacy-draft-vertical', runId, packetType: 'context',
      from: { roomId: 'etsy-market-lab', agentId: 'thor' },
      to: legacyDraftTo,
      sourceRefs: sourceRefsForTestContext(legacyDraftPayload), evidenceRefs: [], lockedActions: ['Etsy upload draft', 'Etsy publish'],
      payload: legacyDraftPayload,
    })

    const readyListingTemplate = packetBase({
      packetId: 'packet-listing-template-vertical', runId, packetType: 'listing-ready-draft',
      from: { roomId: 'etsy-market-lab', agentId: 'thor' },
      to: { roomId: 'etsy-market-lab', agentId: 'odin' },
      sourceRefs: [opportunity.packetId, claims.packetId, supplier.packetId, legacyDraft.packetId],
      evidenceRefs: ['evidence-price-vertical', 'evidence-truth-vertical', 'image-supplier-vertical', 'evidence-supplier-vertical'],
      lockedActions: ['Etsy upload draft', 'Etsy publish', 'Etsy edit listing'], approvalRequired: true,
      payload: {
        contractVersion: 'listing-ready-draft-v1', opportunityPacketId: opportunity.packetId,
        evidenceAllowedClaimsPacketId: claims.packetId, supplierEvidencePacketId: supplier.packetId,
        legacyDraftPacketId: legacyDraft.packetId, upstreamReadiness: { supplierEvidence: 'ready', allowedClaims: 'ready' },
        targetShop: 'DolaroBoutique', categoryGuard: 'jewelry_only', title: 'Initial Necklace Gift',
        description: 'A minimal initial necklace based on verified local evidence.', tags: ['initial necklace', 'gift jewelry'],
        attributes: { type: { value: 'Necklace', evidenceRefs: ['evidence-truth-vertical'] } },
        personalization: false, materials: ['stainless steel', 'gold tone plating'], colors: ['Gold tone'], variants: ['A-Z initials'],
        price: { currency: 'ILS', amount: 200, evidenceRefs: ['evidence-price-vertical'] }, quantity: 1,
        media: [{ imageRef: 'image-supplier-vertical', altText: 'Gold tone initial necklace on a neutral background', order: 1, evidenceRefs: ['image-supplier-vertical', 'evidence-supplier-vertical'] }],
        claims: [{ claimId: 'claim-material-vertical', wording: 'Gold tone plated stainless steel', evidenceRefs: ['evidence-truth-vertical'], conditions: [] }],
        blockedClaims: ['Solid gold'], downstreamConstraints: [], approvalRequired: true,
        liveActionsLocked: ['Etsy upload draft', 'Etsy publish', 'Etsy edit listing'], readiness: 'ready', hardBlocks: [],
      },
    })

    const blockedListing = packetBase({
      packetId: 'packet-listing-vertical-r1', runId, packetType: 'listing-ready-draft',
      missingFields: [],
      from: readyListingTemplate.from, to: readyListingTemplate.to,
      sourceRefs: readyListingTemplate.sourceRefs, evidenceRefs: readyListingTemplate.evidenceRefs,
      lockedActions: readyListingTemplate.lockedActions, approvalRequired: true,
      payload: readyListingTemplate.payload,
    })
    const correctedListing = reviseWorkspacePacket(blockedListing, {
      packetId: 'packet-listing-vertical-r2',
      createdAt: '2026-07-19T00:00:01.000Z',
      idempotencyKey: 'vertical:packet-listing-vertical-r2',
      missingFields: [],
      payload: readyListingTemplate.payload,
    })

    const packets = [created.executionPlanPacket, opportunity, claims, supplier, legacyDraft]
    let clock = Date.parse('2026-07-19T00:00:00.000Z') + 2_000
    const ackByPacket = new Map<string, string>()
    for (const packet of packets) {
      const ack = await handoffPacket(packet, rootDir, clock)
      ackByPacket.set(packet.packetId, ack.ackId)
      state = recordWorkspaceRunPacketEvent(state, runId, {
        type: 'packet.acknowledged', packetId: packet.packetId, ackId: ack.ackId,
        packetRole: packet.packetType === 'execution-plan' ? 'execution-plan' : 'domain', outcome: 'accepted',
      }, clock + 4)
      clock += 10
    }

    const staleStepTo = { roomId: 'etsy-market-lab', agentId: 'odin' }
    const staleStepPayload = validTestContextPayload({
      mission: 'Represent stale Step proof for supersession verification.',
      receiver: staleStepTo,
      executionPlanPacketId: created.executionPlanPacket.packetId,
      stepId: 'step-stale-proof',
      provenanceRef: legacyDraft.packetId,
    })
    const staleStepPacket = packetBase({
      packetId: 'packet-stale-step-vertical', runId, packetType: 'context',
      from: { roomId: 'etsy-market-lab', agentId: 'thor' },
      to: staleStepTo,
      sourceRefs: sourceRefsForTestContext(staleStepPayload), evidenceRefs: [],
      payload: staleStepPayload,
    })
    const staleStepAck = await handoffPacket(staleStepPacket, rootDir, clock)
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.acknowledged', packetId: staleStepPacket.packetId, ackId: staleStepAck.ackId,
      packetRole: 'domain', outcome: 'accepted',
    }, clock + 4)
    const beforeStaleSupersede = await loadWorkspacePacketStore({ rootDir, nowMs: clock + 5 })
    if (!beforeStaleSupersede.ok) throw new Error('Expected store before superseding stale Step proof.')
    const staleSupersededEvent = createWorkspacePacketLifecycleEvent(staleStepPacket, beforeStaleSupersede.state.events, {
      type: 'superseded', actor: staleStepPacket.from,
      reason: 'Accepted Packet is no longer an active Step proof.',
      payload: { supersededByPacketId: 'packet-stale-step-replacement-vertical' },
    }, { eventId: `${staleStepPacket.packetId}:superseded`, createdAt: new Date(clock + 5).toISOString() })
    await persistWorkspacePacketStore({
      packets: [], events: [staleSupersededEvent], acks: [],
      activePacketIds: beforeStaleSupersede.state.packets
        .map((packet) => packet.packetId)
        .filter((packetId) => packetId !== staleStepPacket.packetId),
    }, { rootDir, nowMs: clock + 5 })
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.superseded', packetId: staleStepPacket.packetId,
      packetRole: 'domain', message: 'Accepted stale proof superseded and removed from active refs.',
    }, clock + 5)
    expect(state.runs[0].packetRefs).not.toContain(staleStepPacket.packetId)
    clock += 10

    await expect(handoffPacket(blockedOpportunity, rootDir, clock, 'blocked'))
      .rejects.toThrow(/domain|block|ready/i)
    clock += 10

    const rejectedCandidateAck = await handoffPacket(rejectedOpportunity, rootDir, clock, 'rejected')
    expect(rejectedCandidateAck.outcome).toBe('rejected')
    clock += 10

    const blockedListingAck = await handoffPacket(blockedListing, rootDir, clock, 'blocked')
    ackByPacket.set(blockedListing.packetId, blockedListingAck.ackId)
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.blocked', packetId: blockedListing.packetId, ackId: blockedListingAck.ackId,
      packetRole: 'domain', outcome: 'blocked', message: 'Receiver blocked listing revision 1 pending price-proof review.',
    }, clock + 4)
    clock += 10

    const blockedCompletion = await completeWorkspaceRunWithPacketStore(
      state,
      runId,
      'Must not complete while a required Packet ACK is blocked.',
      clock,
      { rootDir },
    )
    expect(blockedCompletion.ok).toBe(false)
    if (blockedCompletion.ok) throw new Error('Blocked ACK unexpectedly completed the Run.')
    expect(blockedCompletion.missingProof).toContain(`acceptedAck:${blockedListing.packetId}`)
    state = blockedCompletion.state

    const beforeSupersede = await loadWorkspacePacketStore({ rootDir, nowMs: clock + 1 })
    if (!beforeSupersede.ok) throw new Error('Expected Packet store before superseding revision 1.')
    const supersededEvent = createWorkspacePacketLifecycleEvent(blockedListing, beforeSupersede.state.events, {
      type: 'superseded',
      actor: blockedListing.from,
      reason: 'Corrected immutable revision 2 replaces the blocked revision.',
      payload: { supersededByPacketId: correctedListing.packetId },
    }, {
      eventId: `${blockedListing.packetId}:superseded`,
      createdAt: new Date(clock + 1).toISOString(),
    })
    await persistWorkspacePacketStore({
      packets: [],
      events: [supersededEvent],
      acks: [],
      activePacketIds: beforeSupersede.state.packets
        .map((packet) => packet.packetId)
        .filter((packetId) => packetId !== blockedListing.packetId),
    }, { rootDir, nowMs: clock + 1 })
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.superseded', packetId: blockedListing.packetId,
      packetRole: 'domain', message: 'Blocked listing revision superseded by corrected revision 2.',
    }, clock + 1)
    expect(state.runs[0].packetRefs).not.toContain(blockedListing.packetId)
    clock += 10

    const correctedListingAck = await handoffPacket(correctedListing, rootDir, clock)
    ackByPacket.set(correctedListing.packetId, correctedListingAck.ackId)
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.acknowledged', packetId: correctedListing.packetId, ackId: correctedListingAck.ackId,
      packetRole: 'domain', outcome: 'accepted',
    }, clock + 4)
    clock += 10

    expect(fetchSpy).not.toHaveBeenCalled()

    const planPayload = created.executionPlanPacket.payload as { steps: Array<{ stepId: string; title: string }> }
    const readbackTemplate = packetBase({
      packetId: 'packet-readback-template-vertical', runId, packetType: 'run-readback',
      from: { roomId: created.run.ownerRoomId, agentId: created.run.assignedWorkerProfileId ?? null },
      to: { roomId: 'olympus-command', agentId: 'hermes' },
      sourceRefs: [created.executionPlanPacket.packetId, legacyDraft.packetId], evidenceRefs: [],
      payload: {
        executionPlanPacketId: created.executionPlanPacket.packetId, executionPlanRevision: 1, finalStatus: 'completed',
        steps: [{
          stepId: planPayload.steps[0].stepId, required: true, packetRefs: [legacyDraft.packetId],
          ackRefs: [ackByPacket.get(legacyDraft.packetId)], expectedOutput: planPayload.steps[0].title,
          actualOutputRefs: [legacyDraft.packetId], outcome: 'accepted',
        }],
        approvalGrantRefs: [], artifactRefs: [], deliveryReadbackRefs: [], rollbackRefs: [], unresolvedItems: [], nextActions: [],
      },
    })
    const badReadback = packetBase({
      packetId: 'packet-readback-vertical-r1', runId, packetType: 'run-readback',
      from: readbackTemplate.from, to: readbackTemplate.to,
      sourceRefs: [...readbackTemplate.sourceRefs, staleStepPacket.packetId, opportunity.packetId], evidenceRefs: [],
      payload: {
        ...(readbackTemplate.payload as Record<string, unknown>),
        steps: [{
          stepId: planPayload.steps[0].stepId, required: true, packetRefs: [staleStepPacket.packetId],
          ackRefs: [staleStepAck.ackId], expectedOutput: planPayload.steps[0].title,
          actualOutputRefs: [staleStepPacket.packetId, opportunity.packetId], outcome: 'accepted',
        }],
      },
    })
    const badReadbackAck = await handoffPacket(badReadback, rootDir, clock)
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.acknowledged', packetId: badReadback.packetId, ackId: badReadbackAck.ackId,
      packetRole: 'run-readback', outcome: 'accepted',
    }, clock + 4)
    const wrongAckCompletion = await completeWorkspaceRunWithPacketStore(
      state, runId, 'Wrong ACK binding must fail.', clock + 5, { rootDir },
    )
    expect(wrongAckCompletion.ok).toBe(false)
    if (wrongAckCompletion.ok) throw new Error('Superseded Step proof unexpectedly completed the Run.')
    expect(wrongAckCompletion.missingProof).toContain(
      `readbackStepPacketActive:${planPayload.steps[0].stepId}:${staleStepPacket.packetId}`,
    )
    expect(wrongAckCompletion.missingProof).toContain(
      `readbackOutputPacketRef:${planPayload.steps[0].stepId}:${opportunity.packetId}`,
    )
    state = wrongAckCompletion.state
    clock += 10

    const beforeReadbackSupersede = await loadWorkspacePacketStore({ rootDir, nowMs: clock })
    if (!beforeReadbackSupersede.ok) throw new Error('Expected store before correcting RunReadback.')
    const readbackSupersededEvent = createWorkspacePacketLifecycleEvent(badReadback, beforeReadbackSupersede.state.events, {
      type: 'superseded', actor: badReadback.from,
      reason: 'Correct the Step ACK binding in immutable revision 2.',
      payload: { supersededByPacketId: 'packet-readback-vertical-r2' },
    }, { eventId: `${badReadback.packetId}:superseded`, createdAt: new Date(clock).toISOString() })
    await persistWorkspacePacketStore({
      packets: [], events: [readbackSupersededEvent], acks: [],
      activePacketIds: beforeReadbackSupersede.state.packets
        .map((packet) => packet.packetId)
        .filter((packetId) => packetId !== badReadback.packetId),
    }, { rootDir, nowMs: clock })
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.superseded', packetId: badReadback.packetId,
      packetRole: 'run-readback', message: 'Incorrect RunReadback superseded by corrected revision 2.',
    }, clock)

    const readback = reviseWorkspacePacket(badReadback, {
      packetId: 'packet-readback-vertical-r2',
      createdAt: '2026-07-19T00:00:02.000Z',
      idempotencyKey: 'vertical:packet-readback-vertical-r2',
      payload: readbackTemplate.payload,
    })
    clock += 10
    const readbackAck = await handoffPacket(readback, rootDir, clock)
    state = recordWorkspaceRunPacketEvent(state, runId, {
      type: 'packet.acknowledged', packetId: readback.packetId, ackId: readbackAck.ackId,
      packetRole: 'run-readback', outcome: 'accepted',
    }, clock + 4)

    const futureObservedContextProof = await verifyWorkspaceRunCompletionFromPacketStore(state.runs[0], {
      rootDir,
      nowMs: Date.parse('2026-07-18T17:29:59.999Z'),
    })
    expect(futureObservedContextProof.ok).toBe(false)
    if (futureObservedContextProof.ok) throw new Error('Future-observed Context unexpectedly proved completion.')
    expect(futureObservedContextProof.missingProof).toContain(`freshUseProof:${legacyDraft.packetId}`)

    const completed = await completeWorkspaceRunWithPacketStore(state, runId, 'Local vertical slice verified.', clock + 5, { rootDir })
    expect(completed.ok).toBe(true)
    if (!completed.ok) throw new Error(`Expected completion, got ${completed.missingProof.join(', ')}`)
    expect(completed.run.status).toBe('completed')
    expect(completed.run.packetRefs).toHaveLength(7)

    const stored = await loadWorkspacePacketStore({ rootDir })
    expect(stored.ok).toBe(true)
    if (!stored.ok) throw new Error('Expected readable final Packet store.')
    expect(stored.state.packets).toHaveLength(11)
    expect(stored.state.acks).toHaveLength(11)
    const statusByPacket = new Map(stored.state.packets.map((packet) => [
      packet.packetId,
      workspacePacketStatusFromEvents(packet.packetId, stored.state.events),
    ]))
    expect(statusByPacket.has(blockedOpportunity.packetId)).toBe(false)
    expect(statusByPacket.get(rejectedOpportunity.packetId)).toBe('rejected')
    expect(statusByPacket.get(blockedListing.packetId)).toBe('superseded')
    expect(statusByPacket.get(badReadback.packetId)).toBe('superseded')
    expect(statusByPacket.get(staleStepPacket.packetId)).toBe('superseded')
    expect(statusByPacket.get(correctedListing.packetId)).toBe('accepted')
    expect(statusByPacket.get(readback.packetId)).toBe('accepted')
    expect([...statusByPacket.values()].filter((status) => status === 'accepted')).toHaveLength(7)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
