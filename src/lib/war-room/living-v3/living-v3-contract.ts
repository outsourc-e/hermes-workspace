export type LivingV3RoomId =
  | 'olympus-command'
  | 'agora-opportunity'
  | 'oracle-signals'
  | 'etsy-market-lab'
  | 'forge-hephaestus'
  | 'terra-forge'
  | 'merchant-harbor'
  | 'atlantis-vault'
  | 'treasury-commerce'
  | 'pantheon-quarters'
  | 'daedalus-workshop'
  | 'gateway-cockpit'
  | 'council-strategists'

export type LivingV3AgentId =
  | 'ares'
  | 'aphrodite'
  | 'hermes'
  | 'goblin'
  | 'athena'
  | 'oracle'
  | 'heimdall'
  | 'loki'
  | 'thor'
  | 'odin'
  | 'hephaestus'
  | 'terra'
  | 'merchant-scout'
  | 'atlantis-archivist'
  | 'poseidon'
  | 'treasury-guardian'
  | 'roster-keeper'
  | 'daedalus'
  | 'signal-runner'
  | 'julius'
  | 'alexander'
  | 'napoleon'
  | 'saladin'
  | 'genghis'
  | 'hannibal'

export type LivingV3StationId =
  | 'command-table'
  | 'mission-router'
  | 'agora-intake'
  | 'oracle-signal-basin'
  | 'forge-workbench'
  | 'terra-modeling-studio'
  | 'terra-model-hunt'
  | 'terra-printer-control'
  | 'merchant-dock'
  | 'atlantis-index'
  | 'treasury-ledger'
  | 'pantheon-roster'
  | 'pantheon-rest-pods'
  | 'daedalus-bench'
  | 'gateway-console'
  | 'council-table'
  | 'etsy-loki-product-hunt'
  | 'etsy-thor-seo-metrics'
  | 'etsy-loki-source-leads'
  | 'etsy-thor-source-truth'
  | 'etsy-thor-shotlab-prep'
  | 'etsy-thor-qa-review'
  | 'etsy-odin-draft-approval'

export type LivingV3BadgeKind = 'active-task' | 'approval' | 'blocked' | 'alert' | 'sleeping' | 'idle'

export type LivingV3AgentActivity = 'idle' | 'walking' | 'working' | 'talking' | 'carrying' | 'waiting-approval' | 'sleeping'

export type LivingV3ZoomLevel = 'map' | 'mid' | 'room'

export type LivingV3CameraMode = 'map' | 'free' | 'room'

export type LivingV3AnimationState =
  | 'idle'
  | 'walk-north'
  | 'walk-south'
  | 'walk-east'
  | 'walk-west'
  | 'walk-north-east'
  | 'walk-north-west'
  | 'walk-south-east'
  | 'walk-south-west'
  | 'work-standing'
  | 'talk-standing'
  | 'carry-packet'
  | 'wait-approval'
  | 'sit'
  | 'sleep'

export type LivingV3Point = { x: number; y: number }

export type LivingV3Rect = LivingV3Point & { w: number; h: number }

export type LivingV3RoomDefinition = {
  id: LivingV3RoomId
  label: string
  role: string
  world: LivingV3Rect
  assetPath: string
  status: 'central-command' | 'active-work' | 'rest-only'
  badge: LivingV3BadgeKind
}

export type LivingV3BridgeDefinition = {
  id: string
  fromRoomId: LivingV3RoomId
  toRoomId: LivingV3RoomId
  world: LivingV3Rect
  assetPath: string
  orientation: 'horizontal' | 'vertical'
  frameCount: number
  label: string
}

export type LivingV3StationDefinition = {
  id: LivingV3StationId
  roomId: LivingV3RoomId
  label: string
  role: string
  bounds: LivingV3Rect
  operatorSpot: LivingV3Point
  assetPath: string
  frameCount: number
  badge: LivingV3BadgeKind
  hermesIntent: 'command' | 'work' | 'approval' | 'rest'
}

export type LivingV3AgentDefinition = {
  id: LivingV3AgentId
  label: string
  shortLabel: string
  role: string
  persona: string
  accent: string
  home: { roomId: LivingV3RoomId; point: LivingV3Point }
  primaryStationIds: Array<LivingV3StationId>
  assetFolder: string
  portraitPath: string
  clips: Record<LivingV3AnimationState, { assetPath: string; frameCount: number }>
  visualStatus?: 'temporary-approved-sprite' | 'norse-operator-runtime-final' | 'terra-earth-pet-runtime-final' | 'poseidon-sea-pet-runtime-final' | 'ambient-companion' | 'primary-roaming-companion' | 'council-room-general'
}

export type LivingV3CorridorDefinition = {
  id: string
  fromRoomId: LivingV3RoomId
  toRoomId: LivingV3RoomId
  world: LivingV3Rect
  label: string
}

export type LivingV3CameraState = {
  center: LivingV3Point
  scale: number
  mode: LivingV3CameraMode
  focusedRoomId: LivingV3RoomId | null
}

export type LivingV3WorldConfig = {
  id: 'living-war-room-v3'
  version: string
  assetRoot: '/war-room/living-v3'
  worldSize: { w: number; h: number }
  rooms: Array<LivingV3RoomDefinition>
  bridges: Array<LivingV3BridgeDefinition>
  stations: Array<LivingV3StationDefinition>
  agents: Array<LivingV3AgentDefinition>
  scale: {
    agent: 0.85
    station: 0.8
  }
  legacy: {
    oldRoutesRemainAvailable: true
    v3MayReferenceLegacyAssets: false
  }
}

export const LIVING_V3_VERSION = 'living-v3-20260703-core-modules-1' as const
export const LIVING_V3_ASSET_ROOT = '/war-room/living-v3' as const
export const LIVING_V3_APPROVED_ETSY_ART_ROOT = '/war-room/etsy-ops-v4' as const
export const LIVING_V3_APPROVED_CORE_ROOM_ROOT = '/war-room/direct-overhead-v4-4k-empty' as const

export const LIVING_V3_CURRENT_CORE_ROOM_IDS = [
  'olympus-command',
  'etsy-market-lab',
  'terra-forge',
  'council-strategists',
  'gateway-cockpit',
] as const satisfies ReadonlyArray<LivingV3RoomId>

export const LIVING_V3_SUPPORT_ROOM_IDS = ['pantheon-quarters'] as const satisfies ReadonlyArray<LivingV3RoomId>

