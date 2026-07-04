import {
  LIVING_V3_WORLD_CONFIG,





  livingV3RoomById,
  livingV3RoomLocalToWorld
} from './living-v3-contract'
import type {LivingV3BridgeDefinition, LivingV3Point, LivingV3Rect, LivingV3RoomId, LivingV3WorldConfig} from './living-v3-contract';

export type LivingV3NavigationDoorSide = 'north' | 'south' | 'east' | 'west'
export type LivingV3NavigationWaypointKind = 'room-floor' | 'door' | 'bridge'
export type LivingV3NavigationRouteStatus = 'same-room' | 'ready' | 'blocked'

export type LivingV3NavigationDoor = {
  id: string
  roomId: LivingV3RoomId
  bridgeId: string
  side: LivingV3NavigationDoorSide
  world: LivingV3Point
  label: string
}

export type LivingV3NavigationWaypoint = {
  id: string
  kind: LivingV3NavigationWaypointKind
  world: LivingV3Point
  label: string
  roomId?: LivingV3RoomId
  bridgeId?: string
  doorId?: string
}

export type LivingV3NavigationRoute = {
  status: LivingV3NavigationRouteStatus
  fromRoomId: LivingV3RoomId
  toRoomId: LivingV3RoomId
  roomPath: Array<LivingV3RoomId>
  bridgePath: Array<string>
  waypoints: Array<LivingV3NavigationWaypoint>
  doorIds: Array<string>
  distance: number
  blockedReason?: string
}

export type LivingV3NavigationRouteSample = {
  world: LivingV3Point
  roomId: LivingV3RoomId
  segmentLabel: string
  segmentIndex: number
  from: LivingV3NavigationWaypoint
  to: LivingV3NavigationWaypoint
}

export type LivingV3NavigationSegment = {
  from: LivingV3NavigationWaypoint
  to: LivingV3NavigationWaypoint
}

const EDGE_EPSILON = 3

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function rightEdge(rect: LivingV3Rect) {
  return rect.x + rect.w
}

function bottomEdge(rect: LivingV3Rect) {
  return rect.y + rect.h
}

function rectCenter(rect: LivingV3Rect): LivingV3Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd)
}

function pointDistance(a: LivingV3Point, b: LivingV3Point) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function interpolate(from: LivingV3Point, to: LivingV3Point, progress: number): LivingV3Point {
  const t = clamp01(progress)
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  }
}

function doorSideForBridgeRoom(bridge: LivingV3BridgeDefinition, room: { world: LivingV3Rect }): LivingV3NavigationDoorSide | null {
  const roomRight = rightEdge(room.world)
  const roomBottom = bottomEdge(room.world)
  const bridgeRight = rightEdge(bridge.world)
  const bridgeBottom = bottomEdge(bridge.world)

  if (bridge.orientation === 'horizontal') {
    const bridgeOverlapsRoomY = rangesOverlap(bridge.world.y, bridgeBottom, room.world.y, roomBottom)
    if (!bridgeOverlapsRoomY) return null
    if (Math.abs(bridge.world.x - roomRight) <= EDGE_EPSILON) return 'east'
    if (Math.abs(bridgeRight - room.world.x) <= EDGE_EPSILON) return 'west'
    return null
  }

  const bridgeOverlapsRoomX = rangesOverlap(bridge.world.x, bridgeRight, room.world.x, roomRight)
  if (!bridgeOverlapsRoomX) return null
  if (Math.abs(bridge.world.y - roomBottom) <= EDGE_EPSILON) return 'south'
  if (Math.abs(bridgeBottom - room.world.y) <= EDGE_EPSILON) return 'north'
  return null
}

