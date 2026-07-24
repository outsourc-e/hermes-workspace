import { etsyMarketLabStationOperatorId } from './etsy-station-apps'
import {    livingV3RoomById, livingV3StationById } from './living-v3-contract'
import {



  getWorkspaceToolRegistry,
  routeWorkspaceToolIntent
} from './workspace-tool-registry'
import type {LivingV3AgentId, LivingV3RoomId, LivingV3StationId} from './living-v3-contract';
import type {WorkspaceToolId, WorkspaceToolRoute, WorkspaceToolSurfaceId} from './workspace-tool-registry';

export type WorkspaceStationActionKind =
  | 'route_task'
  | 'open_station'
  | 'prefill_tool'
  | 'stage_packet'
  | 'request_approval'

export type WorkspaceStationActionSource = 'hermes' | 'controlled-worker' | 'ui' | 'codex'

export type WorkspaceStationActionEventInput = {
  eventId?: string
  createdAtMs?: number
  source?: WorkspaceStationActionSource
  kind?: WorkspaceStationActionKind
  taskText?: string
  toolId?: WorkspaceToolId
  roomId?: LivingV3RoomId
  stationId?: LivingV3StationId
  surfaceId?: WorkspaceToolSurfaceId
  readback?: string
  payload?: Record<string, unknown>
}

export type WorkspaceStationActionEvent = Required<Pick<WorkspaceStationActionEventInput, 'eventId' | 'createdAtMs' | 'source' | 'kind'>> & {
  taskText: string
  toolId?: WorkspaceToolId
  roomId?: LivingV3RoomId
  stationId?: LivingV3StationId
  surfaceId?: WorkspaceToolSurfaceId
  readback: string
  payload: Record<string, unknown>
}

export type WorkspaceStationUiAction =
  | { type: 'focus_station'; roomId: LivingV3RoomId; stationId?: LivingV3StationId }
  | { type: 'set_tool_surface'; surfaceId: WorkspaceToolSurfaceId }
  | { type: 'prefill_tool'; surfaceId: WorkspaceToolSurfaceId; value: string }
  | { type: 'stage_packet'; packetLabel: string; readback: string }
  | { type: 'request_approval_local'; reason: string }
  | { type: 'record_receipt'; stationId?: LivingV3StationId; receipt: string }
  | { type: 'queue_basic_agent_motion'; agentId: LivingV3AgentId; roomId: LivingV3RoomId; stationId?: LivingV3StationId; label: string }

export type WorkspaceStationActionRouterResult = {
  actionId: string
  createdAtMs: number
  event: WorkspaceStationActionEvent
  route: WorkspaceToolRoute
  uiActions: Array<WorkspaceStationUiAction>
  movement: {
    mode: 'basic_station_walk'
    agentId: LivingV3AgentId
    roomId: LivingV3RoomId
    stationId?: LivingV3StationId
    label: string
    naturalMotionReady: true
    polishedAutonomyReady: false
  }
  safety: WorkspaceToolRoute['safety'] & {
    acceptsOnlyTypedEvents: true
    mutatesExternalSystems: false
    spawnsWorkers: false
  }
}

const TOOL_HINTS: Record<WorkspaceToolId, string> = {
  'command-room-manager': 'Command Room Manager route this local workspace task',
  'etsy-research-lab': 'Research Lab product shop store market research meta analysis selectable depth verified atlas',
  'smart-intake-v2': 'Smart Intake V2 mixed AliExpress Google Drive Google Sheet local images freeform prompt',
  'etsy-sheet-intake': 'Import CSV TSV JSON sheet product gallery dossiers',
  'etsy-product-gallery': 'Open product gallery choose selected product dossier',
  'shotlab-handoff': 'ShotLab handoff image prep selected product local packet',
  'seo-workbench': 'SEO keyword tags title Alura metrics local packet',
  'approval-inbox': 'Approval review upload publish locked local approval packet',
  'daily-news-board': 'Daily news bulletin Gateway board local packet preview locked delivery',
}

const STATION_HINTS: Partial<Record<LivingV3StationId, string>> = {
  'mission-router': TOOL_HINTS['command-room-manager'],
  'etsy-loki-product-hunt': TOOL_HINTS['smart-intake-v2'],
  'etsy-loki-source-leads': TOOL_HINTS['smart-intake-v2'],
  'etsy-thor-seo-metrics': TOOL_HINTS['seo-workbench'],
  'etsy-thor-source-truth': TOOL_HINTS['approval-inbox'],
  'etsy-thor-shotlab-prep': TOOL_HINTS['shotlab-handoff'],
  'etsy-thor-qa-review': TOOL_HINTS['approval-inbox'],
  'etsy-odin-draft-approval': TOOL_HINTS['approval-inbox'],
}