export const LIVING_V3_FUTURE_ROOM_IDS = [
  'agora-opportunity',
  'oracle-signals',
  'forge-hephaestus',
  'merchant-harbor',
  'atlantis-vault',
  'treasury-commerce',
  'daedalus-workshop',
] as const satisfies ReadonlyArray<LivingV3RoomId>

export function livingV3AssetPath(path: string) {
  return `${LIVING_V3_ASSET_ROOT}/${path}?v=${LIVING_V3_VERSION}`
}

export function livingV3ApprovedEtsyArtPath(path: string) {
  return `${LIVING_V3_APPROVED_ETSY_ART_ROOT}/${path}?v=${LIVING_V3_VERSION}`
}

export function livingV3ApprovedCoreRoomPath(path: string) {
  return `${LIVING_V3_APPROVED_CORE_ROOM_ROOT}/${path}?v=${LIVING_V3_VERSION}`
}

function clip(agent: LivingV3AgentId, state: LivingV3AnimationState) {
  return {
    assetPath: livingV3AssetPath(`agents/${agent}/${state}.png`),
    frameCount: 8,
  }
}

type LivingV3ApprovedSpriteAgentId = 'athena' | 'hephaestus' | 'julius'
type LivingV3ExpandedAgentId = Extract<LivingV3AgentId, 'ares' | 'aphrodite' | 'hermes' | 'terra' | 'poseidon'>

const approvedEtsyAgentFolders: Record<LivingV3ApprovedSpriteAgentId, string> = {
  athena: 'athena-market-strategist',
  hephaestus: 'hephaestus-shotlab-artificer',
  julius: 'caesar-hermes-approval-commander',
}

const approvedEtsyAnimationState: Record<LivingV3AnimationState, string> = {
  idle: 'idle',
  'walk-north': 'walk-north',
  'walk-south': 'walk-south',
  'walk-east': 'walk-east',
  'walk-west': 'walk-west',
  'walk-north-east': 'walk-north-east',
  'walk-north-west': 'walk-north-west',
  'walk-south-east': 'walk-south-east',
  'walk-south-west': 'walk-south-west',
  'work-standing': 'work-at-station',
  'talk-standing': 'talk-status',
  'carry-packet': 'carry-packet',
  'wait-approval': 'wait-approval',
  sit: 'wait-approval',
  sleep: 'rest-or-blocked',
}

function approvedEtsyClip(agent: LivingV3ApprovedSpriteAgentId, state: LivingV3AnimationState) {
  return {
    assetPath: livingV3ApprovedEtsyArtPath(`agents/${approvedEtsyAgentFolders[agent]}/${approvedEtsyAnimationState[state]}.png`),
    frameCount: 8,
  }
}

function clips(agent: LivingV3AgentId): LivingV3AgentDefinition['clips'] {
  return {
    idle: clip(agent, 'idle'),
    'walk-north': clip(agent, 'walk-north'),
    'walk-south': clip(agent, 'walk-south'),
    'walk-east': clip(agent, 'walk-east'),
    'walk-west': clip(agent, 'walk-west'),
    'walk-north-east': clip(agent, 'walk-north-east'),
    'walk-north-west': clip(agent, 'walk-north-west'),
    'walk-south-east': clip(agent, 'walk-south-east'),
    'walk-south-west': clip(agent, 'walk-south-west'),
    'work-standing': clip(agent, 'work-standing'),
    'talk-standing': clip(agent, 'talk-standing'),
    'carry-packet': clip(agent, 'carry-packet'),
    'wait-approval': clip(agent, 'wait-approval'),
    sit: clip(agent, 'wait-approval'),
    sleep: clip(agent, 'sleep'),
  }
}

function expandedAgentAssets(agent: LivingV3ExpandedAgentId) {
  return {
    assetFolder: livingV3AssetPath(`agents/${agent}`),
    portraitPath: livingV3AssetPath(`agents/${agent}/portrait.png`),
    clips: clips(agent),
  }
}

function approvedEtsyClips(agent: LivingV3ApprovedSpriteAgentId): LivingV3AgentDefinition['clips'] {
  return {
    idle: approvedEtsyClip(agent, 'idle'),
    'walk-north': approvedEtsyClip(agent, 'walk-north'),
    'walk-south': approvedEtsyClip(agent, 'walk-south'),
    'walk-east': approvedEtsyClip(agent, 'walk-east'),
    'walk-west': approvedEtsyClip(agent, 'walk-west'),
    'walk-north-east': approvedEtsyClip(agent, 'walk-north-east'),
    'walk-north-west': approvedEtsyClip(agent, 'walk-north-west'),
    'walk-south-east': approvedEtsyClip(agent, 'walk-south-east'),
    'walk-south-west': approvedEtsyClip(agent, 'walk-south-west'),
    'work-standing': approvedEtsyClip(agent, 'work-standing'),
    'talk-standing': approvedEtsyClip(agent, 'talk-standing'),
    'carry-packet': approvedEtsyClip(agent, 'carry-packet'),
    'wait-approval': approvedEtsyClip(agent, 'wait-approval'),
    sit: approvedEtsyClip(agent, 'sit'),
    sleep: approvedEtsyClip(agent, 'sleep'),
  }
}

function borrowedAgentAssets(spriteAgent: LivingV3ApprovedSpriteAgentId) {
  return {
    assetFolder: livingV3ApprovedEtsyArtPath(`agents/${approvedEtsyAgentFolders[spriteAgent]}`),
    portraitPath: livingV3ApprovedEtsyArtPath(`agents/${approvedEtsyAgentFolders[spriteAgent]}/portrait.png`),
    clips: approvedEtsyClips(spriteAgent),
  }
}

type LivingV3EtsyPetAgentId = Extract<LivingV3AgentId, 'loki' | 'thor' | 'odin'>

const etsyPetAgentFolders: Record<LivingV3EtsyPetAgentId, string> = {
  'loki': 'hermes-pets-loki',
  'thor': 'hermes-pets-thor',
  'odin': 'hermes-pets-odin',
}

const etsyPetRuntimeClips: Record<LivingV3AnimationState, { file: string; frameCount: number }> = {
  idle: { file: 'idle.png', frameCount: 8 },
  'walk-north': { file: 'walk-north.png', frameCount: 8 },
  'walk-south': { file: 'walk-south.png', frameCount: 8 },
  'walk-east': { file: 'walk-east.png', frameCount: 8 },
  'walk-west': { file: 'walk-west.png', frameCount: 8 },
  'walk-north-east': { file: 'walk-north-east.png', frameCount: 8 },
  'walk-north-west': { file: 'walk-north-west.png', frameCount: 8 },
  'walk-south-east': { file: 'walk-south-east.png', frameCount: 8 },
  'walk-south-west': { file: 'walk-south-west.png', frameCount: 8 },
  'work-standing': { file: 'work-standing.png', frameCount: 8 },
  'talk-standing': { file: 'talk-standing.png', frameCount: 8 },
  'carry-packet': { file: 'carry-packet.png', frameCount: 8 },
  'wait-approval': { file: 'wait-approval.png', frameCount: 8 },
  sit: { file: 'wait-approval.png', frameCount: 8 },
  sleep: { file: 'sleep.png', frameCount: 8 },
}

