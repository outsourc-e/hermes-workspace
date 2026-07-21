import { LIVING_V3_WORLD_CONFIG, livingV3StationById } from '../living-v3/living-v3-contract'
import type { AgentIntent, WarRoomAgentId, WarRoomRoomId, WarRoomStationId } from './domain'

export type StationInputKind = 'task' | 'product_signal' | 'keyword_signal' | 'media_source' | 'evidence' | 'cost' | 'message' | 'code' | 'roster' | 'model_source' | 'printer_status'
export type StationOutputKind = 'packet' | 'brief' | 'approval_request' | 'evidence_record' | 'draft' | 'alert' | 'local_decision' | 'model_asset' | 'gcode'
export type CockpitType =
  | 'command'
  | 'opportunity'
  | 'oracle'
  | 'forge'
  | 'merchant'
  | 'archive'
  | 'treasury'
  | 'roster'
  | 'rest'
  | 'engineering'
  | 'gateway'
  | 'council'
  | 'etsy'
  | 'terra'

export type StationToolManifest = {
  stationId: WarRoomStationId
  roomId: WarRoomRoomId
  label: string
  purpose: string
  inputKinds: Array<StationInputKind>
  outputKinds: Array<StationOutputKind>
  allowedIntents: Array<AgentIntent['type']>
  lockedActions: Array<string>
  approvalRequired: boolean
  defaultAgentId?: WarRoomAgentId
  cockpitType: CockpitType
}

const LIVE_LOCKED_ACTIONS = [
  'live_etsy_publish',
  'live_etsy_edit',
  'supplier_message_send',
  'paid_generation',
  'purchase',
  'discord_send',
  'account_mutation',
]

