import { describe, expect, it } from 'vitest'
import { createWorkspacePacket } from './packets/factory'
import { sourceRefsForTestContext, validTestContextPayload } from './packets/test-fixtures'
import {
  buildWorkspaceMissionSpine,
  buildWorkspacePacketMissionRail,
  createCouncilHandoffWorkspaceRun,
  parseWorkspacePacketMissionResults,
  workspaceAgentMindsForRun,
} from './mission-spine'

function contextPacket(input: {
  packetId: string
  createdAt: string
  fromAgentId: string
  toAgentId: string
  missingFields?: Array<string>
  approval?: { required: boolean; stage: string | null; grantId: string | null }
}) {
  const receiver = { roomId: 'terra-forge', agentId: input.toAgentId }
  const payload = validTestContextPayload({
    mission: `Mission for ${input.packetId}`,
    receiver,
    executionPlanPacketId: 'packet-plan-mission-rail',
    stepId: `step-${input.packetId}`,
  })
  return createWorkspacePacket({
    packetId: input.packetId,
    packetLineageId: input.packetId,
    runId: 'run-mission-rail',
    schemaVersion: '1.0.0',
    packetType: 'context',
    from: { roomId: 'olympus-command', agentId: input.fromAgentId },
    to: receiver,
    createdAt: input.createdAt,
    sourceRefs: sourceRefsForTestContext(payload),
    evidenceRefs: [],
    assumptions: [],
    missingFields: input.missingFields ?? [],
    lockedActions: ['external-action'],
    approval: input.approval ?? { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{
      criterionId: `criterion-${input.packetId}`,
      description: 'Packet rail must show persisted truth.',
      required: true,
    }],
    idempotencyKey: `run-mission-rail:${input.packetId}`,
    payload,
  })
}

