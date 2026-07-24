import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatScreen } from '../../chat/chat-screen'
import { MiniGod, StationProp } from './StationProp'
import { CouncilTablePanel } from './CouncilTablePanel'
import { StationDialog  } from './StationDialog'
import { olympusGameManifest, realmMapHotspots } from './scene-manifest'
import { godIntelligenceForAgent, roomOpsSummary, suggestionsForStation, warRoomOpsState, workflowStepsForStation } from './ops-model'
import { apiRoomForUiRoom, uiRoomForApiRoom } from './ops-room-map'
import type {StationLiveFeedItem} from './StationDialog';
import type { WarRoomRoomDetailResponse, WarRoomRoomSummary, WarRoomSummaryResponse, WarRoomWorkflowPacket } from './ops-contracts'
import type { WarRoomAgentState, WarRoomArchiveCollection, WarRoomArchiveRecord } from './ops-model'
import type { OlympusAgentInstance, OlympusPoint, OlympusRoom, OlympusStation } from './types'

const LIVE_ATLAS_CAMPAIGN_MAP_ASSET = '/war-room/live-atlas-r2/kingdom-campaign-map-chatgpt.png?v=chatgpt-kingdom-map-v1'
const LIVE_PACKET_ASSETS: Record<string, string> = {
  opportunity: '/war-room/live-atlas-r1/packets/opportunity.svg?v=clean-v1',
  keyword: '/war-room/live-atlas-r1/packets/keyword.svg?v=clean-v1',
  'supplier-proof': '/war-room/live-atlas-r1/packets/supplier-proof.svg?v=clean-v1',
  draft: '/war-room/live-atlas-r1/packets/draft.svg?v=clean-v1',
  approval: '/war-room/live-atlas-r1/packets/approval.svg?v=clean-v1',
  archive: '/war-room/live-atlas-r1/packets/archive.svg?v=clean-v1',
  packet: '/war-room/live-atlas-r1/packets/packet.svg?v=clean-v1',
}
const WAR_ROOM_WORLD_MEMORY_KEY = 'war-room-world-memory-v1'
const ROOM_TITLE_PLAQUE = '/war-room/vNext/ui/room-title-plaque.png?v=20260512-premium-title-plaque'
const COUNCIL_ASSET_VERSION = '20260515-napoleon-v8-clean-facing-walk'

type CouncilAnimationState = 'walk' | 'ponder' | 'sit' | 'speak' | 'vote'
type CouncilFacingDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

type CouncilLegend = {
  id: string
  name: string
  virtue: string
  seat: OlympusPoint
  roamPath: Array<OlympusPoint>
  delay: number
  speedMs: number
  scale: number
  frames: Record<CouncilAnimationState, number>
}