export const WAR_ROOM_STATION_MANIFESTS: Array<StationToolManifest> = [
  {
    stationId: 'command-table',
    roomId: 'olympus-command',
    label: 'Command Table',
    purpose: 'Mission overview and task assignment surface.',
    inputKinds: ['task', 'message'],
    outputKinds: ['packet', 'local_decision'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'hermes',
    cockpitType: 'command',
  },
  {
    stationId: 'mission-router',
    roomId: 'olympus-command',
    label: 'Mission Router',
    purpose: 'Routes packets between rooms without external mutation.',
    inputKinds: ['task', 'message'],
    outputKinds: ['packet', 'alert'],
    allowedIntents: ['move_to_station', 'work_at_station', 'carry_packet', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'hermes',
    cockpitType: 'command',
  },
  {
    stationId: 'approval-dais',
    roomId: 'olympus-command',
    label: 'Approval Dais',
    purpose: 'Manual local-only approval packet gate.',
    inputKinds: ['task', 'evidence', 'cost'],
    outputKinds: ['approval_request', 'local_decision'],
    allowedIntents: ['move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: true,
    defaultAgentId: 'hermes',
    cockpitType: 'command',
  },
  {
    stationId: 'agora-intake',
    roomId: 'agora-opportunity',
    label: 'Opportunity Intake',
    purpose: 'Product opportunity triage and prioritization.',
    inputKinds: ['product_signal', 'keyword_signal', 'evidence'],
    outputKinds: ['packet', 'brief', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'goblin',
    cockpitType: 'opportunity',
  },
  {
    stationId: 'oracle-signal-basin',
    roomId: 'oracle-signals',
    label: 'Signal Basin',
    purpose: 'Research, SEO, trend signals, and forecasts.',
    inputKinds: ['keyword_signal', 'evidence'],
    outputKinds: ['brief', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'oracle',
    cockpitType: 'oracle',
  },
  {
    stationId: 'etsy-loki-product-hunt',
    roomId: 'etsy-market-lab',
    label: 'Product Search',
    purpose: 'Loki searches local product data, compares candidates, and chooses one product. Future Alura, Etsy, AliExpress, Alibaba, and supplier scouting are not connected yet.',
    inputKinds: ['task', 'message'],
    outputKinds: ['packet', 'brief'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'loki',
    cockpitType: 'etsy',
  },
  {
    stationId: 'etsy-thor-seo-metrics',
    roomId: 'etsy-market-lab',
    label: 'SEO & Metrics',
    purpose: 'Thor prepares local title ideas, tags, metrics, and listing copy. No Google Sheets or Alura sync is live.',
    inputKinds: ['product_signal', 'keyword_signal', 'evidence'],
    outputKinds: ['brief', 'evidence_record', 'packet'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'thor',
    cockpitType: 'etsy',
  },
  {
    stationId: 'etsy-loki-source-leads',
    roomId: 'etsy-market-lab',
    label: 'Source Leads',
    purpose: 'Loki reviews possible source leads for the selected product. Phase A creates local evidence packets only.',
    inputKinds: ['product_signal', 'evidence'],
    outputKinds: ['evidence_record', 'packet', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'loki',
    cockpitType: 'etsy',
  },
  {
    stationId: 'etsy-thor-source-truth',
    roomId: 'etsy-market-lab',
    label: 'Source Truth',
    purpose: 'Thor checks what is proven, missing, or unsafe to claim before copy and alt text.',
    inputKinds: ['product_signal', 'media_source', 'evidence'],
    outputKinds: ['brief', 'evidence_record', 'approval_request'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'thor',
    cockpitType: 'etsy',
  },
  {
    stationId: 'etsy-thor-shotlab-prep',
    roomId: 'etsy-market-lab',
    label: 'ShotLab Prep',
    purpose: 'Thor prepares a local media handoff packet. It does not run ShotLab, paid generation, or media production in this phase.',
    inputKinds: ['product_signal', 'media_source', 'evidence'],
    outputKinds: ['packet', 'draft'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'thor',
    cockpitType: 'etsy',
  },
  {
    stationId: 'etsy-thor-qa-review',
    roomId: 'etsy-market-lab',
    label: 'QA Review',
    purpose: 'Thor reviews images, text, variants, bad claims, and listing readiness before approval.',
    inputKinds: ['media_source', 'evidence', 'product_signal'],
    outputKinds: ['brief', 'alert', 'approval_request'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'thor',
    cockpitType: 'etsy',
  },
  {
    stationId: 'etsy-odin-draft-approval',
    roomId: 'etsy-market-lab',
    label: 'Draft Approval',
    purpose: 'Odin reviews a local draft preview and waits for DLV approval. No publishing or live upload is possible.',
    inputKinds: ['task', 'evidence', 'media_source', 'cost'],
    outputKinds: ['draft', 'approval_request', 'local_decision'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: true,
    defaultAgentId: 'odin',
    cockpitType: 'etsy',
  },
  {
    stationId: 'forge-workbench',
    roomId: 'forge-hephaestus',
    label: 'Forge Workbench',
    purpose: 'ShotLab prep, automation packets, and tool workflow building.',
    inputKinds: ['media_source', 'evidence', 'code'],
    outputKinds: ['brief', 'draft', 'packet'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'hephaestus',
    cockpitType: 'forge',
  },
  {
    stationId: 'terra-modeling-studio',
    roomId: 'terra-forge',
    label: 'Modeling Studio',
    purpose: 'Aggregates CAD, OpenSCAD, Blender, STEP, G-code QA, and print-readiness routing into one 3D modeling work surface.',
    inputKinds: ['task', 'message', 'model_source', 'evidence'],
    outputKinds: ['brief', 'model_asset', 'gcode', 'packet'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet', 'request_approval', 'raise_alert'],
    lockedActions: [...LIVE_LOCKED_ACTIONS, 'printer_upload', 'printer_start', 'printer_heat', 'printer_axis_move'],
    approvalRequired: false,
    defaultAgentId: 'terra',
    cockpitType: 'terra',
  },
  {
    stationId: 'terra-model-hunt',
    roomId: 'terra-forge',
    label: 'Model Hunt',
    purpose: 'Aggregates public 3D model discovery, source/license proof, remix risk, and print-fit triage before downloads or edits.',
    inputKinds: ['task', 'message', 'keyword_signal', 'evidence'],
    outputKinds: ['brief', 'evidence_record', 'model_asset', 'packet'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet', 'raise_alert'],
    lockedActions: [...LIVE_LOCKED_ACTIONS, 'external_download', 'license_assumption', 'paid_model_purchase'],
    approvalRequired: false,
    defaultAgentId: 'terra',
    cockpitType: 'terra',
  },
  {
    stationId: 'terra-printer-control',
    roomId: 'terra-forge',
    label: 'Printer Control',
    purpose: 'Read-only printer status, live camera placeholder, queue, progress, and temperature view. Machine side effects require DLV approval.',
    inputKinds: ['printer_status', 'model_source', 'evidence'],
    outputKinds: ['alert', 'approval_request', 'local_decision'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: [...LIVE_LOCKED_ACTIONS, 'printer_upload', 'printer_start', 'printer_pause', 'printer_cancel', 'printer_heat', 'printer_axis_move', 'printer_settings_change'],
    approvalRequired: true,
    defaultAgentId: 'terra',
    cockpitType: 'terra',
  },
  {
    stationId: 'merchant-dock',
    roomId: 'merchant-harbor',
    label: 'Merchant Dock',
    purpose: 'Etsy, suppliers, listings, logistics, and marketplace evidence.',
    inputKinds: ['product_signal', 'media_source', 'evidence'],
    outputKinds: ['draft', 'approval_request', 'evidence_record'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: true,
    defaultAgentId: 'loki',
    cockpitType: 'merchant',
  },
  {
    stationId: 'atlantis-index',
    roomId: 'atlantis-vault',
    label: 'Source Index',
    purpose: 'Evidence, memory, files, and archive state.',
    inputKinds: ['evidence', 'media_source'],
    outputKinds: ['evidence_record', 'packet'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'carry_packet'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'poseidon',
    cockpitType: 'archive',
  },
  {
    stationId: 'treasury-ledger',
    roomId: 'treasury-commerce',
    label: 'Commerce Ledger',
    purpose: 'Revenue, spend, usage, margin, and approval budgets.',
    inputKinds: ['cost', 'task', 'evidence'],
    outputKinds: ['approval_request', 'local_decision', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: true,

    cockpitType: 'treasury',
  },
  {
    stationId: 'pantheon-roster',
    roomId: 'pantheon-quarters',
    label: 'Roster Board',
    purpose: 'Agent roster, assignments, idle state, and rest awareness.',
    inputKinds: ['roster', 'task'],
    outputKinds: ['local_decision', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'rest'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'roster-keeper',
    cockpitType: 'roster',
  },
  {
    stationId: 'pantheon-rest-pods',
    roomId: 'pantheon-quarters',
    label: 'Rest Pods',
    purpose: 'Only zone where rest/sleep body state is allowed.',
    inputKinds: ['roster'],
    outputKinds: ['local_decision'],
    allowedIntents: ['move_to_station', 'rest'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'roster-keeper',
    cockpitType: 'rest',
  },
  {
    stationId: 'daedalus-bench',
    roomId: 'daedalus-workshop',
    label: 'Daedalus Bench',
    purpose: 'Development, QA, routing logic, and automation prototypes.',
    inputKinds: ['code', 'task', 'evidence'],
    outputKinds: ['brief', 'draft', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: false,
    defaultAgentId: 'daedalus',
    cockpitType: 'engineering',
  },
  {
    stationId: 'gateway-console',
    roomId: 'gateway-cockpit',
    label: 'Gateway Console',
    purpose: 'Discord, remote command channels, and operator message handoffs.',
    inputKinds: ['message', 'task'],
    outputKinds: ['packet', 'approval_request', 'alert'],
    allowedIntents: ['say', 'move_to_station', 'carry_packet', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: true,
    defaultAgentId: 'heimdall',
    cockpitType: 'gateway',
  },
  {
    stationId: 'council-table',
    roomId: 'council-strategists',
    label: 'Council Table',
    purpose: 'Strategic advice before major operator decisions.',
    inputKinds: ['task', 'evidence', 'cost'],
    outputKinds: ['approval_request', 'local_decision'],
    allowedIntents: ['say', 'move_to_station', 'work_at_station', 'request_approval', 'raise_alert'],
    lockedActions: LIVE_LOCKED_ACTIONS,
    approvalRequired: true,
    defaultAgentId: 'julius',
    cockpitType: 'council',
  },
]

export function livingV3StationManifestById(stationId: WarRoomStationId) {
  return WAR_ROOM_STATION_MANIFESTS.find((manifest) => manifest.stationId === stationId) ?? null
}

export function livingV3StationManifestsByRoom(roomId: WarRoomRoomId) {
  return WAR_ROOM_STATION_MANIFESTS.filter((manifest) => manifest.roomId === roomId)
}

export function validateLivingV3StationManifestCoverage() {
  const stationIds = new Set(LIVING_V3_WORLD_CONFIG.stations.map((station) => station.id))
  const manifestIds = new Set(WAR_ROOM_STATION_MANIFESTS.map((manifest) => manifest.stationId))
  const missing = [...stationIds].filter((stationId) => !manifestIds.has(stationId))
  const extra = [...manifestIds].filter((stationId) => !livingV3StationById(stationId))
  return { ok: missing.length === 0 && extra.length === 0, missing, extra }
}