const stationActionSources: Array<WorkspaceStationActionSource> = ['hermes', 'controlled-worker', 'ui', 'codex']
const stationActionKinds: Array<WorkspaceStationActionKind> = ['route_task', 'open_station', 'prefill_tool', 'stage_packet', 'request_approval']
const workspaceToolSurfaceIds: Array<WorkspaceToolSurfaceId> = [
  'command-room-manager',
  'etsy-scout',
  'smart-intake',
  'sheet-intake',
  'shotlab-handoff',
  'seo-workbench',
  'approval-inbox',
  'future-board',
]
const workspaceToolIds = getWorkspaceToolRegistry().map((tool) => tool.id)

function safeString(value: unknown, max = 8_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeStringArray(value: unknown, maxItems = 8, maxChars = 500) {
  if (!Array.isArray(value)) return undefined
  const cleaned = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => safeString(item, maxChars))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
    .slice(0, maxItems)
  return cleaned.length ? cleaned : undefined
}

function safePayloadValue(value: unknown): unknown {
  if (typeof value === 'string') return safeString(value, 1_200)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'string' ? safeString(item, 500) : typeof item === 'number' && Number.isFinite(item) ? item : typeof item === 'boolean' ? item : undefined)
      .filter((item) => item !== undefined)
      .slice(0, 12)
  }
  if (value && typeof value === 'object') return '[object omitted]'
  return undefined
}

function safePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const payload: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 24)) {
    const key = safeString(rawKey, 80)
    const nextValue = safePayloadValue(rawValue)
    if (key && nextValue !== undefined) payload[key] = nextValue
  }
  return payload
}

export function isWorkspaceStationActionSource(value: unknown): value is WorkspaceStationActionSource {
  return typeof value === 'string' && stationActionSources.includes(value as WorkspaceStationActionSource)
}

export function isWorkspaceStationActionKind(value: unknown): value is WorkspaceStationActionKind {
  return typeof value === 'string' && stationActionKinds.includes(value as WorkspaceStationActionKind)
}

export function isWorkspaceStationToolId(value: unknown): value is WorkspaceToolId {
  return typeof value === 'string' && workspaceToolIds.includes(value as WorkspaceToolId)
}

export function isWorkspaceToolSurfaceId(value: unknown): value is WorkspaceToolSurfaceId {
  return typeof value === 'string' && workspaceToolSurfaceIds.includes(value as WorkspaceToolSurfaceId)
}

export function isLivingV3RoomId(value: unknown): value is LivingV3RoomId {
  return typeof value === 'string' && Boolean(livingV3RoomById(value as LivingV3RoomId))
}

export function isLivingV3StationId(value: unknown): value is LivingV3StationId {
  return typeof value === 'string' && Boolean(livingV3StationById(value as LivingV3StationId))
}

