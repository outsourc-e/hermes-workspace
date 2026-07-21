import { describe, expect, it } from 'vitest'

import {
  WAR_ROOM_RETIRED_AGENT_ALIASES,
  WAR_ROOM_WORKER_PROFILES,
  assertWarRoomAgentCanReceiveNewAssignment,
  canonicalWarRoomOwnerFor,
  retiredWarRoomAgentAlias,
} from './worker-profiles'

const RETIRED_ALIASES = [
  'signal-runner',
  'merchant-scout',
  'harbor-scout',
  'atlantis-archivist',
  'treasury-guardian',
  'athena-agent',
] as const

describe('War Room retired profile routing registry', () => {
  it('locks every retired alias to the canonical owner from the approved ownership matrix', () => {
    expect(WAR_ROOM_RETIRED_AGENT_ALIASES).toMatchObject({
      'signal-runner': { canonicalOwner: 'heimdall' },
      'merchant-scout': { canonicalOwner: 'loki' },
      'harbor-scout': { canonicalOwner: 'loki' },
      'atlantis-archivist': { canonicalOwner: 'poseidon' },
      'treasury-guardian': { canonicalOwner: 'dwarf' },
      'athena-agent': { canonicalOwner: 'goblin' },
    })
    for (const alias of RETIRED_ALIASES) {
      expect(retiredWarRoomAgentAlias(alias)).toBe(alias)
      expect(canonicalWarRoomOwnerFor(alias)).toBe(WAR_ROOM_RETIRED_AGENT_ALIASES[alias].canonicalOwner)
    }
    expect(canonicalWarRoomOwnerFor('hermes')).toBe('hermes')
  })

  it('removes retired aliases from the active worker profile selection list', () => {
    const activeIds = WAR_ROOM_WORKER_PROFILES.map((profile) => profile.agentId)
    expect(activeIds).not.toEqual(expect.arrayContaining([...RETIRED_ALIASES]))
    expect(activeIds).toEqual(expect.arrayContaining(['hermes', 'goblin', 'loki']))
  })

  it('fails closed on every retired alias without deleting its historical mapping', () => {
    for (const alias of RETIRED_ALIASES) {
      expect(() => assertWarRoomAgentCanReceiveNewAssignment(alias)).toThrow(
        new RegExp(`Retired agent alias ${alias}.*${WAR_ROOM_RETIRED_AGENT_ALIASES[alias].canonicalOwner}`),
      )
    }
    expect(() => assertWarRoomAgentCanReceiveNewAssignment('hermes')).not.toThrow()
  })
})
