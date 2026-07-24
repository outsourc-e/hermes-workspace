import { beforeEach, describe, expect, it } from 'vitest'
import {
  AgentIntentSchema,
  DEFAULT_SAFETY_LOCKS,
  WAR_ROOM_RETIRED_AGENT_ALIASES,
  WAR_ROOM_WORKER_PROFILES,
  bodyObjectExists,
  createWarRoomTask,
  dispatchWarRoomIntent,
  getWarRoomBodyState,
  listWarRoomCapabilities,
  listWarRoomEvents,
  listWarRoomEventsByAgent,
  listWarRoomEventsByTask,
  requestWarRoomApproval,
  resetWarRoomBodyRuntimeForDev,
  resolveWarRoomApproval,
} from './index'

describe('War Room body contract/runtime', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(1_000)
  })

  it('validates typed AgentIntent payloads and rejects live external action shapes', () => {
    expect(AgentIntentSchema.safeParse({
      type: 'move_to_station',
      agentId: 'athena',
      roomId: 'agora-opportunity',
      stationId: 'agora-intake',
    }).success).toBe(true)

    expect(AgentIntentSchema.safeParse({
      type: 'publish_etsy',
      agentId: 'merchant-scout',
      listingId: 'live-listing',
    }).success).toBe(false)
  })

  it('updates agent body state after move_to_station and appends events', () => {
    dispatchWarRoomIntent({
      type: 'move_to_station',
      agentId: 'athena',
      roomId: 'agora-opportunity',
      stationId: 'agora-intake',
    }, 2_000)

    const athena = getWarRoomBodyState().agents.find((agent) => agent.agentId === 'athena')
    expect(athena?.roomId).toBe('agora-opportunity')
    expect(athena?.stationId).toBe('agora-intake')
    expect(athena?.state).toBe('walking')
    expect(listWarRoomEvents().map((event) => event.type)).toEqual(['agent.intent.received', 'agent.moved'])
  })

  it('request_approval creates approval state and approval.requested event', () => {
    createWarRoomTask({
      taskId: 'task-opportunity-1',
      label: 'Review opportunity',
      roomId: 'agora-opportunity',
      stationId: 'agora-intake',
      assignedAgentId: 'athena',
    }, 2_000)

    dispatchWarRoomIntent({
      type: 'request_approval',
      agentId: 'athena',
      taskId: 'task-opportunity-1',
      reason: 'Needs DLV before spend.',
    }, 3_000)

    const state = getWarRoomBodyState()
    expect(state.approvals).toHaveLength(1)
    expect(state.approvals[0].status).toBe('waiting_operator')
    expect(state.agents.find((agent) => agent.agentId === 'athena')?.state).toBe('waiting_approval')
    expect(listWarRoomEventsByTask('task-opportunity-1').some((event) => event.type === 'approval.requested')).toBe(true)
  })

  it('fails safely when agentId, roomId, or stationId are invalid', () => {
    expect(() => dispatchWarRoomIntent({
      type: 'move_to_room',
      agentId: 'missing-agent' as never,
      roomId: 'olympus-command',
    })).toThrow(/Unknown agentId/)

    expect(() => dispatchWarRoomIntent({
      type: 'move_to_station',
      agentId: 'hermes',
      roomId: 'olympus-command',
      stationId: 'agora-intake',
    })).toThrow(/does not belong/)
  })

  it('blocks retired aliases from new intents and task assignments while preserving historical body IDs', () => {
    const retiredRuntimeIds = [
      'signal-runner',
      'merchant-scout',
      'atlantis-archivist',
      'treasury-guardian',
    ] as const

    for (const agentId of retiredRuntimeIds) {
      expect(bodyObjectExists('agent', agentId)).toBe(true)
      expect(() => dispatchWarRoomIntent({
        type: 'say',
        agentId,
        text: 'New routing must be blocked.',
      })).toThrow(new RegExp(`${agentId}.*${WAR_ROOM_RETIRED_AGENT_ALIASES[agentId].canonicalOwner}`))
      expect(() => createWarRoomTask({
        taskId: `retired-${agentId}`,
        label: 'Retired alias assignment',
        roomId: 'olympus-command',
        assignedAgentId: agentId,
      })).toThrow(/Retired agent alias/)
    }

    expect(getWarRoomBodyState().tasks).toHaveLength(0)
    expect(listWarRoomEvents()).toHaveLength(0)
  })

  it('keeps live external mutation switches locked by default', () => {
    expect(DEFAULT_SAFETY_LOCKS).toEqual({
      liveExternalMutation: false,
      autonomousLiveActionAllowed: false,
      paidGenerationEnabled: false,
      liveEtsyEnabled: false,
      supplierMessagingEnabled: false,
      purchasesEnabled: false,
    })
  })

  it('exposes capability and worker profile mappings without live capabilities', () => {
    const capabilities = listWarRoomCapabilities()
    expect(capabilities.hermes).toEqual(['say', 'goToStation', 'carryPacket', 'requestApproval', 'raiseAlert', 'startWork'])
    expect(capabilities.goblin).toEqual(['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'])
    expect(capabilities.athena).not.toContain('carryPacket')
    expect(capabilities['loki']).toEqual(['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'])
    expect(capabilities['thor']).toEqual(['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'])
    expect(capabilities['odin']).toEqual(['say', 'goToStation', 'startWork', 'carryPacket', 'requestApproval', 'raiseAlert'])
    expect(capabilities['roster-keeper']).toEqual(['say', 'goToStation', 'rest'])
    expect(capabilities['merchant-scout']).toEqual([])
    expect(capabilities['atlantis-archivist']).toEqual([])
    expect(capabilities['treasury-guardian']).toEqual([])
    expect(capabilities['signal-runner']).toEqual([])
    expect(Object.values(capabilities).flat()).not.toContain('publishEtsy')
    expect(WAR_ROOM_WORKER_PROFILES.map((profile) => profile.agentId)).toEqual(expect.arrayContaining([
      'hermes',
      'goblin',
      'athena',
      'hephaestus',
      'julius',
      'alexander',
      'napoleon',
      'saladin',
      'genghis',
      'hannibal',
      'loki',
      'thor',
      'odin',
    ]))
    expect(WAR_ROOM_WORKER_PROFILES.filter((profile) => profile.roomId === 'council-strategists')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: 'julius', hermesProfileKey: 'council.julius' }),
        expect.objectContaining({ agentId: 'alexander', hermesProfileKey: 'council.alexander' }),
        expect.objectContaining({ agentId: 'napoleon', hermesProfileKey: 'council.napoleon' }),
        expect.objectContaining({ agentId: 'saladin', hermesProfileKey: 'council.saladin' }),
        expect.objectContaining({ agentId: 'genghis', hermesProfileKey: 'council.genghis' }),
        expect.objectContaining({ agentId: 'hannibal', hermesProfileKey: 'council.hannibal' }),
      ]),
    )
    expect(WAR_ROOM_WORKER_PROFILES.find((profile) => profile.agentId === 'loki')?.hermesProfileKey).toBe('research.product_discovery')
    expect(WAR_ROOM_WORKER_PROFILES.find((profile) => profile.agentId === 'goblin')?.hermesProfileKey).toBe('research.opportunity_discovery')
    expect(WAR_ROOM_WORKER_PROFILES.find((profile) => profile.agentId === 'thor')?.hermesProfileKey).toBe('archive.metrics_ledger')
    expect(WAR_ROOM_WORKER_PROFILES.find((profile) => profile.agentId === 'odin')?.hermesProfileKey).toBe('merchant.draft_handoff')
  })

  it('moves Etsy Market Lab resident agents to their local station bodies', () => {
    dispatchWarRoomIntent({
      type: 'move_to_station',
      agentId: 'loki',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
    }, 2_000)

    const odin = getWarRoomBodyState().agents.find((agent) => agent.agentId === 'loki')
    expect(odin?.roomId).toBe('etsy-market-lab')
    expect(odin?.stationId).toBe('etsy-loki-product-hunt')
    expect(odin?.state).toBe('walking')
    expect(listWarRoomEventsByAgent('loki').map((event) => event.type)).toEqual(['agent.intent.received', 'agent.moved'])
  })

  it('blocks role-forbidden body actions without unlocking external capabilities', () => {
    expect(() => dispatchWarRoomIntent({
      type: 'carry_packet',
      agentId: 'athena',
      packetId: 'blocked-packet',
      fromStationId: 'agora-intake',
      toStationId: 'mission-router',
    })).toThrow(/cannot perform carryPacket/)
    expect(listWarRoomEvents().some((event) => event.type === 'safety.blocked')).toBe(true)
  })

  it('supports direct approval requests and agent event filters', () => {
    requestWarRoomApproval({
      agentId: 'julius',
      reason: 'Council release gate needs operator review.',
    }, 4_000)

    expect(getWarRoomBodyState().approvals[0].agentId).toBe('julius')
    expect(listWarRoomEventsByAgent('julius').map((event) => event.type)).toContain('approval.requested')
  })

  it('resolves approvals as local-only decisions instead of live actions', () => {
    requestWarRoomApproval({
      agentId: 'hermes',
      roomId: 'olympus-command',
      stationId: 'mission-router',
      reason: 'Approve a local draft only.',
      requestedAction: 'Review local draft',
      lockedAction: 'Publish Etsy listing',
    }, 5_000)
    const approvalId = getWarRoomBodyState().approvals[0].approvalId
    resolveWarRoomApproval({ approvalId, status: 'approved', operatorNote: 'Local-only yes.' }, 6_000)
    expect(getWarRoomBodyState().approvals[0].status).toBe('approved_local_only')
    expect(getWarRoomBodyState().approvals[0].lockedAction).toBe('Publish Etsy listing')
  })
})
