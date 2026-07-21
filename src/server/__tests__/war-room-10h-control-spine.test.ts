import { describe, expect, it } from 'vitest'
import {
  buildWarRoom10hControlSpineState,
  createWarRoom10hActionBlueprintRegistry,
  createWarRoom10hConnectorActionDraft,
  createWarRoom10hConnectorRegistry,
  createWarRoom10hSafetyEvidence,
  createWarRoom10hSafetySpine,
  createWarRoom10hWorkflowPacket,
  deriveWarRoom10hAgentMovement,
} from '../war-room-10h-control-spine'
import type {
  WarRoomConnectorRegistryEntry,
  WarRoomWorkflowPacket,
} from '../war-room-10h-types'

describe('War Room 10h control spine', () => {
  it('builds a complete state with room graph, packets, connectors, action blueprints, and safety locks', () => {
    const state = buildWarRoom10hControlSpineState()

    expect(state.ok).toBe(true)
    expect(state.version).toBe('war-room-10h-control-spine-v1')
    expect(state.roomGraph.rooms).toHaveLength(10)
    expect(state.roomGraph.corridors.length).toBeGreaterThan(0)
    expect(state.connectorRegistry.length).toBeGreaterThanOrEqual(3)
    expect(state.actionBlueprintRegistry.length).toBeGreaterThanOrEqual(7)
    expect(state.packets.length).toBeGreaterThan(0)
    expect(state.agentMovements.length).toBe(state.packets.length)
    expect(state.actionDraftQueues.length).toBeGreaterThan(0)
    expect(state.approvalQueue.entries.length).toBeGreaterThan(0)
  })

  it('defaults the safety spine with external/paid/live flags locked false', () => {
    const safety = createWarRoom10hSafetySpine()

    expect(safety).toMatchObject({
      externalActionsEnabled: false,
      liveEtsyEnabled: false,
      liveSupplierEnabled: false,
      paidGenerationEnabled: false,
      discordSideEffectsEnabled: false,
      credentialsLoadedByDefault: false,
      connectorLiveModeEnabled: false,
      workspaceWritesAllowed: true,
      kanbanUiMutationsAllowed: false,
      approvalRequiredForExternalActions: true,
      noAutoApproval: true,
      noOverclaimFinalQuality: true,
    })
  })

  it('exposes safety evidence with forbidden actions and allowed connector modes', () => {
    const evidence = createWarRoom10hSafetyEvidence()

    expect(evidence.noEnabledLiveActionControls).toBe(true)
    expect(evidence.defaultConnectorLockState).toBe('NOT_CONNECTED')
    expect(evidence.allowedConnectorModes).toEqual([
      'disabled',
      'read-only',
      'dry-run',
      'draft-only',
    ])
    expect(evidence.forbiddenWithoutDlvApproval).toContain('publish')
    expect(evidence.forbiddenWithoutDlvApproval).toContain('paid generation')
    expect(evidence.forbiddenWithoutDlvApproval).toContain(
      'git push/merge/reset/clean/stash/checkout',
    )
  })

  it('defaults every external business connector to NOT_CONNECTED or read-only/dry-run with no credentials', () => {
    const registry = createWarRoom10hConnectorRegistry()

    for (const connector of registry) {
      expect(connector.credentialsLoaded).toBe(false)
      expect(connector.liveApiCallsEnabled).toBe(false)
      expect(connector.networkWritesEnabled).toBe(false)
      expect([
        'NOT_CONNECTED',
        'READ_ONLY_READY',
        'DRY_RUN_ONLY',
        'DRAFT_ONLY',
        'BLOCKED_FOR_DLV_APPROVAL',
      ]).toContain(connector.lockState)
      for (const capability of connector.capabilities) {
        expect(capability.externalMutation).toBe(false)
        expect(capability.requiresDlvApproval).toBe(true)
      }
    }

    const etsy = registry.find((entry) => entry.category === 'store')
    expect(etsy?.lockState).toBe('NOT_CONNECTED')
    expect(etsy?.mode).toBe('draft-only')
  })

  it('defines reference-video action blueprints from trigger through feedback with safe classifications', () => {
    const blueprints = createWarRoom10hActionBlueprintRegistry()
    const byId = new Map(
      blueprints.map((blueprint) => [blueprint.id, blueprint]),
    )

    expect(byId.get('etsy-listing-draft-prep')).toMatchObject({
      actionClass: 'allowedLocalDraft',
      trigger: 'opportunity-approved',
      router: 'olympus-command',
      packetKind: 'action-draft',
      roomId: 'merchant-harbor',
      stationId: 'merchant-draft-hold',
      outputArtifactKind: 'draft',
      approvalGate: 'DLV-manual-confirm-required',
      archiveRoomId: 'atlantis-vault',
      feedbackLoop: 'oracle-signals',
      liveExecutionEnabled: false,
      externalMutation: false,
    })

    expect(byId.get('supplier-proof-readonly')?.actionClass).toBe(
      'allowedReadOnly',
    )
    expect(byId.get('discord-cockpit-live-send')?.actionClass).toBe(
      'lockedLive',
    )

    for (const blueprint of blueprints) {
      expect(blueprint.liveExecutionEnabled).toBe(false)
      expect(blueprint.externalMutation).toBe(false)
      expect(blueprint.payloadPreviewRequired).toBe(true)
      expect(blueprint.localAuditLogRequired).toBe(true)
      expect(blueprint.approvalGate).toMatch(/DLV|manual|blocked/i)
    }
  })

  it('creates action drafts that cannot mutate externally and require DLV approval', () => {
    const registry = createWarRoom10hConnectorRegistry()
    const draft = createWarRoom10hConnectorActionDraft({
      connectorId: 'etsy-shop-connector',
      roomId: 'merchant-harbor',
      packetId: 'pkt-test',
      actionKind: 'prepare-listing-draft',
      registry,
    })

    expect(draft).toMatchObject({
      connectorId: 'etsy-shop-connector',
      roomId: 'merchant-harbor',
      packetId: 'pkt-test',
      mode: 'draft-only',
      status: 'rejected-by-safety-spine',
      externalMutation: false,
      requiresDlvApproval: true,
    })
    expect(draft.evidence.join(' ')).toContain('NOT_CONNECTED')
    expect(draft.evidence.join(' ')).toContain('no credentials')
  })

  it('permits dry-run drafts for local workspace connectors while still requiring DLV approval', () => {
    const registry = createWarRoom10hConnectorRegistry()
    const draft = createWarRoom10hConnectorActionDraft({
      connectorId: 'workspace-local-connector',
      roomId: 'forge-hephaestus',
      packetId: 'pkt-local',
      actionKind: 'validate-local-draft',
      registry,
    })

    expect(draft.mode).toBe('dry-run')
    expect(draft.status).toBe('queued-for-human-review')
    expect(draft.externalMutation).toBe(false)
    expect(draft.requiresDlvApproval).toBe(true)
  })

  it('builds workflow packets with review locks and safety spine', () => {
    const packet = createWarRoom10hWorkflowPacket({
      id: 'pkt-test-001',
      kind: 'action-draft',
      sourceRoomId: 'olympus-command',
      targetRoomId: 'merchant-harbor',
      sourceStationId: 'olympus-approval',
      targetStationId: 'merchant-connector-dock',
      corridorId: 'command-to-merchant',
      worker: {
        id: 'worker-test',
        profile: 'test',
        role: 'connector-worker',
        displayName: 'Test Worker',
      },
      activity: 'queued',
      sourceTaskId: 't_test',
      connectorId: 'etsy-shop-connector',
    })

    expect(packet.sourceRoomId).toBe('olympus-command')
    expect(packet.targetRoomId).toBe('merchant-harbor')
    expect(packet.corridorId).toBe('command-to-merchant')
    expect(packet.reviewLock.required).toBe(true)
    expect(packet.reviewLock.externalMutationAllowed).toBe(false)
    expect(packet.reviewLock.approvalState).toBe('required')
    expect(packet.safety.externalActionsEnabled).toBe(false)
    expect(packet.safety.liveEtsyEnabled).toBe(false)
  })

  it('derives deterministic agent movement from packet state without randomness', () => {
    const packet = createWarRoom10hWorkflowPacket({
      id: 'pkt-deterministic',
      kind: 'implementation',
      sourceRoomId: 'olympus-command',
      targetRoomId: 'forge-hephaestus',
      sourceStationId: 'olympus-command-table',
      targetStationId: 'forge-workbench',
      corridorId: 'command-to-forge',
      worker: {
        id: 'worker-test',
        profile: 'test',
        role: 'implementer',
        displayName: 'Test Worker',
      },
      activity: 'in-progress',
    })

    const first = deriveWarRoom10hAgentMovement(packet)
    const second = deriveWarRoom10hAgentMovement(packet)

    expect(first).toEqual(second)
    expect(first.progress).toBeGreaterThanOrEqual(10)
    expect(first.progress).toBeLessThanOrEqual(90)
    expect(first.state).toBe('walking-corridor')
  })

  it('maps blocked packets to blocked-at-gate and complete packets to returning-with-artifact', () => {
    const blockedPacket = createWarRoom10hWorkflowPacket({
      id: 'pkt-blocked',
      kind: 'approval-lock',
      sourceRoomId: 'forge-hephaestus',
      targetRoomId: 'merchant-harbor',
      sourceStationId: 'forge-qa',
      targetStationId: 'merchant-connector-dock',
      corridorId: 'forge-to-merchant',
      worker: {
        id: 'worker-test',
        profile: 'test',
        role: 'connector-worker',
        displayName: 'Test Worker',
      },
      activity: 'blocked',
    })

    const completePacket = createWarRoom10hWorkflowPacket({
      id: 'pkt-complete',
      kind: 'artifact-handoff',
      sourceRoomId: 'forge-hephaestus',
      targetRoomId: 'atlantis-vault',
      sourceStationId: 'forge-asset-bench',
      targetStationId: 'atlantis-archive',
      corridorId: 'forge-to-atlantis',
      worker: {
        id: 'worker-test',
        profile: 'test',
        role: 'asset-worker',
        displayName: 'Test Worker',
      },
      activity: 'complete',
      artifactLabel: 'Final manifest',
    })

    expect(deriveWarRoom10hAgentMovement(blockedPacket).state).toBe(
      'blocked-at-gate',
    )
    expect(deriveWarRoom10hAgentMovement(completePacket).state).toBe(
      'returning-with-artifact',
    )
  })

  it('keeps artifact final quality claims at prototype or qa-evidence-only by default', () => {
    const packet = createWarRoom10hWorkflowPacket({
      id: 'pkt-quality',
      kind: 'implementation',
      sourceRoomId: 'agora-opportunity',
      targetRoomId: 'forge-hephaestus',
      sourceStationId: 'agora-planning',
      targetStationId: 'forge-workbench',
      corridorId: 'agora-to-forge',
      worker: {
        id: 'worker-test',
        profile: 'test',
        role: 'implementer',
        displayName: 'Test Worker',
      },
      activity: 'in-progress',
      artifactLabel: 'Draft spec',
    })

    expect(packet.artifact).not.toBeNull()
    expect(['prototype', 'qa-evidence-only', 'none']).toContain(
      packet.artifact?.finalQualityClaim,
    )
  })

  it('produces an approval queue with auto-approval disabled and every entry requiring DLV approval', () => {
    const state = buildWarRoom10hControlSpineState()

    expect(state.approvalQueue.autoApprovalEnabled).toBe(false)
    expect(state.approvalQueue.externalMutation).toBe(false)
    for (const entry of state.approvalQueue.entries) {
      expect(entry.externalMutation).toBe(false)
      expect(entry.requiresDlvApproval).toBe(true)
      expect(entry.status).toBe('pending')
    }
  })

  it('does not allow live connector enablement through approval queue or registry', () => {
    const registry = createWarRoom10hConnectorRegistry()
    const allowedLockStates: Array<WarRoomConnectorRegistryEntry['lockState']> =
      [
        'NOT_CONNECTED',
        'READ_ONLY_READY',
        'DRY_RUN_ONLY',
        'DRAFT_ONLY',
        'BLOCKED_FOR_DLV_APPROVAL',
      ]
    const allowedModes: Array<WarRoomConnectorRegistryEntry['mode']> = [
      'disabled',
      'read-only',
      'dry-run',
      'draft-only',
    ]

    for (const connector of registry) {
      expect(allowedLockStates).toContain(connector.lockState)
      expect(allowedModes).toContain(connector.mode)
    }
  })

  it('includes all 10 horizontal mini-room contract rooms with connected corridors', () => {
    const state = buildWarRoom10hControlSpineState()
    const roomIds = state.roomGraph.rooms.map((room) => room.id)

    expect(roomIds).toContain('olympus-command')
    expect(roomIds).toContain('agora-opportunity')
    expect(roomIds).toContain('oracle-signals')
    expect(roomIds).toContain('forge-hephaestus')
    expect(roomIds).toContain('merchant-harbor')
    expect(roomIds).toContain('atlantis-vault')
    expect(roomIds).toContain('treasury-commerce')
    expect(roomIds).toContain('roman-dev-studio')
    expect(roomIds).toContain('gateway-discord-cockpit')
    expect(roomIds).toContain('rest-agent-lounge')

    const corridorRoomIds = new Set<string>()
    for (const corridor of state.roomGraph.corridors) {
      corridorRoomIds.add(corridor.sourceRoomId)
      corridorRoomIds.add(corridor.targetRoomId)
    }
    for (const roomId of roomIds) {
      expect(corridorRoomIds).toContain(roomId)
    }

    for (const room of state.roomGraph.rooms) {
      expect(room.moduleContract).toMatchObject({
        moduleShape: 'horizontal-rectangle',
        allRoomsViewScale: 'miniature-self-contained-room',
        corridorConnection: 'physical-paved-corridor-or-bridge',
      })
      expect(room.stations.length).toBeGreaterThan(0)
    }
  })

  it('exposes room, agent, packet, station, and manual-only lock state contracts', () => {
    const state = buildWarRoom10hControlSpineState()

    expect(state.stateContracts.rooms).toHaveLength(10)
    expect(state.stateContracts.agents).toHaveLength(10)
    for (const agent of state.stateContracts.agents) {
      expect(agent.minimumFrameCount).toBe(50)
      expect(agent.movementTempo).toBe('slow-real-directional')
      expect(agent.directions).toEqual(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'])
      expect(agent.roleStates).toEqual([
        'idle',
        'walk',
        'work-use-station',
        'talk',
        'carry-packet',
        'rest-recharge',
        'blocked-thinking',
      ])
    }

    for (const packet of state.stateContracts.packets) {
      expect(packet.externalMutation).toBe(false)
      expect(packet.routeConstraint).toBe('physical-corridor-only')
      expect(packet.allowedStates).toContain('moving-along-road')
      expect(packet.allowedStates).toContain('approved-sealed')
      expect(packet.allowedStates).toContain('blocked')
    }

    for (const station of state.stateContracts.stations) {
      expect(station.externalActionCapable).toBe(false)
      expect(station.manualApprovalRequiredForLiveAction).toBe(true)
      expect(station.visualStates).toContain('manual-approval-needed')
    }

    expect(state.stateContracts.locks).toMatchObject({
      readOnlyAllowed: true,
      dryRunAllowed: true,
      localDraftAllowed: true,
      autonomousLiveActionAllowed: false,
      externalNetworkWritesAllowed: false,
      credentialLoadingAllowedByDefault: false,
    })
    expect(state.stateContracts.locks.manualLiveActionSkeletonStates).toContain(
      'queued-for-dlv-manual-review',
    )
    expect(state.stateContracts.locks.manualLiveActionSkeletonStates).toContain(
      'blocked-by-safety-spine',
    )
  })

  it('does not expose forbidden legacy Kimi/Claude/Gemini profile lanes in seed workers', () => {
    const state = buildWarRoom10hControlSpineState()
    const profiles = state.packets.map((packet) => packet.worker.profile.toLowerCase())

    for (const profile of profiles) {
      expect(profile).not.toMatch(/kimi|claude|gemini/)
    }
  })

  it('returns identical control spine state shape across multiple builds', () => {
    const first = buildWarRoom10hControlSpineState()
    const second = buildWarRoom10hControlSpineState()

    expect(first.roomGraph.rooms.map((room) => room.id)).toEqual(
      second.roomGraph.rooms.map((room) => room.id),
    )
    expect(first.connectorRegistry.map((entry) => entry.id)).toEqual(
      second.connectorRegistry.map((entry) => entry.id),
    )
    expect(first.packets.map((packet) => packet.id)).toEqual(
      second.packets.map((packet) => packet.id),
    )
    expect(first.approvalQueue.entries.map((entry) => entry.id)).toEqual(
      second.approvalQueue.entries.map((entry) => entry.id),
    )
  })
})
