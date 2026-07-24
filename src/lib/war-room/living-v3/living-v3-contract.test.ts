import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { WAR_ROOM_STATION_MANIFESTS, validateLivingV3StationManifestCoverage } from '../body/station-manifest'
import {
  LIVING_V3_APPROVED_CORE_ROOM_ROOT,
  LIVING_V3_APPROVED_ETSY_ART_ROOT,
  LIVING_V3_ASSET_ROOT,
  LIVING_V3_WORLD_CONFIG,
  livingV3AgentById,
  livingV3PointInsideRect
} from './living-v3-contract'
import { createInitialLivingV3HermesState } from './hermes-adapter'
import {
  ETSY_MARKET_LAB_RESIDENT_AGENT_IDS,
  ETSY_MARKET_LAB_STATION_APP_IDS,
  ETSY_MARKET_LAB_STATION_IDS,
  ETSY_MARKET_LAB_STATION_OPERATOR_IDS,
} from './etsy-station-apps'
import { buildLivingV3AgentSnapshots, buildLivingV3RoomStatuses, stationOperatorSpotIsOutsideBounds } from './living-v3-runtime'
import { isTruthyWarRoomFlag } from './route-flags'
import type {LivingV3BridgeDefinition, LivingV3Rect, LivingV3RoomDefinition} from './living-v3-contract';