function doorWorldPointForSide(bridge: LivingV3BridgeDefinition, room: { world: LivingV3Rect }, side: LivingV3NavigationDoorSide): LivingV3Point {
  const bridgeCenter = rectCenter(bridge.world)
  if (side === 'east') {
    return {
      x: rightEdge(room.world),
      y: clamp(bridgeCenter.y, room.world.y + 12, bottomEdge(room.world) - 12),
    }
  }
  if (side === 'west') {
    return {
      x: room.world.x,
      y: clamp(bridgeCenter.y, room.world.y + 12, bottomEdge(room.world) - 12),
    }
  }
  if (side === 'south') {
    return {
      x: clamp(bridgeCenter.x, room.world.x + 12, rightEdge(room.world) - 12),
      y: bottomEdge(room.world),
    }
  }
  return {
    x: clamp(bridgeCenter.x, room.world.x + 12, rightEdge(room.world) - 12),
    y: room.world.y,
  }
}

export function livingV3NavigationDoorForBridgeRoom(
  bridge: LivingV3BridgeDefinition,
  roomId: LivingV3RoomId,
  config: LivingV3WorldConfig = LIVING_V3_WORLD_CONFIG,
): LivingV3NavigationDoor | null {
  const room = config.rooms.find((candidate) => candidate.id === roomId)
  if (!room) return null
  const side = doorSideForBridgeRoom(bridge, room)
  if (!side) return null
  const world = doorWorldPointForSide(bridge, room, side)
  return {
    id: `${bridge.id}:${roomId}`,
    roomId,
    bridgeId: bridge.id,
    side,
    world,
    label: `${room.label} ${side} door to ${bridge.label}`,
  }
}

export function livingV3NavigationDoors(config: LivingV3WorldConfig = LIVING_V3_WORLD_CONFIG): Array<LivingV3NavigationDoor> {
  return config.bridges.flatMap((bridge) => {
    const fromDoor = livingV3NavigationDoorForBridgeRoom(bridge, bridge.fromRoomId, config)
    const toDoor = livingV3NavigationDoorForBridgeRoom(bridge, bridge.toRoomId, config)
    return [fromDoor, toDoor].filter((door): door is LivingV3NavigationDoor => Boolean(door))
  })
}

type NavigationGraphEdge = {
  roomId: LivingV3RoomId
  nextRoomId: LivingV3RoomId
  bridge: LivingV3BridgeDefinition
}

function buildNavigationGraph(config: LivingV3WorldConfig) {
  const graph = new Map<LivingV3RoomId, Array<NavigationGraphEdge>>()
  for (const room of config.rooms) graph.set(room.id, [])

  for (const bridge of config.bridges) {
    const fromDoor = livingV3NavigationDoorForBridgeRoom(bridge, bridge.fromRoomId, config)
    const toDoor = livingV3NavigationDoorForBridgeRoom(bridge, bridge.toRoomId, config)
    if (!fromDoor || !toDoor) continue
    graph.get(bridge.fromRoomId)?.push({ roomId: bridge.fromRoomId, nextRoomId: bridge.toRoomId, bridge })
    graph.get(bridge.toRoomId)?.push({ roomId: bridge.toRoomId, nextRoomId: bridge.fromRoomId, bridge })
  }

  return graph
}

export function livingV3NavigationRoomPath(
  fromRoomId: LivingV3RoomId,
  toRoomId: LivingV3RoomId,
  config: LivingV3WorldConfig = LIVING_V3_WORLD_CONFIG,
): Array<{ roomId: LivingV3RoomId; bridgeId?: string }> | null {
  if (fromRoomId === toRoomId) return [{ roomId: fromRoomId }]
  const graph = buildNavigationGraph(config)
  const queue: Array<LivingV3RoomId> = [fromRoomId]
  const visited = new Set<LivingV3RoomId>([fromRoomId])
  const previous = new Map<LivingV3RoomId, { roomId: LivingV3RoomId; bridgeId: string }>()

  while (queue.length) {
    const roomId = queue.shift()!
    for (const edge of graph.get(roomId) ?? []) {
      if (visited.has(edge.nextRoomId)) continue
      visited.add(edge.nextRoomId)
      previous.set(edge.nextRoomId, { roomId, bridgeId: edge.bridge.id })
      if (edge.nextRoomId === toRoomId) {
        const path: Array<{ roomId: LivingV3RoomId; bridgeId?: string }> = [{ roomId: toRoomId }]
        let cursor = toRoomId
        while (cursor !== fromRoomId) {
          const prev = previous.get(cursor)
          if (!prev) return null
          path.unshift({ roomId: prev.roomId, bridgeId: prev.bridgeId })
          cursor = prev.roomId
        }
        return path
      }
      queue.push(edge.nextRoomId)
    }
  }

  return null
}