function etsyPetRuntimePath(agent: LivingV3EtsyPetAgentId, fileName: string) {
  return livingV3ApprovedEtsyArtPath(`agents/${etsyPetAgentFolders[agent]}/runtime/${fileName}`)
}

function etsyPetAgentClip(agent: LivingV3EtsyPetAgentId, state: LivingV3AnimationState) {
  const clipDef = etsyPetRuntimeClips[state]
  return {
    assetPath: etsyPetRuntimePath(agent, clipDef.file),
    frameCount: clipDef.frameCount,
  }
}

function etsyPetAgentClips(agent: LivingV3EtsyPetAgentId): LivingV3AgentDefinition['clips'] {
  return {
    idle: etsyPetAgentClip(agent, 'idle'),
    'walk-north': etsyPetAgentClip(agent, 'walk-north'),
    'walk-south': etsyPetAgentClip(agent, 'walk-south'),
    'walk-east': etsyPetAgentClip(agent, 'walk-east'),
    'walk-west': etsyPetAgentClip(agent, 'walk-west'),
    'walk-north-east': etsyPetAgentClip(agent, 'walk-north-east'),
    'walk-north-west': etsyPetAgentClip(agent, 'walk-north-west'),
    'walk-south-east': etsyPetAgentClip(agent, 'walk-south-east'),
    'walk-south-west': etsyPetAgentClip(agent, 'walk-south-west'),
    'work-standing': etsyPetAgentClip(agent, 'work-standing'),
    'talk-standing': etsyPetAgentClip(agent, 'talk-standing'),
    'carry-packet': etsyPetAgentClip(agent, 'carry-packet'),
    'wait-approval': etsyPetAgentClip(agent, 'wait-approval'),
    sit: etsyPetAgentClip(agent, 'sit'),
    sleep: etsyPetAgentClip(agent, 'sleep'),
  }
}

function etsyPetAgentAssets(agent: LivingV3EtsyPetAgentId) {
  return {
    assetFolder: livingV3ApprovedEtsyArtPath(`agents/${etsyPetAgentFolders[agent]}/runtime`),
    portraitPath: etsyPetRuntimePath(agent, 'portrait.png'),
    clips: etsyPetAgentClips(agent),
  }
}

type LivingV3CouncilGeneralAgentId = Extract<LivingV3AgentId, 'julius' | 'alexander' | 'napoleon' | 'saladin' | 'genghis' | 'hannibal'>

const councilGeneralFolders: Record<LivingV3CouncilGeneralAgentId, string> = {
  julius: 'julius-caesar-general-v1',
  alexander: 'alexander-general-v1',
  napoleon: 'napoleon-bonaparte-general-v1',
  saladin: 'saladin-general-v1',
  genghis: 'genghis-khan-general-v1',
  hannibal: 'hannibal-barca-general-v1',
}

const councilGeneralRuntimeClips: Record<LivingV3AnimationState, { file: string; frameCount: number }> = {
  idle: { file: 'idle.png', frameCount: 6 },
  'walk-north': { file: 'walk.png', frameCount: 8 },
  'walk-south': { file: 'walk.png', frameCount: 8 },
  'walk-east': { file: 'walk.png', frameCount: 8 },
  'walk-west': { file: 'walk.png', frameCount: 8 },
  'walk-north-east': { file: 'walk.png', frameCount: 8 },
  'walk-north-west': { file: 'walk.png', frameCount: 8 },
  'walk-south-east': { file: 'walk.png', frameCount: 8 },
  'walk-south-west': { file: 'walk.png', frameCount: 8 },
  'work-standing': { file: 'work-standing.png', frameCount: 5 },
  'talk-standing': { file: 'talk-standing.png', frameCount: 4 },
  'carry-packet': { file: 'carry-packet.png', frameCount: 5 },
  'wait-approval': { file: 'wait-approval.png', frameCount: 6 },
  sit: { file: 'sit.png', frameCount: 6 },
  sleep: { file: 'sleep.png', frameCount: 8 },
}

function councilGeneralRuntimePath(agent: LivingV3CouncilGeneralAgentId, fileName: string) {
  return livingV3AssetPath(`generals-council/${councilGeneralFolders[agent]}/runtime/${fileName}`)
}

function councilGeneralClip(agent: LivingV3CouncilGeneralAgentId, state: LivingV3AnimationState) {
  const clipDef = councilGeneralRuntimeClips[state]
  return {
    assetPath: councilGeneralRuntimePath(agent, clipDef.file),
    frameCount: clipDef.frameCount,
  }
}

function councilGeneralClips(agent: LivingV3CouncilGeneralAgentId): LivingV3AgentDefinition['clips'] {
  return {
    idle: councilGeneralClip(agent, 'idle'),
    'walk-north': councilGeneralClip(agent, 'walk-north'),
    'walk-south': councilGeneralClip(agent, 'walk-south'),
    'walk-east': councilGeneralClip(agent, 'walk-east'),
    'walk-west': councilGeneralClip(agent, 'walk-west'),
    'walk-north-east': councilGeneralClip(agent, 'walk-north-east'),
    'walk-north-west': councilGeneralClip(agent, 'walk-north-west'),
    'walk-south-east': councilGeneralClip(agent, 'walk-south-east'),
    'walk-south-west': councilGeneralClip(agent, 'walk-south-west'),
    'work-standing': councilGeneralClip(agent, 'work-standing'),
    'talk-standing': councilGeneralClip(agent, 'talk-standing'),
    'carry-packet': councilGeneralClip(agent, 'carry-packet'),
    'wait-approval': councilGeneralClip(agent, 'wait-approval'),
    sit: councilGeneralClip(agent, 'sit'),
    sleep: councilGeneralClip(agent, 'sleep'),
  }
}

function councilGeneralAssets(agent: LivingV3CouncilGeneralAgentId) {
  return {
    assetFolder: livingV3AssetPath(`generals-council/${councilGeneralFolders[agent]}/runtime`),
    portraitPath: councilGeneralRuntimePath(agent, 'portrait.png'),
    clips: councilGeneralClips(agent),
  }
}

