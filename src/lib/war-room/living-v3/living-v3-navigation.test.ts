import { describe, expect, it } from 'vitest'
import { LIVING_V3_WORLD_CONFIG  } from './living-v3-contract'
import {
  buildLivingV3NavigationRoute,
  livingV3NavigationDoors,
  livingV3NavigationPointIsOnWalkableSurface,
  livingV3NavigationRouteIsLegal,
  livingV3NavigationSegments,
  sampleLivingV3NavigationRoute,
} from './living-v3-navigation'
import type {LivingV3RoomId} from './living-v3-contract';

const roomIds = LIVING_V3_WORLD_CONFIG.rooms.map((room) => room.id)

function pointInsideRoom(roomId: LivingV3RoomId, point = { x: 50, y: 68 }) {
  return { roomId, point }
}

describe('Living War Room V3 navigation graph', () => {
  it('derives exactly two dynamic door endpoints for every bridge', () => {
    const doors = livingV3NavigationDoors()

    expect(doors).toHaveLength(LIVING_V3_WORLD_CONFIG.bridges.length * 2)
    for (const bridge of LIVING_V3_WORLD_CONFIG.bridges) {
      const bridgeDoors = doors.filter((door) => door.bridgeId === bridge.id)
      expect(bridgeDoors.map((door) => door.roomId).sort()).toEqual([bridge.fromRoomId, bridge.toRoomId].sort())
      expect(bridgeDoors.every((door) => livingV3NavigationPointIsOnWalkableSurface(door.world))).toBe(true)
    }
  })

  it('keeps the entire room graph connected through legal bridge/door segments', () => {
    for (const fromRoomId of roomIds) {
      for (const toRoomId of roomIds) {
        const route = buildLivingV3NavigationRoute(pointInsideRoom(fromRoomId), pointInsideRoom(toRoomId))
        expect(route.status, `${fromRoomId} -> ${toRoomId}`).not.toBe('blocked')
        expect(livingV3NavigationRouteIsLegal(route), `${fromRoomId} -> ${toRoomId}`).toBe(true)
        expect(route.waypoints.every((waypoint) => livingV3NavigationPointIsOnWalkableSurface(waypoint.world))).toBe(true)
      }
    }
  })

  it('routes Olympus to Terra through doors and bridges instead of a direct wall-crossing segment', () => {
    const route = buildLivingV3NavigationRoute(
      { roomId: 'olympus-command', point: { x: 50, y: 68 } },
      { roomId: 'terra-forge', point: { x: 48, y: 66 } },
    )

    expect(route.status).toBe('ready')
    expect(route.roomPath).toEqual(['olympus-command', 'agora-opportunity', 'forge-hephaestus', 'terra-forge'])
    expect(route.bridgePath).toEqual(['agora-to-command', 'agora-to-forge', 'forge-to-terra'])
    expect(route.doorIds).toEqual(expect.arrayContaining([
      'agora-to-command:olympus-command',
      'agora-to-command:agora-opportunity',
      'agora-to-forge:agora-opportunity',
      'forge-to-terra:terra-forge',
    ]))
    expect(livingV3NavigationSegments(route).some((segment) => segment.from.roomId && segment.to.roomId && segment.from.roomId !== segment.to.roomId)).toBe(false)

    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const sample = sampleLivingV3NavigationRoute(route, progress)
      expect(livingV3NavigationPointIsOnWalkableSurface(sample.world), `progress ${progress}`).toBe(true)
    }
  })
})