function waypointDistance(waypoints: Array<LivingV3NavigationWaypoint>) {
  return waypoints.slice(1).reduce((total, waypoint, index) => total + pointDistance(waypoints[index].world, waypoint.world), 0)
}

function pushWaypoint(waypoints: Array<LivingV3NavigationWaypoint>, waypoint: LivingV3NavigationWaypoint) {
  const previous = waypoints.at(-1)
  if (previous && pointDistance(previous.world, waypoint.world) < 0.5 && previous.kind === waypoint.kind) return
  waypoints.push(waypoint)
}

function bridgeById(config: LivingV3WorldConfig, bridgeId: string) {
  return config.bridges.find((bridge) => bridge.id === bridgeId) ?? null
}

function roomLabel(roomId: LivingV3RoomId) {
  return livingV3RoomById(roomId)?.label ?? roomId
}

export function buildLivingV3NavigationRoute(
  from: { roomId: LivingV3RoomId; point: LivingV3Point },
  to: { roomId: LivingV3RoomId; point: LivingV3Point },
  config: LivingV3WorldConfig = LIVING_V3_WORLD_CONFIG,
): LivingV3NavigationRoute {
  const originWorld = livingV3RoomLocalToWorld(from.roomId, from.point)
  const targetWorld = livingV3RoomLocalToWorld(to.roomId, to.point)
  const baseOrigin: LivingV3NavigationWaypoint = {
    id: `origin:${from.roomId}`,
    kind: 'room-floor',
    roomId: from.roomId,
    world: originWorld,
    label: `Start inside ${roomLabel(from.roomId)}`,
  }
  const baseTarget: LivingV3NavigationWaypoint = {
    id: `target:${to.roomId}`,
    kind: 'room-floor',
    roomId: to.roomId,
    world: targetWorld,
    label: `Arrive inside ${roomLabel(to.roomId)}`,
  }

  if (from.roomId === to.roomId) {
    const waypoints = [baseOrigin, baseTarget]
    return {
      status: 'same-room',
      fromRoomId: from.roomId,
      toRoomId: to.roomId,
      roomPath: [from.roomId],
      bridgePath: [],
      waypoints,
      doorIds: [],
      distance: waypointDistance(waypoints),
    }
  }

  const roomPath = livingV3NavigationRoomPath(from.roomId, to.roomId, config)
  if (!roomPath || roomPath.length < 2) {
    return {
      status: 'blocked',
      fromRoomId: from.roomId,
      toRoomId: to.roomId,
      roomPath: [from.roomId],
      bridgePath: [],
      waypoints: [baseOrigin],
      doorIds: [],
      distance: 0,
      blockedReason: `No legal bridge/door route from ${from.roomId} to ${to.roomId}`,
    }
  }

  const waypoints: Array<LivingV3NavigationWaypoint> = [baseOrigin]
  const doorIds: Array<string> = []
  const bridgePath: Array<string> = []

  for (let index = 0; index < roomPath.length - 1; index += 1) {
    const currentRoomId = roomPath[index].roomId
    const nextRoomId = roomPath[index + 1].roomId
    const bridgeId = roomPath[index].bridgeId
    const bridge = bridgeId ? bridgeById(config, bridgeId) : null
    if (!bridge) {
      return {
        status: 'blocked',
        fromRoomId: from.roomId,
        toRoomId: to.roomId,
        roomPath: roomPath.map((entry) => entry.roomId),
        bridgePath,
        waypoints,
        doorIds,
        distance: waypointDistance(waypoints),
        blockedReason: `Missing bridge between ${currentRoomId} and ${nextRoomId}`,
      }
    }

    const currentDoor = livingV3NavigationDoorForBridgeRoom(bridge, currentRoomId, config)
    const nextDoor = livingV3NavigationDoorForBridgeRoom(bridge, nextRoomId, config)
    if (!currentDoor || !nextDoor) {
      return {
        status: 'blocked',
        fromRoomId: from.roomId,
        toRoomId: to.roomId,
        roomPath: roomPath.map((entry) => entry.roomId),
        bridgePath,
        waypoints,
        doorIds,
        distance: waypointDistance(waypoints),
        blockedReason: `Bridge ${bridge.id} is missing a valid door on ${currentRoomId} or ${nextRoomId}`,
      }
    }

    bridgePath.push(bridge.id)
    doorIds.push(currentDoor.id, nextDoor.id)
    pushWaypoint(waypoints, {
      id: `door:${currentDoor.id}:exit`,
      kind: 'door',
      roomId: currentRoomId,
      bridgeId: bridge.id,
      doorId: currentDoor.id,
      world: currentDoor.world,
      label: `Exit ${roomLabel(currentRoomId)} through ${currentDoor.side} door`,
    })
    pushWaypoint(waypoints, {
      id: `bridge:${bridge.id}:center:${index}`,
      kind: 'bridge',
      bridgeId: bridge.id,
      world: rectCenter(bridge.world),
      label: `Cross ${bridge.label}`,
    })
    pushWaypoint(waypoints, {
      id: `door:${nextDoor.id}:enter`,
      kind: 'door',
      roomId: nextRoomId,
      bridgeId: bridge.id,
      doorId: nextDoor.id,
      world: nextDoor.world,
      label: `Enter ${roomLabel(nextRoomId)} through ${nextDoor.side} door`,
    })
  }

  pushWaypoint(waypoints, baseTarget)
  return {
    status: 'ready',
    fromRoomId: from.roomId,
    toRoomId: to.roomId,
    roomPath: roomPath.map((entry) => entry.roomId),
    bridgePath,
    waypoints,
    doorIds: [...new Set(doorIds)],
    distance: waypointDistance(waypoints),
  }
}