const HANNIBAL_FINISHED_ACTION_STATES: Record<CouncilAnimationState, number> = { walk: 6, ponder: 16, sit: 18, speak: 16, vote: 18 }
const COUNCIL_LEGENDS: Array<CouncilLegend> = [
  { id: 'alexander', name: 'Alexander', virtue: 'audacity', seat: { x: 50, y: 35 }, roamPath: [{ x: 35, y: 49 }, { x: 45, y: 39 }, { x: 57, y: 42 }, { x: 50, y: 54 }], delay: 0, speedMs: 7400, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
  { id: 'caesar', name: 'Caesar', virtue: 'command', seat: { x: 65, y: 45 }, roamPath: [{ x: 63, y: 43 }, { x: 73, y: 56 }, { x: 62, y: 68 }, { x: 55, y: 54 }], delay: 350, speedMs: 8200, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
  { id: 'hannibal', name: 'Hannibal', virtue: 'maneuver', seat: { x: 67, y: 59 }, roamPath: [{ x: 70, y: 44 }, { x: 81, y: 54 }, { x: 72, y: 70 }, { x: 61, y: 61 }], delay: 700, speedMs: 9100, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
  { id: 'napoleon', name: 'Napoleon', virtue: 'tempo', seat: { x: 58, y: 75 }, roamPath: [{ x: 56, y: 71 }, { x: 67, y: 77 }, { x: 57, y: 84 }, { x: 47, y: 72 }], delay: 1050, speedMs: 6800, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
  { id: 'sun-tzu', name: 'Sun Tzu', virtue: 'clarity', seat: { x: 42, y: 75 }, roamPath: [{ x: 43, y: 70 }, { x: 32, y: 63 }, { x: 40, y: 53 }, { x: 50, y: 61 }], delay: 1400, speedMs: 10400, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
  { id: 'saladin', name: 'Saladin', virtue: 'honor', seat: { x: 33, y: 59 }, roamPath: [{ x: 30, y: 48 }, { x: 21, y: 60 }, { x: 33, y: 73 }, { x: 43, y: 61 }], delay: 1750, speedMs: 9600, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
  { id: 'genghis', name: 'Genghis Khan', virtue: 'reach', seat: { x: 35, y: 45 }, roamPath: [{ x: 38, y: 41 }, { x: 28, y: 50 }, { x: 38, y: 65 }, { x: 49, y: 52 }], delay: 2100, speedMs: 7800, scale: 1.03, frames: HANNIBAL_FINISHED_ACTION_STATES },
]

type LiveWarRoomFeedItem = StationLiveFeedItem & {
  kind?: string
  roomId?: string
  categoryIds?: Array<string>
  blocker?: string | null
  nextAction?: string | null
}

type LivingPacketPhase = 'queued' | 'routing' | 'working' | 'handoff-ready'

type LegacyWarRoomRoom = {
  id: string
  missionCount?: number
  sessionCount?: number
  health?: 'quiet' | 'idle' | 'active' | 'blocked' | 'review' | 'error'
  feed?: Array<LiveWarRoomFeedItem>
}

type LiveWarRoomStatus = Omit<Partial<WarRoomSummaryResponse>, 'rooms'> & {
  readOnly?: boolean
  rooms?: Array<WarRoomRoomSummary> | Record<string, LegacyWarRoomRoom>
}


type ProductIntelligenceData = {
  ok?: boolean
  error?: string
  db_path?: string
  summary?: { imported_at?: string; source_dir_read_only?: string; [key: string]: unknown } | null
  counts?: Record<string, number | null | undefined>
  room_counts?: Array<{ room?: string | null; count?: number }>
  keyword_room_counts?: Array<{ room?: string | null; count?: number }>
  opportunities?: Array<{ id?: string; title?: string; current_room?: string; status?: string; opportunity_score?: number; priority?: string; next_action?: string; keywords?: string; supplier_link_count?: number; etsy_angle?: string; shotlab_status?: string }>
  keyword_opportunities?: Array<{ keyword?: string; score?: number; avg_sales?: number; competition?: number; competition_level?: string; signal_score?: number; next_action?: string }>
  action_queue?: Array<{ next_action?: string; count?: number }>
  workflow_funnel?: Array<{ room?: string | null; status?: string | null; count?: number }>
  sources?: Array<{ source_name?: string; source_kind?: string; source_size?: number; imported_at?: string }>
  safety?: Record<string, boolean>
}

type WarRoomArchiveApiData = {
  ok?: boolean
  error?: string
  mode?: string
  databaseName?: string
  pathLabel?: string
  safetyLocks?: Array<string>
  collections?: Array<WarRoomArchiveCollection>
  records?: Array<WarRoomArchiveRecord>
  summary?: {
    totalRecords?: number
    returnedRecords?: number
    totalCollections?: number
    byKind?: Record<string, number>
    byState?: Record<string, number>
    filteredBy?: Record<string, unknown>
  }
  generatedAt?: string
}

const ROOM_WORKSPACE_LINKS: Record<string, Array<{ label: string; href: string }>> = {
  'olympus-command': [{ label: 'Swarm', href: '/swarm' }, { label: 'Jobs', href: '/jobs' }, { label: 'Tasks', href: '/tasks' }],
  'pantheon-quarters': [{ label: 'Profiles', href: '/profiles' }, { label: 'Swarm', href: '/swarm' }, { label: 'Settings', href: '/settings' }],
  agora: [{ label: 'Product DB', href: '/product-intelligence' }, { label: 'Research', href: '/product-research' }, { label: 'Tasks', href: '/tasks' }],
  oracle: [{ label: 'Product DB', href: '/product-intelligence' }, { label: 'Operations', href: '/operations' }, { label: 'Memory', href: '/memory' }],
  forge: [{ label: 'Product DB', href: '/product-intelligence' }, { label: 'Jobs', href: '/jobs' }, { label: 'Files', href: '/files' }],
  'merchant-harbor': [{ label: 'Product DB', href: '/product-intelligence' }, { label: 'Research', href: '/product-research' }, { label: 'Files', href: '/files' }],
  'atlantis-vault': [{ label: 'Product DB', href: '/product-intelligence' }, { label: 'Memory', href: '/memory' }, { label: 'Files', href: '/files' }],
  treasury: [{ label: 'Product DB', href: '/product-intelligence' }, { label: 'Jobs', href: '/jobs' }, { label: 'Tasks', href: '/tasks' }],
}

function liveRoomKey(roomId: string) {
  return apiRoomForUiRoom(roomId)
}

function liveRoomStatus(status: LiveWarRoomStatus | null, roomId: string): LegacyWarRoomRoom | WarRoomRoomSummary | null {
  const apiRoomId = liveRoomKey(roomId)
  if (!status?.rooms) return null
  if (Array.isArray(status.rooms)) {
    return status.rooms.find((candidate) => candidate.apiRoomId === apiRoomId || candidate.uiRoomId === roomId || candidate.id === apiRoomId) ?? null
  }
  return status.rooms[apiRoomId] ?? null
}

function liveRoomFeed(status: LiveWarRoomStatus | null, roomId: string): Array<LiveWarRoomFeedItem> {
  const room = liveRoomStatus(status, roomId)
  return 'feed' in (room ?? {}) ? ((room as LegacyWarRoomRoom).feed ?? []) : []
}

function liveSourceLine(status: LiveWarRoomStatus | null) {
  if (!status?.ok) return 'Live status warming up'
  const source = status.sources?.sessions ?? 'local ops'
  const missions = status.pulse?.missions ?? 0
  const approvals = status.pulse?.approvals ?? 0
  return `${source} synced • ${missions} missions • ${approvals} approvals`
}

function livePulseDetail(status: LiveWarRoomStatus | null) {
  const running = status?.pulse?.agents.running ?? 0
  const failed = status?.pulse?.agents.failed ?? 0
  const approvals = status?.pulse?.approvals ?? 0
  const review = approvals ? `${approvals} waiting review` : 'approval gate clear'
  const agentLine = running ? `${running} agents active` : failed ? `${failed} agents need attention` : 'agents standing by'
  return `${agentLine} • ${review}`
}

function friendlyHealthLabel(health?: string) {
  if (health === 'blocked') return 'Needs review'
  if (health === 'review') return 'Approval queue'
  if (health === 'active') return 'Live ops'
  return 'Ready'
}

function roomIntelLine(room: LegacyWarRoomRoom | WarRoomRoomSummary | null) {
  if (room && 'agentOps' in room && room.agentOps) {
    const ops = room.agentOps
    if (ops.assignmentCount || ops.workerCount) return `${ops.leadWorkerId} • ${ops.assignmentCount} swarm tasks`
  }
  if (!room || !('productIntelligence' in room) || !room.productIntelligence) return null
  const intel = room.productIntelligence
  if (intel.keywordCount) return `${intel.keywordCount.toLocaleString()} keyword signals`
  if (intel.supplierLinkCount) return `${intel.supplierLinkCount.toLocaleString()} supplier links`
  if (intel.productCount) return `${intel.productCount.toLocaleString()} product candidates`
  if (intel.opportunityCount) return `${intel.opportunityCount.toLocaleString()} intel records`
  return intel.signalLine
}

function RoomBrotherPanel({ room, liveRoom, activeStation, agent, walking }: { room: OlympusRoom; liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null; activeStation: OlympusStation | null; agent: OlympusAgentInstance; walking: boolean }) {
  const ops = liveRoom && 'agentOps' in liveRoom ? liveRoom.agentOps : null
  const primaryWorker = ops?.workers[0]
  const visibleWorkers = ops?.workers.slice(0, 3) ?? (primaryWorker ? [primaryWorker] : [])
  const stationName = activeStation?.name ?? 'room floor'
  const workMode = activeStation ? (walking ? `walking to ${stationName}` : `working at ${stationName}`) : 'standing by for a tool click'
  const output = activeStation
    ? activeStation.kind === 'supplier'
      ? 'supplier proof packet'
      : activeStation.kind === 'finance'
        ? 'margin / spend-lock packet'
        : activeStation.kind === 'approval'
          ? 'DLV approval packet'
          : activeStation.kind === 'prompt' || activeStation.kind === 'listing'
            ? 'draft artifact packet'
            : activeStation.kind === 'sorting'
              ? 'ranked opportunity packet'
              : 'room work packet'
    : 'choose a station to produce a useful artifact'
  return (
    <div className="pointer-events-none absolute bottom-3 left-4 z-[46] w-[min(350px,32vw)] rounded-[18px] border border-cyan-100/14 bg-[linear-gradient(135deg,rgba(5,14,18,.62),rgba(20,12,5,.54))] p-2 text-stone-50 shadow-[0_14px_30px_rgba(0,0,0,.45)] backdrop-blur-sm" data-war-room-brother-work-panel={room.id}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[7px] font-black uppercase tracking-[.22em] text-cyan-100/68">Room brother / worker</div>
          <div className="mt-0.5 truncate text-[13px] font-black text-amber-50">{ops?.leadWorkerId ?? agent.name} → {room.name}</div>
        </div>
        <div className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[.10em] ${healthTone(liveRoom?.health)}`}>{friendlyHealthLabel(liveRoom?.health)}</div>
      </div>
      <div className="mt-1.5 grid gap-1.5 md:grid-cols-3">
        <div className="rounded-xl border border-white/8 bg-white/[.035] px-2 py-1.5">
          <div className="text-[7px] font-black uppercase tracking-[.14em] text-stone-300/68">Now</div>
          <div className="mt-0.5 line-clamp-2 text-[9px] font-bold leading-snug text-cyan-50/88">{workMode}</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[.035] px-2 py-1.5">
          <div className="text-[7px] font-black uppercase tracking-[.14em] text-stone-300/68">Output</div>
          <div className="mt-0.5 line-clamp-2 text-[9px] font-bold leading-snug text-emerald-50/88">{output}</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[.035] px-2 py-1.5">
          <div className="text-[7px] font-black uppercase tracking-[.14em] text-stone-300/68">Queue</div>
          <div className="mt-0.5 line-clamp-2 text-[9px] font-bold leading-snug text-amber-50/88">{ops ? `${ops.assignmentCount} tasks • ${ops.reviewAssignments} review • ${'workflowPacketCount' in (liveRoom ?? {}) ? (liveRoom as WarRoomRoomSummary).workflowPacketCount : 0} packets` : 'local read-only'}</div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {visibleWorkers.slice(0, 1).map((worker) => <span key={worker.id} className="rounded-full border border-amber-100/14 bg-black/24 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[.08em] text-amber-50/86">{worker.label} • {worker.status}</span>)}
        <span className="rounded-full border border-emerald-100/14 bg-emerald-300/[.07] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[.08em] text-emerald-50/86">read-only / draft-only</span>
      </div>
    </div>
  )
}

function latestLiveLine(status: LiveWarRoomStatus | null, room: OlympusRoom, liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null) {
  const feedLine = liveRoomFeed(status, room.id).at(0)
  if (feedLine?.title) return feedLine.title
  if (feedLine?.summary) return feedLine.summary
  const intel = roomIntelLine(liveRoom)
  if (intel) return intel
  if (liveRoom && 'workflowPacketCount' in liveRoom && liveRoom.workflowPacketCount) return `${liveRoom.workflowPacketCount} workflow packets waiting`
  return roomSubtitle(room)
}

function roomPacketCount(liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null) {
  if (liveRoom && 'workflowPacketCount' in liveRoom) return liveRoom.workflowPacketCount
  return 0
}

type LiveAtlasActor = {
  roomId: string
  x: number
  y: number
  targetX: number
  targetY: number
  stationId?: string
  moving: boolean
  action: string
  phase: number
}

type LiveAtlasTransfer = {
  id: string
  fromRoomId: string
  toRoomId: string
  x: number
  y: number
  progress: number
  label: string
  artifactType?: string
  title?: string
  message?: string
  fromGod?: string
  toGod?: string
  season?: number
}

type GodMessengerRoute = {
  id: string
  fromRoomId: string
  toRoomId: string
  fromGod: string
  toGod: string
  reason: string
  message: string
}

const GOD_MESSENGER_ROUTES: Array<GodMessengerRoute> = [
  { id: 'athena-to-hermes', fromRoomId: 'agora', toRoomId: 'olympus-command', fromGod: 'Athena', toGod: 'Hermes', reason: 'opportunity triage', message: 'New opportunity needs route and owner.' },
  { id: 'hermes-to-hephaestus', fromRoomId: 'olympus-command', toRoomId: 'forge', fromGod: 'Hermes', toGod: 'Hephaestus', reason: 'draft handoff', message: 'Forge one safe draft; keep live actions locked.' },
  { id: 'hephaestus-to-atlantis', fromRoomId: 'forge', toRoomId: 'atlantis-vault', fromGod: 'Hephaestus', toGod: 'Atlantis', reason: 'artifact archive', message: 'Store the prompt, image proof, and source notes.' },
  { id: 'atlantis-to-oracle', fromRoomId: 'atlantis-vault', toRoomId: 'oracle', fromGod: 'Atlantis', toGod: 'Oracle', reason: 'memory signal', message: 'Compare this artifact with keyword history.' },
  { id: 'oracle-to-merchant', fromRoomId: 'oracle', toRoomId: 'merchant-harbor', fromGod: 'Oracle', toGod: 'Poseidon', reason: 'supplier check', message: 'Verify demand before supplier movement.' },
  { id: 'merchant-to-treasury', fromRoomId: 'merchant-harbor', toRoomId: 'treasury', fromGod: 'Poseidon', toGod: 'Treasury', reason: 'cost gate', message: 'Check margin and spend lock before approval.' },
  { id: 'treasury-to-pantheon', fromRoomId: 'treasury', toRoomId: 'pantheon-quarters', fromGod: 'Treasury', toGod: 'Pantheon', reason: 'worker assignment', message: 'Assign reviewer; wait for DLV approval.' },
  { id: 'pantheon-to-athena', fromRoomId: 'pantheon-quarters', toRoomId: 'agora', fromGod: 'Pantheon', toGod: 'Athena', reason: 'research feedback', message: 'Send scoring notes back to the market cell.' },
]

type LiveAtlasRoomPacket = {
  id: string
  roomId: string
  x: number
  y: number
  progress: number
  artifactType: string
  title: string
}

const LIVE_ATLAS_CELL_CENTERS: Record<string, OlympusPoint> = {
  'olympus-command': { x: 13, y: 34 },
  'pantheon-quarters': { x: 38, y: 34 },
  agora: { x: 63, y: 34 },
  oracle: { x: 88, y: 34 },
  forge: { x: 13, y: 72 },
  'merchant-harbor': { x: 38, y: 72 },
  'atlantis-vault': { x: 63, y: 72 },
  treasury: { x: 88, y: 72 },
}

const LIVE_ATLAS_CAMPAIGN_POINTS: Record<string, OlympusPoint> = {
  'olympus-command': { x: 50, y: 18 },
  'pantheon-quarters': { x: 20, y: 31 },
  oracle: { x: 80, y: 31 },
  agora: { x: 27, y: 53 },
  forge: { x: 50, y: 49 },
  'merchant-harbor': { x: 18, y: 74 },
  treasury: { x: 74, y: 73 },
  'atlantis-vault': { x: 86, y: 54 },
}

function clampPercent(value: number, min = 8, max = 92) {
  return Math.max(min, Math.min(max, value))
}

function interpolatePoint(a: OlympusPoint, b: OlympusPoint, t: number): OlympusPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function roomWorkAction(room: OlympusRoom, liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null, station?: OlympusStation) {
  const packets = roomPacketCount(liveRoom)
  if (liveRoom?.health === 'review') return 'carrying review packet'
  if (liveRoom?.health === 'blocked') return 'waiting at approval gate'
  if (packets > 12) return `moving queue to ${station?.name ?? 'next tool'}`
  if (packets > 0) return `working at ${station?.name ?? 'station'}`
  return `patrolling ${room.name}`
}

function packetUiRoom(roomId: string) {
  return uiRoomForApiRoom(roomId)
}

const DEMO_WORKFLOW_PACKETS: Array<WarRoomWorkflowPacket> = [
  {
    id: 'demo-packet-forge-draft',
    sourceRoomId: 'agora',
    targetRoomId: 'shotlab',
    stationId: 'prompt-anvil',
    title: 'Hermes dispatch packet → Prompt Anvil draft',
    state: 'draft-ready',
    artifactType: 'draft',
    input: 'Opportunity and keyword signal staged from Atlantis backbone.',
    output: 'Draft artifact preview for Forge prompt, variants, and locked publish actions.',
    risk: 'No Etsy publish, paid generation, supplier message, or account action without DLV approval.',
    nextHandoff: 'Treasury approval gate',
    ownerWorkerId: 'hephaestus',
    lockedActions: ['etsy-publish', 'paid-generation', 'supplier-message'],
  },
  {
    id: 'demo-packet-treasury-approval',
    sourceRoomId: 'shotlab',
    targetRoomId: 'treasury',
    stationId: 'approval-vault',
    title: 'Review for DLV approval gate',
    state: 'approval-waiting',
    artifactType: 'approval',
    input: 'Forge draft and supplier context ready for human decision.',
    output: 'Approval decision card preview with allowed/locked action split.',
    risk: 'Spend and live marketplace changes remain locked.',
    nextHandoff: 'Atlantis evidence archive',
    ownerWorkerId: 'treasury-watcher',
    lockedActions: ['spend', 'publish', 'renew', 'purchase'],
  },
  {
    id: 'demo-packet-atlantis-archive',
    sourceRoomId: 'treasury',
    targetRoomId: 'atlantis',
    stationId: 'dataset-pool',
    title: 'Approval outcome → Atlantis evidence archive',
    state: 'archived',
    artifactType: 'archive',
    input: 'Approval decision and source evidence snapshot.',
    output: 'Evidence archive record preview with room, station, packet, and lock history.',
    risk: 'Archive is read-only; no external account changes.',
    nextHandoff: 'Future packet search and replay',
    ownerWorkerId: 'poseidon',
    lockedActions: ['external-write'],
  },
]

function effectiveWorkflowPackets(liveStatus: LiveWarRoomStatus | null) {
  return liveStatus?.workflowPackets?.length ? liveStatus.workflowPackets : DEMO_WORKFLOW_PACKETS
}

function workflowPacketForUiRoom(roomId: string, packets: Array<WarRoomWorkflowPacket>) {
  return packets.find((packet) => packetUiRoom(packet.targetRoomId) === roomId)
    ?? packets.find((packet) => packetUiRoom(packet.sourceRoomId) === roomId)
    ?? null
}

function packetAsset(artifactType?: string) {
  return LIVE_PACKET_ASSETS[artifactType ?? 'packet'] ?? LIVE_PACKET_ASSETS.packet
}

function useLiveAtlasMotion(roomRows: Array<{ room: OlympusRoom; liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null; latestLine: string }>, liveStatus: LiveWarRoomStatus | null) {
  return useMemo(() => {
    const actors: Partial<Record<string, LiveAtlasActor>> = {}
    const roomPackets: Partial<Record<string, Array<LiveAtlasRoomPacket>>> = {}
    const workflowPackets = (liveStatus?.workflowPackets ?? [])
    const packetsByRoom = new Map<string, Array<WarRoomWorkflowPacket>>()

    workflowPackets.forEach((packet) => {
      const sourceUi = packetUiRoom(packet.sourceRoomId)
      const targetUi = packetUiRoom(packet.targetRoomId)
      ;[sourceUi, targetUi].forEach((roomId) => {
        if (!packetsByRoom.has(roomId)) packetsByRoom.set(roomId, [])
        packetsByRoom.get(roomId)?.push(packet)
      })
    })

    roomRows.forEach(({ room, liveRoom }) => {
      const agent = room.agents.at(0)
      const visiblePackets = packetsByRoom.get(room.id) ?? []
      const priorityStation = room.stations.find((station) => station.kind === 'approval' && liveRoom?.health === 'review')
        ?? room.stations.find((station) => station.kind === 'archive' && room.id === 'atlantis-vault')
        ?? room.stations.at(0)
      const point = priorityStation?.operatorSpot ?? priorityStation?.position ?? agent?.position ?? { x: 50, y: 50 }
      const agentName = agent?.name ?? room.name
      const packetCount = roomPacketCount(liveRoom)
      const action = packetCount || visiblePackets.length
        ? `${agentName} holding ${packetCount || visiblePackets.length} packet${(packetCount || visiblePackets.length) === 1 ? '' : 's'} for review`
        : `${agentName} ready — open for current data`

      actors[room.id] = {
        roomId: room.id,
        x: clampPercent(point.x),
        y: clampPercent(point.y),
        targetX: clampPercent(point.x),
        targetY: clampPercent(point.y),
        stationId: priorityStation?.id,
        moving: false,
        action,
        phase: 0,
      }

      const packet = visiblePackets.at(0)
      roomPackets[room.id] = packet ? [{
        id: packet.id,
        roomId: room.id,
        x: clampPercent((priorityStation?.position.x ?? 50) + 5, 12, 88),
        y: clampPercent((priorityStation?.position.y ?? 50) + 8, 16, 88),
        progress: 1,
        artifactType: packet.artifactType,
        title: packet.title,
      }] : []
    })

    return { actors, roomPackets, transfers: [] as Array<LiveAtlasTransfer> }
  }, [liveStatus, roomRows])
}
function MiniRoomCell({ room, liveRoom, latestLine, actor, packets, onOpen }: { room: OlympusRoom; liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null; latestLine: string; actor?: LiveAtlasActor; packets?: Array<LiveAtlasRoomPacket>; onOpen: (roomId: string) => void }) {
  const agent = room.agents.at(0)
  const packetCount = roomPacketCount(liveRoom)
  const health = liveRoom?.health ?? 'idle'
  const featuredStations = room.stations.slice(0, 6)
  const activeStationId = actor?.stationId ?? featuredStations[0]?.id
  const agentX = actor?.x ?? agent?.position.x ?? 50
  const agentY = actor?.y ?? agent?.position.y ?? 50
  return (
    <button
      type="button"
      onClick={() => onOpen(room.id)}
      aria-label={`Enter live miniature room ${room.name}`}
      className="group relative h-full min-h-0 overflow-hidden rounded-[22px] border border-amber-100/20 bg-[#070507]/74 text-left shadow-[0_16px_34px_rgba(0,0,0,.58),inset_0_0_24px_rgba(255,187,91,.06)] transition-colors hover:border-amber-100/55 focus:outline-none focus:ring-2 focus:ring-amber-100"
      data-war-room-live-mini-cell={room.id}
      data-workflow-packets={packetCount}
    >
      <div className="absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-2 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
        <div className="min-w-0 border border-amber-100/16 bg-black/58 px-3 py-1.5 shadow-[0_10px_22px_rgba(0,0,0,.48)] backdrop-blur-[3px]">
          <div className="truncate font-serif text-[10px] font-black uppercase tracking-[.13em] text-amber-50">{room.name}</div>
        </div>
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full border ${healthTone(health)}`} title={friendlyHealthLabel(health)} />
      </div>

      <div className="absolute inset-x-4 bottom-4 z-20 transition group-hover:translate-y-0 group-focus:translate-y-0">
        <div className="inline-flex max-w-full items-center gap-2 border border-cyan-100/18 bg-black/64 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.12em] text-cyan-50/88 shadow-[0_10px_20px_rgba(0,0,0,.46)] backdrop-blur-[3px]">
          <span>{packetCount} packets</span>
          <span className="text-amber-50/65">•</span>
          <span>{actor?.moving ? 'walking' : 'working'}</span>
        </div>
        {actor?.action ? (
          <div className="mt-1 max-w-[92%] truncate border border-amber-100/12 bg-black/54 px-2 py-1 text-[8px] font-bold uppercase tracking-[.08em] text-amber-50/76 shadow-[0_8px_18px_rgba(0,0,0,.44)] backdrop-blur-[3px]" data-live-atlas-action-line={room.id}>
            {actor.action}
          </div>
        ) : null}
      </div>

      <div className="absolute inset-0 z-0 overflow-hidden">
        <img src={`${room.backgroundAsset}?v=cell-atlas-r3`} alt="" className="h-full w-full object-cover opacity-95" draggable={false} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,transparent_54%,rgba(0,0,0,.66)_100%),linear-gradient(180deg,rgba(255,220,151,.05),rgba(0,0,0,.12)_42%,rgba(0,0,0,.38))]" />
        <div className={`pointer-events-none absolute inset-0 border bg-gradient-to-br ${roomAccent(room.id)} opacity-38 mix-blend-screen`} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
        {featuredStations.map((station) => {
          const active = station.id === activeStationId
          return (
            <span key={station.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${station.position.x}%`, top: `${station.position.y}%` }}>
              <img
                src={`${station.asset}?v=live-atlas-r1`}
                alt=""
                className={`h-[30px] w-[30px] object-contain drop-shadow-[0_9px_12px_rgba(0,0,0,.82)] transition ${active ? 'scale-[1.15] brightness-125' : 'opacity-82'}`}
                draggable={false}
              />
              {active ? null : null}
            </span>
          )
        })}
        {actor && agent ? (
          <span
            className="absolute z-20 h-[42px] w-[42px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/16 bg-cyan-200/[.035] shadow-[0_0_16px_rgba(45,212,191,.22)] brightness-100"
            style={{ left: `${agentX}%`, top: `${agentY}%` }}
            data-live-atlas-actor={room.id}
            data-live-atlas-moving={actor.moving ? 'true' : 'false'}
            data-live-atlas-action={actor.action}
          >
            <img
              src={`${agent.idleFrame ?? agent.spriteSheet}?v=live-atlas-r4-motion`}
              alt=""
              className="h-full w-full object-contain [image-rendering:pixelated] drop-shadow-[0_10px_12px_rgba(0,0,0,.82)]"
              draggable={false}
            />

          </span>
        ) : null}
        {packets?.slice(0, 1).map((packet) => (
          <span
            key={packet.id}
            className="absolute z-[19] grid h-[25px] w-[25px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/24 bg-black/48 shadow-[0_0_18px_rgba(251,191,36,.28)]"
            style={{ left: `${packet.x}%`, top: `${packet.y}%`, opacity: 0.58 + packet.progress * 0.36 }}
            title={packet.title}
            data-live-atlas-artifact={packet.artifactType}
            data-live-atlas-artifact-room={room.id}
          >
            <img src={packetAsset(packet.artifactType)} alt="" className="h-5 w-5 object-contain" draggable={false} />
          </span>
        ))}
        {null}
        {actor?.moving ? null : null}
      </div>
    </button>
  )
}

function CampaignMapNode({ room, liveRoom, latestLine, actor, packets, onOpen }: { room: OlympusRoom; liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null; latestLine: string; actor?: LiveAtlasActor; packets?: Array<LiveAtlasRoomPacket>; onOpen: (roomId: string) => void }) {
  const point = LIVE_ATLAS_CAMPAIGN_POINTS[room.id] ?? LIVE_ATLAS_CELL_CENTERS[room.id]
  const packetCount = roomPacketCount(liveRoom)
  const health = liveRoom?.health ?? 'idle'
  const status = health === 'blocked' || health === 'review' ? 'needs review' : actor?.moving ? 'routing' : packetCount ? 'working' : 'ready'
  return (
    <button
      type="button"
      onClick={() => onOpen(room.id)}
      aria-label={`Enter ${room.name} from campaign map`}
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 text-left outline-none"
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
      data-war-room-campaign-node={room.id}
      data-war-room-campaign-status={status}
    >
      <span className={`relative grid h-[58px] w-[58px] place-items-center rounded-full border-2 bg-black/42 shadow-[0_12px_24px_rgba(0,0,0,.52),0_0_18px_rgba(251,191,36,.14)] backdrop-blur-[2px] transition duration-200 group-hover:scale-110 group-hover:border-amber-100 group-focus:scale-110 group-focus:border-amber-100 ${healthTone(health)}`}>
        <span className="absolute inset-[-6px] rounded-full border border-amber-100/16 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100" />
        <img src={room.agents[0]?.idleFrame ?? room.agents[0]?.spriteSheet} alt="" className="h-[36px] w-[36px] object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,.76)]" draggable={false} />
        {packets?.[0] ? <img src={packetAsset(packets[0].artifactType)} alt="" className="absolute -right-1 -top-1 h-5 w-5 rounded-full border border-amber-100/32 bg-black/62 p-0.5" draggable={false} /> : null}
      </span>
      <span className="absolute left-1/2 top-[61px] block min-w-[124px] -translate-x-1/2 rounded-[10px] border border-amber-100/20 bg-[#100b06]/82 px-2 py-1 text-center shadow-[0_10px_18px_rgba(0,0,0,.52)] backdrop-blur-[2px] transition group-hover:border-amber-100/65 group-focus:border-amber-100/65">
        <span className="block truncate font-serif text-[9px] font-black text-amber-50">{room.name}</span>
        <span className="mt-0.5 block truncate text-[6px] font-black uppercase tracking-[.10em] text-cyan-50/82">{packetCount} packets • {status}</span>
        <span className="mt-1 hidden truncate text-[9px] font-semibold text-stone-200/78 group-hover:block group-focus:block">{latestLine}</span>
      </span>
    </button>
  )
}

function LiveMoneyOsRun({ packets, rooms, onOpenPacket }: { packets: Array<WarRoomWorkflowPacket>; rooms: Array<OlympusRoom>; onOpenPacket: (packet: WarRoomWorkflowPacket) => void }) {
  const activePacket = packets.find((packet) => packet.state === 'approval-waiting')
    ?? packets.find((packet) => packet.state === 'draft-ready')
    ?? packets.find((packet) => packet.state === 'needs-proof')
    ?? packets.at(0)
  if (!activePacket) return null
  const destination = packetDestination(activePacket)
  const destinationRoom =
    rooms.find((room) => room.id === destination.roomId) ?? null
  const destinationStation = destinationRoom && destination.stationId
    ? destinationRoom.stations.find(
        (station) => station.id === destination.stationId,
      )
    : null
  const steps = [
    { id: 'signal', label: 'Signal', detail: activePacket.input, done: true },
    { id: 'route', label: 'Hermes route', detail: `${livingRoomLabel(activePacket.sourceRoomId)} → ${livingRoomLabel(activePacket.targetRoomId)}`, done: true },
    { id: 'work', label: destinationStation?.name ?? 'Station work', detail: activePacket.output, done: activePacket.state !== 'source-ready' },
    { id: 'gate', label: 'DLV gate', detail: activePacket.risk, done: activePacket.state === 'approval-waiting' || activePacket.state === 'archived' },
  ]
  return (
    <section className="relative max-h-[38px] shrink-0 overflow-hidden rounded-[14px] border border-amber-100/10 bg-black/24 px-3 py-1.5 shadow-[0_8px_18px_rgba(0,0,0,.26)]" data-war-room-live-money-os-run="true">
      <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[8px] font-black uppercase tracking-[.22em] text-amber-100/60">Live run</span>
            <h2 className="truncate text-[12px] font-black leading-none text-amber-50">{activePacket.title}</h2>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[7px] font-black uppercase tracking-[.10em]">
            <span className={`rounded-full border px-2.5 py-1 ${packetStateTone(activePacket.state)}`}>{activePacket.state.replace(/-/g, ' ')}</span>
            <span className="rounded-full border border-cyan-100/20 bg-cyan-300/[.08] px-2.5 py-1 text-cyan-50">{destinationRoom?.name ?? 'waiting room'}</span>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 gap-1.5 lg:grid lg:grid-cols-4" data-war-room-money-os-steps="true">
          {steps.map((step, index) => (
            <div key={step.id} className={`relative min-h-[28px] rounded-[10px] border px-2 py-1 ${step.done ? 'border-cyan-100/16 bg-cyan-300/[.055]' : 'border-white/8 bg-black/16'}`} data-war-room-money-os-step={step.id}>
              {index < steps.length - 1 ? <div className="pointer-events-none absolute -right-3 top-1/2 hidden h-px w-6 bg-gradient-to-r from-cyan-100/70 to-transparent md:block" /> : null}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-100/72">{String(index + 1).padStart(2, '0')}</div>
                <div className={`h-2 w-2 rounded-full ${step.done ? 'bg-emerald-200 shadow-[0_0_12px_rgba(110,231,183,.8)]' : 'bg-white/28'}`} />
              </div>
              <div className="truncate text-[8px] font-black text-amber-50">{step.label}</div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => onOpenPacket(activePacket)} className="shrink-0 rounded-full border border-emerald-100/24 bg-emerald-300/90 px-3 py-1.5 text-[8px] font-black uppercase tracking-[.14em] text-black shadow-[0_8px_18px_rgba(16,185,129,.14)] transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-default disabled:border-white/10 disabled:bg-white/10 disabled:text-white/42" data-war-room-jump-live-handoff="true">
          Handoff
        </button>
      </div>
    </section>
  )
}

const LIVE_ATLAS_CORRIDORS: Array<[string, string]> = [
  ['olympus-command', 'pantheon-quarters'],
  ['olympus-command', 'agora'],
  ['olympus-command', 'oracle'],
  ['pantheon-quarters', 'merchant-harbor'],
  ['agora', 'merchant-harbor'],
  ['agora', 'forge'],
  ['oracle', 'agora'],
  ['merchant-harbor', 'forge'],
  ['forge', 'treasury'],
  ['treasury', 'atlantis-vault'],
  ['forge', 'atlantis-vault'],
]

function corridorPoint(roomId: string) {
  return LIVE_ATLAS_CAMPAIGN_POINTS[roomId] ?? LIVE_ATLAS_CELL_CENTERS[roomId]
}

function corridorPath(from: OlympusPoint, to: OlympusPoint) {
  const midX = (from.x + to.x) / 2
  const lift = Math.max(6, Math.abs(from.y - to.y) * 0.28)
  return `M ${from.x} ${from.y} C ${midX} ${from.y - lift}, ${midX} ${to.y + lift}, ${to.x} ${to.y}`
}

function ConnectedCellsMap({ roomRows, actors, roomPackets, workflowPackets, onOpenRoom, onOpenPacket }: { roomRows: Array<{ room: OlympusRoom; liveRoom: LegacyWarRoomRoom | WarRoomRoomSummary | null; latestLine: string }>; actors: Partial<Record<string, LiveAtlasActor>>; roomPackets: Partial<Record<string, Array<LiveAtlasRoomPacket>>>; workflowPackets: Array<WarRoomWorkflowPacket>; onOpenRoom: (roomId: string) => void; onOpenPacket: (packet: WarRoomWorkflowPacket) => void }) {
  const transferPackets = workflowPackets.slice(0, 7).map((packet, index) => {
    const sourceRoomId = packetUiRoom(packet.sourceRoomId)
    const targetRoomId = packetUiRoom(packet.targetRoomId)
    const from = corridorPoint(sourceRoomId)
    const to = corridorPoint(targetRoomId)
    const progress = 0.22 + ((index * 0.17) % 0.58)
    return { packet, sourceRoomId, targetRoomId, point: interpolatePoint(from, to, progress) }
  })

  return (
    <div className="relative h-full min-h-[500px] overflow-hidden rounded-[28px] border border-amber-100/12 bg-[radial-gradient(circle_at_50%_50%,rgba(251,146,60,.10),transparent_30%),linear-gradient(180deg,rgba(3,8,12,.94),rgba(0,0,0,.78))] shadow-[inset_0_0_90px_rgba(0,0,0,.70)]" data-war-room-connected-cells-map="true" data-war-room-live-cells-count={roomRows.length}>
      <style>{`
        @keyframes warRoomCellBreathe { 0%, 100% { transform: translate(-50%, -50%) scale(1); filter: brightness(1); } 50% { transform: translate(-50%, -50%) scale(1.025); filter: brightness(1.13); } }
        @keyframes warRoomAgentPatrol { 0%, 100% { transform: translateX(-7px); } 50% { transform: translateX(7px) translateY(-2px); } }
        @keyframes warRoomPacketPulse { 0%, 100% { transform: translate(-50%, -50%) scale(.94); opacity: .76; } 50% { transform: translate(-50%, -50%) scale(1.16); opacity: 1; } }
      `}</style>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-war-room-corridor-svg="true">
        <defs>
          <linearGradient id="war-room-corridor-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgba(45,212,191,.22)" />
            <stop offset=".5" stopColor="rgba(251,191,36,.70)" />
            <stop offset="1" stopColor="rgba(45,212,191,.22)" />
          </linearGradient>
          <filter id="war-room-corridor-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {LIVE_ATLAS_CORRIDORS.map(([fromId, toId]) => {
          const from = corridorPoint(fromId)
          const to = corridorPoint(toId)
          const path = corridorPath(from, to)
          return (
            <g key={`${fromId}-${toId}`} data-war-room-corridor={`${fromId}->${toId}`}>
              <path d={path} fill="none" stroke="rgba(255,214,132,.07)" strokeWidth="3.4" strokeLinecap="round" opacity="0.48" />
              <path d={path} fill="none" stroke="url(#war-room-corridor-line)" strokeWidth=".7" strokeLinecap="round" strokeDasharray="2.4 4.8" opacity="0.42" filter="url(#war-room-corridor-glow)" />
              <circle r="0.46" fill="rgba(125,249,255,.72)" opacity="0.54">
                <animateMotion dur={`${9 + (fromId.length % 4)}s`} repeatCount="indefinite" path={path} />
              </circle>
              <circle r="0.32" fill="rgba(255,224,138,.72)" opacity="0.48">
                <animateMotion dur={`${7 + (toId.length % 5)}s`} repeatCount="indefinite" begin="-3s" path={path} />
              </circle>
            </g>
          )
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,transparent_0%,transparent_64%,rgba(0,0,0,.68)_100%),linear-gradient(90deg,rgba(255,255,255,.014)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.010)_1px,transparent_1px)] [background-size:auto,72px_72px,72px_72px]" />

      {transferPackets.map(({ packet, sourceRoomId, targetRoomId, point }, index) => {
        const agent = roomRows.find(({ room }) => room.id === sourceRoomId)?.room.agents[0]
        return (
          <button key={packet.id} type="button" onClick={() => onOpenPacket(packet)} className="group absolute z-30 rounded-full border border-amber-100/28 bg-black/58 p-1 shadow-[0_0_18px_rgba(251,191,36,.24)] backdrop-blur-[1px] transition hover:scale-110 hover:border-emerald-100 focus:outline-none focus:ring-2 focus:ring-amber-100" style={{ left: `${point.x}%`, top: `${point.y}%`, animation: `warRoomPacketPulse ${2.6 + index * 0.18}s ease-in-out infinite` }} aria-label={`Open live corridor packet ${packet.title}`} data-war-room-corridor-packet={packet.id} data-war-room-corridor-source={sourceRoomId} data-war-room-corridor-target={targetRoomId}>
            <img src={packetAsset(packet.artifactType)} alt="" className="relative h-5 w-5 rounded-full bg-black/42 p-0.5" draggable={false} />
            {agent ? <img src={agent.idleFrame ?? agent.spriteSheet} alt="" className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border border-cyan-100/16 bg-black/66 p-0.5 [image-rendering:pixelated]" draggable={false} /> : null}
            <span className="pointer-events-none absolute left-1/2 top-10 hidden w-44 -translate-x-1/2 rounded-xl border border-amber-100/18 bg-black/82 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[.08em] text-amber-50 shadow-[0_10px_20px_rgba(0,0,0,.5)] group-hover:block group-focus:block">{livingRoomLabel(packet.sourceRoomId)} → {livingRoomLabel(packet.targetRoomId)}</span>
          </button>
        )
      })}

      {roomRows.map(({ room, liveRoom, latestLine }) => {
        const point = corridorPoint(room.id)
        const packetCount = roomPacketCount(liveRoom)
        const health = liveRoom?.health ?? 'idle'
        const agent = room.agents.at(0)
        const roomActor = actors[room.id]
        const firstRoomPacket = roomPackets[room.id]?.at(0)
        const isForgeFocus = room.id === 'forge'
        return (
          <button key={room.id} type="button" onClick={() => onOpenRoom(room.id)} className={`group absolute overflow-hidden border bg-[#070507]/88 text-left shadow-[0_18px_34px_rgba(0,0,0,.64),inset_0_0_24px_rgba(255,187,91,.08)] backdrop-blur-[2px] transition hover:z-40 hover:border-amber-100/70 focus:z-40 focus:outline-none focus:ring-2 focus:ring-amber-100 ${isForgeFocus ? 'z-30 h-[184px] w-[min(500px,34vw)] min-w-[340px] rounded-[26px] border-amber-100/42 p-3 shadow-[0_30px_80px_rgba(0,0,0,.78),0_0_44px_rgba(249,115,22,.20),inset_0_0_42px_rgba(255,187,91,.10)]' : 'z-20 h-[56px] w-[min(126px,11vw)] min-w-[92px] rounded-[14px] border-amber-100/14 p-1 opacity-68 hover:opacity-100'}`} style={{ left: `${point.x}%`, top: `${point.y}%`, animation: isForgeFocus ? undefined : `warRoomCellBreathe ${5.8 + (room.name.length % 4)}s ease-in-out infinite`, transform: 'translate(-50%, -50%)' }} aria-label={`Enter connected cell ${room.name}`} data-war-room-connected-cell={room.id} data-workflow-packets={packetCount} data-war-room-focus-cell={isForgeFocus ? 'true' : undefined}>
            <img src={`${isForgeFocus ? '/war-room/vNext/forge/layers/forge-of-hephaestus-living-room-v33.png' : room.backgroundAsset}?v=connected-cell-r2`} alt="" className={`absolute inset-0 h-full w-full object-cover ${isForgeFocus ? 'opacity-95' : 'opacity-44'}`} draggable={false} />
            <div className={`absolute inset-0 bg-gradient-to-br ${roomAccent(room.id)} ${isForgeFocus ? 'opacity-18' : 'opacity-28'} mix-blend-screen`} />
            <div className={`pointer-events-none absolute inset-0 ${isForgeFocus ? 'bg-[radial-gradient(circle_at_52%_52%,transparent_0%,transparent_56%,rgba(0,0,0,.55)_100%)]' : 'bg-black/18'}`} />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`truncate font-serif font-black uppercase tracking-[.10em] text-amber-50 drop-shadow-[0_3px_8px_rgba(0,0,0,.9)] ${isForgeFocus ? 'text-[18px]' : 'text-[8px]'}`}>{room.name}</div>
                  <div className={`mt-0.5 truncate font-black uppercase tracking-[.08em] text-cyan-50/82 ${isForgeFocus ? 'text-[10px]' : 'text-[6px]'}`}>{packetCount} packets • {health}</div>
                </div>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${healthTone(health)}`} />
              </div>
              <div className="flex items-end justify-between gap-2">
                {agent ? <span className={`relative block ${isForgeFocus ? 'h-16 w-16' : 'h-7 w-7'}`} style={{ animation: `warRoomAgentPatrol ${4.4 + (room.id.length % 3)}s ease-in-out infinite` }}><img src={agent.idleFrame ?? agent.spriteSheet} alt="" className="h-full w-full object-contain [image-rendering:pixelated] drop-shadow-[0_8px_10px_rgba(0,0,0,.76)]" draggable={false} /></span> : null}
                {isForgeFocus ? <span className="rounded-full border border-orange-100/24 bg-black/56 px-3 py-1 text-[9px] font-black uppercase tracking-[.14em] text-orange-50 shadow-[0_0_20px_rgba(249,115,22,.22)]">open cell</span> : null}
                {!isForgeFocus && firstRoomPacket ? <img src={packetAsset(firstRoomPacket.artifactType)} alt="" className="h-5 w-5 rounded-full border border-amber-100/20 bg-black/56 p-0.5 shadow-[0_0_14px_rgba(251,191,36,.18)]" draggable={false} /> : null}
              </div>
              <div className={`absolute truncate font-semibold text-stone-200/82 ${isForgeFocus ? 'bottom-3 left-20 right-24 text-[10px]' : 'bottom-1 left-8 right-1 text-[6px]'}`}>{roomActor?.action ?? `${room.name} ready`}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function LiveAtlasHub({ rooms, liveStatus, liveSyncPulse: _liveSyncPulse, liveStatusError, onOpenRoom, onOpenPacket, onOpenCommand }: { rooms: Array<OlympusRoom>; liveStatus: LiveWarRoomStatus | null; liveSyncPulse: number; liveStatusError: string | null; onOpenRoom: (roomId: string) => void; onOpenPacket: (packet: WarRoomWorkflowPacket) => void; onOpenCommand: () => void }) {
  const roomRows = rooms.map((room) => {
    const liveRoom = liveRoomStatus(liveStatus, room.id)
    return { room, liveRoom, latestLine: latestLiveLine(liveStatus, room, liveRoom) }
  })

  const visibleStatusError = liveStatusError && !liveStatusError.includes('Cannot read properties') ? liveStatusError : null
  const visibleWorkflowPackets = effectiveWorkflowPackets(liveStatus)
  const { actors, roomPackets } = useLiveAtlasMotion(roomRows, liveStatus)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[34px] border border-amber-100/24 bg-[#050508] shadow-[inset_0_0_64px_rgba(0,0,0,.72),0_28px_72px_rgba(0,0,0,.62)]" data-war-room-live-atlas="campaign-map-r2-chatgpt-pending">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,204,112,.16),transparent_26%),radial-gradient(circle_at_20%_85%,rgba(45,212,191,.10),transparent_28%),linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.45))]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col gap-2 p-2 pb-3 lg:p-3 lg:pb-3">
        <header className="flex shrink-0 items-center justify-between gap-3 rounded-[16px] border border-amber-100/14 bg-[linear-gradient(135deg,rgba(7,18,25,.66),rgba(25,14,4,.50))] px-3 py-2 shadow-[inset_0_0_28px_rgba(45,212,191,.05)]">
          <div className="min-w-0">
            <div className="text-[8px] font-black uppercase tracking-[.26em] text-cyan-100/70">OLYMPUS COMMAND • JARVIS PHASE A</div>
            <h1 className="mt-0.5 truncate font-serif text-[16px] font-black leading-none text-[#ffeeb0] drop-shadow-[0_8px_18px_rgba(0,0,0,.62)]">JARVIS Command Loop</h1>
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            <span className="rounded-full border border-emerald-100/20 bg-emerald-300/[.08] px-3 py-1 text-[8px] font-black uppercase tracking-[.14em] text-emerald-50/88">
              Planner Mode / Observer active / Safe Build pending
            </span>
            <span className="rounded-full border border-amber-100/22 bg-amber-300/[.08] px-3 py-1 text-[8px] font-black uppercase tracking-[.14em] text-amber-50/88">
              Etsy/shops not connected • theoretical only
            </span>
          </div>
        </header>

        <JarvisOmenStrip liveStatus={liveStatus} liveStatusError={visibleStatusError} workflowPackets={visibleWorkflowPackets} onOpenCommand={onOpenCommand} />

        <LiveMoneyOsRun packets={visibleWorkflowPackets} rooms={rooms} onOpenPacket={onOpenPacket} />

        <section className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-cyan-100/12 bg-[linear-gradient(180deg,rgba(6,12,18,.84),rgba(3,5,8,.96))] p-1.5 shadow-[inset_0_0_44px_rgba(45,212,191,.04),0_20px_48px_rgba(0,0,0,.56)]" aria-label="Live moving room cells" data-war-room-live-cells-dock="living-ops-table">
          <ConnectedCellsMap
            roomRows={roomRows}
            actors={actors}
            roomPackets={roomPackets}
            workflowPackets={visibleWorkflowPackets}
            onOpenRoom={onOpenRoom}
            onOpenPacket={onOpenPacket}
          />
        </section>
      </div>
    </div>
  )
}

function healthTone(health?: string) {
  if (health === 'blocked') return 'border-amber-200/50 bg-amber-400/13 text-amber-50'
  if (health === 'review') return 'border-amber-200/50 bg-amber-400/13 text-amber-50'
  if (health === 'active') return 'border-cyan-200/48 bg-cyan-400/12 text-cyan-50'
  return 'border-emerald-200/32 bg-emerald-400/8 text-emerald-50'
}

function roomSubtitle(room: OlympusRoom) {
  if (room.id === 'olympus-command') return 'Mission routing • approvals • gateway health'
  if (room.id === 'pantheon-quarters') return 'Agents • model roster • training halls'
  if (room.id === 'agora') return 'Product research • niches • shop expansion stalls'
  if (room.id === 'oracle') return 'Keywords • trends • stats • alert omens'
  if (room.id === 'forge') return 'Hephaestus tools • forge stations • draft relics'
  if (room.id === 'merchant-harbor') return 'Suppliers • docks • logistics • risk gates'
  if (room.id === 'atlantis-vault') return 'Memory • reports • screenshots • datasets'
  return 'Margins • costs • paid-action locks • approval vaults'
}

function roomAccent(roomId: string) {
  if (roomId === 'forge') return 'from-orange-300/22 via-amber-200/8 to-transparent border-orange-200/38'
  if (roomId === 'oracle') return 'from-violet-300/20 via-sky-200/8 to-transparent border-violet-200/35'
  if (roomId === 'merchant-harbor') return 'from-cyan-300/20 via-sky-200/8 to-transparent border-cyan-200/35'
  if (roomId === 'atlantis-vault') return 'from-teal-300/20 via-cyan-200/8 to-transparent border-teal-200/35'
  if (roomId === 'treasury') return 'from-yellow-300/20 via-amber-200/8 to-transparent border-yellow-200/38'
  if (roomId === 'agora') return 'from-emerald-300/20 via-lime-200/8 to-transparent border-emerald-200/35'
  return 'from-amber-200/20 via-sky-100/8 to-transparent border-amber-100/30'
}

type JarvisOmenTone = 'signal' | 'review' | 'safety' | 'build'

type JarvisOmen = {
  id: string
  tone: JarvisOmenTone
  source: string
  title: string
  body: string
  nextAction: string
  locked?: boolean
}

const JARVIS_SAFE_ACTIONS = [
  'Read-only checks',
  'Non-destructive QA',
  'Scoped /war-room UI edits after phase approval',
]

const JARVIS_LOCKED_ACTIONS = [
  'Etsy/shop writes',
  'ShotLab paid generation',
  'Purchases/supplier messages',
  'Destructive DB/admin/git reset',
  'God/model asset-family replacement',
]

const JARVIS_OMEN_TONE_CLASS: Record<JarvisOmenTone, string> = {
  signal: 'border-cyan-100/24 bg-cyan-300/[.075] text-cyan-50',
  review: 'border-amber-100/28 bg-amber-300/[.085] text-amber-50',
  safety: 'border-emerald-100/24 bg-emerald-300/[.075] text-emerald-50',
  build: 'border-violet-100/24 bg-violet-300/[.075] text-violet-50',
}

function jarvisOmens(liveStatus: LiveWarRoomStatus | null, liveStatusError: string | null, workflowPackets: Array<WarRoomWorkflowPacket>): Array<JarvisOmen> {
  const approvals = liveStatus?.pulse?.approvals ?? workflowPackets.filter((packet) => packet.state === 'approval-waiting').length
  const runningAgents = liveStatus?.pulse?.agents.running ?? 0
  const missions = liveStatus?.pulse?.missions ?? 0
  const pulseLine = liveStatus?.ok
    ? `${livePulseDetail(liveStatus)} • ${missions} missions in local pulse.`
    : liveStatusError
      ? 'Status warming up with calm observer fallback; no external action is triggered.'
      : 'Status warming up; JARVIS is using deterministic local mock/theoretical signals.'

  return [
    {
      id: 'safety-commerce-sealed',
      tone: 'safety',
      source: 'Safety Omen',
      title: 'External commerce sealed',
      body: 'Etsy, suppliers, paid generation, purchases, messages, ads, refunds, and account edits are not connected.',
      nextAction: 'Keep mock/theoretical mode.',
      locked: true,
    },
    {
      id: 'safe-build-ready',
      tone: 'build',
      source: 'Build Omen',
      title: 'Safe Build path ready',
      body: 'Design → warroom implementation → qaagent verification chain is active under /Users/mac/hermes-workspace.',
      nextAction: 'Implement scoped /war-room UI only.',
    },
    {
      id: 'olympus-command-leads',
      tone: approvals ? 'review' : 'signal',
      source: 'Command Omen',
      title: 'Olympus Command should lead',
      body: 'First glance must show mission state, agents, approvals, health, and JARVIS recommendation.',
      nextAction: approvals ? 'Review approval gate waiting.' : 'Open Council/Command table.',
    },
    {
      id: 'local-pulse',
      tone: runningAgents || approvals ? 'review' : 'signal',
      source: 'Data Omen',
      title: liveStatus?.ok ? 'Kanban / agent pulse online' : 'Status warming up',
      body: pulseLine,
      nextAction: 'Keep route/build QA read-only.',
    },
  ]
}

function JarvisOmenStrip({ liveStatus, liveStatusError, workflowPackets, onOpenCommand }: { liveStatus: LiveWarRoomStatus | null; liveStatusError: string | null; workflowPackets: Array<WarRoomWorkflowPacket>; onOpenCommand: () => void }) {
  const approvals = liveStatus?.pulse?.approvals ?? workflowPackets.filter((packet) => packet.state === 'approval-waiting').length
  const runningAgents = liveStatus?.pulse?.agents.running ?? 0
  const readyPackets = workflowPackets.filter((packet) => packet.state !== 'archived').length
  const omens = jarvisOmens(liveStatus, liveStatusError, workflowPackets)

  return (
    <section
      className="shrink-0 overflow-hidden rounded-[24px] border border-cyan-100/16 bg-[linear-gradient(135deg,rgba(5,13,22,.72),rgba(15,10,22,.62)_52%,rgba(28,17,5,.66))] p-2 text-stone-50 shadow-[0_16px_40px_rgba(0,0,0,.44),inset_0_0_38px_rgba(45,212,191,.06)] backdrop-blur-md"
      data-war-room-jarvis-omen-strip="phase-a-command-first-glance"
      aria-label="JARVIS Omen Strip: autonomy mode, safety locks, pulse, and next recommendation"
    >
      <div className="flex flex-col gap-2 2xl:flex-row">
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {omens.map((omen) => (
            <article key={omen.id} className={`min-w-0 rounded-[18px] border p-2 shadow-[inset_0_0_22px_rgba(255,255,255,.025)] ${JARVIS_OMEN_TONE_CLASS[omen.tone]}`} data-war-room-jarvis-omen-tone={omen.tone}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[7px] font-black uppercase tracking-[.18em] opacity-72">{omen.source}</span>
                <span className="rounded-full border border-white/12 bg-black/24 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[.12em] opacity-78">{omen.locked ? 'locked' : omen.tone}</span>
              </div>
              <h2 className="mt-1 truncate font-serif text-[12px] font-black leading-tight text-[#fff2bf]">{omen.title}</h2>
              <p className="mt-1 line-clamp-2 text-[8px] font-semibold leading-snug text-stone-100/82">{omen.body}</p>
              <p className="mt-1.5 truncate text-[7px] font-black uppercase tracking-[.10em] text-cyan-100/76">Next: {omen.nextAction}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-2 rounded-[18px] border border-amber-100/14 bg-black/24 p-2 2xl:w-[340px]" data-war-room-command-summary="planner-safe-build-locks">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ['mode', 'Planner'],
              ['agents', n(runningAgents)],
              ['approvals', n(approvals)],
              ['packets', n(readyPackets)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/9 bg-white/[.045] px-2 py-1.5 text-center">
                <div className="text-[6px] font-black uppercase tracking-[.12em] text-stone-400">{label}</div>
                <div className="mt-0.5 truncate text-[10px] font-black leading-none text-amber-50">{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-emerald-100/14 bg-emerald-300/[.055] px-2 py-1.5">
            <div className="text-[7px] font-black uppercase tracking-[.16em] text-emerald-100/72">Autonomy Level</div>
            <p className="mt-0.5 text-[9px] font-black leading-snug text-emerald-50">Planner Mode, Safe Build not auto-executing.</p>
          </div>
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-1">
            <div>
              <div className="text-[7px] font-black uppercase tracking-[.16em] text-cyan-100/72">Current permissions</div>
              <p className="mt-0.5 text-[8px] font-semibold leading-snug text-stone-200/82">{JARVIS_SAFE_ACTIONS.join(' • ')}.</p>
            </div>
            <div>
              <div className="text-[7px] font-black uppercase tracking-[.16em] text-rose-100/72">Locked every time</div>
              <p className="mt-0.5 text-[8px] font-semibold leading-snug text-stone-200/82">{JARVIS_LOCKED_ACTIONS.join(' • ')}.</p>
            </div>
          </div>
          <button type="button" onClick={onOpenCommand} className="rounded-2xl border border-amber-100/26 bg-amber-200 px-3 py-2 text-[9px] font-black uppercase tracking-[.12em] text-stone-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-50">
            Next recommendation: Finish Phase A Omen Strip + Olympus Command header, then QA route/build.
          </button>
        </div>
      </div>
    </section>
  )
}


function n(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString()
}

function shortRoomName(room?: string | null) {
  if (!room) return 'unassigned'
  return room.replace(/[-_]/g, ' ')
}

function livingRoomLabel(roomId?: string | null) {
  const labels: Record<string, string> = {
    oracle: 'Oracle Signals',
    agora: 'Agora Research',
    harbor: 'Merchant Harbor',
    shotlab: 'Forge of Hephaestus',
    atlantis: 'Atlantis Vault',
    treasury: 'Treasury Approval',
    olympus: 'Olympus Command',
  }
  return labels[roomId ?? ''] ?? shortRoomName(roomId)
}

type PacketDestination = {
  roomId: string
  stationId?: string
  reason: string
}

type AgentWorkSignal = {
  apiRoomId: string
  room: OlympusRoom
  agent: OlympusAgentInstance
  packet: WarRoomWorkflowPacket | undefined
  action: string
}

function packetDestination(packet: WarRoomWorkflowPacket): PacketDestination {
  const targetRoomId = packetUiRoom(packet.targetRoomId)
  const sourceRoomId = packetUiRoom(packet.sourceRoomId)
  const preferredRoomId = targetRoomId || sourceRoomId || 'atlantis-vault'
  if (packet.state === 'approval-waiting' || packet.artifactType === 'approval') {
    return preferredRoomId === 'treasury'
      ? { roomId: 'treasury', stationId: 'approval-vault', reason: 'open approval vault' }
      : { roomId: 'forge', stationId: 'approval-shrine', reason: 'open DLV approval shrine' }
  }
  if (packet.artifactType === 'draft' || packet.state === 'draft-ready') {
    return { roomId: 'forge', stationId: 'prompt-anvil', reason: 'open Prompt Anvil draft surface' }
  }
  if (packet.artifactType === 'supplier-proof' || preferredRoomId === 'merchant-harbor') {
    return { roomId: 'merchant-harbor', stationId: 'supplier-ledger', reason: 'open supplier proof ledger' }
  }
  if (packet.artifactType === 'archive' || packet.state === 'archived' || preferredRoomId === 'atlantis-vault') {
    return { roomId: 'atlantis-vault', stationId: 'dataset-pool', reason: 'open Atlantis workflow packet pool' }
  }
  if (preferredRoomId === 'oracle') return { roomId: 'oracle', stationId: 'signal-pool', reason: 'open signal pool' }
  if (preferredRoomId === 'agora') return { roomId: 'agora', stationId: 'idea-stalls', reason: 'open opportunity review' }
  if (preferredRoomId === 'olympus-command') return { roomId: 'olympus-command', stationId: 'dispatch-beacon', reason: 'open Hermes dispatch beacon' }
  return { roomId: preferredRoomId, reason: 'open packet room' }
}

function packetStateTone(state?: string) {
  if (state === 'approval-waiting') return 'border-amber-200/36 bg-amber-300/[.12] text-amber-50'
  if (state === 'needs-proof') return 'border-rose-200/32 bg-rose-400/[.10] text-rose-50'
  if (state === 'draft-ready') return 'border-cyan-200/32 bg-cyan-300/[.10] text-cyan-50'
  if (state === 'archived') return 'border-emerald-200/30 bg-emerald-300/[.10] text-emerald-50'
  return 'border-violet-200/28 bg-violet-300/[.09] text-violet-50'
}

function safetyLine(data: ProductIntelligenceData | null) {
  if (!data?.safety) return 'Read-only intelligence surface. No Etsy, supplier, browser, purchase, or paid action.'
  const locked = Object.entries(data.safety).filter(([, allowed]) => allowed === false).map(([key]) => key.replace(/_/g, ' '))
  return locked.length ? `Locked: ${locked.slice(0, 5).join(' • ')}` : 'Read-only safety state confirmed.'
}

function DatabaseVaultPanel({ data, archiveData, workflowPackets, loading, error, onRefresh, onOpenVault, onOpenPacket }: { data: ProductIntelligenceData | null; archiveData: WarRoomArchiveApiData | null; workflowPackets: Array<WarRoomWorkflowPacket>; loading: boolean; error: string | null; onRefresh: () => void; onOpenVault: () => void; onOpenPacket: (packet: WarRoomWorkflowPacket) => void }) {
  const counts = data?.counts ?? {}
  const opportunities = data?.opportunities?.slice(0, 5) ?? []
  const keywords = data?.keyword_opportunities?.slice(0, 5) ?? []
  const actions = data?.action_queue?.slice(0, 4) ?? []
  const rooms = data?.room_counts?.slice(0, 6) ?? []
  const sources = data?.sources?.slice(0, 3) ?? []
  const funnel = data?.workflow_funnel?.slice(0, 7) ?? []
  const archiveRecords = archiveData?.records?.slice(0, 3) ?? []
  const livePackets = workflowPackets.slice(0, 6)
  const atlantisRoom = olympusGameManifest.rooms.find((candidate) => candidate.id === 'atlantis-vault')
  const atlantisVisibleStations = atlantisRoom?.stations.slice(0, 4) ?? []
  const atlantisAgent = atlantisRoom?.agents[0]
  const livingRooms = ['oracle', 'agora', 'harbor', 'shotlab', 'treasury', 'atlantis']
  const packetCountForRoom = (roomId: string) => workflowPackets.filter((packet) => packet.sourceRoomId === roomId || packet.targetRoomId === roomId).length
  const workSignals = livingRooms.map((apiRoomId) => {
    const uiRoomId = packetUiRoom(apiRoomId)
    const room = olympusGameManifest.rooms.find((candidate) => candidate.id === uiRoomId)
    const agent = room?.agents[0]
    const packet = workflowPackets.find((candidate) => candidate.targetRoomId === apiRoomId) ?? workflowPackets.find((candidate) => candidate.sourceRoomId === apiRoomId)
    if (!room || !agent) return null
    const action = packet?.state === 'approval-waiting'
      ? 'holding for DLV approval'
      : packet?.state === 'draft-ready'
        ? 'routing draft to forge'
        : packet?.state === 'archived'
          ? 'sealing evidence in vault'
          : packet
            ? 'processing packet handoff'
            : 'standing by for next artifact'
    return { apiRoomId, room, agent, packet, action }
  }).filter((signal): signal is AgentWorkSignal => Boolean(signal))
  const archiveSummary = archiveData?.summary
  const importedAt = data?.summary?.imported_at ?? sources[0]?.imported_at ?? null

  return (
    <section className="pointer-events-auto absolute inset-4 z-[48] grid gap-3 overflow-hidden rounded-[30px] border border-cyan-100/24 bg-[linear-gradient(135deg,rgba(2,10,16,.92),rgba(3,23,30,.88)_48%,rgba(8,9,18,.94))] p-4 text-stone-50 shadow-[0_28px_70px_rgba(0,0,0,.72),inset_0_0_70px_rgba(45,212,191,.08)] backdrop-blur-md lg:grid-cols-[1.02fr_.98fr]" data-war-room-database-vault="professional-v1">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_16%,rgba(45,212,191,.20),transparent_28%),radial-gradient(circle_at_86%_78%,rgba(251,191,36,.10),transparent_30%)]" />
      <div className="relative min-h-0 overflow-hidden rounded-[24px] border border-cyan-100/14 bg-black/34 p-4 shadow-[inset_0_0_38px_rgba(0,0,0,.5)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.28em] text-cyan-100/72">Atlantis Database Vault</div>
            <h2 className="mt-1 font-serif text-[clamp(24px,2.5vw,34px)] font-black leading-none text-[#dffcff]">Product Intelligence DB</h2>
            <p className="mt-1.5 max-w-2xl text-[11px] font-semibold leading-snug text-stone-200/76">Imported records, strongest opportunities, keyword demand, action queues, and safety locks — no Etsy/supplier side effects.</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onOpenVault} className="rounded-full border border-emerald-100/30 bg-emerald-300/[.12] px-3 py-2 text-[10px] font-black uppercase tracking-[.14em] text-emerald-50 transition-colors hover:bg-emerald-200 hover:text-black focus:outline-none focus:ring-2 focus:ring-emerald-100">
              Open Data Vault
            </button>
            <button type="button" onClick={onRefresh} className="rounded-full border border-cyan-100/28 bg-cyan-300/[.10] px-3 py-2 text-[10px] font-black uppercase tracking-[.14em] text-cyan-50 transition-colors hover:bg-cyan-200 hover:text-black focus:outline-none focus:ring-2 focus:ring-cyan-100">
              {loading ? 'Loading…' : 'Refresh DB'}
            </button>
          </div>
        </div>

        {error || data?.error ? (
          <div className="mt-4 rounded-2xl border border-amber-200/28 bg-amber-300/[.10] p-3 text-[12px] font-bold text-amber-50">
            {error ?? data?.error}
            {data?.db_path ? <div className="mt-1 text-[10px] font-semibold text-amber-100/72">DB path: {data.db_path}</div> : null}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-5 gap-2">
          {[
            ['Products', counts.products],
            ['Keywords', counts.keywords],
            ['Suppliers', counts.supplier_links],
            ['Edges', counts.keyword_edges],
            ['Events', counts.workflow_events],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-white/[.055] p-2.5">
              <div className="truncate text-[8px] font-black uppercase tracking-[.10em] text-cyan-100/64">{label}</div>
              <div className="mt-1 truncate text-[clamp(16px,1.45vw,21px)] font-black leading-none text-cyan-50">{n(value as number | undefined)}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-[24px] border border-cyan-100/18 bg-[radial-gradient(circle_at_26%_42%,rgba(34,211,238,.18),transparent_28%),linear-gradient(135deg,rgba(8,47,73,.34),rgba(3,7,18,.72))] p-3" data-atlantis-visible-room-slice="horizontal-mini-room-surface">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-100/72">Visible room slice</div>
              <div className="text-[13px] font-black text-cyan-50">Stations + Poseidon target points + packet lane</div>
            </div>
            <span className="rounded-full border border-rose-100/22 bg-rose-400/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.10em] text-rose-50" data-atlantis-manual-safety-lock="true">manual-only lock</span>
          </div>
          <div className="relative h-[132px] overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(90deg,rgba(8,145,178,.10)_1px,transparent_1px),linear-gradient(0deg,rgba(8,145,178,.08)_1px,transparent_1px),rgba(2,6,23,.58)] [background-size:28px_28px]" data-atlantis-room-interior-detail="crystal-archive-floor">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-atlantis-packet-lanes="command-and-rest">
              <path d="M 8 66 C 28 54, 44 57, 63 48 S 88 44, 96 38" fill="none" stroke="rgba(103,232,249,.62)" strokeWidth="1.2" strokeDasharray="4 4" />
              <path d="M 50 72 C 60 78, 72 82, 92 86" fill="none" stroke="rgba(251,191,36,.50)" strokeWidth="1" strokeDasharray="3 5" />
              <circle r="2.2" fill="rgba(251,191,36,.90)"><animateMotion dur="14s" repeatCount="indefinite" path="M 8 66 C 28 54, 44 57, 63 48 S 88 44, 96 38" /></circle>
            </svg>
            {atlantisVisibleStations.map((station) => (
              <button key={station.id} type="button" onClick={onOpenVault} className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cyan-100/22 bg-black/54 p-1.5 text-left shadow-[0_0_18px_rgba(34,211,238,.16)] transition hover:border-cyan-100/70 focus:outline-none focus:ring-2 focus:ring-cyan-100" style={{ left: `${station.position.x}%`, top: `${station.position.y}%` }} data-atlantis-visible-station={station.id} data-atlantis-station-purpose={station.name}>
                <img src={station.asset} alt="" className="h-7 w-7 object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,.85)]" draggable={false} />
                <span className="pointer-events-none absolute left-1/2 top-9 hidden min-w-[118px] -translate-x-1/2 rounded-xl border border-cyan-100/18 bg-black/82 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[.08em] text-cyan-50 group-hover:block group-focus:block">{station.name}</span>
              </button>
            ))}
            {atlantisAgent ? <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: `${atlantisAgent.position.x}%`, top: `${atlantisAgent.position.y}%` }} data-atlantis-agent-target="home" data-atlantis-agent-work-target="workAisle" data-atlantis-agent-rest-target="restThreshold"><MiniGod agent={atlantisAgent} target={{ x: 50, y: 50 }} walking={false} working={true} workKind="archive" /></div> : null}
            <div className="absolute bottom-2 left-2 rounded-full border border-cyan-100/18 bg-black/46 px-2 py-1 text-[8px] font-black uppercase tracking-[.10em] text-cyan-50">Command → Atlantis archive packet</div>
            <div className="absolute bottom-2 right-2 rounded-full border border-amber-100/18 bg-black/46 px-2 py-1 text-[8px] font-black uppercase tracking-[.10em] text-amber-50">Rest target remains visible</div>
          </div>
        </div>

        <div className="mt-3 rounded-[22px] border border-teal-100/18 bg-teal-300/[.055] p-3" data-war-room-archive-api-strip="true">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[.24em] text-teal-100/72">Archive API backbone</div>
              <div className="mt-1 text-[13px] font-black text-teal-50">{archiveData?.databaseName ?? 'War Room Archive DB'}</div>
              <div className="mt-1 text-[9px] font-semibold text-stone-300/70">{archiveData?.pathLabel ?? 'Waiting for /api/war-room-archive'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right">
              <div className="rounded-2xl border border-white/10 bg-black/24 px-3 py-2"><div className="text-[8px] font-black uppercase text-teal-100/64">records</div><div className="text-lg font-black text-teal-50">{n(archiveSummary?.totalRecords)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-black/24 px-3 py-2"><div className="text-[8px] font-black uppercase text-teal-100/64">collections</div><div className="text-lg font-black text-teal-50">{n(archiveSummary?.totalCollections)}</div></div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {archiveRecords.length ? archiveRecords.map((record) => <span key={record.id} className="rounded-full border border-teal-100/18 bg-black/28 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.08em] text-teal-50">{record.title}</span>) : <span className="text-[10px] font-bold text-stone-300/62">No archive records returned yet.</span>}
          </div>
        </div>

        <div className="mt-3 rounded-[22px] border border-indigo-100/18 bg-[linear-gradient(135deg,rgba(99,102,241,.10),rgba(20,184,166,.055))] p-3" data-war-room-living-pipeline="phase-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[.24em] text-indigo-100/72">Living workflow backbone</div>
              <div className="mt-1 text-[13px] font-black text-indigo-50">Oracle → Agora → Harbor → Forge → Treasury → Atlantis</div>
              <div className="mt-1 text-[9px] font-semibold text-stone-300/70">Packets move as read-only artifacts. Rooms can inspect and stage; live marketplace/supplier/spend actions remain locked.</div>
            </div>
            <div className="rounded-2xl border border-indigo-100/18 bg-black/24 px-3 py-2 text-right">
              <div className="text-[8px] font-black uppercase text-indigo-100/64">live packets</div>
              <div className="text-lg font-black text-indigo-50">{n(workflowPackets.length)}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {livingRooms.map((roomId) => (
              <div key={roomId} className="min-w-0 rounded-2xl border border-white/10 bg-black/26 px-2 py-2">
                <div className="truncate text-[8px] font-black uppercase tracking-[.08em] text-cyan-100/72">{livingRoomLabel(roomId)}</div>
                <div className="mt-1 text-[15px] font-black text-cyan-50">{n(packetCountForRoom(roomId))}</div>
                <div className="mt-0.5 text-[8px] font-bold uppercase text-stone-400">handoffs</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[20px] border border-cyan-100/14 bg-black/24 p-2.5" data-war-room-agent-work-signals="phase-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-100/70">Agent work signals</div>
              <div className="text-[8px] font-black uppercase tracking-[.12em] text-emerald-100/70">live from packets</div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {workSignals.slice(0, 6).map((signal) => (
                <button key={signal.apiRoomId} type="button" disabled={!signal.packet} onClick={() => { if (signal.packet) onOpenPacket(signal.packet) }} className="relative min-h-[92px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_18%_18%,rgba(45,212,191,.13),transparent_34%),rgba(255,255,255,.035)] p-2 text-left transition hover:border-cyan-100/36 hover:bg-cyan-300/[.08] focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-default disabled:opacity-70" aria-label={signal.packet ? `Open ${signal.agent.name} packet in ${livingRoomLabel(signal.apiRoomId)}` : `${signal.agent.name} has no active packet`} data-war-room-agent-signal-button={signal.apiRoomId}>
                  <div className="pointer-events-none absolute bottom-1 left-1 h-[76px] w-[76px] opacity-95">
                    <MiniGod agent={signal.agent} target={{ x: 50, y: 78 }} walking={false} working={Boolean(signal.packet)} workKind={signal.packet?.artifactType ?? 'archive'} />
                  </div>
                  <div className="relative ml-[72px] min-w-0">
                    <div className="truncate text-[10px] font-black text-cyan-50">{signal.agent.name}</div>
                    <div className="truncate text-[8px] font-black uppercase tracking-[.09em] text-stone-300/70">{livingRoomLabel(signal.apiRoomId)}</div>
                    <div className="mt-1 line-clamp-2 text-[9px] font-semibold leading-snug text-stone-200/82">{signal.action}</div>
                    <div className="mt-1 truncate rounded-full border border-white/10 bg-black/32 px-2 py-1 text-[7px] font-black uppercase tracking-[.08em] text-amber-50">{signal.packet?.title ?? 'No active packet'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {livePackets.length ? livePackets.map((packet) => (
              <button key={packet.id} type="button" onClick={() => onOpenPacket(packet)} className="rounded-2xl border border-white/10 bg-black/28 p-2.5 text-left transition hover:border-indigo-100/36 hover:bg-indigo-300/[.08] focus:outline-none focus:ring-2 focus:ring-indigo-100" aria-label={`Open packet ${packet.title}`} data-war-room-workflow-packet-button={packet.id}>
                <div className="flex items-start gap-2">
                  <img src={LIVE_PACKET_ASSETS[packet.artifactType] ?? LIVE_PACKET_ASSETS.packet} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-xl border border-white/10 bg-black/30 p-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[10px] font-black text-amber-50">{packet.title}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[7px] font-black uppercase tracking-[.08em] ${packetStateTone(packet.state)}`}>{packet.state.replace(/-/g, ' ')}</span>
                    </div>
                    <div className="mt-1 truncate text-[8px] font-bold uppercase tracking-[.08em] text-cyan-100/72">{livingRoomLabel(packet.sourceRoomId)} → {livingRoomLabel(packet.targetRoomId)} • {packet.ownerWorkerId}</div>
                    <div className="mt-1 line-clamp-2 text-[9px] font-semibold leading-snug text-stone-300/76">{packet.output}</div>
                  </div>
                </div>
              </button>
            )) : <div className="rounded-2xl border border-white/10 bg-black/26 p-3 text-[10px] font-bold text-stone-300">No workflow packets returned yet.</div>}
          </div>
        </div>

        <div className="mt-3 grid min-h-0 gap-3 lg:grid-cols-[1.35fr_.65fr]">
          <div className="min-h-0 rounded-[22px] border border-emerald-100/14 bg-emerald-200/[.045] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-black uppercase tracking-[.20em] text-emerald-50">Highest value product candidates</h3>
              <span className="rounded-full border border-emerald-100/18 px-2 py-1 text-[8px] font-black uppercase text-emerald-100/80">top score</span>
            </div>
            <div className="space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:rgba(45,212,191,.45)_rgba(0,0,0,.25)] max-h-[172px]">
              {opportunities.length ? opportunities.map((item) => (
                <article key={item.id ?? item.title} className="rounded-2xl border border-white/10 bg-black/28 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-black text-amber-50">{item.title ?? 'Untitled opportunity'}</div>
                      <div className="mt-0.5 truncate text-[9px] font-semibold text-stone-300/80">{item.keywords || item.etsy_angle || 'No keyword line stored yet'}</div>
                    </div>
                    <div className="rounded-xl border border-cyan-100/20 bg-cyan-300/[.09] px-2 py-1 text-right">
                      <div className="text-[8px] font-black uppercase text-cyan-100/70">score</div>
                      <div className="text-lg font-black text-cyan-50">{Math.round(Number(item.opportunity_score ?? 0))}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[8px] font-black uppercase tracking-[.08em]">
                    <span className="rounded-full border border-amber-100/18 bg-amber-300/[.08] px-2 py-1 text-amber-50">{item.priority ?? 'priority'}</span>
                    <span className="rounded-full border border-cyan-100/16 bg-cyan-300/[.06] px-2 py-1 text-cyan-50">{shortRoomName(item.current_room)}</span>
                    <span className="rounded-full border border-white/10 bg-white/[.05] px-2 py-1 text-stone-200">{n(item.supplier_link_count)} suppliers</span>
                  </div>
                  <div className="mt-1.5 truncate text-[9px] font-bold leading-snug text-emerald-50/84">Next: {item.next_action ?? 'Review evidence and route to next gate'}</div>
                </article>
              )) : <div className="rounded-2xl border border-white/10 bg-black/28 p-4 text-sm font-bold text-stone-300">No ranked opportunities found yet.</div>}
            </div>
          </div>

          <div className="rounded-[22px] border border-amber-100/14 bg-amber-200/[.045] p-3">
            <h3 className="text-[11px] font-black uppercase tracking-[.20em] text-amber-50">Action queue</h3>
            <div className="mt-3 space-y-2">
              {actions.length ? actions.map((item) => (
                <div key={item.next_action} className="rounded-2xl border border-white/10 bg-black/26 p-3">
                  <div className="text-xl font-black text-amber-50">{n(item.count)}</div>
                  <div className="mt-1 text-[10px] font-bold leading-snug text-stone-200/82">{item.next_action}</div>
                </div>
              )) : <div className="text-[12px] font-bold text-stone-300">No action queue loaded.</div>}
            </div>
            <div className="mt-3 rounded-2xl border border-emerald-100/16 bg-emerald-300/[.07] p-3 text-[10px] font-bold leading-snug text-emerald-50/88">{safetyLine(data)}</div>
          </div>
        </div>
      </div>

      <div className="relative grid min-h-0 gap-3 overflow-hidden rounded-[24px] border border-amber-100/14 bg-black/34 p-4 shadow-[inset_0_0_38px_rgba(0,0,0,.5)]">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-cyan-100/14 bg-cyan-300/[.045] p-3">
            <h3 className="text-[11px] font-black uppercase tracking-[.20em] text-cyan-50">Keyword signals</h3>
            <div className="mt-3 space-y-2">
              {keywords.length ? keywords.map((item) => (
                <div key={item.keyword} className="rounded-2xl border border-white/10 bg-black/28 p-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-[12px] font-black text-cyan-50">{item.keyword}</span>
                    <span className="text-[11px] font-black text-amber-50">{Math.round(Number(item.signal_score ?? item.score ?? 0))}</span>
                  </div>
                  <div className="mt-1 text-[9px] font-semibold text-stone-300/78">avg sales {n(item.avg_sales)} • competition {item.competition_level ?? item.competition ?? 'n/a'}</div>
                  <div className="mt-1 text-[9px] font-bold text-emerald-50/78">{item.next_action}</div>
                </div>
              )) : <div className="text-[12px] font-bold text-stone-300">No keyword signal loaded.</div>}
            </div>
          </div>

          <div className="rounded-[22px] border border-violet-100/14 bg-violet-300/[.045] p-3">
            <h3 className="text-[11px] font-black uppercase tracking-[.20em] text-violet-50">DB distribution</h3>
            <div className="mt-3 space-y-2">
              {rooms.length ? rooms.map((item) => (
                <div key={item.room ?? 'room'} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-black/24 px-3 py-2">
                  <div className="truncate text-[10px] font-black uppercase tracking-[.08em] text-stone-200">{shortRoomName(item.room)}</div>
                  <div className="text-sm font-black text-violet-50">{n(item.count)}</div>
                </div>
              )) : <div className="text-[12px] font-bold text-stone-300">No room counts available.</div>}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-3">
            <h3 className="text-[11px] font-black uppercase tracking-[.20em] text-stone-100">Workflow funnel</h3>
            <div className="mt-3 max-h-[160px] space-y-2 overflow-y-auto pr-1">
              {funnel.length ? funnel.map((item, index) => (
                <div key={`${item.room}-${item.status}-${index}`} className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-[10px] font-bold text-stone-200">
                  <span className="text-amber-50">{n(item.count)}</span> • {shortRoomName(item.room)} • {item.status ?? 'no status'}
                </div>
              )) : <div className="text-[12px] font-bold text-stone-300">No workflow funnel rows.</div>}
            </div>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/[.035] p-3">
            <h3 className="text-[11px] font-black uppercase tracking-[.20em] text-stone-100">Sources</h3>
            <div className="mt-3 space-y-2">
              {sources.length ? sources.map((item) => (
                <div key={`${item.source_name}-${item.imported_at}`} className="rounded-xl border border-white/10 bg-black/24 px-3 py-2">
                  <div className="truncate text-[10px] font-black text-stone-100">{item.source_name}</div>
                  <div className="mt-1 text-[9px] font-semibold text-stone-300/72">{item.source_kind} • {n(item.source_size)} bytes</div>
                </div>
              )) : <div className="text-[12px] font-bold text-stone-300">No source imports listed.</div>}
              {importedAt ? <div className="text-[9px] font-bold text-cyan-100/70">Last import: {String(importedAt)}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function agentChatSessionId(agentId: string) {
  return `war-room-${agentId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
}

const GOD_CHAT_ICON_SCALE: Record<string, number> = {
  hermes: 0.82,
  hercules: 0.68,
  athena: 0.82,
  'oracle-researcher': 1.08,
  oracle: 1.0,
  hephaestus: 1.0,
  njord: 1.0,
  poseidon: 1.0,
  'atlantis-archivist': 1.0,
  'treasury-watcher': 1.0,
}

const GOD_CHAT_ASSET_VERSION = '20260525-hercules-perceived-scale-v3'

function normalizedGodScale(agentId: string) {
  return GOD_CHAT_ICON_SCALE[agentId] ?? 1
}

function agentRoom(agent: OlympusAgentInstance) {
  return olympusGameManifest.rooms.find((candidate) => candidate.id === agent.roomId)
}

function GodChatIcon({ agent, active = false, onOpen }: { agent: OlympusAgentInstance; active?: boolean; onOpen: (agent: OlympusAgentInstance) => void }) {
  const color = agentStateColor(warRoomOpsState.agents.find((candidate) => candidate.id === agent.id)?.state)
  const room = agentRoom(agent)
  const visualScale = normalizedGodScale(agent.id)
  return (
    <button
      type="button"
      onClick={() => onOpen(agent)}
      className={`group relative grid h-[54px] w-[54px] place-items-center rounded-2xl border bg-black/62 shadow-[0_15px_32px_rgba(0,0,0,.62)] backdrop-blur-md transition hover:-translate-x-1 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-100 ${active ? 'border-cyan-100/80' : 'border-amber-100/22'}`}
      style={{ boxShadow: `0 0 22px ${color}33, 0 15px 32px rgba(0,0,0,.62)` }}
      aria-label={`Open chat popup with ${agent.name}`}
      title={`${agent.name} • ${room?.name ?? agent.role}`}
    >
      <span className="absolute inset-[-5px] rounded-[22px] border opacity-65" style={{ borderColor: color }} />
      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-black/70" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      <img src={`${agent.idleFrame ?? agent.spriteSheet}?v=${GOD_CHAT_ASSET_VERSION}`} alt="" className="relative z-10 h-10 w-10 object-contain [image-rendering:pixelated] drop-shadow-[0_8px_10px_rgba(0,0,0,.82)]" style={{ transform: `scale(${visualScale})` }} draggable={false} />
      <span className="pointer-events-none absolute right-[68px] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-amber-100/18 bg-black/82 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] text-amber-50 shadow-[0_12px_24px_rgba(0,0,0,.55)] group-hover:block group-focus:block">
        {agent.name}
      </span>
    </button>
  )
}

function GodChatRail({ room, onOpen, activeAgentId }: { room?: OlympusRoom; onOpen: (agent: OlympusAgentInstance) => void; activeAgentId?: string }) {
  const agents = room?.agents.length ? room.agents : olympusGameManifest.rooms.flatMap((candidate) => candidate.agents)
  return (
    <div className="pointer-events-auto flex max-h-[calc(100vh-118px)] flex-col items-end gap-1.5 overflow-visible rounded-[28px] border border-amber-100/16 bg-black/34 p-1.5 shadow-[0_20px_44px_rgba(0,0,0,.55)] backdrop-blur-md">
      <div className="px-1 pb-1 text-right text-[8px] font-black uppercase tracking-[.22em] text-cyan-100/76">God chat</div>
      {agents.map((candidate) => <GodChatIcon key={candidate.id} agent={candidate} active={candidate.id === activeAgentId} onOpen={onOpen} />)}
    </div>
  )
}

function GodChatPopup({ agent, onClose }: { agent: OlympusAgentInstance | null; onClose: () => void }) {
  if (!agent) return null
  const sessionId = agentChatSessionId(agent.id)
  const room = agentRoom(agent)
  const visualScale = normalizedGodScale(agent.id)
  return (
    <div className="fixed inset-0 isolate z-[190] flex items-center justify-center px-5 py-6" data-war-room-god-chat="open">
      <button type="button" aria-label="Close god chat backdrop" onClick={onClose} className="absolute inset-0 bg-black/68 backdrop-blur-[5px]" />
      <section className="relative z-10 grid h-[min(82vh,820px)] w-[min(980px,88vw)] grid-rows-[auto_1fr] overflow-hidden rounded-[34px] border border-cyan-100/24 bg-[linear-gradient(135deg,rgba(6,8,16,.96),rgba(32,18,42,.94)_55%,rgba(7,18,24,.96))] shadow-[0_35px_90px_rgba(0,0,0,.78),inset_0_0_60px_rgba(103,232,249,.08)]">
        <header className="flex items-center gap-4 border-b border-amber-100/12 bg-black/32 px-5 py-4">
          <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-amber-100/25 bg-black/62">
            <img src={`${agent.idleFrame ?? agent.spriteSheet}?v=${GOD_CHAT_ASSET_VERSION}`} alt="" className="h-12 w-12 object-contain [image-rendering:pixelated] drop-shadow-[0_8px_10px_rgba(0,0,0,.8)]" style={{ transform: `scale(${visualScale})` }} draggable={false} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[.28em] text-cyan-100/70">Dedicated god chat • {sessionId}</p>
            <h2 className="truncate font-serif text-3xl font-black leading-none text-[#ffeeb0]">{agent.name}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-amber-50/70">{agent.role} • {room?.name ?? 'Olympus'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-amber-100/25 bg-amber-200/10 px-4 py-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-50 transition hover:bg-amber-200 hover:text-black focus:outline-none focus:ring-2 focus:ring-amber-100">
            Close ✕
          </button>
        </header>
        <div className="min-h-0 overflow-hidden bg-[#05070d]">
          <ChatScreen activeFriendlyId={sessionId} forcedSessionKey={sessionId} compact embedded />
        </div>
      </section>
    </div>
  )
}

function RoomTitlePlaque({ eyebrow, title, compact = false }: { eyebrow: string; title: string; compact?: boolean }) {
  return (
    <div className={`relative grid place-items-center text-center drop-shadow-[0_18px_28px_rgba(0,0,0,.72)] ${compact ? 'h-[70px] w-[min(520px,58vw)]' : 'h-[86px] w-[min(700px,68vw)]'}`}>
      <img src={ROOM_TITLE_PLAQUE} alt="" className="absolute inset-0 h-full w-full object-fill opacity-95" draggable={false} />
      <div className="relative z-10 px-10 pb-1">
        <p className="text-[9px] font-black uppercase tracking-[0.26em] text-emerald-100/76">{eyebrow}</p>
        <h1 className={`font-serif font-black leading-none text-[#ffeeb0] ${compact ? 'text-2xl md:text-3xl' : 'text-3xl md:text-5xl'}`}>{title}</h1>
      </div>
    </div>
  )
}

function stateColor(roomId: string) {
  const state = mapMarkerState(roomId)
  if (state === 'approval') return '#fbbf24'
  if (state === 'working') return '#67e8f9'
  if (state === 'queued') return '#a7f3d0'
  return '#fef3c7'
}

function agentStateColor(state: WarRoomAgentState | undefined) {
  if (state === 'needs-approval') return '#fbbf24'
  if (state === 'working') return '#67e8f9'
  if (state === 'thinking') return '#c4b5fd'
  if (state === 'blocked') return '#f87171'
  if (state === 'done') return '#86efac'
  return '#fef3c7'
}

function liveStationForRoom(roomId: string) {
  const room = olympusGameManifest.rooms.find((candidate) => candidate.id === roomId)
  if (!room) return null
  const summary = roomOpsSummary(roomId)
  const priorityStep = [...summary.workflowSteps]
    .sort((a, b) => {
      const weight = { active: 0, locked: 1, waiting: 2, done: 3 } as const
      return weight[a.state] - weight[b.state]
    })
    .find((step) => step.stationId && step.state !== 'done')
  if (priorityStep?.stationId && room.stations.some((station) => station.id === priorityStep.stationId)) return priorityStep.stationId
  if (summary.needsApproval) return room.stations.find((station) => station.kind === 'approval')?.id ?? null
  if (summary.queueTotal > 0) return room.stations[0]?.id ?? null
  return room.stations[0]?.id ?? null
}

function liveRoomLine(room: OlympusRoom) {
  const summary = roomOpsSummary(room.id)
  return summary.activeAgent?.line ?? `${room.name} ready for live data`
}

function OlympusEnvironmentField() {
  const command = realmMapHotspots.find((spot) => spot.roomId === 'olympus-command')
  if (!command) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {realmMapHotspots.filter((spot) => spot.roomId !== 'olympus-command').map((spot, index) => {
          const color = stateColor(spot.roomId)
          const routePath = `M ${command.x} ${command.y} C ${(command.x + spot.x) / 2} ${Math.min(command.y, spot.y) - 9}, ${(command.x + spot.x) / 2} ${Math.max(command.y, spot.y) + 9}, ${spot.x} ${spot.y}`
          return (
            <g key={`route-${spot.roomId}`}>
              <path d={routePath} fill="none" stroke={color} strokeWidth="0.16" strokeLinecap="round" strokeDasharray="1.1 3.2" opacity="0.18" />
              <circle r="0.62" fill={color} opacity="0.62">
                <animateMotion dur={`${11 + index}s`} repeatCount="indefinite" path={routePath} />
              </circle>
            </g>
          )
        })}
      </svg>
      {realmMapHotspots.map((spot) => {
        const summary = roomOpsSummary(spot.roomId)
        const room = olympusGameManifest.rooms.find((candidate) => candidate.id === spot.roomId)
        const agentName = summary.activeAgent?.name ?? room?.agents.at(0)?.name ?? spot.label
        const state = summary.activeAgent?.state
        const color = agentStateColor(state)
        return (
          <div
            key={`live-god-${spot.roomId}`}
            className="absolute z-[19] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-black/52 shadow-[0_0_18px_rgba(0,0,0,.75)]"
            style={{ left: `${Math.min(94, spot.x + 5)}%`, top: `${Math.max(6, spot.y - 7)}%`, borderColor: color, boxShadow: `0 0 18px ${color}66` }}
            title={`${agentName} • ${state}`}
          >
            <span className="absolute inset-[-8px] rounded-full border opacity-55 animate-ping" style={{ borderColor: color }} />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: color, boxShadow: `0 0 14px ${color}` }} />
          </div>
        )
      })}
    </div>
  )
}

function RoomEnvironmentField({ room, activeStation }: { room: OlympusRoom; activeStation: OlympusStation | null }) {
  if (!activeStation || room.id === 'oracle') return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden">
      <svg className="absolute inset-0 h-full w-full opacity-70 mix-blend-screen" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={`M 50 76 C ${activeStation.position.x * 0.86} ${Math.min(86, activeStation.position.y + 14)}, ${activeStation.position.x * 1.05} ${Math.max(18, activeStation.position.y - 10)}, ${activeStation.position.x} ${activeStation.position.y}`}
          fill="none"
          stroke="rgba(251, 191, 36, .42)"
          strokeWidth="0.22"
          strokeLinecap="round"
          strokeDasharray="1 2.4"
        />
      </svg>
    </div>
  )
}

function councilPathSnapshot(path: Array<OlympusPoint>, phase: number) {
  if (!path.length) return { point: { x: 50, y: 50 }, from: { x: 50, y: 50 }, to: { x: 50, y: 50 }, local: 0 }
  const wrapped = ((phase % 1) + 1) % 1
  const scaled = wrapped * path.length
  const index = Math.floor(scaled) % path.length
  const next = (index + 1) % path.length
  const local = scaled - index
  const eased = easeInOutSine(local)
  return {
    point: {
      x: path[index].x + (path[next].x - path[index].x) * eased,
      y: path[index].y + (path[next].y - path[index].y) * eased,
    },
    from: path[index],
    to: path[next],
    local,
  }
}

function councilPointOnPath(path: Array<OlympusPoint>, phase: number) {
  return councilPathSnapshot(path, phase).point
}

function councilFacingFromVector(from: OlympusPoint, to: OlympusPoint): CouncilFacingDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const angle = Math.atan2(dx, -dy) * 180 / Math.PI
  if (angle >= -22.5 && angle < 22.5) return 'n'
  if (angle >= 22.5 && angle < 67.5) return 'ne'
  if (angle >= 67.5 && angle < 112.5) return 'e'
  if (angle >= 112.5 && angle < 157.5) return 'se'
  if (angle >= 157.5 || angle < -157.5) return 's'
  if (angle >= -157.5 && angle < -112.5) return 'sw'
  if (angle >= -112.5 && angle < -67.5) return 'w'
  return 'nw'
}

function councilLocalActionVariant(direction: CouncilFacingDirection): 'west' | 'east' {
  return direction === 'e' || direction === 'ne' || direction === 'se' ? 'east' : 'west'
}

function CouncilAgentChatPopup({ legend, onClose }: { legend: CouncilLegend | null; onClose: () => void }) {
  if (!legend) return null
  const sessionId = `war-room-council-${legend.id}`
  return (
    <div className="fixed inset-0 isolate z-[195] flex items-center justify-center px-5 py-6" data-war-room-council-agent-chat="open">
      <button type="button" aria-label="Close council agent chat backdrop" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-[5px]" />
      <section className="relative z-10 grid h-[min(82vh,820px)] w-[min(980px,88vw)] grid-rows-[auto_1fr] overflow-hidden rounded-[34px] border border-amber-100/28 bg-[linear-gradient(135deg,rgba(7,7,10,.97),rgba(42,28,10,.95)_55%,rgba(5,16,20,.97))] shadow-[0_35px_90px_rgba(0,0,0,.82),inset_0_0_60px_rgba(251,191,36,.08)]">
        <header className="flex items-center gap-4 border-b border-amber-100/14 bg-black/36 px-5 py-4">
          <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-amber-100/25 bg-black/66">
            <img src={`/war-room/council/locked-style/v1/live/${legend.id}-speak.png?v=${COUNCIL_ASSET_VERSION}`} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated] drop-shadow-[0_10px_14px_rgba(0,0,0,.85)]" draggable={false} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[.28em] text-amber-100/70">Dedicated council AI agent • {sessionId}</p>
            <h2 className="truncate font-serif text-3xl font-black leading-none text-[#ffeeb0]">{legend.name}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-amber-50/70">Historical council strategist • {legend.virtue}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-amber-100/25 bg-amber-200/10 px-4 py-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-50 transition hover:bg-amber-200 hover:text-black focus:outline-none focus:ring-2 focus:ring-amber-100">
            Close ✕
          </button>
        </header>
        <div className="min-h-0 overflow-hidden bg-[#05070d]">
          <ChatScreen activeFriendlyId={sessionId} forcedSessionKey={sessionId} compact embedded />
        </div>
      </section>
    </div>
  )
}

function CouncilLegendSprite({ legend, state, speaking, direction = 's' }: { legend: CouncilLegend; state: CouncilAnimationState; speaking: boolean; direction?: CouncilFacingDirection }) {
  const useChairStill = state === 'sit' || state === 'vote'
  const frames = useChairStill ? 1 : legend.frames[state]
  const duration = state === 'walk' ? Math.max(760, frames * 120) : Math.max(980, frames * 160)
  const hasDirectionalWalk = state === 'walk' && (legend.id === 'hannibal' || legend.id === 'caesar' || legend.id === 'alexander' || legend.id === 'napoleon' || legend.id === 'saladin' || legend.id === 'genghis')
  const hasMirroredLocalAction = (state === 'ponder' || state === 'speak') && (legend.id === 'hannibal' || legend.id === 'caesar' || legend.id === 'alexander') && councilLocalActionVariant(direction) === 'east'
  const stripName = hasDirectionalWalk
    ? `${legend.id}-walk-${direction}-strip`
    : hasMirroredLocalAction
      ? `${legend.id}-${state}-east-strip`
      : `${legend.id}-${state}-strip`
  const assetName = useChairStill ? `${legend.id}-${state}-still` : stripName
  return (
    <span className="council-sprite-viewport relative block h-24 w-24 overflow-hidden" data-council-facing={direction} data-council-action-variant={hasMirroredLocalAction ? 'east' : 'west'} style={{ transform: `scale(${legend.scale})` }}>
      <img
        src={`/war-room/council/locked-style/v1/live/${assetName}.png?v=${COUNCIL_ASSET_VERSION}`}
        alt=""
        className={`council-sprite-strip council-sprite-strip-${frames} absolute left-0 top-0 h-full max-w-none object-fill [image-rendering:pixelated] ${useChairStill ? '' : 'drop-shadow-[0_13px_12px_rgba(0,0,0,.88)]'}`}
        style={{ width: `${frames * 100}%`, animationDuration: `${duration}ms`, filter: speaking && !useChairStill ? 'drop-shadow(0 0 14px rgba(255,238,176,.76))' : undefined }}
        draggable={false}
      />
    </span>
  )
}

function CouncilSeatChairLayer({ meeting }: { meeting: boolean }) {
  if (meeting) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[92]" data-war-room-council-empty-chairs="ambient-seat-anchors">
      {COUNCIL_LEGENDS.map((legend) => {
        const depth = 58 + Math.round(legend.seat.y)
        return (
          <img
            key={`empty-chair-${legend.id}`}
            src={`/war-room/council/chairs/${legend.id}-empty-chair.png?v=${COUNCIL_ASSET_VERSION}`}
            alt=""
            className="absolute h-20 w-20 -translate-x-1/2 -translate-y-[58%] object-contain [image-rendering:pixelated] drop-shadow-[0_14px_16px_rgba(0,0,0,.82)]"
            style={{ left: `${legend.seat.x}%`, top: `${legend.seat.y}%`, zIndex: depth }}
            draggable={false}
          />
        )
      })}
    </div>
  )
}