function publicPath(assetPath: string) {
  return path.join(process.cwd(), 'public', assetPath.split('?')[0].replace(/^\//, ''))
}

function rightEdge(rect: LivingV3Rect) {
  return rect.x + rect.w
}

function bottomEdge(rect: LivingV3Rect) {
  return rect.y + rect.h
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd)
}

function assertBridgeTouchesRoomEdges(bridge: LivingV3BridgeDefinition, from: LivingV3RoomDefinition, to: LivingV3RoomDefinition) {
  if (bridge.orientation === 'horizontal') {
    const left = from.world.x <= to.world.x ? from : to
    const right = left.id === from.id ? to : from
    expect(bridge.world.x, `${bridge.id} should start at the left room edge`).toBe(rightEdge(left.world))
    expect(rightEdge(bridge.world), `${bridge.id} should end at the right room edge`).toBe(right.world.x)
    expect(
      rangesOverlap(bridge.world.y, bottomEdge(bridge.world), left.world.y, bottomEdge(left.world)) &&
        rangesOverlap(bridge.world.y, bottomEdge(bridge.world), right.world.y, bottomEdge(right.world)),
      `${bridge.id} should sit inside both room y-ranges`,
    ).toBe(true)
    return
  }

  const upper = from.world.y <= to.world.y ? from : to
  const lower = upper.id === from.id ? to : from
  expect(bridge.world.y, `${bridge.id} should start at the upper room edge`).toBe(bottomEdge(upper.world))
  expect(bottomEdge(bridge.world), `${bridge.id} should end at the lower room edge`).toBe(lower.world.y)
  expect(
    rangesOverlap(bridge.world.x, rightEdge(bridge.world), upper.world.x, rightEdge(upper.world)) &&
      rangesOverlap(bridge.world.x, rightEdge(bridge.world), lower.world.x, rightEdge(lower.world)),
    `${bridge.id} should sit inside both room x-ranges`,
  ).toBe(true)
}

describe('Living War Room V3 contract', () => {
  it('exposes exactly two Olympus tools: Hermes Command and Mission Control', () => {
    const olympusStations = LIVING_V3_WORLD_CONFIG.stations.filter((station) => station.roomId === 'olympus-command')
    expect(olympusStations.map((station) => [station.id, station.label])).toEqual([
      ['command-table', 'Hermes Command'],
      ['mission-router', 'Mission Control'],
    ])
    expect(WAR_ROOM_STATION_MANIFESTS.filter((station) => station.roomId === 'olympus-command').map((station) => station.stationId)).toEqual([
      'command-table',
      'mission-router',
    ])
  })

  it('uses only approved V3/current War Room art roots', () => {
    expect(LIVING_V3_WORLD_CONFIG.id).toBe('living-war-room-v3')
    expect(LIVING_V3_WORLD_CONFIG.assetRoot).toBe(LIVING_V3_ASSET_ROOT)
    expect(LIVING_V3_WORLD_CONFIG.legacy).toEqual({
      oldRoutesRemainAvailable: true,
      v3MayReferenceLegacyAssets: false,
    })

    const allAssetPaths = [
      ...LIVING_V3_WORLD_CONFIG.rooms.map((room) => room.assetPath),
      ...LIVING_V3_WORLD_CONFIG.bridges.map((bridge) => bridge.assetPath),
      ...LIVING_V3_WORLD_CONFIG.stations.map((station) => station.assetPath),
      ...LIVING_V3_WORLD_CONFIG.agents.flatMap((agent) => [
        agent.portraitPath,
        ...Object.values(agent.clips).map((clip) => clip.assetPath),
      ]),
    ]

    for (const assetPath of allAssetPaths) {
      expect(
        assetPath.includes(`${LIVING_V3_ASSET_ROOT}/`) ||
          assetPath.includes(`${LIVING_V3_APPROVED_CORE_ROOM_ROOT}/`) ||
          assetPath.includes(`${LIVING_V3_APPROVED_ETSY_ART_ROOT}/`),
        `${assetPath} should be V3 or approved War Room art`,
      ).toBe(true)
      expect(assetPath).not.toContain('/war-room/etsy-ops-julius-v1/')
      expect(existsSync(publicPath(assetPath)), `${assetPath} should exist`).toBe(true)
    }

    const merchantRoom = LIVING_V3_WORLD_CONFIG.rooms.find((room) => room.id === 'merchant-harbor')
    expect(merchantRoom?.assetPath).toContain(`${LIVING_V3_APPROVED_ETSY_ART_ROOT}/room/`)
    expect(LIVING_V3_WORLD_CONFIG.rooms.filter((room) => room.id !== 'merchant-harbor').every((room) => room.assetPath.includes(`${LIVING_V3_APPROVED_CORE_ROOM_ROOT}/rooms/`))).toBe(true)
    expect(LIVING_V3_WORLD_CONFIG.bridges.every((bridge) => bridge.assetPath.includes(`${LIVING_V3_ASSET_ROOT}/bridges/`))).toBe(true)
    expect(LIVING_V3_WORLD_CONFIG.stations.filter((station) => station.roomId === 'merchant-harbor').every((station) => station.assetPath.includes(`${LIVING_V3_APPROVED_ETSY_ART_ROOT}/stations/`))).toBe(true)
    for (const agent of LIVING_V3_WORLD_CONFIG.agents) {
      if (['ares', 'aphrodite', 'hermes', 'terra', 'poseidon'].includes(agent.id)) {
        expect(agent.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/${agent.id}/portrait.png`)
      } else if (agent.visualStatus === 'council-room-general') {
        expect(agent.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/generals-council/`)
      } else {
        expect(agent.portraitPath).toContain(`${LIVING_V3_APPROVED_ETSY_ART_ROOT}/agents/`)
      }
    }
  })

  it('defines the expanded map without hiding or dimming existing rooms', () => {
    expect(LIVING_V3_WORLD_CONFIG.rooms.map((room) => room.id)).toEqual([
      'olympus-command',
      'agora-opportunity',
      'oracle-signals',
      'etsy-market-lab',
      'forge-hephaestus',
      'terra-forge',
      'merchant-harbor',
      'atlantis-vault',
      'treasury-commerce',
      'pantheon-quarters',
      'daedalus-workshop',
      'gateway-cockpit',
      'council-strategists',
    ])
    expect(LIVING_V3_WORLD_CONFIG.rooms).toHaveLength(13)
    expect(LIVING_V3_WORLD_CONFIG.rooms.every((room) => !('phase' in room))).toBe(true)
    expect(LIVING_V3_WORLD_CONFIG.rooms.find((room) => room.id === 'etsy-market-lab')?.world).toEqual({ x: 3420, y: 720, w: 480, h: 320 })
    expect(LIVING_V3_WORLD_CONFIG.rooms.find((room) => room.id === 'terra-forge')?.world).toEqual({ x: 620, y: 1760, w: 480, h: 320 })
    expect(LIVING_V3_WORLD_CONFIG.rooms.find((room) => room.id === 'olympus-command')?.status).toBe('central-command')
    expect(LIVING_V3_WORLD_CONFIG.rooms.find((room) => room.id === 'pantheon-quarters')?.status).toBe('rest-only')
    expect(LIVING_V3_WORLD_CONFIG.scale).toEqual({ agent: 0.85, station: 0.8 })
    expect(LIVING_V3_WORLD_CONFIG.agents.map((agent) => [agent.id, agent.home.roomId])).toEqual(expect.arrayContaining([
      ['ares', 'etsy-market-lab'],
      ['aphrodite', 'etsy-market-lab'],
      ['hermes', 'olympus-command'],
      ['goblin', 'agora-opportunity'],
      ['julius', 'council-strategists'],
      ['alexander', 'council-strategists'],
      ['napoleon', 'council-strategists'],
      ['saladin', 'council-strategists'],
      ['genghis', 'council-strategists'],
      ['hannibal', 'council-strategists'],
      ['terra', 'terra-forge'],
      ['poseidon', 'atlantis-vault'],
      ['loki', 'etsy-market-lab'],
      ['thor', 'etsy-market-lab'],
      ['odin', 'etsy-market-lab'],
    ]))
    expect(LIVING_V3_WORLD_CONFIG.bridges).toHaveLength(13)
    expect(LIVING_V3_WORLD_CONFIG.bridges.every((bridge) => bridge.assetPath.includes('/war-room/living-v3/bridges/'))).toBe(true)
    const terra = LIVING_V3_WORLD_CONFIG.agents.find((agent) => agent.id === 'terra')
    expect(terra?.visualStatus).toBe('terra-earth-pet-runtime-final')
    expect(terra?.assetFolder).toContain(`${LIVING_V3_ASSET_ROOT}/agents/terra`)
    expect(terra?.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/terra/portrait.png`)
    expect(terra?.clips.idle.assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/terra/idle.png`)
    expect(terra?.clips['walk-north-east'].assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/terra/walk-north-east.png`)
    expect(terra?.clips.sit.assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/terra/wait-approval.png`)
    expect(Object.values(terra!.clips).every((clip) => clip.frameCount === 8)).toBe(true)
    expect(existsSync(publicPath(terra!.portraitPath))).toBe(true)
    expect(existsSync(publicPath(terra!.clips.idle.assetPath))).toBe(true)
    expect(existsSync(publicPath(terra!.clips['walk-north-east'].assetPath))).toBe(true)
  })

  it('lets Terra roam inside Terra Forge and touch the 3D tools after her active task hold', () => {
    const state = createInitialLivingV3HermesState(0)
    const snapshots = buildLivingV3AgentSnapshots(state, 90_000)
    const terra = snapshots.find((snapshot) => snapshot.agentId === 'terra')

    expect(terra?.roomId).toBe('terra-forge')
    expect(terra?.label).toMatch(/Modeling Studio|Model Hunt|Printer Control|Obsidian Memory|Walking calmly/)
    expect(terra?.clipPath).toContain('/war-room/living-v3/agents/terra/')
    expect(['idle', 'walking', 'working', 'talking']).toContain(terra?.activity)
  })

  it('adds the Etsy Market Lab station cast and resident local agents', () => {
    expect(LIVING_V3_WORLD_CONFIG.stations.map((station) => station.id)).toEqual(expect.arrayContaining([
      'etsy-loki-product-hunt',
      'etsy-thor-seo-metrics',
      'etsy-loki-source-leads',
      'etsy-thor-source-truth',
      'etsy-thor-shotlab-prep',
      'etsy-thor-qa-review',
      'etsy-odin-draft-approval',
    ]))
    expect(LIVING_V3_WORLD_CONFIG.agents.map((agent) => agent.id)).not.toContain('tyche')
    expect(LIVING_V3_WORLD_CONFIG.agents.map((agent) => agent.id)).toEqual(expect.arrayContaining(ETSY_MARKET_LAB_RESIDENT_AGENT_IDS))
    for (const agentId of ['ares', 'aphrodite'] as const) {
      const agent = LIVING_V3_WORLD_CONFIG.agents.find((candidate) => candidate.id === agentId)
      expect(agent?.visualStatus).toBe('ambient-companion')
      expect(agent?.primaryStationIds).toEqual([])
      expect(agent?.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/${agentId}/portrait.png`)
      expect(Object.values(agent!.clips).every((clip) => clip.frameCount === 8)).toBe(true)
    }
    const hermes = LIVING_V3_WORLD_CONFIG.agents.find((agent) => agent.id === 'hermes')
    expect(hermes?.visualStatus).toBe('primary-roaming-companion')
    expect(hermes?.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/hermes/portrait.png`)
    expect(hermes?.clips.idle.assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/hermes/idle.png`)
    const goblin = LIVING_V3_WORLD_CONFIG.agents.find((agent) => agent.id === 'goblin')
    expect(goblin).toMatchObject({
      label: 'Goblin',
      home: { roomId: 'agora-opportunity', point: { x: 50, y: 68 } },
      primaryStationIds: ['agora-intake'],
      visualStatus: 'temporary-approved-sprite',
    })
    expect(goblin?.role).toContain('Opportunity Packet')
    expect(goblin?.assetFolder).toContain('/agents/athena-market-strategist')
    expect(existsSync(publicPath(goblin!.portraitPath))).toBe(true)
    expect(Object.values(goblin!.clips).every((clip) => clip.frameCount === 8)).toBe(true)
    const poseidon = LIVING_V3_WORLD_CONFIG.agents.find((agent) => agent.id === 'poseidon')
    expect(poseidon).toMatchObject({
      label: 'Poseidon',
      home: { roomId: 'atlantis-vault', point: { x: 50, y: 68 } },
      primaryStationIds: ['atlantis-index'],
      visualStatus: 'poseidon-sea-pet-runtime-final',
    })
    expect(poseidon?.role).toContain('He centralizes visibility; he does not own every worker action')
    expect(poseidon?.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/poseidon/portrait.png`)
    expect(poseidon?.clips.idle.assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/poseidon/idle.png`)
    expect(poseidon?.clips['work-standing'].assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/poseidon/work-standing.png`)
    expect(poseidon?.clips['walk-north-east'].assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/poseidon/walk-north-east.png`)
    expect(poseidon?.clips.sit.assetPath).toContain(`${LIVING_V3_ASSET_ROOT}/agents/poseidon/wait-approval.png`)
    expect(Object.values(poseidon!.clips).every((clip) => clip.frameCount === 8)).toBe(true)
    expect(existsSync(publicPath(poseidon!.portraitPath))).toBe(true)
    expect(existsSync(publicPath(poseidon!.clips.idle.assetPath))).toBe(true)
    expect(existsSync(publicPath(poseidon!.clips['work-standing'].assetPath))).toBe(true)
    expect(existsSync(publicPath(poseidon!.clips['walk-north-east'].assetPath))).toBe(true)
    for (const agentId of ETSY_MARKET_LAB_RESIDENT_AGENT_IDS) {
      const agent = LIVING_V3_WORLD_CONFIG.agents.find((candidate) => candidate.id === agentId)
      expect(agent?.home.roomId).toBe('etsy-market-lab')
      expect(agent?.visualStatus).toBe('norse-operator-runtime-final')
      expect(agent?.assetFolder).toContain(`${LIVING_V3_APPROVED_ETSY_ART_ROOT}/agents/hermes-pets-`)
      expect(agent?.assetFolder).toContain('/runtime')
      expect(agent?.portraitPath).toContain('/runtime/portrait.png')
      expect(agent?.clips.idle.assetPath).toContain('/runtime/idle.png')
      expect(agent?.clips['walk-north-east'].assetPath).toContain('/runtime/walk-north-east.png')
      expect(agent?.clips.sit.assetPath).toContain('/runtime/wait-approval.png')
      expect(Object.values(agent!.clips).every((clip) => clip.frameCount === 8)).toBe(true)
      expect(existsSync(publicPath(agent!.portraitPath))).toBe(true)
      expect(existsSync(publicPath(agent!.clips.idle.assetPath))).toBe(true)
      expect(existsSync(publicPath(agent!.clips['walk-north-east'].assetPath))).toBe(true)
    }
    const councilGenerals = ['julius', 'alexander', 'napoleon', 'saladin', 'genghis', 'hannibal'] as const
    for (const agentId of councilGenerals) {
      const agent = LIVING_V3_WORLD_CONFIG.agents.find((candidate) => candidate.id === agentId)
      expect(agent?.home.roomId).toBe('council-strategists')
      expect(agent?.visualStatus).toBe('council-room-general')
      expect(agent?.primaryStationIds).toEqual(['council-table'])
      expect(agent?.portraitPath).toContain(`${LIVING_V3_ASSET_ROOT}/generals-council/`)
      expect(agent?.clips.sit.assetPath).toContain('/runtime/sit.png')
      expect(existsSync(publicPath(agent!.portraitPath))).toBe(true)
      expect(existsSync(publicPath(agent!.clips.sit.assetPath))).toBe(true)
    }
    expect(LIVING_V3_WORLD_CONFIG.agents.map((agent) => agent.id)).not.toEqual(expect.arrayContaining(['athena', 'oracle', 'hephaestus', 'merchant-scout', 'atlantis-archivist', 'treasury-guardian', 'roster-keeper', 'daedalus', 'signal-runner']))
    expect(Object.values(ETSY_MARKET_LAB_STATION_OPERATOR_IDS)).not.toContain('julius')
    expect(validateLivingV3StationManifestCoverage()).toEqual({ ok: true, missing: [], extra: [] })
    expect(WAR_ROOM_STATION_MANIFESTS.filter((manifest) => manifest.roomId === 'etsy-market-lab')).toHaveLength(7)
    expect(WAR_ROOM_STATION_MANIFESTS.find((manifest) => manifest.stationId === 'etsy-odin-draft-approval')?.defaultAgentId).not.toBe('julius')
  })

  it('preserves retired body IDs and assets only as historical hidden placeholders', () => {
    for (const agentId of ['merchant-scout', 'atlantis-archivist', 'treasury-guardian', 'signal-runner'] as const) {
      const agent = livingV3AgentById(agentId)
      expect(agent?.role).toContain('Retired historical visual placeholder')
      expect(agent?.role).toContain('never route new work')
      expect(agent?.portraitPath).toBeTruthy()
      expect(agent?.clips.idle.assetPath).toBeTruthy()
      expect(LIVING_V3_WORLD_CONFIG.agents.some((visible) => visible.id === agentId)).toBe(false)
    }
  })

  it('starts Etsy Market Lab with visible resident agents in the room status snapshot', () => {
    const state = createInitialLivingV3HermesState(10_000)
    const snapshots = buildLivingV3AgentSnapshots(state, 10_500)
    const statuses = buildLivingV3RoomStatuses(state, snapshots)
    const etsyStatus = statuses.find((status) => status.roomId === 'etsy-market-lab')
    const etsyResidents = snapshots.filter((snapshot) => ETSY_MARKET_LAB_RESIDENT_AGENT_IDS.includes(snapshot.agentId as never))

    expect(etsyResidents.map((snapshot) => snapshot.agentId)).toEqual(expect.arrayContaining(ETSY_MARKET_LAB_RESIDENT_AGENT_IDS))
    expect(etsyResidents.every((snapshot) => snapshot.roomId === 'etsy-market-lab')).toBe(true)
    expect(etsyStatus?.activeAgents).toBeGreaterThanOrEqual(3)
  })

  it('starts Poseidon in Atlantis Vault as a data-backed room manager, not a global bottleneck', () => {
    const state = createInitialLivingV3HermesState(10_000)
    const snapshots = buildLivingV3AgentSnapshots(state, 12_500)
    const atlantisStatus = buildLivingV3RoomStatuses(state, snapshots).find((status) => status.roomId === 'atlantis-vault')
    const poseidon = snapshots.find((snapshot) => snapshot.agentId === 'poseidon')

    expect(poseidon).toMatchObject({
      roomId: 'atlantis-vault',
      activity: 'working',
      badge: 'active-task',
      packetLabel: 'Vault index',
    })
    expect(poseidon?.label).toContain('DB and Obsidian catalog health')
    expect(atlantisStatus?.activeTasks).toBe(1)
    expect(atlantisStatus?.activeAgents).toBeGreaterThanOrEqual(1)
  })

  it('maps every Etsy Market Lab station to a distinct workbench app id', () => {
    const etsyStationIds = LIVING_V3_WORLD_CONFIG.stations
      .filter((station) => station.roomId === 'etsy-market-lab')
      .map((station) => station.id)
    const appIds = Object.values(ETSY_MARKET_LAB_STATION_APP_IDS)

    expect(ETSY_MARKET_LAB_STATION_IDS).toEqual(etsyStationIds)
    expect(new Set(appIds).size).toBe(appIds.length)
    expect(appIds).toEqual(expect.arrayContaining([
      'loki-product-hunter',
      'thor-seo-metrics',
      'loki-source-leads',
      'thor-source-truth',
      'thor-shotlab-forge',
      'thor-qa-review',
      'odin-draft-approval',
    ]))
  })

  it('keeps bridges touching room edges instead of floating in gaps', () => {
    const roomsById = new Map(LIVING_V3_WORLD_CONFIG.rooms.map((room) => [room.id, room]))
    for (const bridge of LIVING_V3_WORLD_CONFIG.bridges) {
      const from = roomsById.get(bridge.fromRoomId)
      const to = roomsById.get(bridge.toRoomId)
      expect(from, `${bridge.id} from room should exist`).toBeTruthy()
      expect(to, `${bridge.id} to room should exist`).toBeTruthy()
      assertBridgeTouchesRoomEdges(bridge, from!, to!)
    }
    expect(LIVING_V3_WORLD_CONFIG.bridges.find((bridge) => bridge.id === 'oracle-to-etsy-market')?.world).toEqual({ x: 3340, y: 880, w: 80, h: 30 })
    expect(LIVING_V3_WORLD_CONFIG.bridges.find((bridge) => bridge.id === 'forge-to-terra')?.world).toEqual({ x: 844, y: 1660, w: 32, h: 100 })
  })

  it('keeps all operator spots outside station bounds', () => {
    for (const station of LIVING_V3_WORLD_CONFIG.stations) {
      expect(stationOperatorSpotIsOutsideBounds(station.id), `${station.id} operator spot should be outside station bounds`).toBe(true)
      expect(livingV3PointInsideRect(station.operatorSpot, station.bounds)).toBe(false)
    }
  })

  it('ships a V3 public asset manifest without legacy paths', () => {
    const manifestPath = path.join(process.cwd(), 'public/war-room/living-v3/manifest.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifestText = readFileSync(manifestPath, 'utf8')
    expect(manifestText).toContain('"assetRoot": "/war-room/living-v3"')
    expect(manifestText).not.toContain('/war-room/etsy-ops-julius-v1/')
    const manifest = JSON.parse(manifestText) as {
      rooms: Record<string, unknown>
      bridges: Record<string, unknown>
      agents: Record<string, { totalFrames: number; states: Record<string, { validation?: { ok: boolean } }> }>
    }
    expect(Object.keys(manifest.rooms)).toEqual(expect.arrayContaining(['olympus-command']))
    expect(Object.keys(manifest.bridges)).toEqual(expect.arrayContaining(['command-to-etsy', 'command-to-rest']))
    expect(Object.keys(manifest.agents)).toEqual(['athena', 'hephaestus', 'julius'])
    for (const agent of Object.values(manifest.agents)) {
      expect(agent.totalFrames).toBeGreaterThanOrEqual(112)
      for (const [state, entry] of Object.entries(agent.states)) {
        if (state === 'portrait') continue
        expect(entry.validation?.ok, `${state} should pass clipping validation`).toBe(true)
      }
    }
  })

  it('normalizes current V3 route flags and typo-safe Etsy compatibility flags', () => {
    expect(isTruthyWarRoomFlag('1')).toBe(true)
    expect(isTruthyWarRoomFlag('1.')).toBe(true)
    expect(isTruthyWarRoomFlag('living-v3')).toBe(true)
    expect(isTruthyWarRoomFlag('v3')).toBe(true)
    expect(isTruthyWarRoomFlag('0')).toBe(false)
  })
})
