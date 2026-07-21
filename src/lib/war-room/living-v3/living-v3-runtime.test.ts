import { describe, expect, it } from 'vitest'
import { CHARACTER_ANIMATION_TIMING, livingV3TravelDurationForDistance } from './character-animation-timing'
import { assignLivingV3Task, createInitialLivingV3HermesState, moveLivingV3AgentToRoom, setLivingV3AgentState } from './hermes-adapter'
import { LIVING_V3_WORLD_CONFIG  } from './living-v3-contract'
import {
  buildLivingV3NavigationRoute,
  livingV3NavigationPointIsOnWalkableSurface,
  livingV3NavigationRouteIsLegal,
} from './living-v3-navigation'
import {
  buildLivingV3AgentSnapshot,
  buildLivingV3AgentSnapshots,
  clampLivingV3Camera,
  fitLivingV3RoomCamera,
  getLivingV3ZoomLevel,
  livingV3AnimationFor,
} from './living-v3-runtime'
import type {LivingV3AgentId} from './living-v3-contract';

describe('Living War Room V3 runtime', () => {
  it('starts from a local Hermes adapter state with only approved visible agents', () => {
    const startMs = 1_000
    const state = createInitialLivingV3HermesState(startMs)
    const snapshots = buildLivingV3AgentSnapshots(state, startMs + 20_000)
    const expectedVisibleAgentIds = [
      'ares',
      'aphrodite',
      'hermes',
      'goblin',
      'heimdall',
      'terra',
      'poseidon',
      'julius',
      'alexander',
      'napoleon',
      'saladin',
      'genghis',
      'hannibal',
      'loki',
      'thor',
      'odin',
    ] satisfies Array<LivingV3AgentId>

    expect(snapshots).toHaveLength(expectedVisibleAgentIds.length)
    expect(snapshots.map((snapshot) => snapshot.agentId)).toEqual(expectedVisibleAgentIds)
    expect(snapshots.find((snapshot) => snapshot.agentId === 'ares')?.clipPath).toContain('/war-room/living-v3/agents/ares/')
    expect(snapshots.find((snapshot) => snapshot.agentId === 'aphrodite')?.clipPath).toContain('/war-room/living-v3/agents/aphrodite/')
    expect(snapshots.find((snapshot) => snapshot.agentId === 'hermes')?.clipPath).toContain('/war-room/living-v3/agents/hermes/')
    expect(snapshots.find((snapshot) => snapshot.agentId === 'poseidon')?.clipPath).toContain('/war-room/living-v3/agents/poseidon/')
    expect(snapshots
      .filter((snapshot) => ['julius', 'alexander', 'napoleon', 'saladin', 'genghis', 'hannibal'].includes(snapshot.agentId))
      .every((snapshot) => snapshot.clipPath.includes('/war-room/living-v3/generals-council/') && snapshot.roomId === 'council-strategists')).toBe(true)
    expect(snapshots
      .filter((snapshot) => ['loki', 'thor', 'odin'].includes(snapshot.agentId))
      .every((snapshot) => snapshot.clipPath.includes('/war-room/etsy-ops-v4/agents/hermes-pets-') && snapshot.clipPath.includes('/runtime/') && snapshot.spriteFrameCount === 8)).toBe(true)
    expect(snapshots
      .filter((snapshot) => snapshot.animationState === 'sleep')
      .every((snapshot) => snapshot.roomId === 'pantheon-quarters')).toBe(true)
    expect(snapshots.some((snapshot) => snapshot.agentId === 'thor' && snapshot.animationState === 'work-standing')).toBe(true)
    expect(snapshots.some((snapshot) => snapshot.agentId === 'odin' && snapshot.animationState === 'wait-approval')).toBe(true)
  })

  it('uses sleep animation only inside Pantheon Quarters', () => {
    expect(livingV3AnimationFor('sleeping', 'still', 'merchant-harbor')).toBe('idle')
    expect(livingV3AnimationFor('sleeping', 'still', 'olympus-command')).toBe('idle')
    expect(livingV3AnimationFor('sleeping', 'still', 'pantheon-quarters')).toBe('sleep')
  })

  it('can move any visible agent into Pantheon Quarters for rest', () => {
    const startMs = 2_000
    const empty = { epochMs: startMs, tasks: [], alerts: [], approvals: [] }
    const state = moveLivingV3AgentToRoom(empty, 'hermes', 'pantheon-quarters', startMs)
    const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', startMs + 20_000)

    expect(snapshot.roomId).toBe('pantheon-quarters')
    expect(snapshot.activity).toBe('sleeping')
    expect(snapshot.animationState).toBe('sleep')
  })

  it('keeps non-ambient idle agents stationary until Hermes assigns work', () => {
    const startMs = 3_000
    const state = { epochMs: startMs, tasks: [], alerts: [], approvals: [] }
    const early = buildLivingV3AgentSnapshots(state, startMs)
    const later = buildLivingV3AgentSnapshots(state, startMs + 30_000)

    for (const agentId of ['loki', 'thor', 'odin'] satisfies Array<LivingV3AgentId>) {
      const earlySnapshot = early.find((snapshot) => snapshot.agentId === agentId)
      const laterSnapshot = later.find((snapshot) => snapshot.agentId === agentId)
      expect(earlySnapshot?.activity).toBe('idle')
      expect(laterSnapshot?.activity).toBe('idle')
      expect(laterSnapshot?.world).toEqual(earlySnapshot?.world)
    }
  })

  it('derives deterministic ambient life for visual companions without creating backend tasks', () => {
    const empty = { epochMs: 0, tasks: [], alerts: [], approvals: [] }
    const states = new Set<ReturnType<typeof buildLivingV3AgentSnapshot>['animationState']>()
    const worlds: Array<ReturnType<typeof buildLivingV3AgentSnapshot>['world']> = []

    const visitedRooms = new Set<string>()
    for (let nowMs = 0; nowMs <= 620_000; nowMs += 1_750) {
      const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, empty, 'ares', nowMs)
      states.add(snapshot.animationState)
      worlds.push(snapshot.world)
      visitedRooms.add(snapshot.roomId)
      expect(snapshot.clipPath).toContain('/war-room/living-v3/agents/ares/')
    }

    expect(states.has('idle'), 'idle should appear in ambient cycle').toBe(true)
    expect([...states].some((animationState) => animationState.startsWith('walk-')), 'at least one walk state should appear').toBe(true)
    expect(states.has('talk-standing'), 'talk-standing should appear in ambient cycle').toBe(true)
    expect(states.has('sleep'), 'sleep should appear in ambient cycle').toBe(true)
    expect([...visitedRooms]).toEqual(expect.arrayContaining([
      'etsy-market-lab',
      'forge-hephaestus',
      'merchant-harbor',
      'atlantis-vault',
      'treasury-commerce',
      'pantheon-quarters',
      'olympus-command',
    ]))
    expect(new Set(worlds.map((world) => `${Math.round(world.x)}:${Math.round(world.y)}`)).size).toBeGreaterThan(8)
    expect(empty.tasks).toHaveLength(0)
  })

  it('keeps council generals as room-only ambient presences that sometimes sit at the table', () => {
    const empty = { epochMs: 0, tasks: [], alerts: [], approvals: [] }
    const councilGenerals = ['julius', 'alexander', 'napoleon', 'saladin', 'genghis', 'hannibal'] satisfies Array<LivingV3AgentId>

    for (const agentId of councilGenerals) {
      const states = new Set<ReturnType<typeof buildLivingV3AgentSnapshot>['animationState']>()
      const positions = new Set<string>()
      for (let nowMs = 0; nowMs <= 130_000; nowMs += 2_500) {
        const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, empty, agentId, nowMs)
        expect(snapshot.roomId).toBe('council-strategists')
        expect(snapshot.clipPath).toContain('/war-room/living-v3/generals-council/')
        states.add(snapshot.animationState)
        positions.add(`${Math.round(snapshot.roomPoint.x)}:${Math.round(snapshot.roomPoint.y)}`)
      }
      expect([...states].some((animationState) => animationState.startsWith('walk-'))).toBe(true)
      expect(states.has('sit')).toBe(true)
      expect(positions.size).toBeGreaterThan(3)
    }
  })

  it('lets explicit local tasks override ambient companion motion', () => {
    const startMs = 3_500
    const empty = { epochMs: startMs, tasks: [], alerts: [], approvals: [] }
    const state = moveLivingV3AgentToRoom(empty, 'ares', 'pantheon-quarters', startMs)
    const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'ares', startMs + 20_000)

    expect(snapshot.roomId).toBe('pantheon-quarters')
    expect(snapshot.activity).toBe('sleeping')
    expect(snapshot.animationState).toBe('sleep')
  })

  it('returns ambient companions to roaming after a bounded talk/work hold expires', () => {
    const startMs = 3_800
    const empty = { epochMs: startMs, tasks: [], alerts: [], approvals: [] }
    const state = assignLivingV3Task(empty, {
      agentId: 'hermes',
      kind: 'talk',
      label: 'Hermes Command answering DLV',
      roomId: 'olympus-command',
      stationId: 'command-table',
      badge: 'active-task',
      packetLabel: 'command chat',
    }, startMs)

    const during = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', startMs + 8_000)
    const after = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', startMs + 80_000)

    expect(during.activity).toBe('talking')
    expect(during.packetLabel).toBe('command chat')
    expect(after.packetLabel).toBeNull()
    expect(after.label).not.toBe('Hermes Command answering DLV')
  })

  it('uses DLV-approved character animation timing and walking speed', () => {
    expect(CHARACTER_ANIMATION_TIMING.framesPerState).toBe(8)
    expect(CHARACTER_ANIMATION_TIMING.frameDurationMs.idle).toBe(170)
    expect(CHARACTER_ANIMATION_TIMING.frameDurationMs.talk_standing).toBe(140)
    expect(CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_south).toBe(90)
    expect(CHARACTER_ANIMATION_TIMING.movement.spriteWidthsPerSecond).toBe(0.7)
    expect(livingV3TravelDurationForDistance(90, { minMs: 0, maxMs: 10_000 })).toBe(1_000)
  })

  it('routes inter-room motion through legal doors and bridge waypoints instead of floating across walls', () => {
    const startMs = 0
    const from = { roomId: 'olympus-command' as const, point: { x: 50, y: 68 } }
    const to = { roomId: 'terra-forge' as const, point: { x: 48, y: 66 } }
    const route = buildLivingV3NavigationRoute(from, to)

    expect(route.status).toBe('ready')
    expect(route.roomPath).toEqual(['olympus-command', 'agora-opportunity', 'forge-hephaestus', 'terra-forge'])
    expect(route.bridgePath).toEqual(['agora-to-command', 'agora-to-forge', 'forge-to-terra'])
    expect(route.waypoints.some((waypoint) => waypoint.kind === 'door')).toBe(true)
    expect(route.waypoints.some((waypoint) => waypoint.kind === 'bridge')).toBe(true)
    expect(livingV3NavigationRouteIsLegal(route)).toBe(true)

    const state = assignLivingV3Task({ epochMs: startMs, tasks: [], alerts: [], approvals: [] }, {
      agentId: 'hermes',
      kind: 'move',
      label: 'door bridge route test',
      roomId: 'terra-forge',
      from,
      target: to.point,
      badge: 'idle',
    }, startMs)
    const task = state.tasks[0]
    const sampleTimes = [0.2, 0.5, 0.8].map((fraction) => Math.round(task.travelDurationMs * fraction))

    for (const sampleMs of sampleTimes) {
      const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', sampleMs)
      expect(snapshot.activity).toBe('walking')
      expect(snapshot.navigation.bridgePath).toEqual(route.bridgePath)
      expect(snapshot.navigation.doorIds.length).toBeGreaterThanOrEqual(2)
      expect(snapshot.navigation.waypoints.every((waypoint) => livingV3NavigationPointIsOnWalkableSurface(waypoint.world))).toBe(true)
      expect(livingV3NavigationPointIsOnWalkableSurface(snapshot.world)).toBe(true)
      expect(snapshot.label).toMatch(/door|Cross|Enter|Walk/i)
    }
  })

  it('advances walking frames at 90ms per frame', () => {
    const state = assignLivingV3Task({ epochMs: 0, tasks: [], alerts: [], approvals: [] }, {
      agentId: 'hermes',
      kind: 'move',
      label: 'walk timing test',
      roomId: 'olympus-command',
      from: { roomId: 'olympus-command', point: { x: 16, y: 20 } },
      target: { x: 84, y: 78 },
      badge: 'idle',
    }, 0)

    const frame0 = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', 0)
    const frame1 = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', 90)

    expect(frame0.animationState.startsWith('walk-')).toBe(true)
    expect(frame1.spriteFrameIndex).toBe((frame0.spriteFrameIndex + 1) % frame0.spriteFrameCount)
  })

  it('uses the dominant axis for shallow diagonal walking so sprites do not look backwards', () => {
    const startMs = 0
    const state = assignLivingV3Task({ epochMs: startMs, tasks: [], alerts: [], approvals: [] }, {
      agentId: 'hermes',
      kind: 'move',
      label: 'mostly east walking test',
      roomId: 'olympus-command',
      from: { roomId: 'olympus-command', point: { x: 16, y: 50 } },
      target: { x: 84, y: 54 },
      badge: 'idle',
    }, startMs)
    const task = state.tasks[0]
    const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, 'hermes', Math.round(task.travelDurationMs * 0.45))

    expect(snapshot.direction).toBe('east')
    expect(snapshot.animationState).toBe('walk-east')
  })

  it('exposes a Hermes-ready setAgentState adapter without seating work outside rest', () => {
    const startMs = 4_000
    const empty = { epochMs: startMs, tasks: [], alerts: [], approvals: [] }
    const working = setLivingV3AgentState(empty, {
      agentId: 'loki',
      activity: 'working',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      label: 'Standing product search work',
    }, startMs)
    const snapshot = buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, working, 'loki', startMs + 200)

    expect(snapshot.roomId).toBe('etsy-market-lab')
    expect(snapshot.activity).toBe('working')
    expect(snapshot.animationState).toBe('work-standing')
  })

  it('resolves zoom levels from scale and focused room state', () => {
    expect(getLivingV3ZoomLevel(0.5, null)).toBe('map')
    expect(getLivingV3ZoomLevel(0.8, null)).toBe('mid')
    expect(getLivingV3ZoomLevel(1.08, null)).toBe('room')
    expect(getLivingV3ZoomLevel(0.5, 'merchant-harbor')).toBe('room')
  })

  it('fits a focused room deeply inside the viewport without map-scale leakage', () => {
    const camera = fitLivingV3RoomCamera('merchant-harbor', { w: 1440, h: 900 })
    expect(camera.focusedRoomId).toBe('merchant-harbor')
    expect(camera.mode).toBe('room')
    expect(camera.scale).toBeGreaterThan(1.18)
  })

  it('clamps camera scale and center to world bounds', () => {
    const clamped = clampLivingV3Camera({
      center: { x: -5000, y: 9000 },
      scale: 9,
      mode: 'free',
      focusedRoomId: null,
    }, { w: 1440, h: 900 }, LIVING_V3_WORLD_CONFIG.worldSize)

    expect(clamped.scale).toBeLessThanOrEqual(2.25)
    expect(clamped.center.x).toBeGreaterThan(0)
    expect(clamped.center.y).toBeLessThan(LIVING_V3_WORLD_CONFIG.worldSize.h)
  })
})
