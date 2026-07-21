import { describe, expect, it } from 'vitest'
import { LIVING_V3_WORLD_CONFIG } from '../living-v3/living-v3-contract'
import {
  WAR_ROOM_RETIRED_AGENT_ALIASES,
  WAR_ROOM_STATION_MANIFESTS,
  livingV3StationManifestById,
  livingV3StationManifestsByRoom,
  validateLivingV3StationManifestCoverage,
} from './index'

describe('Living V3 station manifest', () => {
  it('covers every current Living V3 station and room', () => {
    expect(validateLivingV3StationManifestCoverage()).toEqual({ ok: true, missing: [], extra: [] })
    for (const room of LIVING_V3_WORLD_CONFIG.rooms) {
      expect(livingV3StationManifestsByRoom(room.id).length, `${room.id} should expose at least one station manifest`).toBeGreaterThan(0)
    }
  })

  it('keeps all live external actions locked in tool manifests', () => {
    for (const manifest of WAR_ROOM_STATION_MANIFESTS) {
      expect(manifest.lockedActions).toEqual(expect.arrayContaining([
        'live_etsy_publish',
        'live_etsy_edit',
        'supplier_message_send',
        'paid_generation',
        'purchase',
        'discord_send',
        'account_mutation',
      ]))
      expect(manifest.allowedIntents).not.toContain('publish_etsy')
      expect(livingV3StationManifestById(manifest.stationId)?.stationId).toBe(manifest.stationId)
    }
  })

  it('never selects a retired alias as a station default', () => {
    const retiredAliases = new Set(Object.keys(WAR_ROOM_RETIRED_AGENT_ALIASES))
    for (const manifest of WAR_ROOM_STATION_MANIFESTS) {
      if (manifest.defaultAgentId) expect(retiredAliases.has(manifest.defaultAgentId)).toBe(false)
    }
    expect(livingV3StationManifestById('agora-intake')?.defaultAgentId).toBe('goblin')
    expect(livingV3StationManifestById('merchant-dock')?.defaultAgentId).toBe('loki')
    expect(livingV3StationManifestById('atlantis-index')?.defaultAgentId).toBe('poseidon')
    expect(livingV3StationManifestById('gateway-console')?.defaultAgentId).toBe('heimdall')
    expect(livingV3StationManifestById('treasury-ledger')?.defaultAgentId).toBeUndefined()
  })
})