export function livingV3NavigationSegments(route: LivingV3NavigationRoute): Array<LivingV3NavigationSegment> {
  return route.waypoints.slice(1).map((waypoint, index) => ({
    from: route.waypoints[index],
    to: waypoint,
  }))
}

function segmentRoomId(route: LivingV3NavigationRoute, from: LivingV3NavigationWaypoint, to: LivingV3NavigationWaypoint): LivingV3RoomId {
  if (from.roomId && to.roomId && from.roomId === to.roomId) return from.roomId
  if (from.kind === 'door' && from.roomId && to.kind === 'bridge') return from.roomId
  if (from.kind === 'bridge' && to.kind === 'door' && to.roomId) return to.roomId
  return from.roomId ?? to.roomId ?? route.fromRoomId
}

function segmentLabel(from: LivingV3NavigationWaypoint, to: LivingV3NavigationWaypoint) {
  if (from.kind === 'bridge' || to.kind === 'bridge') return from.kind === 'bridge' ? to.label : to.label
  if (from.roomId && to.roomId && from.roomId === to.roomId && to.kind === 'door') return `Walk inside ${roomLabel(from.roomId)} to door`
  if (from.kind === 'door' && to.kind === 'room-floor' && to.roomId) return `Walk from door into ${roomLabel(to.roomId)}`
  if (from.kind === 'door' && to.kind === 'door' && from.roomId) return `Walk across ${roomLabel(from.roomId)} from door to door`
  return to.label
}