describe('workspace mission spine', () => {
  it('routes Council -> Hermes -> Terra for 3D-print missions with separated minds', () => {
    const run = createCouncilHandoffWorkspaceRun({
      packetId: 'council-packet-3d',
      topic: 'I want to 3D print a modular phone stand',
      verdict: 'Proceed with a small printable prototype',
      summary: 'Build a local CAD/print packet first; keep printer control locked.',
      voteLine: '5 support · 1 guarded',
      prompt: 'Hermes: turn this into a 3D print brief for Terra. Need STL/STEP, slicer checks, printer approval locked.',
    }, 1_000)

    expect(run.blueprintId).toBe('cad-3d-print-design-v1')
    expect(run.ownerRoomId).toBe('terra-forge')
    expect(run.ownerStationId).toBe('terra-modeling-studio')
    expect(run.artifacts[0]).toMatchObject({
      kind: 'cad-design-packet',
      roomId: 'terra-forge',
      stationId: 'terra-modeling-studio',
    })
    expect(run.artifacts[0].payload).toMatchObject({
      councilPacketId: 'council-packet-3d',
      missionSpine: 'council-hermes-routed-v1',
    })
    expect(run.approvals[0]).toMatchObject({
      status: 'waiting_operator',
      targetSystem: 'cad-3d-print',
    })

    const spine = buildWorkspaceMissionSpine({ runs: [run], prompt: run.actionInput.text })
    expect(spine.map((step) => step.stepId)).toEqual([
      'idea',
      'council',
      'hermes_brief',
      'routed_room',
      'agent_work',
      'approval',
      'readback',
    ])
    expect(spine.find((step) => step.stepId === 'council')).toMatchObject({ status: 'done', packetId: 'council-packet-3d' })
    expect(spine.find((step) => step.stepId === 'routed_room')).toMatchObject({ ownerAgentId: 'terra', roomId: 'terra-forge' })
    expect(spine.find((step) => step.stepId === 'approval')).toMatchObject({ status: 'waiting', ownerAgentId: 'odin', roomId: 'olympus-command', stationId: 'approval-dais' })

    const minds = workspaceAgentMindsForRun(run)
    expect(minds.map((mind) => mind.mindId)).toEqual([
      'council-strategists',
      'hermes-manager',
      'terra-3d-print',
      'approval-guardian',
    ])
    expect(minds.find((mind) => mind.mindId === 'terra-3d-print')).toMatchObject({
      agentId: 'terra',
      contextScope: 'private-focus',
      roomId: 'terra-forge',
    })
  })

  it('routes Council -> Hermes -> Etsy with the same mission spine backbone', () => {
    const run = createCouncilHandoffWorkspaceRun({
      packetId: 'council-packet-etsy',
      topic: 'Find Dolaro Etsy product opportunity',
      verdict: 'Use Etsy smart intake first',
      summary: 'Start with product discovery; publish/upload remains locked.',
      voteLine: '4 support · 2 guarded',
      prompt: 'Hermes: prepare an Etsy product research mission from AliExpress links and local images; do not publish.',
    }, 2_000)

    expect(run.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(run.ownerRoomId).toBe('etsy-market-lab')
    expect(run.ownerStationId).toBe('etsy-loki-product-hunt')
    expect(workspaceAgentMindsForRun(run).map((mind) => mind.mindId)).toContain('etsy-market-operators')
    expect(buildWorkspaceMissionSpine({ runs: [run] }).find((step) => step.stepId === 'routed_room')).toMatchObject({
      ownerAgentId: 'loki',
      roomId: 'etsy-market-lab',
    })
  })

  it('routes Council -> Hermes -> Poseidon for Atlantis Vault DB and Obsidian catalog missions', () => {
    const run = createCouncilHandoffWorkspaceRun({
      packetId: 'council-packet-vault',
      topic: 'Clean Atlantis Vault DB and Obsidian mappings',
      verdict: 'Inspect real links before cleanup',
      summary: 'Build a data-backed audit packet; writes and deletes stay locked.',
      voteLine: '6 support · 0 guarded',
      prompt: 'Hermes: route this to Atlantis Vault for Poseidon. Audit DB/Supabase tables, Obsidian catalog links, rejected candidates, and cleanup readback. Do not write or delete.',
    }, 3_000)

    expect(run.blueprintId).toBe('atlantis-vault-governance-v1')
    expect(run.ownerRoomId).toBe('atlantis-vault')
    expect(run.ownerStationId).toBe('atlantis-index')
    expect(run.artifacts[0]).toMatchObject({
      kind: 'data-vault-audit-packet',
      roomId: 'atlantis-vault',
      stationId: 'atlantis-index',
    })
    expect(workspaceAgentMindsForRun(run).map((mind) => mind.mindId)).toEqual([
      'council-strategists',
      'hermes-manager',
      'poseidon-atlantis-vault',
    ])
    expect(buildWorkspaceMissionSpine({ runs: [run] }).find((step) => step.stepId === 'routed_room')).toMatchObject({
      ownerAgentId: 'poseidon',
      roomId: 'atlantis-vault',
      stationId: 'atlantis-index',
    })
  })

  it('projects Packet IDs without changing the seven-step mission spine', () => {
    const legacyRun = createCouncilHandoffWorkspaceRun({
      packetId: 'council-packet-projection',
      topic: 'Local commerce packet projection',
      verdict: 'Use packet-enabled path',
      summary: 'Keep every external action locked.',
      voteLine: '6 support · 0 guarded',
      prompt: 'Hermes: project local packet references only.',
    }, 2_500)
    const packetRun = {
      ...legacyRun,
      executionPlanPacketId: 'packet-plan-projection',
      packetRefs: [
        'packet-plan-projection',
        'packet-opportunity-projection',
        'packet-evidence-projection',
        'packet-draft-projection',
        'packet-readback-projection',
      ],
      runReadbackPacketId: 'packet-readback-projection',
    }
    const spine = buildWorkspaceMissionSpine({ runs: [packetRun] })

    expect(spine).toHaveLength(7)
    expect(spine.find((step) => step.stepId === 'hermes_brief')?.packetId).toBe('packet-plan-projection')
    expect(spine.find((step) => step.stepId === 'agent_work')?.packetId).toBe('packet-draft-projection')
    expect(spine.find((step) => step.stepId === 'readback')?.packetId).toBe('packet-readback-projection')
  })

  it('projects sender, receiver, lifecycle truth, missing fields and the next required action from persisted Packets', () => {
    const first = contextPacket({
      packetId: 'packet-context-missing',
      createdAt: '2026-07-20T17:00:00.000Z',
      fromAgentId: 'hermes',
      toAgentId: 'terra',
      missingFields: ['modelChecksum'],
    })
    const second = contextPacket({
      packetId: 'packet-context-offered',
      createdAt: '2026-07-20T17:01:00.000Z',
      fromAgentId: 'terra',
      toAgentId: 'odin',
    })
    const results = parseWorkspacePacketMissionResults([
      { packet: second, status: 'offered', missingFields: [], statusReason: null },
      { packet: first, status: 'blocked', missingFields: ['printerProfile'], statusReason: 'Need exact printer evidence.' },
    ])
    const rail = buildWorkspacePacketMissionRail(results)

    expect(rail.map((item) => item.packetId)).toEqual(['packet-context-missing', 'packet-context-offered'])
    expect(rail[0]).toMatchObject({
      packetType: 'context',
      summary: 'hermes → terra',
      status: 'blocked',
      tone: 'blocked',
      missingFields: ['modelChecksum', 'printerProfile'],
      nextRequiredAction: 'Fill: modelChecksum, printerProfile.',
    })
    expect(rail[1]).toMatchObject({
      summary: 'terra → odin',
      status: 'offered',
      tone: 'active',
      nextRequiredAction: expect.stringContaining('ACK the exact hash'),
    })
  })

  it('does not invent a gate and refuses malformed Packet/status entries', () => {
    const noGate = contextPacket({
      packetId: 'packet-context-no-gate',
      createdAt: '2026-07-20T17:02:00.000Z',
      fromAgentId: 'hermes',
      toAgentId: 'terra',
    })
    const needsGate = contextPacket({
      packetId: 'packet-context-needs-gate',
      createdAt: '2026-07-20T17:03:00.000Z',
      fromAgentId: 'terra',
      toAgentId: 'odin',
      approval: { required: true, stage: 'publish', grantId: null },
    })
    const parsed = parseWorkspacePacketMissionResults([
      { packet: noGate, status: 'ready' },
      { packet: needsGate, status: 'ready' },
      { packet: { ...noGate, contentHash: '0'.repeat(64) }, status: 'ready' },
      { packet: noGate, status: 'made-up' },
    ])
    const rail = buildWorkspacePacketMissionRail(parsed)

    expect(rail).toHaveLength(2)
    expect(rail[0].approvalGatePersisted).toBe(false)
    expect(rail[0].nextRequiredAction).toBe('Offer this Packet to terra.')
    expect(rail[1]).toMatchObject({
      approvalGatePersisted: false,
      approvalStage: 'publish',
      nextRequiredAction: 'Persist the publish approval gate before any live action.',
    })
  })
})
