export const WAR_ROOM_ROOM_MAP = [
  { uiRoomId: 'olympus-command', apiRoomId: 'olympus', label: 'Olympus Command', primaryAgentId: 'hermes' },
  { uiRoomId: 'pantheon-quarters', apiRoomId: 'pantheon', label: 'Pantheon Quarters', primaryAgentId: 'hercules' },
  { uiRoomId: 'agora', apiRoomId: 'agora', label: 'Agora of Opportunity', primaryAgentId: 'athena' },
  { uiRoomId: 'oracle', apiRoomId: 'oracle', label: 'Oracle of Signals', primaryAgentId: 'oracle' },
  { uiRoomId: 'forge', apiRoomId: 'shotlab', label: 'Forge of Hephaestus', primaryAgentId: 'hephaestus' },
  { uiRoomId: 'merchant-harbor', apiRoomId: 'harbor', label: 'Merchant Harbor', primaryAgentId: 'njord' },
  { uiRoomId: 'atlantis-vault', apiRoomId: 'atlantis', label: 'Atlantis Vault', primaryAgentId: 'poseidon' },
  { uiRoomId: 'treasury', apiRoomId: 'treasury', label: 'Treasury of Commerce', primaryAgentId: 'treasury-watcher' },
] as const

export type WarRoomUiRoomId = typeof WAR_ROOM_ROOM_MAP[number]['uiRoomId']
export type WarRoomApiRoomId = typeof WAR_ROOM_ROOM_MAP[number]['apiRoomId']
export type WarRoomRoomMapEntry = typeof WAR_ROOM_ROOM_MAP[number]

const UI_TO_API = new Map<string, WarRoomRoomMapEntry>(WAR_ROOM_ROOM_MAP.map((entry) => [entry.uiRoomId, entry]))
const API_TO_UI = new Map<string, WarRoomRoomMapEntry>(WAR_ROOM_ROOM_MAP.map((entry) => [entry.apiRoomId, entry]))

export function roomMapForUiRoom(uiRoomId: string): WarRoomRoomMapEntry | undefined {
  return UI_TO_API.get(uiRoomId)
}

export function roomMapForApiRoom(apiRoomId: string): WarRoomRoomMapEntry | undefined {
  return API_TO_UI.get(apiRoomId)
}

export function apiRoomForUiRoom(uiRoomId: string): string {
  return roomMapForUiRoom(uiRoomId)?.apiRoomId ?? uiRoomId
}

export function uiRoomForApiRoom(apiRoomId: string): string {
  return roomMapForApiRoom(apiRoomId)?.uiRoomId ?? apiRoomId
}

export function labelForUiRoom(uiRoomId: string): string {
  return roomMapForUiRoom(uiRoomId)?.label ?? uiRoomId
}