export function sampleLivingV3NavigationRoute(route: LivingV3NavigationRoute, progress: number): LivingV3NavigationRouteSample {
  const waypoints = route.waypoints
  if (waypoints.length === 0) {
    const home = livingV3RoomById(route.fromRoomId)?.world ?? { x: 0, y: 0, w: 0, h: 0 }
    const fallback: LivingV3NavigationWaypoint = {
      id: `fallback:${route.fromRoomId}`,
      kind: 'room-floor',
      roomId: route.fromRoomId,
      world: rectCenter(home),
      label: route.blockedReason ?? 'No route',
    }
    return { world: fallback.world, roomId: route.fromRoomId, segmentLabel: fallback.label, segmentIndex: 0, from: fallback, to: fallback }
  }
  if (waypoints.length === 1 || route.distance <= 0) {
    const waypoint = waypoints[0]
    return { world: waypoint.world, roomId: waypoint.roomId ?? route.fromRoomId, segmentLabel: route.blockedReason ?? waypoint.label, segmentIndex: 0, from: waypoint, to: waypoint }
  }

  const targetDistance = clamp01(progress) * route.distance
  let traveled = 0
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const from = waypoints[index]
    const to = waypoints[index + 1]
    const segmentDistance = pointDistance(from.world, to.world)
    const nextTraveled = traveled + segmentDistance
    if (targetDistance <= nextTraveled || index === waypoints.length - 2) {
      const segmentProgress = segmentDistance <= 0 ? 1 : (targetDistance - traveled) / segmentDistance
      return {
        world: interpolate(from.world, to.world, segmentProgress),
        roomId: segmentRoomId(route, from, to),
        segmentLabel: segmentLabel(from, to),
        segmentIndex: index,
        from,
        to,
      }
    }
    traveled = nextTraveled
  }

  const last = waypoints.at(-1)!
  return { world: last.world, roomId: last.roomId ?? route.toRoomId, segmentLabel: last.label, segmentIndex: waypoints.length - 1, from: last, to: last }
}

export function livingV3NavigationRouteDistance(
  from: { roomId: LivingV3RoomId; point: LivingV3Point },
  to: { roomId: LivingV3RoomId; point: LivingV3Point },
  config: LivingV3WorldConfig = LIVING_V3_WORLD_CONFIG,
) {
  return buildLivingV3NavigationRoute(from, to, config).distance
}

export function livingV3NavigationSegmentIsLegal(segment: LivingV3NavigationSegment) {
  const { from, to } = segment
  if (from.roomId && to.roomId && from.roomId === to.roomId) return true
  if (from.kind === 'door' && to.kind === 'bridge' && from.bridgeId === to.bridgeId) return true
  if (from.kind === 'bridge' && to.kind === 'door' && from.bridgeId === to.bridgeId) return true
  if (from.kind === 'bridge' && to.kind === 'bridge' && from.bridgeId === to.bridgeId) return true
  return false
}

export function livingV3NavigationRouteIsLegal(route: LivingV3NavigationRoute) {
  return route.status !== 'blocked' && livingV3NavigationSegments(route).every(livingV3NavigationSegmentIsLegal)
}

export function livingV3PointInsideInflatedRect(point: LivingV3Point, rect: LivingV3Rect, padding = 0) {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.w + padding && point.y >= rect.y - padding && point.y <= rect.y + rect.h + padding
}

export function livingV3NavigationPointIsOnWalkableSurface(
  point: LivingV3Point,
  config: LivingV3WorldConfig = LIVING_V3_WORLD_CONFIG,
) {
  return config.rooms.some((room) => livingV3PointInsideInflatedRect(point, room.world, 1)) ||
    config.bridges.some((bridge) => livingV3PointInsideInflatedRect(point, bridge.world, 1))
}
