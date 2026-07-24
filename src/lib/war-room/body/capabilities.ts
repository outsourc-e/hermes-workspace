import { livingV3AgentById } from '../living-v3/living-v3-contract'
import { WAR_ROOM_RETIRED_AGENT_ALIASES, retiredWarRoomAgentAlias } from './worker-profiles'
import type { AgentIntent, WarRoomAgentId, WarRoomCapability } from './domain'

export const DEFAULT_WAR_ROOM_CAPABILITIES: Array<WarRoomCapability> = ['say', 'goToStation', 'raiseAlert']

export const WAR_ROOM_CAPABILITY_REGISTRY: Record<WarRoomAgentId, Array<WarRoomCapability>> = {
  ares: ['say', 'goToStation', 'rest'],
  aphrodite: ['say', 'goToStation', 'rest'],
  hermes: ['say', 'goToStation', 'carryPacket', 'requestApproval', 'raiseAlert', 'startWork'],
  goblin: ['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'],
  athena: ['say', 'goToStation', 'startWork', 'requestApproval', 'raiseAlert'],
  'loki': ['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'],
  'thor': ['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'],
  'odin': ['say', 'goToStation', 'startWork', 'carryPacket', 'requestApproval', 'raiseAlert'],
  hephaestus: ['say', 'goToStation', 'startWork', 'carryPacket', 'raiseAlert'],
  julius: ['say', 'goToStation', 'requestApproval', 'raiseAlert', 'startWork'],
  alexander: ['say', 'goToStation', 'rest'],
  napoleon: ['say', 'goToStation', 'rest'],
  saladin: ['say', 'goToStation', 'rest'],
  genghis: ['say', 'goToStation', 'rest'],
  hannibal: ['say', 'goToStation', 'rest'],
  oracle: ['say', 'goToStation', 'startWork', 'raiseAlert'],
  'merchant-scout': [],
  'atlantis-archivist': [],
  poseidon: ['say', 'goToStation', 'startWork', 'carryPacket', 'requestApproval', 'raiseAlert'],
  'treasury-guardian': [],
  'roster-keeper': ['say', 'goToStation', 'rest'],
  daedalus: ['say', 'goToStation', 'startWork', 'raiseAlert'],
  heimdall: ['say', 'goToStation', 'rest'],
  terra: ['say', 'goToStation', 'startWork', 'requestApproval', 'raiseAlert'],
  'signal-runner': [],
}

export function capabilityForIntent(intent: AgentIntent): WarRoomCapability {
  return capabilityForIntentType(intent.type)
}

export function capabilityForIntentType(intentType: AgentIntent['type']): WarRoomCapability {
  if (intentType === 'say') return 'say'
  if (intentType === 'move_to_room' || intentType === 'move_to_station') return 'goToStation'
  if (intentType === 'work_at_station') return 'startWork'
  if (intentType === 'carry_packet') return 'carryPacket'
  if (intentType === 'request_approval') return 'requestApproval'
  if (intentType === 'raise_alert') return 'raiseAlert'
  return 'rest'
}

export function canAgentPerformIntent(intent: AgentIntent) {
  const retiredAlias = retiredWarRoomAgentAlias(intent.agentId)
  if (retiredAlias) {
    return {
      ok: false as const,
      reason: `Retired agent alias ${retiredAlias} cannot receive new intents. Use ${WAR_ROOM_RETIRED_AGENT_ALIASES[retiredAlias].canonicalOwner}.`,
    }
  }
  const agent = livingV3AgentById(intent.agentId)
  if (!agent) {
    return { ok: false as const, reason: `Unknown agentId: ${intent.agentId}` }
  }
  const required = capabilityForIntent(intent)
  const capabilities = WAR_ROOM_CAPABILITY_REGISTRY[intent.agentId]
  if (!capabilities.includes(required)) {
    return { ok: false as const, reason: `${agent.label} cannot perform ${required}` }
  }
  return { ok: true as const, required, capabilities }
}

export function listWarRoomCapabilities() {
  return WAR_ROOM_CAPABILITY_REGISTRY
}
