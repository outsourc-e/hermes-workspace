import { describe, expect, it } from 'vitest'
import { getWorkspaceBlueprintById } from './blueprints'
import {
  attachWorkspaceArtifact,
  cancelWorkspaceKernelRun,
  completeWorkspaceRun,
  createWorkspaceApprovalForRun,
  createWorkspaceArtifactForRun,
  createWorkspaceRun,
  recordWorkspaceRunPacketEvent,
  requestWorkspaceApproval,
  resolveWorkspaceKernelApproval,
} from './reducer'
import { routeWorkspaceActionToBlueprint } from './router'

describe('workspace kernel reducer helpers', () => {
  it('creates runs with run.created and run.routed events', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-run-create',
      createdAtMs: 200,
      source: 'operator',
      intent: 'smart intake',
      summary: 'Dolaro AliExpress Google Drive local image prompt',
      input: { text: 'Dolaro AliExpress Google Drive local image prompt' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 200)

    expect(run.runId).toContain('workspace-run-200')
    expect(run.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(run.events.map((event) => event.type)).toEqual(['run.created', 'run.routed'])
    expect(run.executionPlanPacketId).toBeUndefined()
    expect(run.packetRefs).toBeUndefined()
    expect(run.runReadbackPacketId).toBeUndefined()
    expect(run.safety).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('creates packet-enabled runs with an ExecutionPlan before routing', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-packet-run',
      createdAtMs: 211,
      source: 'hermes',
      intent: 'local packet vertical slice',
      summary: 'Packet-enabled local commerce run',
      input: { text: 'Local only. No publish.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 211, {
      executionPlanPacketId: 'packet-plan-211',
    })

    expect(run.executionPlanPacketId).toBe('packet-plan-211')
    expect(run.packetRefs).toEqual(['packet-plan-211'])
    expect(run.runReadbackPacketId).toBeUndefined()
    expect(run.events.map((event) => event.type)).toEqual([
      'run.created',
      'packet.created',
      'packet.ready',
      'run.routed',
    ])
    expect(run.events[1].payload).toMatchObject({
      packetId: 'packet-plan-211',
      packetRole: 'execution-plan',
    })
  })

  it('projects append-only Packet events and deduplicated refs into packet-enabled runs', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-packet-events',
      createdAtMs: 212,
      source: 'hermes',
      intent: 'local packet events',
      summary: 'Packet event projection',
      input: { text: 'Local only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 212, {
      executionPlanPacketId: 'packet-plan-212',
    })
    const eventTypes = [
      'packet.ready',
      'packet.offered',
      'packet.acknowledged',
      'packet.blocked',
      'packet.rejected',
      'packet.superseded',
    ] as const
    let state = { runs: [run] }
    for (const [index, type] of eventTypes.entries()) {
      state = recordWorkspaceRunPacketEvent(state, run.runId, {
        type,
        packetId: index < 3 ? 'packet-opportunity-212' : `packet-${type}-${index}`,
        ...(type === 'packet.acknowledged'
          ? { ackId: 'ack-opportunity-212', outcome: 'accepted' as const }
          : {}),
      }, 213 + index)
    }

    const nextRun = state.runs[0]
    expect(nextRun.packetRefs).toEqual([
      'packet-plan-212',
      'packet-opportunity-212',
      'packet-packet.blocked-3',
      'packet-packet.rejected-4',
    ])
    expect(nextRun.events.map((event) => event.type)).toEqual(expect.arrayContaining([...eventTypes]))
    expect(nextRun.events.find((event) => event.type === 'packet.acknowledged')?.payload).toMatchObject({
      packetId: 'packet-opportunity-212',
      ackId: 'ack-opportunity-212',
      outcome: 'accepted',
    })
  })

  it('blocks packet-enabled completion until every required Packet has accepted ACK proof and a RunReadback', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-packet-completion-blocked',
      createdAtMs: 220,
      source: 'hermes',
      intent: 'complete local packet run',
      summary: 'Packet completion proof required',
      input: { text: 'Local only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 220, {
      executionPlanPacketId: 'packet-plan-220',
    })
    const completed = completeWorkspaceRun({ runs: [run] }, run.runId, 'Done without proof.', 221)
    const nextRun = completed.run!

    expect(completed.ok).toBe(false)
    expect(nextRun.status).toBe('blocked')
    expect(nextRun.stage).toBe('blocked')
    expect(nextRun.events.at(-1)).toMatchObject({
      type: 'run.blocked',
      payload: {
        code: 'workspace_packet_proof_missing',
        missingProof: expect.arrayContaining([
          'runReadbackPacketId',
          'verifiedPacketStoreProof',
        ]),
      },
    })
  })

  it('does not downgrade a run to legacy completion after its ExecutionPlan is superseded', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-superseded-plan-completion',
      createdAtMs: 225,
      source: 'hermes',
      intent: 'replace a packet plan safely',
      summary: 'Packet completion remains gated while the replacement plan is missing.',
      input: { text: 'Local only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 225, {
      executionPlanPacketId: 'packet-plan-225',
    })
    const state = recordWorkspaceRunPacketEvent({ runs: [run] }, run.runId, {
      type: 'packet.superseded',
      packetId: 'packet-plan-225',
      packetRole: 'execution-plan',
      message: 'ExecutionPlan revision 1 was superseded; revision 2 is still missing.',
    }, 226)

    expect(state.runs[0].executionPlanPacketId).toBeUndefined()
    const completed = completeWorkspaceRun(state, run.runId, 'Must not complete through legacy mode.', 227)
    expect(completed.ok).toBe(false)
    if (completed.ok) throw new Error('Superseded ExecutionPlan unexpectedly downgraded to legacy completion.')
    expect(completed.code).toBe('workspace_packet_proof_missing')
    expect(completed.missingProof).toContain('executionPlanPacketId:active')
    expect(completed.run?.status).toBe('blocked')
  })

  it('removes a superseded Packet from active refs while preserving its audit event', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-superseded-ref',
      createdAtMs: 1_000,
      source: 'hermes',
      intent: 'local product research',
      summary: 'Replace a blocked immutable Packet revision.',
      input: { text: 'Local only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 1_000)
    let state = recordWorkspaceRunPacketEvent({ runs: [run] }, run.runId, {
      type: 'packet.acknowledged',
      packetId: 'packet-old-revision',
      ackId: 'ack-old-revision',
      outcome: 'blocked',
    }, 1_010)

    state = recordWorkspaceRunPacketEvent(state, run.runId, {
      type: 'packet.superseded',
      packetId: 'packet-old-revision',
      message: 'Old revision superseded by a corrected immutable revision.',
    }, 1_020)

    expect(state.runs[0].packetRefs).not.toContain('packet-old-revision')
    expect(state.runs[0].events.at(-1)).toMatchObject({
      type: 'packet.superseded',
      payload: { packetId: 'packet-old-revision' },
    })
  })

  it('completes packet-enabled runs only with verified Packet store proof', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-packet-completion-ready',
      createdAtMs: 230,
      source: 'hermes',
      intent: 'complete proven local packet run',
      summary: 'Packet completion proof present',
      input: { text: 'Local only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 230, {
      executionPlanPacketId: 'packet-plan-230',
    })
    let state = recordWorkspaceRunPacketEvent({ runs: [run] }, run.runId, {
      type: 'packet.acknowledged',
      packetId: 'packet-plan-230',
      ackId: 'ack-plan-230',
      outcome: 'accepted',
    }, 231)
    state = recordWorkspaceRunPacketEvent(state, run.runId, {
      type: 'packet.created',
      packetId: 'packet-opportunity-230',
    }, 232)
    state = recordWorkspaceRunPacketEvent(state, run.runId, {
      type: 'packet.acknowledged',
      packetId: 'packet-opportunity-230',
      ackId: 'ack-opportunity-230',
      outcome: 'accepted',
    }, 233)
    state = recordWorkspaceRunPacketEvent(state, run.runId, {
      type: 'packet.created',
      packetId: 'packet-readback-230',
      packetRole: 'run-readback',
    }, 234)
    const packetRefs = state.runs[0].packetRefs ?? []
    const completed = completeWorkspaceRun(
      state,
      run.runId,
      'All required local Packet proof accepted.',
      235,
      {
        runId: run.runId,
        executionPlanPacketId: 'packet-plan-230',
        runReadbackPacketId: 'packet-readback-230',
        packets: packetRefs.map((packetId, index) => ({
          packetId,
          contentHash: `${index + 1}`.repeat(64),
          acceptedAckId: `verified-ack-${index + 1}`,
        })),
        verifiedAtMs: 235,
      },
    )
    expect(completed.ok).toBe(true)
    if (!completed.ok) throw new Error(`Expected verified completion, got ${completed.code}.`)
    const nextRun = completed.run

    expect(nextRun.runReadbackPacketId).toBe('packet-readback-230')
    expect(nextRun.status).toBe('completed')
    expect(nextRun.events.at(-1)?.type).toBe('run.completed')
  })

  it('attaches artifacts and preserves evidence, missing fields, and locked actions', () => {
    const blueprint = getWorkspaceBlueprintById('cad-3d-print-design-v1')!
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-artifact',
      createdAtMs: 201,
      source: 'ui',
      intent: 'cad',
      summary: 'STL design packet',
      input: { text: 'STL design packet' },
    })
    const run = createWorkspaceRun(route.action, blueprint, 201)
    const artifact = {
      ...createWorkspaceArtifactForRun(run, blueprint, 202),
      evidenceIds: ['evidence-local-note'],
      missingFields: ['reference dimensions'],
    }
    const state = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
    const nextRun = state.runs[0]

    expect(nextRun.artifacts[0]).toMatchObject({
      kind: 'cad-design-packet',
      evidenceIds: ['evidence-local-note'],
      missingFields: ['reference dimensions'],
    })
    expect(nextRun.events.map((event) => event.type)).toContain('artifact.created')
    expect(nextRun.artifacts[0].lockedActions.join(' ')).toContain('printer control')
  })

  it('requests approval and moves the run to waiting_approval', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-approval',
      createdAtMs: 203,
      source: 'ui',
      intent: 'publish',
      summary: 'Publish live Etsy listing',
      input: { text: 'publish upload live listing' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 203)
    const approval = createWorkspaceApprovalForRun(run, route.blueprint, 204)
    const state = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    const nextRun = state.runs[0]

    expect(nextRun.status).toBe('waiting_approval')
    expect(nextRun.stage).toBe('approval')
    expect(nextRun.approvals[0]).toMatchObject({
      status: 'waiting_operator',
      riskClass: 'R5_DESTRUCTIVE',
      preview: run.readback,
    })
    expect(nextRun.approvals[0].lockedActions.join(' ')).toContain('live Etsy')
    expect(nextRun.events.map((event) => event.type)).toContain('approval.requested')
  })

  it('records approval decisions without unlocking live execution', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-approval-resolve',
      createdAtMs: 205,
      source: 'ui',
      intent: 'publish',
      summary: 'Publish live Etsy listing',
      input: { text: 'publish upload live listing' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 205)
    const approval = createWorkspaceApprovalForRun(run, route.blueprint, 206)
    const waiting = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    const resolved = resolveWorkspaceKernelApproval(waiting, approval.approvalId, 'approved', { nowMs: 207 })
    const nextRun = resolved.runs[0]

    expect(nextRun.status).toBe('blocked')
    expect(nextRun.stage).toBe('blocked')
    expect(nextRun.approvals[0].status).toBe('approved')
    expect(nextRun.readback).toContain('Live executor is still gated')
    expect(nextRun.events.map((event) => event.type)).toContain('approval.approved')
    expect(nextRun.events.at(-1)?.payload).toMatchObject({ liveExecutorConnected: false })
  })

  it('cancels a run locally and rejects waiting approvals', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-cancel-run',
      createdAtMs: 208,
      source: 'ui',
      intent: 'publish',
      summary: 'Publish live Etsy listing',
      input: { text: 'publish upload live listing' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 208)
    const approval = createWorkspaceApprovalForRun(run, route.blueprint, 209)
    const waiting = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    const cancelled = cancelWorkspaceKernelRun(waiting, run.runId, 'Operator cancelled from test.', 210)
    const nextRun = cancelled.runs[0]

    expect(nextRun.status).toBe('cancelled')
    expect(nextRun.stage).toBe('blocked')
    expect(nextRun.approvals[0].status).toBe('rejected')
    expect(nextRun.events.map((event) => event.type)).toContain('run.cancelled')
    expect(nextRun.events.at(-1)?.payload).toMatchObject({ liveExecutorConnected: false })
  })
})
