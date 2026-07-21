import { CHARACTER_ANIMATION_TIMING, livingV3TravelDurationForDistance } from './character-animation-timing'
import {
  LIVING_V3_WORLD_CONFIG,










  livingV3AgentById,
  livingV3RoomById,
  livingV3StationById
} from './living-v3-contract'
import {


  buildLivingV3NavigationRoute,
  livingV3NavigationRouteDistance,
  sampleLivingV3NavigationRoute
} from './living-v3-navigation'
import type {LivingV3AgentActivity, LivingV3AgentId, LivingV3AnimationState, LivingV3BadgeKind, LivingV3CameraState, LivingV3Point, LivingV3RoomId, LivingV3StationId, LivingV3WorldConfig, LivingV3ZoomLevel} from './living-v3-contract';
import type {LivingV3NavigationRouteStatus, LivingV3NavigationWaypoint} from './living-v3-navigation';
import type { LivingV3HermesAdapterState, LivingV3TaskIntent } from './hermes-adapter'

export type LivingV3Direction =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'north-east'
  | 'north-west'
  | 'south-east'
  | 'south-west'
  | 'still'

export type LivingV3AgentSnapshotNavigation = {
  status: LivingV3NavigationRouteStatus
  routeId: string
  roomPath: Array<LivingV3RoomId>
  bridgePath: Array<string>
  doorIds: Array<string>
  segmentLabel: string
  waypointCount: number
  waypoints: Array<Pick<LivingV3NavigationWaypoint, 'id' | 'kind' | 'world' | 'label' | 'roomId' | 'bridgeId' | 'doorId'>>
  blockedReason?: string
}

export type LivingV3AgentSnapshot = {
  agentId: LivingV3AgentId
  roomId: LivingV3RoomId
  world: LivingV3Point
  roomPoint: LivingV3Point
  activity: LivingV3AgentActivity
  animationState: LivingV3AnimationState
  direction: LivingV3Direction
  clipPath: string
  spriteFrameIndex: number
  spriteFrameCount: number
  badge: LivingV3BadgeKind
  label: string
  packetLabel: string | null
  navigation: LivingV3AgentSnapshotNavigation
}