export const LIVING_V3_WORLD_CONFIG: LivingV3WorldConfig = {
  id: 'living-war-room-v3',
  version: LIVING_V3_VERSION,
  assetRoot: LIVING_V3_ASSET_ROOT,
  worldSize: { w: 4000, h: 2500 },
  scale: { agent: 0.85, station: 0.8 },
  legacy: {
    oldRoutesRemainAvailable: true,
    v3MayReferenceLegacyAssets: false,
  },
  rooms: [
    {
      id: 'olympus-command',
      label: 'Olympus Command',
      role: 'Central Hermes control room, approvals, alerts, and mission routing.',
      world: { x: 1730, y: 910, w: 540, h: 340 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/olympus-command/floor-base.png'),
      status: 'central-command',
      badge: 'approval',
    },
    {
      id: 'agora-opportunity',
      label: 'Goblin Analytics',
      role: 'Read-only Goblin intelligence between Oracle signals and Etsy Market Lab: proven shops/products, caveats, hard blocks, and local handoff packets.',
      world: { x: 620, y: 910, w: 480, h: 320 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/agora-opportunity/floor-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'oracle-signals',
      label: 'Oracle of Signals',
      role: 'Research, trends, SEO, forecasts, and signal reading.',
      world: { x: 2860, y: 720, w: 480, h: 320 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/oracle-signals/floor-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'etsy-market-lab',
      label: 'Etsy Market Lab',
      role: 'Product discovery, Alura research packets, supplier scouting, visual product board, product truth, ShotLab handoff, QA, and draft-only handoff.',
      world: { x: 3420, y: 720, w: 480, h: 320 },
      // Temporary clean approved room shell until a dedicated Etsy Market Lab floor asset is produced.
      assetPath: livingV3ApprovedCoreRoomPath('rooms/oracle-signals/floor-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'forge-hephaestus',
      label: 'Forge of Hephaestus',
      role: 'ShotLab prep, automation building, tools, and production craft.',
      world: { x: 620, y: 1340, w: 480, h: 320 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/forge-hephaestus/floor-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'terra-forge',
      label: 'Terra Forge',
      role: '3D product creation, model search, slicing readiness, print QA, and printer monitoring surfaces.',
      world: { x: 620, y: 1760, w: 480, h: 320 },
      // Placeholder shell: reuse approved forge room art until dedicated Terra assets are produced.
      assetPath: livingV3ApprovedCoreRoomPath('rooms/forge-hephaestus/floor-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'merchant-harbor',
      label: 'Merchant Harbor',
      role: 'Suppliers, Etsy operations, stores, logistics, and marketplace handoffs.',
      world: { x: 3420, y: 1160, w: 480, h: 320 },
      assetPath: livingV3ApprovedEtsyArtPath('room/room-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'atlantis-vault',
      label: 'Atlantis Vault',
      role: 'Data, archive, evidence, memory, and source ledgers.',
      world: { x: 1730, y: 1420, w: 540, h: 320 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/atlantis-vault/floor-base.png'),
      status: 'active-work',
      badge: 'idle',
    },
    {
      id: 'treasury-commerce',
      label: 'Treasury of Commerce',
      role: 'Revenue, spend, usage, margins, and commerce approvals.',
      world: { x: 2860, y: 1160, w: 480, h: 320 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/treasury-commerce/floor-base.png'),
      status: 'active-work',
      badge: 'approval',
    },
    {
      id: 'pantheon-quarters',
      label: 'Pantheon Quarters',
      role: 'Agent roster, assignment status, rest, and standby recovery.',
      world: { x: 1730, y: 1960, w: 540, h: 320 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/pantheon-quarters/floor-base.png'),
      status: 'rest-only',
      badge: 'sleeping',
    },
    {
      id: 'daedalus-workshop',
      label: 'Daedalus Workshop',
      role: 'Development, QA, system design, and automation engineering.',
      world: { x: 620, y: 300, w: 460, h: 280 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/forge-hephaestus/floor-base.png'),
      status: 'active-work',
      badge: 'active-task',
    },
    {
      id: 'gateway-cockpit',
      label: 'Gateway Cockpit',
      role: 'Discord, remote command, messages, and external control channels.',
      world: { x: 2860, y: 300, w: 460, h: 280 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/oracle-signals/floor-base.png'),
      status: 'active-work',
      badge: 'alert',
    },
    {
      id: 'council-strategists',
      label: 'Council of Strategists',
      role: 'Strategic advisor chamber for major decisions before action.',
      world: { x: 1730, y: 150, w: 540, h: 300 },
      assetPath: livingV3ApprovedCoreRoomPath('rooms/olympus-command/floor-base.png'),
      status: 'active-work',
      badge: 'approval',
    },
  ],
  bridges: [
    {
      id: 'council-to-command',
      fromRoomId: 'council-strategists',
      toRoomId: 'olympus-command',
      world: { x: 1984, y: 450, w: 32, h: 460 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Council to Olympus command stair',
    },
    {
      id: 'daedalus-to-agora',
      fromRoomId: 'daedalus-workshop',
      toRoomId: 'agora-opportunity',
      world: { x: 844, y: 580, w: 32, h: 330 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Daedalus to Goblin Analytics path',
    },
    {
      id: 'gateway-to-oracle',
      fromRoomId: 'gateway-cockpit',
      toRoomId: 'oracle-signals',
      world: { x: 3084, y: 580, w: 32, h: 140 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Gateway to Oracle signal path',
    },
    {
      id: 'agora-to-command',
      fromRoomId: 'agora-opportunity',
      toRoomId: 'olympus-command',
      world: { x: 1100, y: 1065, w: 630, h: 30 },
      assetPath: livingV3AssetPath('bridges/command-to-etsy.png'),
      orientation: 'horizontal',
      frameCount: 8,
      label: 'Goblin Analytics to Olympus decision bridge',
    },
    {
      id: 'command-to-oracle',
      fromRoomId: 'olympus-command',
      toRoomId: 'oracle-signals',
      world: { x: 2270, y: 1030, w: 590, h: 30 },
      assetPath: livingV3AssetPath('bridges/command-to-etsy.png'),
      orientation: 'horizontal',
      frameCount: 8,
      label: 'Olympus to Oracle signal bridge',
    },
    {
      id: 'oracle-to-etsy-market',
      fromRoomId: 'oracle-signals',
      toRoomId: 'etsy-market-lab',
      world: { x: 3340, y: 880, w: 80, h: 30 },
      assetPath: livingV3AssetPath('bridges/command-to-etsy.png'),
      orientation: 'horizontal',
      frameCount: 8,
      label: 'Oracle to Etsy Market signal bridge',
    },
    {
      id: 'agora-to-forge',
      fromRoomId: 'agora-opportunity',
      toRoomId: 'forge-hephaestus',
      world: { x: 844, y: 1230, w: 32, h: 110 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Goblin Analytics to Forge production stair',
    },
    {
      id: 'forge-to-terra',
      fromRoomId: 'forge-hephaestus',
      toRoomId: 'terra-forge',
      world: { x: 844, y: 1660, w: 32, h: 100 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Forge to Terra 3D craft stair',
    },
    {
      id: 'command-to-atlantis',
      fromRoomId: 'olympus-command',
      toRoomId: 'atlantis-vault',
      world: { x: 1984, y: 1250, w: 32, h: 170 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Olympus to Atlantis evidence stair',
    },
    {
      id: 'atlantis-to-pantheon',
      fromRoomId: 'atlantis-vault',
      toRoomId: 'pantheon-quarters',
      world: { x: 1984, y: 1740, w: 32, h: 220 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Atlantis to Pantheon archive-rest stair',
    },
    {
      id: 'oracle-to-treasury',
      fromRoomId: 'oracle-signals',
      toRoomId: 'treasury-commerce',
      world: { x: 3084, y: 1040, w: 32, h: 120 },
      assetPath: livingV3AssetPath('bridges/command-to-rest.png'),
      orientation: 'vertical',
      frameCount: 8,
      label: 'Oracle to Treasury signal stair',
    },
    {
      id: 'treasury-to-merchant',
      fromRoomId: 'treasury-commerce',
      toRoomId: 'merchant-harbor',
      world: { x: 3340, y: 1320, w: 80, h: 30 },
      assetPath: livingV3AssetPath('bridges/command-to-etsy.png'),
      orientation: 'horizontal',
      frameCount: 8,
      label: 'Treasury to Merchant handoff lane',
    },
    {
      id: 'atlantis-to-treasury',
      fromRoomId: 'atlantis-vault',
      toRoomId: 'treasury-commerce',
      world: { x: 2270, y: 1450, w: 590, h: 30 },
      assetPath: livingV3AssetPath('bridges/command-to-etsy.png'),
      orientation: 'horizontal',
      frameCount: 8,
      label: 'Atlantis to Treasury ledger lane',
    },
  ],
  stations: [
    {
      id: 'command-table',
      roomId: 'olympus-command',
      label: 'Hermes Command',
      role: 'כתוב מטרה אחת. Hermes ינהל את הדרך.',
      bounds: { x: 24, y: 32, w: 24, h: 22 },
      operatorSpot: { x: 52, y: 58 },
      assetPath: livingV3AssetPath('stations/command-table.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'command',
    },
    {
      id: 'mission-router',
      roomId: 'olympus-command',
      label: 'Mission Control',
      role: 'Manage active tasks, room routing, agents, approvals, artifacts, and readbacks.',
      bounds: { x: 54, y: 34, w: 26, h: 28 },
      operatorSpot: { x: 52, y: 68 },
      assetPath: livingV3AssetPath('stations/mission-router.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'command',
    },
    {
      id: 'agora-intake',
      roomId: 'agora-opportunity',
      label: 'Goblin Radar Desk',
      role: 'Read-only radar desk for Goblin shop/product evidence, caveats, supplier truth, and Etsy Lab handoff packets. No Etsy writes or supplier messages.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/command-table.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'oracle-signal-basin',
      roomId: 'oracle-signals',
      label: 'Oracle Product Search',
      role: 'Searches local Alura/product signals and sends visual product cards into shop rooms.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/mission-router.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-loki-product-hunt',
      roomId: 'etsy-market-lab',
      label: 'Product Inbox',
      role: 'Receives Oracle product cards, shows them visually, and lets the operator choose one. Search text lives in Oracle.',
      bounds: { x: 10, y: 20, w: 20, h: 20 },
      operatorSpot: { x: 34, y: 36 },
      assetPath: livingV3AssetPath('stations/etsy-intake.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-thor-seo-metrics',
      roomId: 'etsy-market-lab',
      label: 'SEO & Metrics',
      role: 'Prepare local title ideas, tags, metrics, and listing copy. Sheet/database writes stay locked.',
      bounds: { x: 40, y: 18, w: 20, h: 20 },
      operatorSpot: { x: 64, y: 36 },
      assetPath: livingV3AssetPath('stations/etsy-seo.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-loki-source-leads',
      roomId: 'etsy-market-lab',
      label: 'Source Leads',
      role: 'Review possible source leads for the selected product. Etsy, AliExpress, Alibaba, and supplier APIs are not queried.',
      bounds: { x: 70, y: 20, w: 20, h: 20 },
      operatorSpot: { x: 62, y: 48 },
      assetPath: livingV3AssetPath('stations/etsy-media-forge.png'),
      frameCount: 8,
      badge: 'alert',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-thor-source-truth',
      roomId: 'etsy-market-lab',
      label: 'Source Truth',
      role: 'Check what is proven, missing, or unsafe to claim before copy and alt text.',
      bounds: { x: 18, y: 58, w: 20, h: 20 },
      operatorSpot: { x: 42, y: 74 },
      assetPath: livingV3AssetPath('stations/approval-dais.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-thor-shotlab-prep',
      roomId: 'etsy-market-lab',
      label: 'ShotLab Prep',
      role: 'Prepare a local media brief and image requirements. ShotLab and paid generation stay blocked.',
      bounds: { x: 44, y: 58, w: 20, h: 20 },
      operatorSpot: { x: 68, y: 74 },
      assetPath: livingV3AssetPath('stations/etsy-shotlab.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-thor-qa-review',
      roomId: 'etsy-market-lab',
      label: 'QA Review',
      role: 'Review images, text, variants, bad claims, and listing readiness before approval.',
      bounds: { x: 66, y: 56, w: 18, h: 18 },
      operatorSpot: { x: 58, y: 80 },
      assetPath: livingV3AssetPath('stations/mission-router.png'),
      frameCount: 8,
      badge: 'alert',
      hermesIntent: 'work',
    },
    {
      id: 'etsy-odin-draft-approval',
      roomId: 'etsy-market-lab',
      label: 'Draft Approval',
      role: 'Review a local draft preview and request DLV approval. Upload, edit, and publish stay locked.',
      bounds: { x: 78, y: 62, w: 16, h: 16 },
      operatorSpot: { x: 70, y: 82 },
      assetPath: livingV3AssetPath('stations/etsy-listing.png'),
      frameCount: 8,
      badge: 'approval',
      hermesIntent: 'approval',
    },
    {
      id: 'terra-modeling-studio',
      roomId: 'terra-forge',
      label: 'Modeling Studio',
      role: 'Routes one 3D brief into CAD, OpenSCAD, Blender, STEP, slicer, and print QA paths without running printer side effects.',
      bounds: { x: 10, y: 20, w: 24, h: 24 },
      operatorSpot: { x: 38, y: 36 },
      assetPath: livingV3AssetPath('stations/command-table.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'terra-model-hunt',
      roomId: 'terra-forge',
      label: 'Model Hunt',
      role: 'Searches public 3D model sources, then shows license, source, fit, and print-risk cards before any download or remix.',
      bounds: { x: 40, y: 20, w: 22, h: 22 },
      operatorSpot: { x: 64, y: 36 },
      assetPath: livingV3AssetPath('stations/mission-router.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'terra-printer-control',
      roomId: 'terra-forge',
      label: 'Printer Control',
      role: 'Printer live view, queue, temperatures, progress, and read-only status first. Print, heat, pause, cancel, and movement stay approval-gated.',
      bounds: { x: 70, y: 22, w: 20, h: 22 },
      operatorSpot: { x: 60, y: 54 },
      assetPath: livingV3AssetPath('stations/approval-dais.png'),
      frameCount: 8,
      badge: 'approval',
      hermesIntent: 'approval',
    },
    {
      id: 'forge-workbench',
      roomId: 'forge-hephaestus',
      label: 'Forge Workbench',
      role: 'Builds automations, ShotLab packets, and tool workflows.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/etsy-shotlab.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'merchant-dock',
      roomId: 'merchant-harbor',
      label: 'Harbor Desk',
      role: 'Handles Etsy, suppliers, shop logistics, listings, and handoffs.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3ApprovedEtsyArtPath('stations/listing-draft-strip.png'),
      frameCount: 8,
      badge: 'alert',
      hermesIntent: 'work',
    },
    {
      id: 'atlantis-index',
      roomId: 'atlantis-vault',
      label: 'Source Index',
      role: 'Keeps evidence, files, memory, and archive state clean.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/command-table.png'),
      frameCount: 8,
      badge: 'idle',
      hermesIntent: 'work',
    },
    {
      id: 'treasury-ledger',
      roomId: 'treasury-commerce',
      label: 'Commerce Ledger',
      role: 'Tracks revenue, spend, usage, margin, and approval budgets.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/approval-dais.png'),
      frameCount: 8,
      badge: 'approval',
      hermesIntent: 'approval',
    },
    {
      id: 'pantheon-roster',
      roomId: 'pantheon-quarters',
      label: 'Roster Board',
      role: 'Shows which agents are assigned, resting, blocked, or waiting.',
      bounds: { x: 26, y: 38, w: 28, h: 24 },
      operatorSpot: { x: 48, y: 68 },
      assetPath: livingV3AssetPath('stations/rest-quiet-table.png'),
      frameCount: 8,
      badge: 'idle',
      hermesIntent: 'rest',
    },
    {
      id: 'pantheon-rest-pods',
      roomId: 'pantheon-quarters',
      label: 'Rest Pods',
      role: 'Only zone where sleep/rest animations are allowed.',
      bounds: { x: 58, y: 46, w: 24, h: 20 },
      operatorSpot: { x: 54, y: 72 },
      assetPath: livingV3AssetPath('stations/rest-sleep-pods.png'),
      frameCount: 8,
      badge: 'sleeping',
      hermesIntent: 'rest',
    },
    {
      id: 'daedalus-bench',
      roomId: 'daedalus-workshop',
      label: 'Daedalus Bench',
      role: 'Development, QA, routing logic, and automation prototypes.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/mission-router.png'),
      frameCount: 8,
      badge: 'active-task',
      hermesIntent: 'work',
    },
    {
      id: 'gateway-console',
      roomId: 'gateway-cockpit',
      label: 'Gateway Console',
      role: 'Discord, remote actions, messages, and command channels.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/mission-router.png'),
      frameCount: 8,
      badge: 'alert',
      hermesIntent: 'command',
    },
    {
      id: 'council-table',
      roomId: 'council-strategists',
      label: 'Council Table',
      role: 'Strategic advice before major operator decisions.',
      bounds: { x: 36, y: 38, w: 26, h: 24 },
      operatorSpot: { x: 50, y: 72 },
      assetPath: livingV3AssetPath('stations/approval-dais.png'),
      frameCount: 8,
      badge: 'approval',
      hermesIntent: 'approval',
    },
  ],
  agents: [
    {
      id: 'ares',
      label: 'Ares',
      shortLabel: 'ARS',
      role: 'Visual-only War Room companion and ambient floor presence.',
      persona: 'Restless and alert, present for atmosphere only. He does not own stations or perform marketplace work.',
      accent: '#ff6b4a',
      home: { roomId: 'etsy-market-lab', point: { x: 18, y: 70 } },
      primaryStationIds: [],
      visualStatus: 'ambient-companion',
      ...expandedAgentAssets('ares'),
    },
    {
      id: 'aphrodite',
      label: 'Aphrodite',
      shortLabel: 'APH',
      role: 'Visual-only War Room companion and ambient floor presence.',
      persona: 'Calm and expressive, present for atmosphere only. She does not own stations or perform marketplace work.',
      accent: '#ff8fc7',
      home: { roomId: 'etsy-market-lab', point: { x: 84, y: 54 } },
      primaryStationIds: [],
      visualStatus: 'ambient-companion',
      ...expandedAgentAssets('aphrodite'),
    },
    {
      id: 'hermes',
      label: 'Hermes',
      shortLabel: 'HER',
      role: 'Router, messenger, dispatcher, and command-floor operator.',
      persona: 'Fast, clear, and safety-aware. Routes work without changing the body directly.',
      accent: '#73e2d5',
      home: { roomId: 'olympus-command', point: { x: 50, y: 72 } },
      primaryStationIds: ['command-table', 'mission-router'],
      visualStatus: 'primary-roaming-companion',
      ...expandedAgentAssets('hermes'),
    },
    {
      id: 'goblin',
      label: 'Goblin',
      shortLabel: 'GOB',
      role: 'Goblin Analytics lead for opportunity discovery, comparative research, candidate ranking, and evidence-linked Opportunity Packet preparation.',
      persona: 'Sharp, skeptical, and profit-aware. Goblin hunts for unusual but defensible opportunities, exposes weak evidence, and never confuses a promising signal with a proven claim.',
      accent: '#9fe870',
      home: { roomId: 'agora-opportunity', point: { x: 50, y: 68 } },
      primaryStationIds: ['agora-intake'],
      visualStatus: 'temporary-approved-sprite',
      ...borrowedAgentAssets('athena'),
    },
    {
      id: 'heimdall',
      label: 'Heimdall',
      shortLabel: 'HMD',
      role: 'Oracle gatekeeper for the shop-first product search workflow.',
      persona: 'Watchful and strict. He blocks stale Product Seeker history, inactive listings, and text-only supplier matches before Oracle sends product cards onward.',
      accent: '#1b7a5f',
      home: { roomId: 'oracle-signals', point: { x: 68, y: 52 } },
      primaryStationIds: ['oracle-signal-basin'],
      ...borrowedAgentAssets('athena'),
    },
    {
      id: 'terra',
      label: 'Terra',
      shortLabel: 'TER',
      role: '3D creation room operator for modeling, model discovery, slicer readiness, print QA, and printer status surfaces.',
      persona: 'Grounded, material-aware, and practical. She routes every 3D request to the right skill path and blocks unsafe printer side effects until DLV approves.',
      accent: '#6f9f5f',
      home: { roomId: 'terra-forge', point: { x: 48, y: 66 } },
      primaryStationIds: ['terra-modeling-studio', 'terra-model-hunt', 'terra-printer-control'],
      visualStatus: 'terra-earth-pet-runtime-final',
      ...expandedAgentAssets('terra'),
    },
    {
      id: 'poseidon',
      label: 'Poseidon',
      shortLabel: 'POS',
      role: 'Atlantis Vault room manager for DB, Obsidian, evidence shelves, and library health. He centralizes visibility; he does not own every worker action.',
      persona: 'Calm, strict, and library-minded. Poseidon keeps DB and Obsidian maps honest, flags drift or trash, and routes workers to their own shelves instead of becoming a bottleneck.',
      accent: '#55d6ff',
      home: { roomId: 'atlantis-vault', point: { x: 50, y: 68 } },
      primaryStationIds: ['atlantis-index'],
      visualStatus: 'poseidon-sea-pet-runtime-final',
      ...expandedAgentAssets('poseidon'),
    },
    {
      id: 'julius',
      label: 'Julius Caesar',
      shortLabel: 'JUL',
      role: 'Council-room-only general. Roams the Strategists chamber floor and convenes at the Council Table only inside his room.',
      persona: 'Serious commander. Gives a tactical view before major approvals.',
      accent: '#f1c36f',
      home: { roomId: 'council-strategists', point: { x: 44, y: 62 } },
      primaryStationIds: ['council-table'],
      visualStatus: 'council-room-general',
      ...councilGeneralAssets('julius'),
    },
    {
      id: 'alexander',
      label: 'Alexander',
      shortLabel: 'ALX',
      role: 'Council-room-only general. Roams the Strategists chamber floor and convenes at the Council Table only inside his room.',
      persona: 'Bold expansion voice. Pushes for visible momentum and morale.',
      accent: '#ffb36b',
      home: { roomId: 'council-strategists', point: { x: 62, y: 42 } },
      primaryStationIds: ['council-table'],
      visualStatus: 'council-room-general',
      ...councilGeneralAssets('alexander'),
    },
    {
      id: 'napoleon',
      label: 'Napoleon',
      shortLabel: 'NAP',
      role: 'Council-room-only general. Roams the Strategists chamber floor and convenes at the Council Table only inside his room.',
      persona: 'Operations mind. Converts ambition into cadence, supply, and QA gates.',
      accent: '#80d9ff',
      home: { roomId: 'council-strategists', point: { x: 72, y: 68 } },
      primaryStationIds: ['council-table'],
      visualStatus: 'council-room-general',
      ...councilGeneralAssets('napoleon'),
    },
    {
      id: 'saladin',
      label: 'Saladin',
      shortLabel: 'SAL',
      role: 'Council-room-only general. Roams the Strategists chamber floor and convenes at the Council Table only inside his room.',
      persona: 'Integrity guard. Keeps trust, restraint, and approval locks visible.',
      accent: '#90e0a8',
      home: { roomId: 'council-strategists', point: { x: 58, y: 80 } },
      primaryStationIds: ['council-table'],
      visualStatus: 'council-room-general',
      ...councilGeneralAssets('saladin'),
    },
    {
      id: 'genghis',
      label: 'Genghis Khan',
      shortLabel: 'GEN',
      role: 'Council-room-only general. Roams the Strategists chamber floor and convenes at the Council Table only inside his room.',
      persona: 'Scale and routing voice. Turns decisions into simple laws that travel.',
      accent: '#d0a66b',
      home: { roomId: 'council-strategists', point: { x: 32, y: 78 } },
      primaryStationIds: ['council-table'],
      visualStatus: 'council-room-general',
      ...councilGeneralAssets('genghis'),
    },
    {
      id: 'hannibal',
      label: 'Hannibal Barca',
      shortLabel: 'HAN',
      role: 'Council-room-only general. Roams the Strategists chamber floor and convenes at the Council Table only inside his room.',
      persona: 'Flank and risk voice. Finds brittle terrain and Plan B before execution.',
      accent: '#ff7d6e',
      home: { roomId: 'council-strategists', point: { x: 26, y: 50 } },
      primaryStationIds: ['council-table'],
      visualStatus: 'council-room-general',
      ...councilGeneralAssets('hannibal'),
    },
    {
      id: 'loki',
      label: 'Loki',
      shortLabel: 'LOK',
      role: 'Etsy Market Lab active hunter for product ideas, market angles, and local source-lead packets.',
      persona: 'Clever, fast, and skeptical. Finds product angles others miss, stages local candidates, and never calls live market tools.',
      accent: '#8bd8ff',
      home: { roomId: 'etsy-market-lab', point: { x: 22, y: 48 } },
      primaryStationIds: ['etsy-loki-product-hunt', 'etsy-loki-source-leads'],
      visualStatus: 'norse-operator-runtime-final',
      ...etsyPetAgentAssets('loki'),
    },
    {
      id: 'thor',
      label: 'Thor',
      shortLabel: 'THR',
      role: 'Etsy Market Lab active forge operator for SEO, ShotLab prep, source truth, and QA readiness.',
      persona: 'Direct, practical, and forceful. Hammers a selected product into local packets, checks, and handoffs before anything leaves the lab.',
      accent: '#72e0d4',
      home: { roomId: 'etsy-market-lab', point: { x: 50, y: 44 } },
      primaryStationIds: ['etsy-thor-seo-metrics', 'etsy-thor-source-truth', 'etsy-thor-shotlab-prep', 'etsy-thor-qa-review'],
      visualStatus: 'norse-operator-runtime-final',
      ...etsyPetAgentAssets('thor'),
    },
    {
      id: 'odin',
      label: 'Odin',
      shortLabel: 'ODN',
      role: 'Etsy Market Lab approval king and final draft gate. He waits on the throne until DLV approves.',
      persona: 'Quiet, heavy, and strict. Holds the final approval view and keeps upload, publish, supplier, and live actions locked.',
      accent: '#ffc75f',
      home: { roomId: 'etsy-market-lab', point: { x: 76, y: 78 } },
      primaryStationIds: ['etsy-odin-draft-approval'],
      visualStatus: 'norse-operator-runtime-final',
      ...etsyPetAgentAssets('odin'),
    },
  ],
}

export const LIVING_V3_HIDDEN_AGENT_DEFINITIONS: Array<LivingV3AgentDefinition> = [
  {
    id: 'athena',
    label: 'Athena',
    shortLabel: 'ATH',
    role: 'Hidden planned worker profile. Not rendered until a dedicated approved visual pass exists.',
    persona: 'Calm, strict, and evidence-first. She blocks weak opportunities before spend.',
    accent: '#73e2d5',
    home: { roomId: 'agora-opportunity', point: { x: 50, y: 72 } },
    primaryStationIds: ['agora-intake', 'command-table'],
    ...borrowedAgentAssets('athena'),
  },
  {
    id: 'oracle',
    label: 'Oracle',
    shortLabel: 'ORC',
    role: 'Hidden planned worker profile. Not rendered until a dedicated approved visual pass exists.',
    persona: 'Quiet, pattern-focused, and skeptical of noisy data.',
    accent: '#8bd8ff',
    home: { roomId: 'oracle-signals', point: { x: 50, y: 72 } },
    primaryStationIds: ['oracle-signal-basin'],
    ...borrowedAgentAssets('athena'),
  },
  {
    id: 'hephaestus',
    label: 'Hephaestus',
    shortLabel: 'HEP',
    role: 'Hidden planned worker profile. Not rendered until a dedicated approved visual pass exists.',
    persona: 'Practical maker, only uses real inputs and inspected materials.',
    accent: '#ff8b4a',
    home: { roomId: 'forge-hephaestus', point: { x: 50, y: 72 } },
    primaryStationIds: ['forge-workbench'],
    ...borrowedAgentAssets('hephaestus'),
  },
  {
    id: 'merchant-scout',
    label: 'Harbor Scout',
    shortLabel: 'HRB',
    role: 'Retired historical visual placeholder. Preserved for old events and assets; never route new work here.',
    persona: 'Street-smart merchant scout. Checks evidence before any shop action.',
    accent: '#f1c36f',
    home: { roomId: 'merchant-harbor', point: { x: 50, y: 72 } },
    primaryStationIds: ['merchant-dock'],
    ...borrowedAgentAssets('julius'),
  },
  {
    id: 'atlantis-archivist',
    label: 'Atlantis Archivist',
    shortLabel: 'ATL',
    role: 'Retired historical visual placeholder. Preserved for old events and assets; never route new work here.',
    persona: 'Patient and exact. Nothing gets remembered without a source.',
    accent: '#72e0d4',
    home: { roomId: 'atlantis-vault', point: { x: 50, y: 72 } },
    primaryStationIds: ['atlantis-index'],
    ...borrowedAgentAssets('athena'),
  },
  {
    id: 'treasury-guardian',
    label: 'Treasury Guardian',
    shortLabel: 'TRS',
    role: 'Retired historical visual placeholder. Preserved for old events and assets; never route new work here.',
    persona: 'Protective and numbers-first. Locks spend until the case is clear.',
    accent: '#ffc75f',
    home: { roomId: 'treasury-commerce', point: { x: 50, y: 72 } },
    primaryStationIds: ['treasury-ledger'],
    ...borrowedAgentAssets('julius'),
  },
  {
    id: 'roster-keeper',
    label: 'Roster Keeper',
    shortLabel: 'ROS',
    role: 'Hidden planned worker profile. Not rendered until a dedicated approved visual pass exists.',
    persona: 'Steady camp keeper. Keeps the floor calm when agents are idle.',
    accent: '#9fd5a6',
    home: { roomId: 'pantheon-quarters', point: { x: 48, y: 68 } },
    primaryStationIds: ['pantheon-roster', 'pantheon-rest-pods'],
    ...borrowedAgentAssets('athena'),
  },
  {
    id: 'daedalus',
    label: 'Daedalus',
    shortLabel: 'DAE',
    role: 'Hidden planned worker profile. Not rendered until a dedicated approved visual pass exists.',
    persona: 'Inventive but disciplined. Tests the maze before anyone walks it.',
    accent: '#ff8b4a',
    home: { roomId: 'daedalus-workshop', point: { x: 50, y: 72 } },
    primaryStationIds: ['daedalus-bench'],
    ...borrowedAgentAssets('hephaestus'),
  },
  {
    id: 'signal-runner',
    label: 'Signal Runner',
    shortLabel: 'SIG',
    role: 'Retired historical visual placeholder. Preserved for old events and assets; never route new work here.',
    persona: 'Concise and responsive. Carries messages but never sends live actions alone.',
    accent: '#8bd8ff',
    home: { roomId: 'gateway-cockpit', point: { x: 50, y: 72 } },
    primaryStationIds: ['gateway-console'],
    ...borrowedAgentAssets('julius'),
  },
]

export function livingV3RoomById(roomId: LivingV3RoomId) {
  return LIVING_V3_WORLD_CONFIG.rooms.find((room) => room.id === roomId) ?? null
}

export function livingV3StationById(stationId: LivingV3StationId) {
  return LIVING_V3_WORLD_CONFIG.stations.find((station) => station.id === stationId) ?? null
}

export function livingV3AgentById(agentId: LivingV3AgentId) {
  return LIVING_V3_WORLD_CONFIG.agents.find((agent) => agent.id === agentId)
    ?? LIVING_V3_HIDDEN_AGENT_DEFINITIONS.find((agent) => agent.id === agentId)
    ?? null
}

export function livingV3RoomLocalToWorld(roomId: LivingV3RoomId, point: LivingV3Point) {
  const room = livingV3RoomById(roomId)
  if (!room) return { x: 0, y: 0 }
  return {
    x: room.world.x + (point.x / 100) * room.world.w,
    y: room.world.y + (point.y / 100) * room.world.h,
  }
}

export function livingV3PointInsideRect(point: LivingV3Point, rect: LivingV3Rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}