function CouncilLegendLayer({ meeting, onOpenAgent }: { meeting: boolean; onOpenAgent: (legend: CouncilLegend) => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 240)
    return () => window.clearInterval(id)
  }, [])

  const speakerIndex = meeting ? Math.floor(now / 3600) % COUNCIL_LEGENDS.length : -1

  return (
    <div className="pointer-events-none absolute inset-0 z-[120]" data-war-room-council-layer="main-room-seven-real-ai-agents">
      <style>{`
        @keyframes council-strip-6 { from { transform: translateX(0); } to { transform: translateX(-83.333333%); } }
        @keyframes council-strip-16 { from { transform: translateX(0); } to { transform: translateX(-93.75%); } }
        .council-sprite-strip-6 { animation: council-strip-6 steps(5, end) infinite; }
        .council-sprite-strip-16 { animation: council-strip-16 steps(15, end) infinite; }
        /* DLV liked the Hannibal model, but the long chair strip looked jittery in-room.
           Keep seated/debate frames stable until the chair package is re-QA'd as a separate pass. */
        .council-sprite-strip-18 { animation: none; }
      `}</style>
      <CouncilSeatChairLayer meeting={meeting} />
      {COUNCIL_LEGENDS.map((legend, index) => {
        const phase = (now + legend.delay) / legend.speedMs
        const snapshot = councilPathSnapshot(legend.roamPath, phase)
        const direction = councilFacingFromVector(snapshot.from, snapshot.to)
        const ambientMode = snapshot.local > 0.74 ? 'speak' : snapshot.local > 0.58 ? 'ponder' : 'walk'
        const speaking = meeting && index === speakerIndex
        const state = meeting ? (speaking ? 'vote' : 'sit') : ambientMode
        const point = meeting ? legend.seat : snapshot.point
        const depth = 74 + Math.round(point.y)
        return (
          <button
            type="button"
            key={legend.id}
            className="group pointer-events-auto absolute flex -translate-x-1/2 -translate-y-[82%] flex-col items-center transition-transform duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-100/80"
            style={{ left: `${point.x}%`, top: `${point.y}%`, zIndex: depth }}
            title={`${legend.name} • ${legend.virtue} • open council AI agent`}
            aria-label={`Open council AI agent ${legend.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onOpenAgent(legend)
            }}
          >
            <span className="absolute left-1/2 top-[82%] h-4 w-14 -translate-x-1/2 rounded-full bg-black/72 blur-md" />
          <CouncilLegendSprite legend={legend} state={state} speaking={speaking} direction={direction} />
            <span className="mt-[-8px] rounded-full border border-amber-100/18 bg-black/72 px-2 py-0.5 text-[7px] font-black uppercase tracking-[.12em] text-amber-50/88 opacity-0 shadow-[0_10px_18px_rgba(0,0,0,.62)] transition group-hover:opacity-100 group-focus:opacity-100">
              {legend.name} • {state}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StationWorkCue({ station, working }: { station: OlympusStation | null; working: boolean }) {
  if (!station || !working) return null
  const x = station.position.x
  const y = station.position.y - station.size.h * 0.1
  const kind = station.kind
  return (
    <div className="pointer-events-none absolute inset-0 z-[43]" aria-hidden="true">
      <style>{`
        @keyframes olympus-spark-rise { 0% { transform: translate3d(-50%, 0, 0) scale(.72); opacity: 0; } 18% { opacity: .95; } 100% { transform: translate3d(-50%, -34px, 0) scale(1.18); opacity: 0; } }
        @keyframes olympus-seal-breathe { 0%,100% { transform: translate(-50%, -50%) scale(.80); opacity: .26; } 50% { transform: translate(-50%, -50%) scale(1.04); opacity: .54; } }
        @keyframes olympus-scan-sweep { 0% { transform: translate(-50%, -62%) rotate(-8deg); opacity: 0; } 20% { opacity: .72; } 100% { transform: translate(-50%, 10%) rotate(8deg); opacity: 0; } }
      `}</style>
      {kind === 'approval' ? (
        <span
          className="absolute rounded-full border border-emerald-100/46 bg-emerald-300/6 shadow-[0_0_24px_rgba(110,231,183,.36)]"
          style={{ left: `${x}%`, top: `${y}%`, width: `${station.size.w * 0.56}%`, height: `${Math.max(5, station.size.h * 0.42)}%`, animation: 'olympus-seal-breathe 2400ms ease-in-out infinite' }}
        />
      ) : kind === 'sorting' || kind === 'listing' ? (
        <span
          className="absolute h-[20%] w-[2.2%] origin-top rounded-full bg-gradient-to-b from-cyan-100/0 via-cyan-100/55 to-cyan-100/0 blur-[1px]"
          style={{ left: `${x}%`, top: `${Math.max(18, y - 7)}%`, animation: 'olympus-scan-sweep 1900ms ease-in-out infinite' }}
        />
      ) : (
        <>
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={`spark-${station.id}-${index}`}
              className="absolute h-1.5 w-1.5 rounded-full bg-amber-100 shadow-[0_0_12px_rgba(251,191,36,.92)]"
              style={{
                left: `${x + (index - 2) * 1.9}%`,
                top: `${y + (index % 2) * 2}%`,
                animation: `olympus-spark-rise 1300ms ease-out ${index * 170}ms infinite`,
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}

function PacketActionLayer({ packet, station, agent, walking, phase }: { packet: WarRoomWorkflowPacket | null; station: OlympusStation | null; agent: OlympusAgentInstance; walking: boolean; phase: LivingPacketPhase }) {
  if (!packet || !station) return null
  const progress = phase === 'queued' ? 18 : phase === 'routing' ? 44 : phase === 'working' ? 72 : 96
  const phaseMeta = phase === 'queued'
    ? { label: 'Packet queued', verb: 'sealed in Atlantis', tone: 'rgba(125,211,252,.88)' }
    : phase === 'routing'
      ? { label: 'Route locked', verb: 'Hermes tracing the handoff lane', tone: 'rgba(45,212,191,.9)' }
      : phase === 'working'
        ? { label: 'Tool is working', verb: `${agent.name} is building the station output`, tone: 'rgba(251,191,36,.92)' }
        : { label: 'Handoff ready', verb: 'cockpit opening with packet context', tone: 'rgba(110,231,183,.92)' }
  const actionLine = walking
    ? `${agent.name} carrying packet to ${station.name}`
    : phase === 'queued'
      ? `Packet queued for ${station.name}`
      : phase === 'routing'
        ? `Routing proof chain into ${station.name}`
        : phase === 'handoff-ready'
          ? `Handoff ready — opening ${station.name}`
          : `${agent.name} forging output at ${station.name}`
  const from = agent.position
  const to = station.operatorSpot
  const tool = station.position
  const pathToOperator = `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 12}, ${(from.x + to.x) / 2} ${Math.max(from.y, to.y) + 8}, ${to.x} ${to.y}`
  const pathToTool = `M ${to.x} ${to.y} C ${(to.x + tool.x) / 2} ${Math.min(to.y, tool.y) - 8}, ${(to.x + tool.x) / 2} ${Math.max(to.y, tool.y) + 7}, ${tool.x} ${tool.y}`
  const safePacketId = packet.id.replace(/[^a-z0-9_-]/gi, '-')
  const dockRight = station.position.x < 58
  const consoleStyle = dockRight
    ? { right: '1rem', top: '.95rem' }
    : { left: '1rem', top: '.95rem' }
  const docketStyle = dockRight
    ? { right: '1.2rem', bottom: '1.15rem' }
    : { left: '1.2rem', bottom: '1.15rem' }
  const toolLabelStyle = {
    left: `${Math.min(78, Math.max(12, station.position.x + (station.position.x > 58 ? -10 : 10)))}%`,
    top: `${Math.min(82, Math.max(14, station.position.y - 6))}%`,
  }
  const steps: Array<LivingPacketPhase> = ['queued', 'routing', 'working', 'handoff-ready']
  const phaseIndex = steps.indexOf(phase)
  return (
    <div className="pointer-events-none absolute inset-0 z-[46]" data-living-agent-action-layer="true" data-living-packet-phase={phase} data-living-packet-artifact={packet.artifactType}>
      <style>{`
        @keyframes packet-action-orbit { 0% { transform: translate(-50%, -50%) rotate(0deg) scale(.96); opacity: .45; } 50% { opacity: .88; } 100% { transform: translate(-50%, -50%) rotate(360deg) scale(.96); opacity: .45; } }
        @keyframes packet-action-pulse { 0%,100% { transform: translate(-50%, -50%) scale(.92); opacity: .16; } 50% { transform: translate(-50%, -50%) scale(1.2); opacity: .50; } }
        @keyframes packet-tool-breathe { 0%,100% { transform: translate(-50%, -50%) scale(.76); filter: blur(1.2px); opacity: .25; } 50% { transform: translate(-50%, -50%) scale(1.34); filter: blur(0); opacity: .78; } }
        @keyframes packet-docket-rise { 0% { transform: translate3d(0,8px,0) scale(.98); opacity: 0; } 100% { transform: translate3d(0,0,0) scale(1); opacity: 1; } }
        @keyframes packet-step-glow { 0%,100% { box-shadow: 0 0 0 rgba(34,211,238,0); } 50% { box-shadow: 0 0 22px rgba(34,211,238,.28); } }
        @keyframes packet-crystal-roll { 0% { transform: rotate(-8deg) scale(.92); } 50% { transform: rotate(8deg) scale(1.06); } 100% { transform: rotate(-8deg) scale(.92); } }
      `}</style>
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-war-room-packet-trail="true">
        <defs>
          <filter id={`packet-glow-${safePacketId}`} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="1.25" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id={`packet-route-${safePacketId}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(125,211,252,.18)" />
            <stop offset="48%" stopColor="rgba(34,211,238,.68)" />
            <stop offset="100%" stopColor="rgba(251,191,36,.58)" />
          </linearGradient>
        </defs>
        <path d={pathToOperator} fill="none" stroke={`url(#packet-route-${safePacketId})`} strokeWidth=".48" strokeLinecap="round" strokeDasharray="1.2 1.7" filter={`url(#packet-glow-${safePacketId})`} />
        <path d={pathToOperator} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".08" strokeLinecap="round" strokeDasharray=".28 2.8" />
        <path d={pathToTool} fill="none" stroke="rgba(251,191,36,.66)" strokeWidth=".34" strokeLinecap="round" strokeDasharray=".8 1.45" filter={`url(#packet-glow-${safePacketId})`} />
        <circle r=".92" fill="rgba(125,211,252,.96)" filter={`url(#packet-glow-${safePacketId})`}>
          <animateMotion dur="1500ms" repeatCount="indefinite" path={pathToOperator} />
        </circle>
        <circle r=".56" fill="rgba(252,211,77,.98)" filter={`url(#packet-glow-${safePacketId})`}>
          <animateMotion dur="1080ms" begin="360ms" repeatCount="indefinite" path={pathToTool} />
        </circle>
        <image href={packetAsset(packet.artifactType)} x="-2.9" y="-2.9" width="5.8" height="5.8" preserveAspectRatio="xMidYMid meet" data-war-room-moving-packet-object="true">
          <animateMotion dur="2450ms" repeatCount="indefinite" path={pathToOperator} />
        </image>
      </svg>

      <div
        className="absolute rounded-full border border-cyan-100/38 bg-cyan-300/10 shadow-[0_0_55px_rgba(34,211,238,.34),inset_0_0_32px_rgba(34,211,238,.11)]"
        data-war-room-station-packet-pulse="true"
        style={{ left: `${station.position.x}%`, top: `${station.position.y}%`, width: `${Math.max(8, station.size.w * 1.08)}%`, height: `${Math.max(8, station.size.h * 0.88)}%`, animation: 'packet-action-pulse 1800ms ease-in-out infinite' }}
      />
      <div
        className="absolute h-28 w-28 rounded-full border border-dashed border-amber-100/46 shadow-[0_0_32px_rgba(251,191,36,.28),inset_0_0_28px_rgba(251,191,36,.08)]"
        style={{ left: `${station.operatorSpot.x}%`, top: `${station.operatorSpot.y}%`, animation: 'packet-action-orbit 3800ms linear infinite' }}
      />
      <div
        className="absolute h-12 w-12 rounded-full bg-amber-200/24 shadow-[0_0_42px_rgba(251,191,36,.58)]"
        style={{ left: `${station.position.x}%`, top: `${station.position.y}%`, animation: 'packet-tool-breathe 1450ms ease-in-out infinite' }}
      />
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/28 bg-black/42 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] text-amber-50 shadow-[0_12px_28px_rgba(0,0,0,.42)] backdrop-blur-md"
        data-war-room-packet-target-plaque="true"
        style={toolLabelStyle}
      >
        target • {station.name}
      </div>

      <section
        className="absolute w-[min(370px,calc(100%-2rem))] rounded-[24px] border border-cyan-100/20 bg-[linear-gradient(135deg,rgba(1,10,18,.78),rgba(13,24,32,.72)_48%,rgba(54,32,7,.62))] p-3 text-cyan-50 shadow-[0_20px_55px_rgba(0,0,0,.56),inset_0_1px_0_rgba(255,255,255,.10)] backdrop-blur-xl"
        data-living-agent-action-console="true"
        style={{ ...consoleStyle, animation: 'packet-docket-rise 360ms ease-out both' }}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-100/18 bg-black/36 shadow-[inset_0_0_20px_rgba(34,211,238,.12)]">
            <img src={packetAsset(packet.artifactType)} alt="" className="h-7 w-7 object-contain drop-shadow-[0_0_14px_rgba(125,211,252,.42)]" style={{ animation: 'packet-crystal-roll 2200ms ease-in-out infinite' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-100/24 bg-emerald-300/12 px-3 py-1 text-[9px] font-black uppercase tracking-[.18em] text-emerald-50">live agent action</span>
              <span className="rounded-full border border-white/10 bg-white/7 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em]" style={{ color: phaseMeta.tone }}>{phaseMeta.label}</span>
            </div>
            <div className="mt-1.5 text-[15px] font-black leading-tight text-white">{actionLine}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[.13em] text-cyan-100/62">{phaseMeta.verb}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden="true">
          {steps.map((step, index) => {
            const active = step === phase
            const done = index <= phaseIndex
            return <div key={step} className={`h-1.5 rounded-full ${done ? 'bg-gradient-to-r from-cyan-200 to-amber-200' : 'bg-white/10'}`} style={active ? { animation: 'packet-step-glow 1200ms ease-in-out infinite' } : undefined} />
          })}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-amber-200 to-emerald-200 transition-all duration-700" style={{ width: `${progress}%` }} /></div>
      </section>

      <div
        className="absolute w-[min(340px,calc(100%-2.8rem))] rounded-[22px] border border-amber-100/16 bg-[linear-gradient(135deg,rgba(24,15,4,.74),rgba(3,12,20,.62))] p-3 text-cyan-50 shadow-[0_18px_45px_rgba(0,0,0,.58)] backdrop-blur-md"
        data-war-room-packet-docket="true"
        style={{ ...docketStyle, animation: 'packet-docket-rise 520ms ease-out both' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-black uppercase tracking-[.17em] text-amber-100/70">Atlantis packet docket</span>
          <span className="rounded-full border border-cyan-100/15 bg-cyan-300/8 px-2 py-0.5 text-[8px] font-black uppercase tracking-[.14em] text-cyan-100/70">{packet.state}</span>
        </div>
        <div className="mt-2 rounded-2xl border border-white/8 bg-black/24 p-2.5">
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-100/55">output</div>
          <div className="mt-1 line-clamp-2 text-[11px] font-bold leading-snug text-cyan-50/78">{packet.output}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-[.12em] text-white/58">
          <span>{packet.artifactType}</span><span>•</span><span>{packet.nextHandoff}</span><span>•</span><span>read-only</span>
        </div>
      </div>
    </div>
  )
}

type StationBadge = { id: string; label: string; state: string; tone: 'emerald' | 'amber' | 'red' | 'sky' | 'violet' }

function badgeTone(state: string): StationBadge['tone'] {
  if (state === 'done' || state === 'ready') return 'emerald'
  if (state === 'active' || state === 'draft') return 'sky'
  if (state === 'locked') return 'red'
  if (state === 'waiting') return 'amber'
  return 'violet'
}

function stationBadges(roomId: string, stationId: string): Array<StationBadge> {
  const steps = warRoomOpsState.workflowSteps.filter((step) => step.roomId === roomId && step.stationId === stationId)
  const artifacts = warRoomOpsState.artifacts.filter((artifact) => steps.some((step) => step.id === artifact.stepId))
  return [
    ...steps.map((step) => ({ id: step.id, label: step.shortLabel, state: step.state, tone: badgeTone(step.state) })),
    ...artifacts.map((artifact) => ({ id: artifact.id, label: artifact.label, state: artifact.state, tone: badgeTone(artifact.state) })),
  ]
}

function mapMarkerState(roomId: string) {
  const summary = roomOpsSummary(roomId)
  if (summary.needsApproval) return 'approval'
  if (summary.activeAgent?.state === 'working' || summary.activeAgent?.state === 'thinking') return 'working'
  if (summary.queueTotal > 0) return 'queued'
  return 'idle'
}

function dedupePath(points: Array<OlympusPoint>): Array<OlympusPoint> {
  return points.filter((point, index) => {
    const previous = points.at(index - 1)
    return !previous || Math.abs(previous.x - point.x) > 0.4 || Math.abs(previous.y - point.y) > 0.4
  })
}

function stationPath(room: OlympusRoom, station: OlympusStation | null, current: OlympusPoint, idlePoint: OlympusPoint): Array<OlympusPoint> {
  if (!station) return dedupePath([current, idlePoint])

  const authoredLane = room.navigation?.lanes?.[station.id]
  if (authoredLane?.length) return dedupePath([current, ...authoredLane])

  const target = station.operatorSpot
  const dx = target.x - current.x
  const dy = target.y - current.y
  const distance = pointDistance(current, target)

  if (distance < 12) return dedupePath([current, target])

  // Route like an isometric game character: stay on the open floor near the current Y,
  // then approach the tool from its operator side. Do not snap back through room center.
  const horizontalFirst = Math.abs(dx) > Math.abs(dy)
  const bend = horizontalFirst
    ? { x: current.x + dx * 0.58, y: current.y + dy * 0.18 }
    : { x: current.x + dx * 0.24, y: current.y + dy * 0.62 }

  return dedupePath([
    current,
    {
      x: Math.max(18, Math.min(82, bend.x)),
      y: Math.max(34, Math.min(82, bend.y)),
    },
    target,
  ])
}

function pointDistance(a: OlympusPoint, b: OlympusPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

type WalkDirection = 'down' | 'up' | 'left' | 'right'

function walkDirection(from: OlympusPoint, to: OlympusPoint): WalkDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy) * 1.15) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

function movementFacingAngle(from: OlympusPoint, to: OlympusPoint) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.hypot(dx, dy) < 0.01) return 0
  // Current overhead god strips are authored facing up/north. CSS rotation that
  // matches the live room is up=0deg, right=90deg, down=180deg, left=-90deg.
  const angle = Math.atan2(dx, -dy) * (180 / Math.PI)
  return Math.abs(angle + 180) < 0.001 ? 180 : angle
}

function pointAtDistance(path: Array<OlympusPoint>, distance: number) {
  if (path.length < 2) return path[0] ?? { x: 50, y: 66 }
  let remaining = distance
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const segmentLength = Math.max(0.01, pointDistance(from, to))
    if (remaining <= segmentLength) {
      const t = remaining / segmentLength
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      }
    }
    remaining -= segmentLength
  }
  return path[path.length - 1]
}

function roomPatrolPoints(room: OlympusRoom, idlePoint: OlympusPoint): Array<OlympusPoint> {
  const authored = room.agents[0]?.patrolPoints?.filter(Boolean) ?? []
  if (authored.length >= 2) return authored

  const stationSpots = room.stations
    .map((station) => station.operatorSpot)
    .filter((point) => point.x >= 22 && point.x <= 78 && point.y >= 38 && point.y <= 82)

  if (stationSpots.length >= 3) return stationSpots

  return [
    { x: Math.max(32, idlePoint.x - 9), y: Math.max(48, idlePoint.y - 5) },
    { x: Math.min(68, idlePoint.x + 10), y: Math.max(48, idlePoint.y - 4) },
    { x: Math.min(70, idlePoint.x + 8), y: Math.min(80, idlePoint.y + 8) },
    { x: Math.max(30, idlePoint.x - 10), y: Math.min(80, idlePoint.y + 7) },
  ]
}

export function WarRoomGame() {
  const rooms = olympusGameManifest.rooms
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [activeStationId, setActiveStationId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [speechStep, setSpeechStep] = useState(0)
  const [agentPosition, setAgentPosition] = useState<OlympusPoint>({ x: 50, y: 66 })
  const [agentWalking, setAgentWalking] = useState(false)
  const [agentDirection, setAgentDirection] = useState<WalkDirection>('down')
  const [agentFacingAngle, setAgentFacingAngle] = useState(0)
  const [liveStatus, setLiveStatus] = useState<LiveWarRoomStatus | null>(null)
  const [roomDetail, setRoomDetail] = useState<WarRoomRoomDetailResponse | null>(null)
  const [productIntel, setProductIntel] = useState<ProductIntelligenceData | null>(null)
  const [archiveIntel, setArchiveIntel] = useState<WarRoomArchiveApiData | null>(null)
  const [productIntelLoading, setProductIntelLoading] = useState(false)
  const [productIntelError, setProductIntelError] = useState<string | null>(null)
  const [productIntelRefreshKey, setProductIntelRefreshKey] = useState(0)
  const [liveStatusError, setLiveStatusError] = useState<string | null>(null)
  const [liveSyncPulse, setLiveSyncPulse] = useState(0)
  const [focusedWorkflowPacket, setFocusedWorkflowPacket] = useState<WarRoomWorkflowPacket | null>(null)
  const [livingPacketPhase, setLivingPacketPhase] = useState<LivingPacketPhase>('queued')
  const [chatAgent, setChatAgent] = useState<OlympusAgentInstance | null>(null)
  const [councilAgent, setCouncilAgent] = useState<CouncilLegend | null>(null)
  const [ambientToolId, setAmbientToolId] = useState<string | null>(null)
  const movementFrame = useRef<number | null>(null)
  const patrolTimer = useRef<number | null>(null)
  const packetDialogTimer = useRef<number | null>(null)
  const packetPhaseTimers = useRef<Array<number>>([])
  const patrolIndex = useRef(0)
  const agentPositionRef = useRef<OlympusPoint>({ x: 50, y: 66 })

  const selectedRoom = useMemo(
    () => rooms.find((candidate) => candidate.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  )
  const room = selectedRoom
  const agent = room?.agents[0] ?? null
  const activeStation = useMemo(
    () => room?.stations.find((station) => station.id === activeStationId) ?? null,
    [activeStationId, room?.stations],
  )
  const idlePoint = agent?.position ?? { x: 50, y: 66 }
  const target = agentPosition
  const dialogLayout = activeStation ? olympusGameManifest.dialogLayouts[activeStation.dialogLayout] : null
  const opsLine = room ? liveRoomLine(room) : null
  const currentLiveRoom = room ? liveRoomStatus(liveStatus, room.id) : null
  const currentLiveFeed = room
    ? roomDetail?.room?.uiRoomId === room.id
      ? roomDetail.feed
      : liveRoomFeed(liveStatus, room.id)
    : []
  const currentLinks = room ? ROOM_WORKSPACE_LINKS[room.id] ?? [] : []
  const currentIntelLine = roomIntelLine(currentLiveRoom)
  const godProfile = agent ? godIntelligenceForAgent(agent.id) : null
  const godAdvisor = agent && godProfile ? {
    name: agent.name,
    rolePrompt: godProfile.rolePrompt,
    suggestions: suggestionsForStation(agent.id, activeStation?.id),
  } : null
  const stationWorkflowSteps = room && activeStation ? workflowStepsForStation(room.id, activeStation.id) : []
  const visibleWorkflowPackets = effectiveWorkflowPackets(liveStatus)
  const stationWorkflowPackets = room
    ? (() => {
      const roomId = room.id
      return roomDetail?.room?.uiRoomId === roomId
        ? roomDetail.workflowPackets
        : visibleWorkflowPackets.filter((packet) => packetUiRoom(packet.targetRoomId) === roomId || packetUiRoom(packet.sourceRoomId) === roomId)
    })()
    : []
  const speechLines = activeStation
    ? [
      focusedWorkflowPacket ? `Working from Atlantis packet: ${focusedWorkflowPacket.title}.` : null,
      focusedWorkflowPacket ? `Building output: ${focusedWorkflowPacket.output}` : null,
      focusedWorkflowPacket ? `Next handoff: ${focusedWorkflowPacket.nextHandoff}` : null,
      opsLine,
      ...(godAdvisor?.suggestions.map((item) => item.text) ?? []),
      ...activeStation.statusLines,
    ].filter(Boolean) as Array<string>
    : [opsLine ?? agent?.speech ?? 'Select a realm or station.']
  const speech = speechLines[speechStep % speechLines.length] ?? speechLines[0]

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WAR_ROOM_WORLD_MEMORY_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { selectedRoomId?: string | null; activeStationId?: string | null }
      if (saved.selectedRoomId && rooms.some((candidate) => candidate.id === saved.selectedRoomId)) {
        setSelectedRoomId(saved.selectedRoomId)
        const savedRoom = rooms.find((candidate) => candidate.id === saved.selectedRoomId)
        // Tool-first rooms should not restore a selected tool from a prior tab,
        // otherwise the user's first click on that already-active tool opens the
        // cockpit immediately and hides the walk/work animation proof.
        if (!['agora', 'forge', 'pantheon-quarters', 'oracle', 'treasury', 'merchant-harbor', 'atlantis-vault'].includes(saved.selectedRoomId) && saved.activeStationId && savedRoom?.stations.some((station) => station.id === saved.activeStationId)) {
          setActiveStationId(saved.activeStationId)
        }
      }
    } catch {
      // Best-effort world memory only.
    }
    // load once after manifest is available
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(WAR_ROOM_WORLD_MEMORY_KEY, JSON.stringify({ selectedRoomId, activeStationId, lastSeenAt: Date.now() }))
    } catch {
      // Safe no-op when storage is unavailable.
    }
  }, [selectedRoomId, activeStationId])

  useEffect(() => {
    agentPositionRef.current = agentPosition
  }, [agentPosition])

  useEffect(() => {
    return () => {
      if (movementFrame.current) window.cancelAnimationFrame(movementFrame.current)
      if (patrolTimer.current) window.clearTimeout(patrolTimer.current)
      if (packetDialogTimer.current) window.clearTimeout(packetDialogTimer.current)
      packetPhaseTimers.current.forEach((timer) => window.clearTimeout(timer))
      packetPhaseTimers.current = []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let interval: number | null = null

    const refresh = async () => {
      try {
        const response = await fetch('/api/war-room-summary?limit=50', { credentials: 'same-origin' })
        if (!response.ok) throw new Error(`war-room-summary ${response.status}`)
        const payload = await response.json() as WarRoomSummaryResponse
        if (cancelled) return
        setLiveStatus(payload)
        setLiveStatusError(payload.sources.sessionError ?? null)
        setLiveSyncPulse((value) => value + 1)
      } catch (error) {
        if (cancelled) return
        setLiveStatusError(error instanceof Error ? error.message : String(error))
      }
    }

    void refresh()
    interval = window.setInterval(refresh, 15_000)
    return () => {
      cancelled = true
      if (interval) window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (selectedRoomId !== 'atlantis-vault') return
    let cancelled = false
    const refreshProductIntel = async () => {
      setProductIntelLoading(true)
      setProductIntelError(null)
      try {
        const [productResponse, archiveResponse] = await Promise.all([
          fetch('/api/product-intelligence?limit=12&min_score=35', { credentials: 'same-origin' }),
          fetch('/api/war-room-archive?roomId=atlantis-vault&limit=12', { credentials: 'same-origin' }),
        ])
        const payload = await productResponse.json() as ProductIntelligenceData
        const archivePayload = await archiveResponse.json() as WarRoomArchiveApiData
        if (cancelled) return
        setProductIntel(payload)
        setArchiveIntel(archivePayload)
        if (!productResponse.ok) setProductIntelError(payload.error ?? `product-intelligence ${productResponse.status}`)
        if (!archiveResponse.ok) setProductIntelError(archivePayload.error ?? `war-room-archive ${archiveResponse.status}`)
      } catch (error) {
        if (!cancelled) setProductIntelError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) setProductIntelLoading(false)
      }
    }
    void refreshProductIntel()
    return () => {
      cancelled = true
    }
  }, [selectedRoomId, productIntelRefreshKey])

  useEffect(() => {
    if (!room) {
      setRoomDetail(null)
      return
    }

    let cancelled = false
    const refreshRoomDetail = async () => {
      try {
        const response = await fetch(`/api/war-room-room-detail?roomId=${encodeURIComponent(room.id)}&limit=8`, { credentials: 'same-origin' })
        if (!response.ok) throw new Error(`war-room-room-detail ${response.status}`)
        const payload = await response.json() as WarRoomRoomDetailResponse
        if (cancelled) return
        setRoomDetail(payload)
        setLiveStatusError(payload.sources.sessionError ?? null)
      } catch (error) {
        if (cancelled) return
        setRoomDetail(null)
        setLiveStatusError(error instanceof Error ? error.message : String(error))
      }
    }

    void refreshRoomDetail()
    return () => {
      cancelled = true
    }
  }, [room?.id])

  useEffect(() => {
    if (!room || !agent) return
    if (movementFrame.current) window.cancelAnimationFrame(movementFrame.current)
    if (patrolTimer.current) window.clearTimeout(patrolTimer.current)
    agentPositionRef.current = agent.position
    patrolIndex.current = 0
    setAgentPosition(agent.position)
    setAgentWalking(false)
    setAgentDirection('down')
    setAgentFacingAngle(0)
  }, [room?.id])

  useEffect(() => {
    setAmbientToolId(null)
    if (room?.id !== 'olympus-command' || dialogOpen) return

    const cancellationState = new Set<'cancelled'>()
    let pulseTimer: number | null = null
    let clearTimer: number | null = null
    const commandToolIds = room.stations
      .filter((station) => station.id !== 'war-table')
      .map((station) => station.id)

    const schedulePulse = (delay = 58_000 + Math.round(Math.random() * 8_000)) => {
      pulseTimer = window.setTimeout(() => {
        if (cancellationState.has('cancelled') || commandToolIds.length === 0) return
        const available = commandToolIds.filter((id) => id !== activeStationId)
        const pool = available.length ? available : commandToolIds
        const next = pool[Math.floor(Math.random() * pool.length)]
        setAmbientToolId(next)
        clearTimer = window.setTimeout(() => {
          setAmbientToolId(null)
          if (!cancellationState.has('cancelled')) schedulePulse()
        }, 4_200)
      }, delay)
    }

    schedulePulse(24_000)
    return () => {
      cancellationState.add('cancelled')
      if (pulseTimer) window.clearTimeout(pulseTimer)
      if (clearTimer) window.clearTimeout(clearTimer)
      setAmbientToolId(null)
    }
  }, [room?.id, dialogOpen, activeStationId, room?.stations])

  useEffect(() => {
    if (!room || !agent || !activeStation) return
    if (movementFrame.current) window.cancelAnimationFrame(movementFrame.current)
    if (patrolTimer.current) window.clearTimeout(patrolTimer.current)

    const path = stationPath(room, activeStation, agentPositionRef.current, idlePoint)
    if (path.length < 2) return

    const totalDistance = path.slice(1).reduce((sum, point, index) => sum + pointDistance(path[index], point), 0)
    if (totalDistance < 0.15) {
      agentPositionRef.current = activeStation.operatorSpot
      setAgentPosition(activeStation.operatorSpot)
      setAgentDirection(walkDirection(activeStation.operatorSpot, activeStation.position))
      setAgentFacingAngle(movementFacingAngle(activeStation.operatorSpot, activeStation.position))
      setAgentWalking(false)
      return
    }

    const duration = room.id === 'treasury'
      ? Math.max(2600, Math.min(6200, totalDistance * 150))
      : Math.max(1050, Math.min(3600, totalDistance * 82))
    const startPoint = path[0]
    let started = 0
    let previousPoint = startPoint

    setAgentDirection(walkDirection(path[0], path[1]))
    setAgentFacingAngle(movementFacingAngle(path[0], path[1]))
    setAgentWalking(true)

    const tick = (now: number) => {
      if (!started) started = now
      const t = Math.min(1, (now - started) / duration)
      const eased = easeInOutSine(t)
      const nextPoint = pointAtDistance(path, totalDistance * eased)
      const moved = pointDistance(previousPoint, nextPoint)

      if (moved > 0.06) {
        setAgentDirection(walkDirection(previousPoint, nextPoint))
        setAgentFacingAngle(movementFacingAngle(previousPoint, nextPoint))
        previousPoint = nextPoint
      }

      agentPositionRef.current = nextPoint
      setAgentPosition(nextPoint)

      if (t >= 1) {
        const workFacing = movementFacingAngle(activeStation.operatorSpot, activeStation.position)
        agentPositionRef.current = activeStation.operatorSpot
        setAgentPosition(activeStation.operatorSpot)
        setAgentDirection(walkDirection(activeStation.operatorSpot, activeStation.position))
        setAgentFacingAngle(workFacing)
        setAgentWalking(false)
        movementFrame.current = null
        return
      }

      movementFrame.current = window.requestAnimationFrame(tick)
    }

    movementFrame.current = window.requestAnimationFrame(tick)
    return () => {
      if (movementFrame.current) window.cancelAnimationFrame(movementFrame.current)
      movementFrame.current = null
    }
  }, [room?.id, activeStation?.id])

  useEffect(() => {
    // Product-quality reset: no autonomous room patrol. The old idle patrol made
    // rooms feel laggy and random; movement now happens only after a user clicks
    // a station, so the interface stays calm and readable.
    return () => {
      if (patrolTimer.current) window.clearTimeout(patrolTimer.current)
      if (movementFrame.current) window.cancelAnimationFrame(movementFrame.current)
      patrolTimer.current = null
      movementFrame.current = null
    }
  }, [room?.id, activeStationId, dialogOpen])

  useEffect(() => {
    setSpeechStep(0)
    if (!activeStation) return
    const id = window.setInterval(() => setSpeechStep((step) => step + 1), 3600)
    return () => window.clearInterval(id)
  }, [activeStation?.id])

  const clearPacketActionTimers = () => {
    if (packetDialogTimer.current) window.clearTimeout(packetDialogTimer.current)
    packetDialogTimer.current = null
    packetPhaseTimers.current.forEach((timer) => window.clearTimeout(timer))
    packetPhaseTimers.current = []
  }

  const scheduleLivingPacketAction = (station: OlympusStation | null, openDelay = 3200) => {
    setLivingPacketPhase('queued')
    packetPhaseTimers.current = [
      window.setTimeout(() => setLivingPacketPhase('routing'), 260),
      window.setTimeout(() => setLivingPacketPhase('working'), 1250),
      window.setTimeout(() => setLivingPacketPhase('handoff-ready'), Math.max(1800, openDelay - 520)),
    ]
    packetDialogTimer.current = window.setTimeout(() => {
      setDialogOpen(Boolean(station))
      packetDialogTimer.current = null
    }, openDelay)
  }

  const openRoom = (roomId: string) => {
    clearPacketActionTimers()
    const destinationRoom = rooms.find((candidate) => candidate.id === roomId)
    const roomPacket = workflowPacketForUiRoom(roomId, visibleWorkflowPackets)
    const packetDestinationForRoom = roomPacket ? packetDestination(roomPacket) : null
    const station = destinationRoom && packetDestinationForRoom?.roomId === roomId && packetDestinationForRoom.stationId
      ? destinationRoom.stations.find((candidate) => candidate.id === packetDestinationForRoom.stationId) ?? null
      : null
    setSelectedRoomId(roomId)
    setActiveStationId(station?.id ?? (['agora', 'forge', 'oracle', 'treasury', 'merchant-harbor', 'atlantis-vault'].includes(roomId) ? null : liveStationForRoom(roomId)))
    setDialogOpen(false)
    setFocusedWorkflowPacket(roomPacket)
    if (roomPacket && station) scheduleLivingPacketAction(station, roomId === 'treasury' ? 5600 : 3000)
    setSpeechStep(0)
  }

  const openPacketDestination = (packet: WarRoomWorkflowPacket) => {
    clearPacketActionTimers()
    const destination = packetDestination(packet)
    const destinationRoom = rooms.find((candidate) => candidate.id === destination.roomId)
    if (!destinationRoom) return
    const station = destination.stationId
      ? destinationRoom.stations.find((candidate) => candidate.id === destination.stationId)
      : null
    setSelectedRoomId(destinationRoom.id)
    setActiveStationId(station?.id ?? null)
    setFocusedWorkflowPacket(packet)
    setDialogOpen(false)
    scheduleLivingPacketAction(station ?? null, destinationRoom.id === 'treasury' ? 5600 : 3200)
    setSpeechStep(0)
  }

  const selectStation = (station: OlympusStation) => {
    clearPacketActionTimers()
    // Tool-first rooms should not require a confusing second click. A station
    // click immediately routes the god state to that station and opens the
    // cockpit/tool surface. Autonomous patrol still runs while no dialog is open,
    // but user intent always wins and moves from the current live position.
    setActiveStationId(station.id)
    setFocusedWorkflowPacket(null)
    if (room?.id === 'treasury') {
      setDialogOpen(false)
      scheduleLivingPacketAction(station, 5600)
      return
    }
    setDialogOpen(true)
  }

  if (!room || !agent) {
    return (
      <main className="olympus-war-room-shell relative h-[calc(100dvh-28px)] overflow-hidden bg-[#03040a] text-[#ffeeb0]">
        <style>{`body:has(.olympus-war-room-shell) aside, body:has(.olympus-war-room-shell) button[aria-label='Open chat'], body:has(.olympus-war-room-shell) button[aria-label='Collapse navigation sidebar'], body:has(.olympus-war-room-shell) [data-tour='usage-meter'] { display: none !important; }`}</style>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(247,216,137,.18),transparent_34%),radial-gradient(circle_at_16%_72%,rgba(45,212,191,.14),transparent_28%),radial-gradient(circle_at_86%_68%,rgba(168,85,247,.14),transparent_30%),linear-gradient(180deg,#070710,#020309_68%,#010101)]" />
        <section className="relative z-10 flex h-full flex-col p-2 md:p-3">
          <div className="relative grid flex-1 place-items-stretch rounded-[32px] border border-amber-100/10 bg-black/10 p-2 shadow-[0_28px_90px_rgba(0,0,0,.72),inset_0_0_75px_rgba(0,0,0,.36)] md:p-3">
            <LiveAtlasHub
              rooms={rooms}
              liveStatus={liveStatus}
              liveSyncPulse={liveSyncPulse}
              liveStatusError={liveStatusError}
              onOpenRoom={openRoom}
              onOpenPacket={openPacketDestination}
              onOpenCommand={() => openRoom('olympus-command')}
            />

            <nav className="sr-only" aria-label="Realm dock">
              {realmMapHotspots.map((spot) => (
                <button key={`dock-${spot.roomId}`} type="button" onClick={() => openRoom(spot.roomId)}>
                  {spot.label}
                </button>
              ))}
            </nav>
          </div>
        </section>
        <GodChatPopup agent={chatAgent} onClose={() => setChatAgent(null)} />
      </main>
    )
  }

  return (
    <main className="olympus-war-room-shell relative h-[calc(100dvh-28px)] overflow-hidden bg-[#03040a] text-[#ffeeb0]">
      <style>{`body:has(.olympus-war-room-shell) aside, body:has(.olympus-war-room-shell) button[aria-label='Open chat'], body:has(.olympus-war-room-shell) button[aria-label='Collapse navigation sidebar'], body:has(.olympus-war-room-shell) [data-tour='usage-meter'] { display: none !important; }`}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(247,216,137,.16),transparent_30%),radial-gradient(circle_at_22%_82%,rgba(240,92,24,.12),transparent_28%),linear-gradient(180deg,#070710,#020309_68%,#010101)]" />
      <section className="relative z-10 flex h-full flex-col p-3 md:p-4">
        <header className={`pointer-events-none absolute left-4 right-4 top-4 z-50 items-start justify-between ${dialogOpen ? 'hidden' : 'flex'}`}>
          <button
            type="button"
            onClick={() => {
              clearPacketActionTimers()
              setSelectedRoomId(null)
              setActiveStationId(null)
              setDialogOpen(false)
              setFocusedWorkflowPacket(null)
            }}
            className="pointer-events-auto rounded-full border border-amber-100/32 bg-black/46 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-amber-50 shadow-[0_14px_26px_rgba(0,0,0,.55)] transition hover:border-emerald-200 hover:bg-emerald-300/12 focus:outline-none focus:ring-2 focus:ring-amber-100"
          >
            ← Map
          </button>
          {activeStation ? <div className="h-[54px] w-[min(520px,58vw)]" aria-hidden="true" /> : <RoomTitlePlaque eyebrow={roomSubtitle(room)} title={room.name} compact />}
          <GodChatRail room={room} onOpen={setChatAgent} activeAgentId={chatAgent?.id} />
        </header>

        <div className={`relative z-10 grid min-h-0 flex-1 place-items-center rounded-[42px] border bg-gradient-to-br ${roomAccent(room.id)} bg-black/20 p-2 pt-20 shadow-[0_28px_90px_rgba(0,0,0,.72),inset_0_0_75px_rgba(0,0,0,.48)] md:p-3 md:pt-20`}>
          <div className="relative aspect-[1600/900] h-full max-h-full w-auto max-w-full overflow-hidden rounded-[34px] border border-amber-100/22 bg-[#09070a] shadow-[inset_0_0_50px_rgba(0,0,0,.65)]">
            <img src={`${room.backgroundAsset}?v=20260513-direct-overhead-v2`} alt={`${room.name} top-down pixel room background layer`} className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]" draggable={false} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,transparent_62%,rgba(0,0,0,.42)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,216,137,.08),transparent_30%,rgba(0,0,0,.10))] mix-blend-screen" />
            {!dialogOpen ? <RoomEnvironmentField room={room} activeStation={activeStation} /> : null}

            {!dialogOpen && !activeStation ? (
              <div className={`pointer-events-none absolute left-4 top-4 z-[44] max-w-[210px] rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] shadow-[0_12px_24px_rgba(0,0,0,.42)] backdrop-blur-md ${healthTone(currentLiveRoom?.health)}`}>
                {friendlyHealthLabel(currentLiveRoom?.health)} • {currentIntelLine ?? `${currentLiveRoom?.missionCount ?? 0} missions`}
              </div>
            ) : null}

            {!dialogOpen && room.id !== 'atlantis-vault' && !focusedWorkflowPacket ? <RoomBrotherPanel room={room} liveRoom={currentLiveRoom} activeStation={activeStation} agent={agent} walking={agentWalking} /> : null}

            {!dialogOpen && room.id === 'atlantis-vault' ? (
              <DatabaseVaultPanel
                data={productIntel}
                archiveData={archiveIntel}
                workflowPackets={visibleWorkflowPackets}
                loading={productIntelLoading}
                error={productIntelError}
                onRefresh={() => setProductIntelRefreshKey((value) => value + 1)}
                onOpenVault={() => {
                  const vaultStation = room.stations.find((station) => station.id === 'dataset-pool') ?? room.stations.find((station) => station.kind === 'archive')
                  if (vaultStation) selectStation(vaultStation)
                }}
                onOpenPacket={openPacketDestination}
              />
            ) : null}

            {room.id !== 'atlantis-vault' ? room.stations.map((station) => (
              <StationProp key={station.id} station={station} badges={stationBadges(room.id, station.id)} active={station.id === activeStation?.id} ambientActive={station.id === ambientToolId && station.id !== activeStation?.id} onSelect={selectStation} />
            )) : null}

            {!dialogOpen && room.id === 'olympus-command' ? <CouncilLegendLayer meeting={activeStation?.id === 'war-table'} onOpenAgent={setCouncilAgent} /> : null}

            {!dialogOpen ? <StationWorkCue station={activeStation} working={Boolean(activeStation && !agentWalking && room.id !== 'oracle' && !(room.id === 'olympus-command' && activeStation.id === 'war-table'))} /> : null}
            {!dialogOpen ? <PacketActionLayer packet={focusedWorkflowPacket} station={activeStation} agent={agent} walking={agentWalking} phase={livingPacketPhase} /> : null}
            {!dialogOpen && !(room.id === 'olympus-command' && activeStation?.id === 'war-table') ? <MiniGod agent={agent} target={target} walking={agentWalking} direction={agentDirection} facingAngle={agentFacingAngle} working={Boolean(activeStation && !agentWalking)} workKind={activeStation?.id ?? activeStation?.kind} /> : null}

            {!dialogOpen && activeStation && !(room.id === 'olympus-command' && activeStation.id === 'war-table') ? (
              <div
                className="pointer-events-none absolute z-[45] max-w-[380px] -translate-x-1/2 -translate-y-full rounded-[18px] border border-amber-100/20 bg-[linear-gradient(135deg,rgba(10,8,12,.66),rgba(55,33,10,.50))] px-3.5 py-2 text-center text-[10px] font-semibold leading-4 text-amber-50/86 shadow-[0_16px_32px_rgba(0,0,0,.52)] backdrop-blur-sm"
                style={{ left: `${Math.max(20, Math.min(80, target.x))}%`, top: `${Math.max(14, target.y - 24)}%` }}
              >
                <span className="block font-serif text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100/70">{agent.name}</span>
                <span>{agentWalking ? `Moving to ${activeStation.name}.` : speech}</span>
              </div>
            ) : null}


            {dialogOpen && activeStation && dialogLayout ? (
              activeStation.id === 'war-table' && room.id === 'olympus-command' ? (
                <CouncilTablePanel
                  onClose={() => {
                    setDialogOpen(false)
                    setActiveStationId(null)
                    setFocusedWorkflowPacket(null)
                  }}
                />
              ) : (
                <StationDialog
                  station={activeStation}
                  roomId={room.id}
                  layout={dialogLayout}
                  liveFeed={currentLiveFeed}
                  liveLinks={currentLinks}
                  sourceLine={roomDetail?.room?.uiRoomId === room.id ? roomDetail.sourceLine : liveSourceLine(liveStatus)}
                  godAdvisor={godAdvisor}
                  workflowSteps={stationWorkflowSteps}
                  workflowPackets={stationWorkflowPackets}
                  focusedWorkflowPacket={focusedWorkflowPacket}
                  actionPermissions={roomDetail?.room?.uiRoomId === room.id ? roomDetail.actionsByStation[activeStation.id] : []}
                  approvalGates={roomDetail?.room?.uiRoomId === room.id ? roomDetail.approvalGates : []}
                  designNorthStar={roomDetail?.designNorthStar ?? liveStatus?.designNorthStar ?? null}
                  onClose={() => {
                    setDialogOpen(false)
                    setActiveStationId(null)
                    setFocusedWorkflowPacket(null)
                  }}
                />
              )
            ) : null}
          </div>
        </div>
      </section>
      <GodChatPopup agent={chatAgent} onClose={() => setChatAgent(null)} />
      <CouncilAgentChatPopup legend={councilAgent} onClose={() => setCouncilAgent(null)} />
    </main>
  )
}