export type LivingV3RoomStatus = {
  roomId: LivingV3RoomId
  badge: LivingV3BadgeKind
  activeAgents: number
  activeTasks: number
  alerts: number
  approvals: number
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function smoothStep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export type LivingV3Viewport = { w: number; h: number }

export type LivingV3SafeInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

export function getLivingV3ZoomLevel(scale: number, focusedRoomId: LivingV3RoomId | null): LivingV3ZoomLevel {
  if (focusedRoomId || scale > 1.05) return 'room'
  if (scale >= 0.65) return 'mid'
  return 'map'
}

export function clampLivingV3Camera(
  camera: LivingV3CameraState,
  viewport: LivingV3Viewport,
  worldSize: LivingV3WorldConfig['worldSize'],
): LivingV3CameraState {
  const scale = clamp(camera.scale, 0.35, 2.25)
  const visibleW = viewport.w / scale
  const visibleH = viewport.h / scale
  const center = {
    x: visibleW >= worldSize.w ? worldSize.w / 2 : clamp(camera.center.x, visibleW / 2, worldSize.w - visibleW / 2),
    y: visibleH >= worldSize.h ? worldSize.h / 2 : clamp(camera.center.y, visibleH / 2, worldSize.h - visibleH / 2),
  }

  return { ...camera, scale, center }
}

export function fitLivingV3RoomCamera(
  roomId: LivingV3RoomId,
  viewport: LivingV3Viewport,
  safeInsets: LivingV3SafeInsets = { top: 78, right: 22, bottom: 76, left: 22 },
): LivingV3CameraState {
  const room = livingV3RoomById(roomId)
  if (!room) {
    return {
      center: { x: LIVING_V3_WORLD_CONFIG.worldSize.w / 2, y: LIVING_V3_WORLD_CONFIG.worldSize.h / 2 },
      scale: 0.45,
      mode: 'map',
      focusedRoomId: null,
    }
  }

  const availableW = Math.max(360, viewport.w - safeInsets.left - safeInsets.right)
  const availableH = Math.max(300, viewport.h - safeInsets.top - safeInsets.bottom)
  const scale = clamp(Math.min(availableW / room.world.w, availableH / room.world.h) * 0.92, 1.18, 2.15)
  const desiredScreenCenter = {
    x: safeInsets.left + availableW / 2,
    y: safeInsets.top + availableH / 2,
  }
  const viewportCenter = { x: viewport.w / 2, y: viewport.h / 2 }
  const roomCenter = {
    x: room.world.x + room.world.w / 2,
    y: room.world.y + room.world.h / 2,
  }

  return clampLivingV3Camera({
    center: {
      x: roomCenter.x - (desiredScreenCenter.x - viewportCenter.x) / scale,
      y: roomCenter.y - (desiredScreenCenter.y - viewportCenter.y) / scale,
    },
    scale,
    mode: 'room',
    focusedRoomId: roomId,
  }, viewport, LIVING_V3_WORLD_CONFIG.worldSize)
}

export function fitLivingV3MapCamera(viewport: LivingV3Viewport): LivingV3CameraState {
  const contentBounds = LIVING_V3_WORLD_CONFIG.rooms.reduce((bounds, room) => ({
    left: Math.min(bounds.left, room.world.x),
    top: Math.min(bounds.top, room.world.y),
    right: Math.max(bounds.right, room.world.x + room.world.w),
    bottom: Math.max(bounds.bottom, room.world.y + room.world.h),
  }), { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: 0, bottom: 0 })
  const contentW = contentBounds.right - contentBounds.left
  const contentH = contentBounds.bottom - contentBounds.top
  const scale = clamp(Math.min((viewport.w - 120) / contentW, (viewport.h - 160) / contentH) * 0.82, 0.38, 0.62)
  return clampLivingV3Camera({
    center: {
      x: contentBounds.left + contentW / 2,
      y: contentBounds.top + contentH / 2,
    },
    scale,
    mode: 'map',
    focusedRoomId: null,
  }, viewport, LIVING_V3_WORLD_CONFIG.worldSize)
}

function directionBetween(from: LivingV3Point, to: LivingV3Point): LivingV3Direction {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  if (absDx < 0.5 && absDy < 0.5) return 'still'
  const horizontal: Extract<LivingV3Direction, 'east' | 'west'> | '' = absDx > 0.5 ? (dx > 0 ? 'east' : 'west') : ''
  const vertical: Extract<LivingV3Direction, 'north' | 'south'> | '' = absDy > 0.5 ? (dy > 0 ? 'south' : 'north') : ''
  if (horizontal && vertical) {
    const dominantAxisRatio = 1.35
    if (absDx >= absDy * dominantAxisRatio) return horizontal
    if (absDy >= absDx * dominantAxisRatio) return vertical
    return `${vertical}-${horizontal}` as LivingV3Direction
  }
  return horizontal || vertical || 'still'
}

export function livingV3AnimationFor(activity: LivingV3AgentActivity, direction: LivingV3Direction, roomId: LivingV3RoomId): LivingV3AnimationState {
  if (activity === 'sleeping') return roomId === 'pantheon-quarters' ? 'sleep' : 'idle'
  if (activity === 'waiting-approval') return 'wait-approval'
  if (activity === 'working') return 'work-standing'
  if (activity === 'talking') return 'talk-standing'
  if (activity === 'carrying') return 'carry-packet'
  if (activity === 'walking') {
    if (direction === 'north') return 'walk-north'
    if (direction === 'south') return 'walk-south'
    if (direction === 'east') return 'walk-east'
    if (direction === 'west') return 'walk-west'
    if (direction === 'north-east') return 'walk-north-east'
    if (direction === 'north-west') return 'walk-north-west'
    if (direction === 'south-east') return 'walk-south-east'
    if (direction === 'south-west') return 'walk-south-west'
  }
  return 'idle'
}

function frameMsFor(animationState: LivingV3AnimationState, activity: LivingV3AgentActivity) {
  if (animationState === 'walk-south') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_south
  if (animationState === 'walk-east') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_east
  if (animationState === 'walk-north') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_north
  if (animationState === 'walk-west') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_west
  if (animationState === 'walk-south-east') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_southeast
  if (animationState === 'walk-north-east') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_northeast
  if (animationState === 'walk-north-west') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_northwest
  if (animationState === 'walk-south-west') return CHARACTER_ANIMATION_TIMING.frameDurationMs.walk_southwest
  if (animationState === 'talk-standing' || animationState === 'work-standing') return CHARACTER_ANIMATION_TIMING.frameDurationMs.talk_standing
  if (animationState === 'sleep') return CHARACTER_ANIMATION_TIMING.frameDurationMs.sleep_rest
  if (activity === 'waiting-approval') return CHARACTER_ANIMATION_TIMING.frameDurationMs.idle
  return CHARACTER_ANIMATION_TIMING.frameDurationMs.idle
}

function taskActivity(task: LivingV3TaskIntent | null, isMoving: boolean): LivingV3AgentActivity {
  if (!task) return 'idle'
  if (isMoving) return task.packetLabel ? 'carrying' : 'walking'
  if (task.kind === 'approval') return 'waiting-approval'
  if (task.kind === 'rest') return 'sleeping'
  if (task.kind === 'talk') return 'talking'
  if (task.kind === 'move' || task.kind === 'roam') return 'idle'
  return 'working'
}

function ambientWalkDurationMs(agentId: LivingV3AgentId, from: AmbientRoutePoint, to: AmbientRoutePoint) {
  const routeDistance = livingV3NavigationRouteDistance(
    { roomId: from.roomId, point: ambientPointFor(agentId, from.point) },
    { roomId: to.roomId, point: ambientPointFor(agentId, to.point) },
  )
  return livingV3TravelDurationForDistance(routeDistance, { minMs: 6_500, maxMs: 24_000 })
}

function roomPointFromWorld(roomId: LivingV3RoomId, world: LivingV3Point) {
  const room = livingV3RoomById(roomId)
  if (!room) return { x: 50, y: 50 }
  return {
    x: ((world.x - room.world.x) / room.world.w) * 100,
    y: ((world.y - room.world.y) / room.world.h) * 100,
  }
}

function navigationSnapshotFromRoute(
  routeId: string,
  route: ReturnType<typeof buildLivingV3NavigationRoute>,
  segmentLabel: string,
): LivingV3AgentSnapshotNavigation {
  return {
    status: route.status,
    routeId,
    roomPath: route.roomPath,
    bridgePath: route.bridgePath,
    doorIds: route.doorIds,
    segmentLabel,
    waypointCount: route.waypoints.length,
    waypoints: route.waypoints.map((waypoint) => ({
      id: waypoint.id,
      kind: waypoint.kind,
      world: waypoint.world,
      label: waypoint.label,
      roomId: waypoint.roomId,
      bridgeId: waypoint.bridgeId,
      doorId: waypoint.doorId,
    })),
    blockedReason: route.blockedReason,
  }
}

function routeLabel(baseLabel: string, route: ReturnType<typeof buildLivingV3NavigationRoute>, segmentLabel: string) {
  if (route.status === 'blocked') return route.blockedReason ?? `${baseLabel} blocked`
  if (route.status === 'same-room') return baseLabel
  return `${baseLabel} · ${segmentLabel}`
}

function taskForAgent(state: LivingV3HermesAdapterState, agentId: LivingV3AgentId, nowMs?: number) {
  const task = state.tasks.find((candidate) => candidate.agentId === agentId) ?? null
  if (!task) return null
  if (nowMs !== undefined && (ambientAgentIds.has(agentId) || councilGeneralAgentIds.has(agentId))) {
    const elapsedMs = nowMs - task.createdAtMs
    if (elapsedMs > task.travelDurationMs + task.holdDurationMs) return null
  }
  return task
}

function fallbackPoint(agentId: LivingV3AgentId) {
  const agent = livingV3AgentById(agentId)
  return agent?.home ?? { roomId: 'olympus-command' as const, point: { x: 50, y: 50 } }
}

function sanitizeTaskTarget(task: LivingV3TaskIntent) {
  if (!task.stationId) return task.target
  const station = livingV3StationById(task.stationId)
  return station?.operatorSpot ?? task.target
}

type AmbientAgentId = Extract<LivingV3AgentId, 'ares' | 'aphrodite' | 'hermes' | 'terra'>
type CouncilGeneralAgentId = Extract<LivingV3AgentId, 'julius' | 'alexander' | 'napoleon' | 'saladin' | 'genghis' | 'hannibal'>

const ambientAgentIds = new Set<LivingV3AgentId>(['ares', 'aphrodite', 'hermes', 'terra'])
const councilGeneralAgentIds = new Set<LivingV3AgentId>(['julius', 'alexander', 'napoleon', 'saladin', 'genghis', 'hannibal'])

type AmbientRoutePoint = {
  roomId: LivingV3RoomId
  point: LivingV3Point
  label: string
}

type AmbientVisualStep = {
  durationMs: number
  from: AmbientRoutePoint
  to: AmbientRoutePoint
  activity: LivingV3AgentActivity
  animationState?: LivingV3AnimationState
  badge: LivingV3BadgeKind
  label: string
}

const calmRoomTour: Array<AmbientRoutePoint> = [
  { roomId: 'olympus-command', point: { x: 48, y: 68 }, label: 'Olympus Command' },
  { roomId: 'agora-opportunity', point: { x: 48, y: 72 }, label: 'Agora' },
  { roomId: 'oracle-signals', point: { x: 52, y: 72 }, label: 'Oracle' },
  { roomId: 'etsy-market-lab', point: { x: 48, y: 66 }, label: 'Etsy Market Lab' },
  { roomId: 'forge-hephaestus', point: { x: 48, y: 72 }, label: 'Forge' },
  { roomId: 'merchant-harbor', point: { x: 50, y: 72 }, label: 'Merchant Harbor' },
  { roomId: 'atlantis-vault', point: { x: 50, y: 72 }, label: 'Atlantis Vault' },
  { roomId: 'treasury-commerce', point: { x: 50, y: 72 }, label: 'Treasury' },
  { roomId: 'pantheon-quarters', point: { x: 48, y: 68 }, label: 'Pantheon Quarters' },
  { roomId: 'daedalus-workshop', point: { x: 50, y: 70 }, label: 'Daedalus Workshop' },
  { roomId: 'gateway-cockpit', point: { x: 50, y: 70 }, label: 'Gateway Cockpit' },
  { roomId: 'council-strategists', point: { x: 50, y: 68 }, label: 'Council' },
]

const terraForgeToolTour: Array<AmbientRoutePoint> = [
  { roomId: 'terra-forge', point: { x: 38, y: 36 }, label: 'Modeling Studio' },
  { roomId: 'terra-forge', point: { x: 64, y: 36 }, label: 'Model Hunt' },
  { roomId: 'terra-forge', point: { x: 60, y: 54 }, label: 'Printer Control' },
  { roomId: 'terra-forge', point: { x: 30, y: 72 }, label: 'Obsidian Memory shelf' },
]

function rotateTour(offset: number) {
  return [...calmRoomTour.slice(offset), ...calmRoomTour.slice(0, offset)]
}

const ambientAgentTours: Record<AmbientAgentId, Array<AmbientRoutePoint>> = {
  hermes: calmRoomTour,
  ares: rotateTour(4),
  aphrodite: rotateTour(8),
  terra: terraForgeToolTour,
}

const ambientAgentPhaseOffsetMs: Record<AmbientAgentId, number> = {
  hermes: 0,
  ares: 52_000,
  aphrodite: 104_000,
  terra: 13_000,
}

const ambientAgentPointOffset: Record<AmbientAgentId, LivingV3Point> = {
  hermes: { x: 0, y: 0 },
  ares: { x: -7, y: 6 },
  aphrodite: { x: 7, y: -3 },
  terra: { x: 0, y: 0 },
}

const councilGeneralPhaseOffsetMs: Record<CouncilGeneralAgentId, number> = {
  julius: 0,
  alexander: 9_000,
  napoleon: 18_000,
  saladin: 27_000,
  genghis: 36_000,
  hannibal: 45_000,
}

const councilGeneralFloorRoutes: Record<CouncilGeneralAgentId, Array<AmbientRoutePoint>> = {
  julius: [
    { roomId: 'council-strategists', point: { x: 44, y: 62 }, label: 'Council floor' },
    { roomId: 'council-strategists', point: { x: 34, y: 38 }, label: 'Command scroll alcove' },
    { roomId: 'council-strategists', point: { x: 50, y: 72 }, label: 'Council Table' },
  ],
  alexander: [
    { roomId: 'council-strategists', point: { x: 62, y: 42 }, label: 'Campaign map wall' },
    { roomId: 'council-strategists', point: { x: 74, y: 24 }, label: 'Expansion balcony' },
    { roomId: 'council-strategists', point: { x: 64, y: 54 }, label: 'Council Table' },
  ],
  napoleon: [
    { roomId: 'council-strategists', point: { x: 72, y: 68 }, label: 'Logistics board' },
    { roomId: 'council-strategists', point: { x: 78, y: 84 }, label: 'Supply cadence desk' },
    { roomId: 'council-strategists', point: { x: 68, y: 64 }, label: 'Council Table' },
  ],
  saladin: [
    { roomId: 'council-strategists', point: { x: 58, y: 80 }, label: 'Trust seal' },
    { roomId: 'council-strategists', point: { x: 48, y: 86 }, label: 'Approval lock aisle' },
    { roomId: 'council-strategists', point: { x: 56, y: 72 }, label: 'Council Table' },
  ],
  genghis: [
    { roomId: 'council-strategists', point: { x: 32, y: 78 }, label: 'Messenger law board' },
    { roomId: 'council-strategists', point: { x: 22, y: 68 }, label: 'Rider gate' },
    { roomId: 'council-strategists', point: { x: 42, y: 72 }, label: 'Council Table' },
  ],
  hannibal: [
    { roomId: 'council-strategists', point: { x: 26, y: 50 }, label: 'Flank path' },
    { roomId: 'council-strategists', point: { x: 20, y: 32 }, label: 'Risk terrain wall' },
    { roomId: 'council-strategists', point: { x: 34, y: 58 }, label: 'Council Table' },
  ],
}

function buildCouncilGeneralPath(agentId: CouncilGeneralAgentId): Array<AmbientVisualStep> {
  const route = councilGeneralFloorRoutes[agentId]
  return [
    {
      durationMs: 10_500,
      from: route[0],
      to: route[0],
      activity: 'idle',
      badge: 'idle',
      label: `${route[0].label} room presence`,
    },
    {
      durationMs: ambientWalkDurationMs(agentId, route[0], route[1]),
      from: route[0],
      to: route[1],
      activity: 'walking',
      badge: 'idle',
      label: `Walking inside Council: ${route[0].label} to ${route[1].label}`,
    },
    {
      durationMs: 9_500,
      from: route[1],
      to: route[1],
      activity: 'talking',
      badge: 'idle',
      label: `${route[1].label} room counsel`,
    },
    {
      durationMs: ambientWalkDurationMs(agentId, route[1], route[2]),
      from: route[1],
      to: route[2],
      activity: 'walking',
      badge: 'approval',
      label: `Walking to Council Table`,
    },
    {
      durationMs: 12_500,
      from: route[2],
      to: route[2],
      activity: 'talking',
      animationState: 'sit',
      badge: 'approval',
      label: 'Seated around Council Table',
    },
    {
      durationMs: ambientWalkDurationMs(agentId, route[2], route[0]),
      from: route[2],
      to: route[0],
      activity: 'walking',
      badge: 'idle',
      label: 'Leaving table back to room floor',
    },
  ] satisfies Array<AmbientVisualStep>
}

function ambientPointFor(agentId: LivingV3AgentId, point: LivingV3Point): LivingV3Point {
  const offset = ambientAgentIds.has(agentId) ? ambientAgentPointOffset[agentId as AmbientAgentId] : { x: 0, y: 0 }
  return {
    x: clamp(point.x + offset.x, 6, 94),
    y: clamp(point.y + offset.y, 6, 94),
  }
}

function buildCalmAmbientPath(agentId: AmbientAgentId): Array<AmbientVisualStep> {
  const tour = ambientAgentTours[agentId]
  return tour.flatMap((from, index) => {
    const to = tour[(index + 1) % tour.length]
    const restStop = from.roomId === 'pantheon-quarters'
    const socialStop = !restStop && (index + (agentId === 'hermes' ? 0 : agentId === 'ares' ? 1 : 2)) % 4 === 0
    return [
      {
        durationMs: restStop ? 16_000 : socialStop ? 11_500 : 9_500,
        from,
        to: from,
        activity: restStop ? 'sleeping' : socialStop ? 'talking' : 'idle',
        animationState: restStop ? 'sleep' : undefined,
        badge: restStop ? 'sleeping' : 'idle',
        label: restStop ? `${from.label} calm rest` : socialStop ? `${from.label} social pause` : `${from.label} calm watch`,
      },
      {
        durationMs: ambientWalkDurationMs(agentId, from, to),
        from,
        to,
        activity: 'walking',
        badge: 'idle',
        label: `Walking calmly from ${from.label} to ${to.label}`,
      },
    ] satisfies Array<AmbientVisualStep>
  })
}

const ambientVisualPaths: Record<AmbientAgentId, Array<AmbientVisualStep>> = {
  hermes: buildCalmAmbientPath('hermes'),
  ares: buildCalmAmbientPath('ares'),
  aphrodite: buildCalmAmbientPath('aphrodite'),
  terra: buildCalmAmbientPath('terra'),
}

const councilGeneralVisualPaths: Record<CouncilGeneralAgentId, Array<AmbientVisualStep>> = {
  julius: buildCouncilGeneralPath('julius'),
  alexander: buildCouncilGeneralPath('alexander'),
  napoleon: buildCouncilGeneralPath('napoleon'),
  saladin: buildCouncilGeneralPath('saladin'),
  genghis: buildCouncilGeneralPath('genghis'),
  hannibal: buildCouncilGeneralPath('hannibal'),
}

const ambientVisualCycleMs: Record<AmbientAgentId, number> = {
  hermes: ambientVisualPaths.hermes.reduce((total, step) => total + step.durationMs, 0),
  ares: ambientVisualPaths.ares.reduce((total, step) => total + step.durationMs, 0),
  aphrodite: ambientVisualPaths.aphrodite.reduce((total, step) => total + step.durationMs, 0),
  terra: ambientVisualPaths.terra.reduce((total, step) => total + step.durationMs, 0),
}

const councilGeneralVisualCycleMs: Record<CouncilGeneralAgentId, number> = {
  julius: councilGeneralVisualPaths.julius.reduce((total, step) => total + step.durationMs, 0),
  alexander: councilGeneralVisualPaths.alexander.reduce((total, step) => total + step.durationMs, 0),
  napoleon: councilGeneralVisualPaths.napoleon.reduce((total, step) => total + step.durationMs, 0),
  saladin: councilGeneralVisualPaths.saladin.reduce((total, step) => total + step.durationMs, 0),
  genghis: councilGeneralVisualPaths.genghis.reduce((total, step) => total + step.durationMs, 0),
  hannibal: councilGeneralVisualPaths.hannibal.reduce((total, step) => total + step.durationMs, 0),
}

function ambientVisualStepFor(agentId: LivingV3AgentId, nowMs: number) {
  const isCouncilGeneral = councilGeneralAgentIds.has(agentId)
  if (!ambientAgentIds.has(agentId) && !isCouncilGeneral) return null
  const path = isCouncilGeneral
    ? councilGeneralVisualPaths[agentId as CouncilGeneralAgentId]
    : ambientVisualPaths[agentId as AmbientAgentId]
  const cycleMs = isCouncilGeneral
    ? councilGeneralVisualCycleMs[agentId as CouncilGeneralAgentId]
    : ambientVisualCycleMs[agentId as AmbientAgentId]
  const phaseOffset = isCouncilGeneral
    ? councilGeneralPhaseOffsetMs[agentId as CouncilGeneralAgentId]
    : ambientAgentPhaseOffsetMs[agentId as AmbientAgentId]
  const phaseMs = ((nowMs + phaseOffset) % cycleMs + cycleMs) % cycleMs
  let cursorMs = 0
  for (const step of path) {
    const nextCursorMs = cursorMs + step.durationMs
    if (phaseMs < nextCursorMs) {
      return {
        step,
        progress: (phaseMs - cursorMs) / step.durationMs,
      }
    }
    cursorMs = nextCursorMs
  }
  return { step: path[0], progress: 1 }
}

function buildAmbientLivingV3AgentSnapshot(agentId: LivingV3AgentId, nowMs: number): LivingV3AgentSnapshot | null {
  const ambient = ambientVisualStepFor(agentId, nowMs)
  const agent = livingV3AgentById(agentId)
  if (!ambient || !agent) return null

  const fromPoint = ambientPointFor(agentId, ambient.step.from.point)
  const targetPoint = ambientPointFor(agentId, ambient.step.to.point)
  const isMoving = ambient.step.activity === 'walking'
  const route = buildLivingV3NavigationRoute(
    { roomId: ambient.step.from.roomId, point: fromPoint },
    { roomId: ambient.step.to.roomId, point: targetPoint },
  )
  const progress = isMoving ? smoothStep(ambient.progress) : 1
  const sample = isMoving ? sampleLivingV3NavigationRoute(route, progress) : sampleLivingV3NavigationRoute(route, 1)
  const world = sample.world
  const roomId = sample.roomId
  const direction = isMoving ? directionBetween(sample.from.world, sample.to.world) : 'still'
  const activity = route.status === 'blocked' ? 'idle' : ambient.step.activity
  const animationState = ambient.step.animationState ?? livingV3AnimationFor(activity, direction, roomId)
  const clip = agent.clips[animationState] ?? agent.clips.idle
  const spriteFrameCount = clip.frameCount
  const spriteFrameIndex = Math.floor(nowMs / frameMsFor(animationState, activity)) % spriteFrameCount
  const baseLabel = route.status === 'blocked' ? `${agent.label} blocked at ${ambient.step.from.label}` : ambient.step.label

  return {
    agentId,
    roomId,
    world,
    roomPoint: roomPointFromWorld(roomId, world),
    activity,
    animationState,
    direction,
    clipPath: clip.assetPath,
    spriteFrameIndex,
    spriteFrameCount,
    badge: route.status === 'blocked' ? 'blocked' : ambient.step.badge,
    label: routeLabel(baseLabel, route, sample.segmentLabel),
    packetLabel: null,
    navigation: navigationSnapshotFromRoute(`ambient:${agentId}:${ambient.step.from.roomId}:${ambient.step.to.roomId}`, route, sample.segmentLabel),
  }
}

export function buildLivingV3AgentSnapshot(
  config: LivingV3WorldConfig,
  state: LivingV3HermesAdapterState,
  agentId: LivingV3AgentId,
  nowMs: number,
): LivingV3AgentSnapshot {
  void config
  const agent = livingV3AgentById(agentId)
  if (!agent) throw new Error(`Unknown Living V3 agent ${agentId}`)

  const task = taskForAgent(state, agentId, nowMs)
  if (!task) {
    const ambientSnapshot = buildAmbientLivingV3AgentSnapshot(agentId, nowMs)
    if (ambientSnapshot) return ambientSnapshot
  }

  const from = task?.from ?? fallbackPoint(agentId)
  const targetRoomId = task?.roomId ?? from.roomId
  const targetPoint = task ? sanitizeTaskTarget(task) : from.point
  const route = buildLivingV3NavigationRoute(from, { roomId: targetRoomId, point: targetPoint }, config)
  const taskElapsed = task ? Math.max(0, nowMs - task.createdAtMs) : 0
  const movingProgress = task ? clamp01(taskElapsed / task.travelDurationMs) : 1
  const easedProgress = smoothStep(movingProgress)
  const isMoving = Boolean(task && movingProgress < 1 && route.status !== 'blocked')
  const sample = sampleLivingV3NavigationRoute(route, isMoving ? easedProgress : 1)
  const world = sample.world
  const roomId = sample.roomId
  const direction = isMoving ? directionBetween(sample.from.world, sample.to.world) : 'still'
  const activity = route.status === 'blocked' ? 'idle' : taskActivity(task, isMoving)
  const animationState = livingV3AnimationFor(activity, direction, roomId)
  const clip = agent.clips[animationState] ?? agent.clips.idle
  const spriteFrameCount = clip.frameCount
  const spriteFrameIndex = Math.floor(nowMs / frameMsFor(animationState, activity)) % spriteFrameCount
  const baseLabel = task?.label ?? agent.role

  return {
    agentId,
    roomId,
    world,
    roomPoint: roomPointFromWorld(roomId, world),
    activity,
    animationState,
    direction,
    clipPath: clip.assetPath,
    spriteFrameIndex,
    spriteFrameCount,
    badge: route.status === 'blocked' ? 'blocked' : task?.badge ?? 'idle',
    label: routeLabel(baseLabel, route, sample.segmentLabel),
    packetLabel: route.status === 'blocked' ? null : task?.packetLabel ?? null,
    navigation: navigationSnapshotFromRoute(task?.id ?? `fallback:${agentId}`, route, sample.segmentLabel),
  }
}

export function buildLivingV3AgentSnapshots(state: LivingV3HermesAdapterState, nowMs: number) {
  return LIVING_V3_WORLD_CONFIG.agents.map((agent) => buildLivingV3AgentSnapshot(LIVING_V3_WORLD_CONFIG, state, agent.id, nowMs))
}

export function buildLivingV3RoomStatuses(state: LivingV3HermesAdapterState, snapshots: Array<LivingV3AgentSnapshot>): Array<LivingV3RoomStatus> {
  return LIVING_V3_WORLD_CONFIG.rooms.map((room) => {
    const alerts = state.alerts.filter((alert) => alert.roomId === room.id)
    const approvals = state.approvals.filter((approval) => livingV3StationById(approval.stationId)?.roomId === room.id)
    const activeTasks = state.tasks.filter((task) => task.roomId === room.id)
    const activeAgents = snapshots.filter((snapshot) => snapshot.roomId === room.id)
    return {
      roomId: room.id,
      badge: approvals.length ? 'approval' : alerts.length ? 'alert' : room.badge,
      activeAgents: activeAgents.length,
      activeTasks: activeTasks.length,
      alerts: alerts.length,
      approvals: approvals.length,
    }
  })
}

export function stationOperatorSpotIsOutsideBounds(stationId: LivingV3StationId) {
  const station = livingV3StationById(stationId)
  if (!station) return false
  const { operatorSpot, bounds } = station
  return !(operatorSpot.x >= bounds.x && operatorSpot.x <= bounds.x + bounds.w && operatorSpot.y >= bounds.y && operatorSpot.y <= bounds.y + bounds.h)
}