function createEventId(createdAtMs: number, source: WorkspaceStationActionSource, kind: WorkspaceStationActionKind) {
  return `station-action-${source}-${kind}-${createdAtMs}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
}

function promptFromEvent(input: WorkspaceStationActionEventInput) {
  const direct = safeString(input.taskText)
  if (direct) return direct
  const payloadPrompt = safeString(input.payload?.prompt ?? input.payload?.taskText ?? input.payload?.operatorNote)
  if (payloadPrompt) return payloadPrompt
  if (input.toolId) return TOOL_HINTS[input.toolId]
  if (input.stationId && STATION_HINTS[input.stationId]) return STATION_HINTS[input.stationId]!
  if (input.readback) return safeString(input.readback)
  return 'Workspace station action event'
}

function normalizeStationActionEvent(input: WorkspaceStationActionEventInput, nowMs = Date.now()): WorkspaceStationActionEvent {
  const source = isWorkspaceStationActionSource(input.source) ? input.source : 'hermes'
  const kind = isWorkspaceStationActionKind(input.kind) ? input.kind : 'route_task'
  const createdAtMs = input.createdAtMs ?? nowMs
  const taskText = promptFromEvent(input)
  return {
    eventId: safeString(input.eventId, 140) || createEventId(createdAtMs, source, kind),
    createdAtMs,
    source,
    kind,
    taskText,
    toolId: isWorkspaceStationToolId(input.toolId) ? input.toolId : undefined,
    roomId: isLivingV3RoomId(input.roomId) ? input.roomId : undefined,
    stationId: isLivingV3StationId(input.stationId) ? input.stationId : undefined,
    surfaceId: isWorkspaceToolSurfaceId(input.surfaceId) ? input.surfaceId : undefined,
    readback: safeString(input.readback, 1_200) || `${source} requested ${kind.replace(/_/g, ' ')}.`,
    payload: safePayload(input.payload),
  }
}

function routePromptFor(event: WorkspaceStationActionEvent) {
  const hints = [
    event.toolId ? TOOL_HINTS[event.toolId] : '',
    event.stationId ? STATION_HINTS[event.stationId] ?? livingV3StationById(event.stationId)?.label ?? '' : '',
    event.surfaceId ? event.surfaceId.replace(/-/g, ' ') : '',
    event.taskText,
  ].filter(Boolean)
  return hints.join(' ').slice(0, 8_000)
}

function routeFor(event: WorkspaceStationActionEvent) {
  const route = routeWorkspaceToolIntent(routePromptFor(event), event.createdAtMs)
  return {
    ...route,
    taskText: event.taskText,
  }
}

function movementAgentFor(route: WorkspaceToolRoute): LivingV3AgentId {
  if (route.target.stationId) return etsyMarketLabStationOperatorId(route.target.stationId)
  return 'hermes'
}

function uiActionsFor(event: WorkspaceStationActionEvent, route: WorkspaceToolRoute, agentId: LivingV3AgentId): Array<WorkspaceStationUiAction> {
  const station = route.target.stationId ? livingV3StationById(route.target.stationId) : null
  const receipt = `${event.source} event ${event.kind}: ${route.stationHandoff.readback}`
  const actions: Array<WorkspaceStationUiAction> = [
    { type: 'focus_station', roomId: route.target.roomId, stationId: route.target.stationId },
    { type: 'set_tool_surface', surfaceId: route.target.surfaceId },
    { type: 'record_receipt', stationId: route.target.stationId, receipt },
    {
      type: 'queue_basic_agent_motion',
      agentId,
      roomId: route.target.roomId,
      stationId: route.target.stationId,
      label: `${event.source} → ${station?.label ?? route.stationHandoff.stationLabel}`,
    },
  ]

  if (route.target.action === 'open_and_prefill_smart_intake' || route.target.action === 'open_and_prefill_sheet_intake') {
    actions.splice(2, 0, { type: 'prefill_tool', surfaceId: route.target.surfaceId, value: event.taskText })
  }

  if (event.kind === 'stage_packet' || route.target.action === 'open_shotlab_handoff' || route.target.action === 'open_seo_workbench') {
    actions.push({
      type: 'stage_packet',
      packetLabel: safeString(event.payload.packetLabel, 120) || safeStringArray(event.payload.packetLabels, 1, 120)?.[0] || route.stationHandoff.toolId,
      readback: event.readback,
    })
  }

  if (event.kind === 'request_approval' || route.target.action === 'open_approval_inbox' || route.stationHandoff.status === 'blocked') {
    actions.push({
      type: 'request_approval_local',
      reason: route.stationHandoff.status === 'blocked'
        ? `Blocked route requires DLV approval: ${route.stationHandoff.readback}`
        : `Local approval requested by ${event.source}: ${event.readback}`,
    })
  }

  return actions
}

export function routeWorkspaceStationActionEvent(
  input: WorkspaceStationActionEventInput,
  nowMs = Date.now(),
): WorkspaceStationActionRouterResult {
  const event = normalizeStationActionEvent(input, nowMs)
  const route = routeFor(event)
  const agentId = movementAgentFor(route)
  const label = `${event.source} ${event.kind.replace(/_/g, ' ')} → ${route.stationHandoff.stationLabel}`
  return {
    actionId: `${event.eventId}-router-result`,
    createdAtMs: event.createdAtMs,
    event,
    route,
    uiActions: uiActionsFor(event, route, agentId),
    movement: {
      mode: 'basic_station_walk',
      agentId,
      roomId: route.target.roomId,
      stationId: route.target.stationId,
      label,
      naturalMotionReady: true,
      polishedAutonomyReady: false,
    },
    safety: {
      ...route.safety,
      acceptsOnlyTypedEvents: true,
      mutatesExternalSystems: false,
      spawnsWorkers: false,
    },
  }
}
