import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  LIVING_V3_ASSET_ROOT,
  LIVING_V3_WORLD_CONFIG,






  livingV3AgentById,
  livingV3AssetPath,
  livingV3RoomById,
  livingV3RoomLocalToWorld,
  livingV3StationById
} from '../../../lib/war-room/living-v3/living-v3-contract'
import {

  assignLivingV3Task,
  createInitialLivingV3HermesState,
  createLivingV3ApprovalPacket,
  moveLivingV3AgentToRoom,
  raiseLivingV3Alert
} from '../../../lib/war-room/living-v3/hermes-adapter'
import {

  buildLivingV3AgentSnapshots,
  buildLivingV3RoomStatuses,
  clampLivingV3Camera,
  fitLivingV3MapCamera,
  fitLivingV3RoomCamera,
  getLivingV3ZoomLevel
} from '../../../lib/war-room/living-v3/living-v3-runtime'
import { livingV3NavigationDoors } from '../../../lib/war-room/living-v3/living-v3-navigation'
import { ETSY_MARKET_LAB_STATION_IDS,  etsyMarketLabStationAppId, etsyMarketLabStationOperatorId, isEtsyMarketLabStationId } from '../../../lib/war-room/living-v3/etsy-station-apps'
import {







  activeEtsyProductCandidate,
  activeEtsySupplierLead,
  addEtsyCandidateToVisualBoard,
  applyOracleSignalToEtsyPipeline,
  buildEtsyDraftPreview,
  createEtsyDraftApprovalPacket,
  createEtsyMetricRows,
  createEtsyProductSearchPacket,
  createEtsyProductTruthPacket,
  createEtsyVisualQaReport,
  createInitialEtsyPipelineState,
  etsyPipelineStageLabel,
  etsyTruthFields,
  nextEtsyPipelineStationLabel,
  rejectEtsyCandidate,
  saveEtsySupplierLead,
  selectEtsyCandidate,
  sendEtsyCandidateToThoth,
  sendEtsySupplierLeadToAnubis,
  setEtsySearchInput,
  setEtsySearchMode,
  setEtsySupplierFilter,
  stageEtsySheetRowLocally,
  syncEtsyPipelineToExternalProduct,
  toggleEtsyTruthField,
  updateEtsyQaItemStatus,
  visibleEtsySupplierLeads
} from '../../../lib/war-room/living-v3/etsy-pipeline'
import {
  migrateEtsyProductWorkspaceStateV2,
  parseEtsyProductWorkspaceStateV2,
  replaceEtsyProductWorkspaceProjectionsLocally,
} from '../../../lib/war-room/living-v3/etsy-product-model'
import {




  createOracleSignalPacket,
  oracleAluraSourceModeLabels,
  searchOracleLocalAlura
} from '../../../lib/war-room/living-v3/oracle-alura'
import {

  activeEtsyRoomCandidate,
  applyEtsyLiveResearchRunToEtsyRoomLocal,
  applySheetIntakeProductToEtsyRoomLocal,
  applySmartIntakeMatchToEtsyRoomLocal,
  createDraftPayloadLocal,
  createInitialEtsyRoomState,
  createSeoPacketLocal,
  createShotLabHandoffLocal,
  etsyRoomStageLabels,
  prepareProductScoutPacketLocal,
  rejectEtsyCandidateLocal,
  requestDlvApprovalLocal,
  selectEtsyCandidateLocal
} from '../../../lib/war-room/living-v3/etsy-room-contracts'
import {



  filterSheetIntakeProducts
} from '../../../lib/war-room/living-v3/etsy-sheet-intake'
import {


  createSmartIntakeMission,
  dossierForSmartIntakeMatch,
  imageSetForSmartIntakeMatch,
  selectedSmartIntakeMatch,
  smartIntakeSourceKindLabels,
  smartIntakeStationLabels
} from '../../../lib/war-room/living-v3/smart-intake-v2'
import {


  getWorkspaceToolRegistry,
  recommendWorkspaceTool,
  routeWorkspaceToolIntent
} from '../../../lib/war-room/living-v3/workspace-tool-registry'
import {


  routeWorkspaceStationActionEvent
} from '../../../lib/war-room/living-v3/workspace-station-action-router'
import {









  attachWorkspaceArtifact,
  buildEtsyKernelStageTimeline,
  buildKernelAgentDisplayStates,
  buildWorkspacePacketMissionRail,
  createCouncilHandoffWorkspaceRun,
  createSmartIntakeMissionKernelRun,
  createWorkspaceAction,
  createWorkspaceApprovalForRun,
  createWorkspaceArtifactForRun,
  createWorkspaceRun,
  getWorkspaceBlueprintById,
  kernelAgentDisplayStateToLivingTask,
  latestWorkspaceMissionRun,
  parseWorkspacePacketMissionResults,
  requestWorkspaceApproval,
  routeWorkspaceActionToBlueprint,
  syncEtsyPipelineToWorkspaceRun,
  workspaceAgentMindsForRun,
  workspaceArtifactToRoomPacket,
  workspaceKernelEventIngressFromStationAction,
  workspaceKernelTelemetryFromRun,
  workspaceRunToLivingV3Task,
  workspaceRunToStationAction
} from '../../../lib/workspace-kernel'
import { buildWorkspaceCoreOpsSnapshot } from '../../../lib/workspace-core-ops'
import { bidiClassNameFor, textDirectionFor } from '../../../lib/war-room/living-v3/bidi-text'
import { livingV3AdapterStateFromBodyRuntime } from '../../../lib/war-room/body/living-v3-body-adapter'
import {




  applySharedEtsyProductWorkspaceCommandClient,
  freezeWarRoomAgents,
  readSharedEtsyRoomState,
  requestWarRoomApproval,

  runControlledAgent,
  runEtsyLiveScoutClient,
  runEtsySheetIntakeClient,
  runLiveAgentChat,
  runOracleScoutLocalIntent,

  sendEtsyRoomLocalIntent,
  sendWarRoomIntent,
  setWarRoomAgentsLocalOnly,
  useWarRoomAgentControl,
  useWarRoomEvents,
  useWarRoomState
} from '../../../hooks/use-war-room-body'
import { AgentWorkbenchPanel } from './AgentWorkbenchPanel'
import { AtlantisVaultSurface } from './AtlantisVaultSurface'
import { HermesCommandCockpit } from './HermesCommandCockpit'
import { CouncilChamberSurface  } from './CouncilChamberSurface'
import { EtsyProductMissionWorkspace } from './EtsyProductMissionWorkspace'
import { GoblinAnalyticsShell } from './GoblinAnalyticsShell'
import { OracleWorkbench } from './OracleWorkbench'
import { PacketHandoffRail } from './PacketHandoffRail'
import { StationWorkbenchHeader } from './StationWorkbenchHeader'
import { TerraModelPrintStudio } from './TerraModelPrintStudio'
import { WorkspaceCoreOpsPanel } from './WorkspaceCoreOpsPanel'
import { WorkspacePipelineWorkbench } from './WorkspacePipelineWorkbench'
import { WorkspaceStationCta } from './WorkspaceStationCta'
import { EtsyProductPrepWorkbench } from './EtsyProductPrepWorkbench'
import type {WorkspaceCoreOpsApprovalDecision, WorkspaceCoreOpsPersistenceView} from './WorkspaceCoreOpsPanel';
import type {CouncilDecisionHandoff, CouncilLaunchRequest} from './CouncilChamberSurface';
import type { PacketHandoffRailStatus } from './PacketHandoffRail'
import type { HermesCommandAgentSummary, HermesCommandMessage, HermesCommandTaskSummary } from './HermesCommandCockpit'
import type {ControlledAgentUiResult, ControlledUiAgentId, EtsyLiveScoutClientResult, LiveAgentChatUiResult} from '../../../hooks/use-war-room-body';
import type {WorkspaceCoreOpsNotification} from '../../../lib/workspace-core-ops';
import type {KernelAgentDisplayState, WorkspaceAgentMindProfile, WorkspaceArtifactKind, WorkspaceContextPacket, WorkspaceEvent, WorkspaceKernelPersistedState, WorkspaceKernelTelemetrySnapshot, WorkspacePacketMissionRailItem, WorkspacePacketMissionResult, WorkspaceRun} from '../../../lib/workspace-kernel';
import type {WorkspaceStationActionRouterResult, WorkspaceStationUiAction} from '../../../lib/war-room/living-v3/workspace-station-action-router';
import type {WorkspaceToolContract, WorkspaceToolRoute} from '../../../lib/war-room/living-v3/workspace-tool-registry';
import type {SmartIntakeImageItem, SmartIntakeMission} from '../../../lib/war-room/living-v3/smart-intake-v2';
import type {EtsySheetIntakeGalleryFilter, EtsySheetIntakeNormalizedProduct, EtsySheetIntakeRunManifest} from '../../../lib/war-room/living-v3/etsy-sheet-intake';
import type {EtsyPrepChatMemorySnippet} from './EtsyProductPrepWorkbench';
import type {EtsyProductCandidate as EtsyRoomProductCandidate, EtsyRoomState} from '../../../lib/war-room/living-v3/etsy-room-contracts';
import type {OracleAluraKeywordResult, OracleAluraSearchResult, OracleAluraSourceMode, OracleSignalPacket} from '../../../lib/war-room/living-v3/oracle-alura';
import type {EtsyPipelineState, EtsyProductCandidate, EtsyProductSearchMode, EtsyQaStatus, EtsySupplierFilter, EtsySupplierLead, EtsyTruthField} from '../../../lib/war-room/living-v3/etsy-pipeline';
import type {EtsyProductWorkspaceStateV2} from '../../../lib/war-room/living-v3/etsy-product-model';
import type {EtsyMarketLabStationId} from '../../../lib/war-room/living-v3/etsy-station-apps';
import type {LivingV3AgentSnapshot} from '../../../lib/war-room/living-v3/living-v3-runtime';
import type {LivingV3HermesAdapterState} from '../../../lib/war-room/living-v3/hermes-adapter';
import type {LivingV3AgentId, LivingV3BadgeKind, LivingV3CameraState, LivingV3RoomId, LivingV3StationDefinition, LivingV3StationId} from '../../../lib/war-room/living-v3/living-v3-contract';
import type {CSSProperties, FormEvent, PointerEvent, ReactNode} from 'react';
import type { AgentIntent } from '../../../lib/war-room/body/domain'
import './living-war-room-v3.css'
import './hermes-command-cockpit.css'
import './terra-model-print-studio.css'
import './etsy-desktop-canonical.css'

export type BodyRuntimeMode = 'local-adapter' | 'body-runtime'

type LivingV3Selection =
  | { kind: 'room'; id: LivingV3RoomId }
  | { kind: 'agent'; id: LivingV3AgentId }
  | { kind: 'station'; id: LivingV3StationDefinition['id'] }
  | null

type AgentMessage = {
  id: string
  agentId: LivingV3AgentId
  from: 'operator' | 'agent' | 'receipt'
  text: string
}

type AgentWindowLayout = {
  x: number
  y: number
  w: number
  h: number
}

type AgentWindowLayoutMap = Partial<Record<LivingV3AgentId, AgentWindowLayout>>

type AgentWindowLayoutAction = {
  agentId: LivingV3AgentId
  mode: 'move' | 'resize'
  startClientX: number
  startClientY: number
  startLayout: AgentWindowLayout
}

type OracleSearchUiState = {
  query: string
  sourceMode: OracleAluraSourceMode
  loading: boolean
  result?: OracleAluraSearchResult
  selectedKeywordId?: string
  lastSignalPacket?: OracleSignalPacket
  error?: string
}

const INITIAL_OFFSET_MS = 12_000
const INITIAL_VIEWPORT = { w: 1280, h: 820 }
const ETSY_PIPELINE_STORAGE_KEY = 'war-room-etsy-market-lab-pipeline-v1'
const ETSY_ROOM_STORAGE_KEY = 'war-room-etsy-market-lab-room-flow-v1'
const ETSY_PRODUCT_WORKSPACE_STORAGE_KEY = 'war-room-etsy-product-workspace-v2'
const LIVING_V3_MESSAGES_STORAGE_KEY = 'war-room-living-v3-chat-history-v1'
const HERMES_COMMAND_PROMPT_STORAGE_KEY = 'war-room-hermes-command-prompt-v1'
const HERMES_COMMAND_ACTION_RUN_STORAGE_KEY = 'war-room-hermes-command-action-run-v1'
const LIVING_V3_MESSAGES_LIMIT = 200
const LIVING_V3_AGENT_VISIBLE_MESSAGES = 40
const LIVING_V3_AGENT_WINDOW_LAYOUT_STORAGE_KEY = 'war-room-living-v3-agent-window-layout-v1'
const LIVING_V3_NAV_DEBUG_STORAGE_KEY = 'war-room-living-v3-navigation-debug-v1'
const DEFAULT_AGENT_WINDOW_LAYOUT: AgentWindowLayout = { x: 820, y: 110, w: 520, h: 680 }
const MIN_AGENT_WINDOW_SIZE = { w: 440, h: 460 }
const LIVING_V3_ACTIVE_CLOCK_MS = 66
const LIVING_V3_BACKGROUND_CLOCK_MS = 1500
const hiddenPrimaryAgentIds = new Set<LivingV3AgentId>(['ares', 'aphrodite', 'heimdall'])

const LEGACY_ETSY_DEMO_SEEDS = [
  'initial necklace gift necklace',
  'find gold initial necklace opportunities',
  'gold initial necklace opportunities',
]

function stringifyForLegacyCheck(value: unknown) {
  try {
    return JSON.stringify(value).toLowerCase()
  } catch {
    return ''
  }
}

function isLegacyEtsyDemoState(value: unknown) {
  const text = stringifyForLegacyCheck(value)
  if (!text) return false
  if (LEGACY_ETSY_DEMO_SEEDS.some((seed) => text.includes(seed))) return true
  return text.includes('fallback-local-mock') && text.includes('initial necklace')
}

function isLegacyEtsyDemoTitle(value: string | null | undefined) {
  const text = (value ?? '').toLowerCase()
  return LEGACY_ETSY_DEMO_SEEDS.some((seed) => text.includes(seed))
}


function defaultLivingV3Messages(): Array<AgentMessage> {
  return [
    {
      id: 'welcome-hermes',
      agentId: 'hermes',
      from: 'agent',
      text: 'כתוב מטרה אחת. Hermes ינתב אותה לכלי, לסוכן או לחדר הנכון.',
    },
  ]
}

function loadStoredLivingV3Messages() {
  if (typeof window === 'undefined') return defaultLivingV3Messages()
  try {
    const raw = window.localStorage.getItem(LIVING_V3_MESSAGES_STORAGE_KEY)
    if (!raw) return defaultLivingV3Messages()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return defaultLivingV3Messages()
    return parsed
      .filter((message): message is AgentMessage => {
        if (!message || typeof message !== 'object') return false
        const candidate = message as Record<string, unknown>
        return typeof candidate.id === 'string'
          && typeof candidate.agentId === 'string'
          && LIVING_V3_WORLD_CONFIG.agents.some((agent) => agent.id === candidate.agentId)
          && (candidate.from === 'operator' || candidate.from === 'agent' || candidate.from === 'receipt')
          && typeof candidate.text === 'string'
      })
      .slice(-LIVING_V3_MESSAGES_LIMIT)
  } catch {
    return defaultLivingV3Messages()
  }
}

function isFiniteLayout(value: unknown): value is AgentWindowLayout {
  if (!value || typeof value !== 'object') return false
  const layout = value as Partial<AgentWindowLayout>
  return [layout.x, layout.y, layout.w, layout.h].every((part) => typeof part === 'number' && Number.isFinite(part))
}

function defaultAgentWindowLayout(viewport = INITIAL_VIEWPORT): AgentWindowLayout {
  const clampedDefault = clampAgentWindowLayout(DEFAULT_AGENT_WINDOW_LAYOUT, viewport)
  return {
    ...clampedDefault,
    x: Math.max(16, viewport.w - clampedDefault.w - 28),
    y: Math.max(86, viewport.h - clampedDefault.h - 24),
  }
}

function clampAgentWindowLayout(layout: AgentWindowLayout, viewport = INITIAL_VIEWPORT): AgentWindowLayout {
  const maxW = Math.max(320, viewport.w - 32)
  const maxH = Math.max(360, viewport.h - 92)
  const w = Math.min(maxW, Math.max(Math.min(MIN_AGENT_WINDOW_SIZE.w, maxW), layout.w))
  const h = Math.min(maxH, Math.max(Math.min(MIN_AGENT_WINDOW_SIZE.h, maxH), layout.h))
  return {
    x: Math.max(12, Math.min(Math.max(12, viewport.w - w - 12), layout.x)),
    y: Math.max(72, Math.min(Math.max(72, viewport.h - h - 12), layout.y)),
    w,
    h,
  }
}

function loadStoredAgentWindowLayouts() {
  if (typeof window === 'undefined') return {} as AgentWindowLayoutMap
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIVING_V3_AGENT_WINDOW_LAYOUT_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([agentId, layout]) => livingV3AgentById(agentId as LivingV3AgentId) && isFiniteLayout(layout))
        .map(([agentId, layout]) => [agentId, clampAgentWindowLayout(layout as AgentWindowLayout)]),
    ) as AgentWindowLayoutMap
  } catch {
    return {} as AgentWindowLayoutMap
  }
}

function loadStoredNavigationDebug() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(LIVING_V3_NAV_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function loadStoredHermesCommandPrompt() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(HERMES_COMMAND_PROMPT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function defaultHermesCommandActionRun(): HermesCommandActionRunCard {
  const now = Date.now()
  return {
    runId: 'command-idle',
    status: 'idle',
    prompt: '',
    intent: 'waiting',
    capability: 'checking',
    assignedAgentId: 'hermes',
    readback: 'כתוב בקשה אחת. Hermes יבדוק כוונה, יכולת, כלי ותוצאה.',
    visualNextStep: 'הפעולה הבאה תופיע כאן אחרי הרצה.',
    createdAtMs: now,
    updatedAtMs: now,
  }
}

function isHermesCommandActionRunCard(value: unknown): value is HermesCommandActionRunCard {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<HermesCommandActionRunCard>
  return typeof run.runId === 'string'
    && typeof run.status === 'string'
    && typeof run.prompt === 'string'
    && typeof run.readback === 'string'
    && typeof run.visualNextStep === 'string'
    && typeof run.createdAtMs === 'number'
    && typeof run.updatedAtMs === 'number'
}

function loadStoredHermesCommandActionRun() {
  if (typeof window === 'undefined') return defaultHermesCommandActionRun()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HERMES_COMMAND_ACTION_RUN_STORAGE_KEY) ?? 'null')
    return isHermesCommandActionRunCard(parsed) ? parsed : defaultHermesCommandActionRun()
  } catch {
    return defaultHermesCommandActionRun()
  }
}

function agentWindowLayoutStyle(layout: AgentWindowLayout): CSSProperties {
  return {
    left: `${layout.x}px`,
    top: `${layout.y}px`,
    width: `${layout.w}px`,
    height: `${layout.h}px`,
  }
}

const initialOracleSearchState: OracleSearchUiState = {
  query: '',
  sourceMode: 'alura_only',
  loading: false,
}

const ORACLE_PRODUCT_GATE_LABELS = ['Etsy live', 'Active', 'Alura', 'AliTools', 'GREEN'] as const

const badgeLabels: Record<LivingV3BadgeKind, string> = {
  'active-task': '*',
  approval: '✓',
  blocked: 'X',
  alert: '!',
  sleeping: 'Z',
  idle: '-',
}

function loadStoredEtsyPipeline() {
  if (typeof window === 'undefined') return createInitialEtsyPipelineState()
  try {
    const raw = window.localStorage.getItem(ETSY_PIPELINE_STORAGE_KEY)
    if (!raw) return createInitialEtsyPipelineState()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return createInitialEtsyPipelineState()
    const candidate = parsed as Partial<EtsyPipelineState>
    if (!Array.isArray(candidate.candidates) || !Array.isArray(candidate.supplierLeads)) {
      return createInitialEtsyPipelineState()
    }
    if (isLegacyEtsyDemoState(candidate)) {
      window.localStorage.removeItem(ETSY_PIPELINE_STORAGE_KEY)
      return createInitialEtsyPipelineState()
    }
    return { ...createInitialEtsyPipelineState(), ...candidate }
  } catch {
    return createInitialEtsyPipelineState()
  }
}

function loadStoredEtsyRoomState() {
  if (typeof window === 'undefined') return createInitialEtsyRoomState()
  try {
    const raw = window.localStorage.getItem(ETSY_ROOM_STORAGE_KEY)
    if (!raw) return createInitialEtsyRoomState()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return createInitialEtsyRoomState()
    const candidate = parsed as Partial<EtsyRoomState>
    if (!candidate.run) {
      return createInitialEtsyRoomState()
    }
    if (isLegacyEtsyDemoState(candidate)) {
      window.localStorage.removeItem(ETSY_ROOM_STORAGE_KEY)
      return createInitialEtsyRoomState()
    }
    return { ...createInitialEtsyRoomState(), ...candidate }
  } catch {
    return createInitialEtsyRoomState()
  }
}

function loadStoredEtsyProductWorkspaceState() {
  const nowMs = Date.now()
  if (typeof window === 'undefined') {
    return migrateEtsyProductWorkspaceStateV2({
      roomState: createInitialEtsyRoomState(nowMs),
      pipelineState: createInitialEtsyPipelineState(),
      nowMs,
    })
  }
  try {
    const raw = window.localStorage.getItem(ETSY_PRODUCT_WORKSPACE_STORAGE_KEY)
    const parsed = raw ? parseEtsyProductWorkspaceStateV2(JSON.parse(raw), nowMs) : undefined
    if (parsed && !isLegacyEtsyDemoState(parsed.roomState) && !isLegacyEtsyDemoState(parsed.pipelineState)) {
      return parsed
    }
    if (raw) window.localStorage.removeItem(ETSY_PRODUCT_WORKSPACE_STORAGE_KEY)
  } catch {
    // Fall through to the deterministic V1 migration below.
  }
  return migrateEtsyProductWorkspaceStateV2({
    roomState: loadStoredEtsyRoomState(),
    pipelineState: loadStoredEtsyPipeline(),
    nowMs,
  })
}

function resolveEtsyProjectionState<T>(current: T, update: T | ((value: T) => T)) {
  return typeof update === 'function'
    ? (update as (value: T) => T)(current)
    : update
}

const activityLabels: Record<LivingV3AgentSnapshot['activity'], string> = {
  idle: 'Idle',
  walking: 'Walking',
  working: 'Working',
  talking: 'Talking',
  carrying: 'Carrying packet',
  'waiting-approval': 'Waiting approval',
  sleeping: 'Resting',
}

type ControlledRunStatus = 'idle' | 'running' | 'completed' | 'failed'
type ControlledRunState = { status: ControlledRunStatus; label: string; runId?: string }
type HermesCommandRunState = { status: ControlledRunStatus; label: string; result?: ControlledAgentUiResult | LiveAgentChatUiResult; answer?: string; error?: string }
type HermesCommandActionRunStatus = 'idle' | 'running' | 'waiting_operator' | 'completed' | 'blocked' | 'failed'
type HermesCommandActionRunCard = {
  runId: string
  status: HermesCommandActionRunStatus
  prompt: string
  intent: string
  capability: 'available' | 'missing' | 'not_needed' | 'checking'
  assignedAgentId: string
  targetRoomId?: string
  targetStationId?: string
  toolId?: string
  readback: string
  visualNextStep: string
  missingCapabilityTitle?: string
  buildPlan?: Array<string>
  createdAtMs: number
  updatedAtMs: number
}
type ControlledAgentButtonConfig = {
  agentId: ControlledUiAgentId
  visualAgentId: LivingV3AgentId
  label: string
  chip: string
  roomId: LivingV3RoomId
  stationId: LivingV3StationDefinition['id']
}

type CommandAgentControlProfile = {
  agentId: ControlledUiAgentId
  label: string
  runState: ControlledRunState
}

type CommandAgentControlRow = {
  agentId: LivingV3AgentId
  label: string
  shortLabel: string
  role: string
  accent: string
  portraitPath: string
  roomId: LivingV3RoomId
  roomLabel: string
  activityLabel: string
  packetLabel: string
  statusTone: 'idle' | 'active' | 'moving' | 'approval' | 'resting' | 'visual'
  visualStatusLabel: string
  primaryStationId?: LivingV3StationDefinition['id']
  primaryStationLabel?: string
  lastMessage?: string
  controlledProfiles: Array<CommandAgentControlProfile>
}

const controlledAgentButtons: Array<ControlledAgentButtonConfig> = [
  {
    agentId: 'hermes-command',
    visualAgentId: 'hermes',
    label: 'Hermes Command',
    chip: 'HC',
    roomId: 'olympus-command',
    stationId: 'command-table',
  },
  {
    agentId: 'hermes',
    visualAgentId: 'hermes',
    label: 'Hermes V1',
    chip: 'H1',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
  },
  {
    agentId: 'scout',
    visualAgentId: 'loki',
    label: 'Loki Scout V2',
    chip: 'S2',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
  },
]

const initialControlledAgentRunStates = Object.fromEntries(
  [
    ...controlledAgentButtons.map((agent) => [agent.agentId, { status: 'idle', label: `${agent.label} ready` }] as const),
    ['smart-intake', { status: 'idle', label: 'Smart Intake Hermes Worker V1 ready' }] as const,
  ],
) as Record<ControlledUiAgentId, ControlledRunState>

type OracleScoutRunStatus = 'idle' | 'running' | 'completed' | 'failed'
type OracleScoutRunState = { status: OracleScoutRunStatus; label: string; runId?: string }

const oracleBridgeEventTypes = new Set([
  'control.local_only',
  'agent.move.started',
  'agent.work.started',
  'oracle.local_alura_search.started',
  'oracle.local_alura_search.completed',
  'packet.created',
  'packet.sent',
  'etsy.signal.received',
  'approval.requested',
  'agent.work.completed',
  'control.frozen',
  'run.failed',
])

function isOracleSignalPacket(value: unknown): value is OracleSignalPacket {
  if (!value || typeof value !== 'object') return false
  const packet = value as Partial<OracleSignalPacket>
  return typeof packet.packetId === 'string'
    && typeof packet.selectedKeyword === 'string'
    && packet.dataOrigin === 'local-alura-cache'
    && packet.status === 'local_signal_ready'
}

function oracleSignalPacketFromPayload(payload: unknown): OracleSignalPacket | null {
  if (!payload || typeof payload !== 'object') return null
  const signalPacket = (payload as { signalPacket?: unknown }).signalPacket
  return isOracleSignalPacket(signalPacket) ? signalPacket : null
}

function controlledAgentChip(config: ControlledAgentButtonConfig, state: ControlledRunState) {
  if (state.status === 'running') return `${config.chip}...`
  if (state.status === 'completed') return `${config.chip}✓`
  if (state.status === 'failed') return `${config.chip}!`
  return config.chip
}

function controlledAgentLabel(agentId: ControlledUiAgentId) {
  return controlledAgentButtons.find((agent) => agent.agentId === agentId)?.label ?? agentId
}

function controlledAgentConfig(agentId: ControlledUiAgentId) {
  return controlledAgentButtons.find((agent) => agent.agentId === agentId) ?? controlledAgentButtons[0]
}

function commandAgentStatusTone(snapshot: LivingV3AgentSnapshot | null, rowHasControlledProfile: boolean): CommandAgentControlRow['statusTone'] {
  if (!snapshot) return rowHasControlledProfile ? 'idle' : 'visual'
  if (snapshot.activity === 'walking' || snapshot.activity === 'carrying') return 'moving'
  if (snapshot.activity === 'working' || snapshot.activity === 'talking') return 'active'
  if (snapshot.activity === 'waiting-approval') return 'approval'
  if (snapshot.activity === 'sleeping') return 'resting'
  return rowHasControlledProfile || snapshot.packetLabel ? 'idle' : 'visual'
}

function commandAgentVisualStatusLabel(agentId: LivingV3AgentId, rowHasControlledProfile: boolean) {
  const agent = livingV3AgentById(agentId)
  if (!agent) return rowHasControlledProfile ? 'controllable' : 'visual'
  if (rowHasControlledProfile) return 'controlled profile'
  if (agent.primaryStationIds.length > 0) return 'station control'
  if (agent.visualStatus === 'ambient-companion') return 'ambient only'
  if (agent.visualStatus === 'council-room-general') return 'council advisor'
  if (agent.visualStatus === 'poseidon-sea-pet-runtime-final') return 'Atlantis Vault manager'
  return agent.visualStatus?.replace(/-/g, ' ') ?? 'visual agent'
}

function percentRectToWorld(roomId: LivingV3RoomId, rect: { x: number; y: number; w: number; h: number }) {
  const room = livingV3RoomById(roomId)
  if (!room) return { x: 0, y: 0, w: 0, h: 0 }
  return {
    x: room.world.x + (rect.x / 100) * room.world.w,
    y: room.world.y + (rect.y / 100) * room.world.h,
    w: (rect.w / 100) * room.world.w,
    h: (rect.h / 100) * room.world.h,
  }
}

function styleVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties
}

function frameStyle(assetPath: string, frameIndex: number, frameCount: number): CSSProperties {
  const safeFrameCount = Math.max(1, frameCount)
  const safeFrameIndex = Math.max(0, Math.min(safeFrameCount - 1, frameIndex))
  const positionPct = safeFrameCount === 1 ? 0 : (safeFrameIndex / (safeFrameCount - 1)) * 100
  return {
    backgroundImage: `url("${assetPath}")`,
    backgroundSize: `${safeFrameCount * 100}% 100%`,
    backgroundPosition: `${positionPct}% 50%`,
  }
}

function getAgentSnapshot(snapshots: Array<LivingV3AgentSnapshot>, agentId: LivingV3AgentId) {
  return snapshots.find((snapshot) => snapshot.agentId === agentId) ?? null
}

function activeStationTask(state: LivingV3HermesAdapterState, stationId: LivingV3StationDefinition['id']) {
  return state.tasks.find((task) => task.stationId === stationId) ?? null
}

const etsyStationLocalOnlyCopy: Partial<Record<LivingV3StationDefinition['id'], string>> = {
  'etsy-loki-product-hunt': 'Product Inbox receives Oracle product-signal cards only. Search text lives in Oracle; Etsy does not invent fallback products.',
  'etsy-thor-seo-metrics': 'SEO & Metrics records local metric and keyword placeholders only. Google Sheets, Alura sync, and database writes are not connected yet.',
  'etsy-loki-source-leads': 'Source Leads prepares local supplier/search evidence packets only. Etsy, AliExpress, Alibaba, and supplier APIs are not queried yet.',
  'etsy-thor-source-truth': 'Source Truth validates what can be claimed locally: materials, dimensions, variants, compliance, and proof.',
  'etsy-thor-shotlab-prep': 'ShotLab Prep creates a local media handoff packet. ShotLab and paid generation are still blocked.',
  'etsy-thor-qa-review': 'QA Review checks images, text, variants, bad claims, and listing readiness before any draft handoff.',
  'etsy-odin-draft-approval': 'Draft Approval is local-only in Phase A. Etsy upload, edit, publish, and live draft creation remain impossible.',
}

function localOnlyCopyForStation(station: LivingV3StationDefinition) {
  return etsyStationLocalOnlyCopy[station.id] ?? 'This station creates local War Room packets only. Live external actions remain locked.'
}

function etsyOperatorStatusForStation(stationId: LivingV3StationDefinition['id'], actionLabel?: string) {
  if (actionLabel === 'Create local search packet') return 'Reading request'
  if (actionLabel === 'Select candidate' || actionLabel === 'Add to Visual Board' || actionLabel === 'Send to SEO') return 'Candidate selected'
  if (actionLabel === 'Stage Sheet Row Locally') return 'Metrics staged'
  if (actionLabel === 'Create Product Truth Packet') return 'Truth packet ready'
  if (actionLabel === 'Create QA Report') return 'QA report ready'
  if (actionLabel === 'Create Draft Approval Packet') return 'Draft packet waiting approval'
  if (actionLabel && stationId === 'etsy-odin-draft-approval') return 'Waiting for operator input'
  const operatorId = etsyMarketLabStationOperatorId(stationId)
  if (operatorId === 'loki') return 'Reading request'
  if (operatorId === 'odin') return 'Waiting for operator input'
  return 'Staging local packet'
}

function etsyOperatorPacketLabel(status: string) {
  if (status === 'Reading request') return 'Product request'
  if (status === 'Candidate selected') return 'Candidate packet'
  if (status === 'Metrics staged') return 'Metric packet'
  if (status === 'Truth packet ready') return 'Truth packet'
  if (status === 'QA report ready') return 'QA report'
  if (status === 'Draft packet waiting approval') return 'Draft approval'
  if (status === 'Waiting for operator input') return 'Operator input'
  return 'Local packet'
}

function etsyEvidenceLabel(value: string | null | undefined) {
  if (!value) return 'Not linked yet'
  if (value === 'fallback-mock' || value === 'fallback-local-mock') return 'Local fallback'
  if (value === 'missing-evidence') return 'Evidence missing'
  if (value === 'partial-local') return 'Partial local proof'
  if (value === 'verified-local') return 'Source linked'
  if (value === 'live-readonly-research') return 'Live read-only research'
  if (value === 'local-user-input') return 'Manual input'
  if (value === 'sheet-intake-local') return 'Sheet intake'
  return value.replace(/[-_]+/g, ' ')
}

function isCouncilRoomGeneralAgent(agentId: LivingV3AgentId) {
  return livingV3AgentById(agentId)?.visualStatus === 'council-room-general'
}

function stationAssignableAgents(station: LivingV3StationDefinition) {
  if (station.roomId === 'etsy-market-lab') {
    return LIVING_V3_WORLD_CONFIG.agents.filter((agent) => agent.visualStatus !== 'council-room-general' && agent.visualStatus !== 'ambient-companion')
  }
  if (station.roomId === 'council-strategists') {
    return LIVING_V3_WORLD_CONFIG.agents.filter((agent) => agent.visualStatus === 'council-room-general' || agent.id === 'hermes')
  }
  return LIVING_V3_WORLD_CONFIG.agents.filter((agent) => agent.visualStatus !== 'council-room-general')
}

const issueChips = ['wrong product', 'bad variant', 'wrong language', 'fake text', 'claim risk']

function LocalThumb({ label, tone = '#72e0d4' }: { label: string; tone?: string }) {
  return (
    <div className="living-v3__etsy-thumb" style={styleVars({ '--thumb-accent': tone })} aria-label={`${label} local placeholder`}>
      <span>{label.slice(0, 2).toUpperCase()}</span>
    </div>
  )
}

function LocalOnlyButton({
  children,
  className = '',
  disabled = false,
  disabledReason,
  onClick,
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  disabledReason?: string
  onClick?: () => void
}) {
  return (
    <button
      className={className}
      type="button"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      data-disabled-reason={disabled && disabledReason ? disabledReason : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

type OracleSearchHandlers = {
  updateQuery: (value: string) => void
  updateSourceMode: (value: OracleAluraSourceMode) => void
  runSearch: () => void
  sendSignalToEtsy: (searchResult: OracleAluraSearchResult, result: OracleAluraKeywordResult) => void
}

function formatMetric(value: number | null | undefined, fallback = 'missing evidence') {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback
  return Math.abs(value) >= 1000 ? value.toLocaleString() : String(value)
}

function OracleAluraLocalSearchApp({ state, handlers }: { state: OracleSearchUiState; handlers: OracleSearchHandlers }) {
  const resultCount = state.result?.keywordResults.length ?? 0
  const selectedResult = state.result?.keywordResults.find((result) => result.id === state.selectedKeywordId) ?? state.result?.keywordResults[0] ?? null
  const nextOracleAction = state.loading
    ? 'Reading local evidence…'
    : selectedResult
      ? `Send ${selectedResult.keyword} into the Etsy prep room`
      : 'Search an Etsy niche, then pass the best signal to Loki'

  return (
    <div
      className="living-v3__oracle-shell"
      data-station-app="oracle-alura-local-search"
      data-oracle-workbench="action-v2"
      data-oracle-product-scout="workbench-v1"
      data-live-actions-locked="true"
    >
      <section className="living-v3__oracle-signal-deck" aria-label="Oracle signal search console">
        <div className="living-v3__oracle-signal-copy">
          <span>Oracle signal scout</span>
          <h3>{(selectedResult?.keyword ?? state.query) || 'Search local product evidence'}</h3>
          <p>{nextOracleAction}</p>
        </div>
        <form
          className="living-v3__oracle-searchbar"
          onSubmit={(event) => {
            event.preventDefault()
            handlers.runSearch()
          }}
        >
          <label>
            <span>Signal / niche</span>
            <input
              value={state.query}
              onChange={(event) => handlers.updateQuery(event.target.value)}
              placeholder="ceramic cup, bow necklace, gift idea…"
              aria-label="Oracle product search text"
            />
          </label>
          <label>
            <span>Evidence source</span>
            <select value={state.sourceMode} onChange={(event) => handlers.updateSourceMode(event.target.value as OracleAluraSourceMode)}>
              {Object.entries(oracleAluraSourceModeLabels).map(([mode, label]) => (
                <option key={mode} value={mode}>{label}</option>
              ))}
            </select>
          </label>
          <LocalOnlyButton className="living-v3__oracle-primary" disabled={state.loading} disabledReason="Oracle is reading local evidence." onClick={handlers.runSearch}>
            {state.loading ? 'Searching…' : 'Search evidence'}
          </LocalOnlyButton>
        </form>
        <div className="living-v3__oracle-kpis" aria-label="Oracle local status">
          <span><b>{resultCount}</b>signals</span>
          <span><b>{selectedResult ? formatMetric(selectedResult.metrics.keywordScore, 'n/a') : '—'}</b>score</span>
          <span><b>{oracleAluraSourceModeLabels[state.sourceMode]}</b>local cache</span>
          <span><b>Locked</b>no live write</span>
        </div>
      </section>

      <section className="living-v3__oracle-workbench" aria-label="Oracle results workbench">
        <article className="living-v3__oracle-selected-card" data-has-signal={selectedResult ? 'true' : 'false'}>
          <span>Selected signal</span>
          <h3>{selectedResult?.keyword ?? 'No signal selected yet'}</h3>
          <p>{selectedResult ? `${selectedResult.sourceLabel} · ${selectedResult.confidence}% confidence` : 'Run a local evidence search. The best signal can be sent to Etsy as a local packet.'}</p>
          <dl className="living-v3__oracle-metrics living-v3__oracle-metrics--selected">
            <div><dt>Score</dt><dd>{formatMetric(selectedResult?.metrics.keywordScore, 'n/a')}</dd></div>
            <div><dt>Volume</dt><dd>{formatMetric(selectedResult?.metrics.searchVolume, 'missing')}</dd></div>
            <div><dt>Sales</dt><dd>{formatMetric(selectedResult?.metrics.sales, 'missing')}</dd></div>
            <div><dt>Missing</dt><dd>{selectedResult?.missingFields.length ?? '—'}</dd></div>
          </dl>
          <LocalOnlyButton
            className="living-v3__oracle-primary living-v3__oracle-primary--handoff"
            disabled={!selectedResult || !state.result}
            disabledReason="Search and choose a signal before sending a local Etsy packet."
            onClick={selectedResult && state.result ? () => handlers.sendSignalToEtsy(state.result!, selectedResult) : undefined}
          >
            Send selected to Etsy
          </LocalOnlyButton>
        </article>

        <section className="living-v3__oracle-results-panel" aria-label="Oracle signal results">
          <div className="living-v3__oracle-results-head">
            <div>
              <span>Signal results</span>
              <h3>{state.result ? `${resultCount} local matches` : 'Waiting for search'}</h3>
            </div>
            <details className="living-v3__oracle-source-box living-v3__oracle-proof">
              <summary>Proof</summary>
              <span>Mode: {oracleAluraSourceModeLabels[state.sourceMode]}</span>
              <span>Files: {state.result?.sourceFilesUsed.join(', ') || 'none yet'}</span>
              {state.result?.warning && <span>Warning: {state.result.warning}</span>}
              {state.error && <span>Error: {state.error}</span>}
            </details>
          </div>
          <div className="living-v3__oracle-results">
            {state.result && !state.result.keywordResults.length && (
              <EtsyEmptyState>No match.</EtsyEmptyState>
            )}
            {!state.result && (
              <EtsyEmptyState>Search local evidence to show Oracle signals.</EtsyEmptyState>
            )}
            {state.result?.keywordResults.map((result) => (
              <article key={result.id} className={`living-v3__oracle-card ${state.selectedKeywordId === result.id ? 'is-selected' : ''}`}>
                <div>
                  <h3>{result.keyword}</h3>
                  <p>{result.sourceLabel}</p>
                  <div className="living-v3__etsy-evidence-badges">
                    <small>{result.dataOrigin}</small>
                    <small>{result.rawSourceFile}</small>
                    <small>{result.confidence}% confidence</small>
                  </div>
                </div>
                <dl className="living-v3__oracle-metrics">
                  <div><dt>Score</dt><dd>{formatMetric(result.metrics.keywordScore)}</dd></div>
                  <div><dt>Volume</dt><dd>{formatMetric(result.metrics.searchVolume)}</dd></div>
                  <div><dt>Sales</dt><dd>{formatMetric(result.metrics.sales)}</dd></div>
                  <div><dt>Comp</dt><dd>{formatMetric(result.metrics.competition)}</dd></div>
                </dl>
                <details className="living-v3__oracle-card-proof">
                  <summary>Proof</summary>
                  <span>Missing: {result.missingFields.join(', ') || 'none'}</span>
                  <span>Evidence: {result.evidenceIds.slice(0, 3).join(', ') || 'none'}</span>
                </details>
                <LocalOnlyButton className="living-v3__oracle-primary" onClick={() => state.result && handlers.sendSignalToEtsy(state.result, result)}>
                  Send signal to Etsy
                </LocalOnlyButton>
              </article>
            ))}
          </div>
        </section>
      </section>

      {state.result?.listingResults.length ? (
        <details className="living-v3__oracle-listings">
          <summary>Sources</summary>
          {state.result.listingResults.slice(0, 4).map((listing) => (
            <span key={listing.id}>{listing.keyword}: {listing.title}</span>
          ))}
        </details>
      ) : null}

      {state.lastSignalPacket && (
        <div className="living-v3__etsy-action-receipt" role="status">
          Product card sent to Etsy Market Lab: {state.lastSignalPacket.selectedKeyword} · {state.lastSignalPacket.sourceFile}
        </div>
      )}
    </div>
  )
}



type TerraForgeStationId = Extract<LivingV3StationId, 'terra-modeling-studio' | 'terra-model-hunt' | 'terra-printer-control'>
const TERRA_FORGE_STATION_IDS: ReadonlyArray<TerraForgeStationId> = ['terra-modeling-studio', 'terra-model-hunt', 'terra-printer-control']

function isTerraForgeStationId(stationId: LivingV3StationId | undefined): stationId is TerraForgeStationId {
  return stationId ? TERRA_FORGE_STATION_IDS.includes(stationId as TerraForgeStationId) : false
}

const TERRA_FORGE_TOOL_CONFIG: Record<TerraForgeStationId, {
  toolId: string
  eyebrow: string
  title: string
  chips: Array<string>
  placeholder: string
  primaryAction: string
  safety: string
  cards: Array<{ label: string; value: string; meta: string }>
  proof: Array<string>
}> = {
  'terra-modeling-studio': {
    toolId: 'modeling-studio',
    eyebrow: 'Modeling',
    title: 'CAD / Blender / OpenSCAD router',
    chips: ['CAD', 'STEP', 'OpenSCAD', 'Blender', 'G-code QA'],
    placeholder: 'object / reference / dimensions',
    primaryAction: 'Stage model brief',
    safety: 'Preview + QA before slicer',
    cards: [
      { label: 'Route', value: 'CAD / Blender / OpenSCAD', meta: 'skill router' },
      { label: 'Preview', value: 'mesh + dimensions', meta: 'no slicer first' },
      { label: 'Export', value: 'STL / 3MF / STEP', meta: 'locked handoff' },
    ],
    proof: ['dlv-3d-print-design-synthesis', 'openscad-3d-print-factory', 'blender-organic-3d-print-cad', 'cad', 'gcode'],
  },
  'terra-model-hunt': {
    toolId: 'model-hunt',
    eyebrow: 'Search',
    title: 'Model discovery board',
    chips: ['Printables', 'Thingiverse', 'MakerWorld', 'License', 'Fit'],
    placeholder: 'model search / product idea',
    primaryAction: 'Stage hunt',
    safety: 'License/proof before remix',
    cards: [
      { label: 'Find', value: 'public model sources', meta: 'read-only first' },
      { label: 'Check', value: 'license + dimensions', meta: 'proof card' },
      { label: 'Shortlist', value: 'print-risk cards', meta: 'no blind download' },
    ],
    proof: ['free-trending-printable-model-discovery', 'step-parts', 'source/license proof', 'fit-risk QA'],
  },
  'terra-printer-control': {
    toolId: 'printer-control',
    eyebrow: 'Printer',
    title: 'Live printer control desk',
    chips: ['Live cam', 'Temps', 'Progress', 'Queue', 'Approval'],
    placeholder: 'job / model / printer note',
    primaryAction: 'Stage print check',
    safety: 'Print/heat/pause/cancel require approval',
    cards: [
      { label: 'Camera', value: 'live URL / config', meta: 'read-only' },
      { label: 'Status', value: 'temps / progress', meta: 'polling only' },
      { label: 'Queue', value: 'approval gate', meta: 'no machine action' },
    ],
    proof: ['Elegoo LAN live feed', 'G-code validation', 'slicer profile check', 'manual approval lock'],
  },
}


type TerraModelAssetPreviewClient = {
  kind: 'embedded' | 'generated' | 'none'
  dataUrl?: string
  source?: string
  note?: string
}

type TerraModelAssetClient = {
  id: string
  name: string
  path: string
  displayPath: string
  directory: string
  rootLabel: string
  sizeBytes: number
  sizeLabel: string
  modifiedAtMs: number
  modifiedLabel: string
  preview: TerraModelAssetPreviewClient
}

type TerraModelAssetsResponse = {
  ok: true
  scannedAtMs: number
  query: string
  limit: number
  totalMatches: number
  assets: Array<TerraModelAssetClient>
  roots: Array<{ label: string; path: string; exists: boolean }>
  errors: Array<string>
}

type TerraInternetModelCandidateClient = {
  id: string
  title: string
  source: 'Printables'
  sourceUrl: string
  imageUrl?: string
  publishedAt?: string
  likes: number
  downloads: number
  rating?: number
  category?: string
  license?: string
  score: number
  fitNotes: Array<string>
  riskFlags: Array<string>
  proof: Array<string>
}

type TerraInternetModelSearchResponse = {
  ok: true
  mode: 'read_only_printables_search'
  status: 'completed' | 'blocked'
  searchedAtMs: number
  query: string
  limit: number
  totalCount: number
  candidates: Array<TerraInternetModelCandidateClient>
  filters: {
    paid: 'free'
    aiGenerated: false
    ordering: 'popular'
    publishedDateLimitDays: number
    categoryId?: string
  }
  skillBasis: string
  sourceNote: string
  lockedActions: Array<string>
  error?: string
}

type TerraDiscoveredPrinterClient = {
  printerId: string
  name: string
  model?: string
  vendor?: string
  host?: string
  firmwareVersion?: string
  serialNumber?: string
  cameraUrl?: string
  cameraRequestMode?: 'configured-url' | 'elegoo-mqtt-on-demand' | 'unavailable'
  source: 'elegoo-slicer'
}

type TerraPrinterStatusResponse = {
  ok: true
  configured: boolean
  name: string
  profile: string
  state: 'not_configured' | 'configured' | 'ready' | 'unreachable'
  message: string
  lastCheckedAtMs: number
  cameraUrl?: string
  snapshotUrl?: string
  statusUrl?: string
  cameraRequestMode?: 'configured-url' | 'elegoo-mqtt-on-demand' | 'unavailable'
  source: 'env' | 'config-file' | 'elegoo-slicer' | 'default'
  configPath?: string
  host?: string
  printerId?: string
  serialNumber?: string
  firmwareVersion?: string
  discoveredPrinters?: Array<TerraDiscoveredPrinterClient>
  discoveryNotes?: Array<string>
  metrics: {
    queueState?: string
    jobName?: string
    progressPercent?: number
    progressSource?: string
    printLifecycle?: 'idle' | 'printing' | 'paused' | 'completed' | 'error' | 'unknown'
    elapsedSeconds?: number
    remainingSeconds?: number
    totalSeconds?: number
    bedTempC?: number
    nozzleTempC?: number
  }
  lockedActions: Array<string>
  error?: string
}

type TerraSlicerProfileClient = {
  id: string
  kind: 'machine' | 'process' | 'filament'
  name: string
  path: string
  displayPath: string
  source: string
  nozzleMm?: number
  material?: string
  color?: string
  default?: boolean
}

type TerraWorkflowStepClient = {
  id: 'web-model-search' | 'choose-model' | 'choose-material' | 'calibration' | 'slice-plan' | 'send-to-printer' | 'print-progress' | 'record-print' | 'post-print-qa' | 'agent-memory'
  label: string
  state: 'ready' | 'available' | 'locked' | 'blocked' | 'unknown'
  live: boolean
  locked: boolean
  requiresApproval: boolean
  source: string
  note: string
}

type TerraWorkbenchCapabilityClient = {
  id: string
  label: string
  category: 'library' | 'slicer' | 'printer' | 'camera' | 'agent' | 'safety'
  state: TerraWorkflowStepClient['state']
  live: boolean
  locked: boolean
  source: string
  evidence: Array<string>
  note: string
}

type TerraAgentSkillBindingClient = {
  name: string
  label: string
  category: 'routing' | 'cad' | 'organic' | 'mechanism' | 'slicer' | 'library'
  state: 'ready' | 'missing'
  path?: string
  source: 'hermes-skill'
  use: string
}

type TerraAgentProfileClient = {
  id: 'terra'
  label: 'Terra'
  role: string
  memory: {
    source: 'obsidian'
    vaultPath: string
    memoryNotePath: string
    exists: boolean
  }
  skills: Array<TerraAgentSkillBindingClient>
  currentFocus: {
    stationId: TerraForgeStationId
    label: string
    reason: string
  }
  guardrails: Array<string>
}

type TerraWorkbenchCapabilitiesResponse = {
  ok: true
  scannedAtMs: number
  slicer: {
    appInstalled: boolean
    appPath: string
    executablePath?: string
    bundleIdentifier?: string
    version?: string
    dataDir: string
    configPath?: string
    selectedMachine?: string
    selectedPrinterId?: string
    cliAvailable: boolean
    cliEvidence: string
    settings: {
      bedLeveling: boolean
      heatedBedLeveling: boolean
      flowCalibration: boolean
      timelapse: boolean
      uploadAndPrint: boolean
      autoRefill: boolean
      bedType?: string
    }
    selectedMachineProfile?: TerraSlicerProfileClient
    profiles: {
      machines: Array<TerraSlicerProfileClient>
      processes: Array<TerraSlicerProfileClient>
      filaments: Array<TerraSlicerProfileClient>
    }
    profileCounts: { machines: number; processes: number; filaments: number }
    machine: {
      model?: string
      bedSizeMm?: [number, number]
      zHeightMm?: number
      nozzleMm?: number
      gcodeFlavor?: string
      defaultFilament?: string
      defaultProcess?: string
      supportsMultiFilament: boolean
      supportsWanNetwork: boolean
      supportsBedMeshCalibration: boolean
      supportsFilamentChange: boolean
      hostType?: string
    }
  }
  printer: TerraPrinterStatusResponse
  modelLibrary: {
    totalMatches: number
    previewed: number
    embeddedPreviews: number
    generatedPreviews: number
    roots: Array<{ label: string; path: string; exists: boolean }>
    errors: Array<string>
  }
  obsidian: { vaultPath: string; memoryNotePath: string; exists: boolean }
  agent: TerraAgentProfileClient
  workflow: Array<TerraWorkflowStepClient>
  capabilities: Array<TerraWorkbenchCapabilityClient>
}

type TerraPrintQaPacketResponse = {
  ok: true
  mode: 'read_only_camera_packet'
  checkedAtMs: number
  printer: TerraPrinterStatusResponse
  model?: {
    name?: string
    path?: string
    expectedPreviewAvailable: boolean
  }
  frame: {
    captured: boolean
    sourceUrl?: string
    contentType?: string
    bytes?: number
    width?: number
    height?: number
    error?: string
  }
  verdict: 'blocked' | 'ready_for_visual_analysis'
  note: string
  lockedActions: Array<string>
}

type TerraPrintQaResponse = TerraPrintQaPacketResponse | { ok: false; status: number; error: string }

type TerraVisualQaSignal = {
  id: string
  label: string
  state: 'ok' | 'risk' | 'unknown'
  value: string
  note: string
}

type TerraVisualQaReport = {
  analyzedAtMs: number
  verdict: 'camera_ok' | 'needs_review' | 'blocked'
  frame: { width: number; height: number }
  signals: Array<TerraVisualQaSignal>
  summary: string
}

type TerraPrintQaUiRun = {
  status: 'idle' | 'running' | 'ready' | 'blocked' | 'failed'
  auto: boolean
  runKey?: string
  startedAtMs: number
  completedAtMs?: number
  response?: TerraPrintQaPacketResponse
  visual?: TerraVisualQaReport
  error?: string
}

type TerraSlicePlanResponse =
  | {
      ok: true
      mode: 'dry_run_plan'
      createdAtMs: number
      outputFile: string
      commandPreview: string
      selected: {
        modelPath: string
        machineProfilePath: string
        processProfilePath: string
        filamentProfilePath: string
      }
      toggles: {
        flowCalibration: boolean
        bedLeveling: boolean
        timelapse: boolean
        capturePrint: boolean
      }
      lockedActions: Array<string>
      note: string
    }
  | { ok: false; status: number; error: string }

type TerraWorkbenchTab = 'web-search' | 'library' | 'prepare' | 'slice' | 'printer' | 'agent'

type TerraWorkbenchUiState = {
  tab: TerraWorkbenchTab
  selectedAssetId?: string
  selectedMachineProfileId?: string
  selectedProcessProfileId?: string
  selectedFilamentProfileId?: string
  internetQuery: string
  internetSearchStatus: 'idle' | 'running' | 'ready' | 'blocked' | 'failed'
  internetSearch?: TerraInternetModelSearchResponse
  internetSearchError?: string
  internetCandidateId?: string
  flowCalibration: boolean
  bedLeveling: boolean
  timelapse: boolean
  capturePrint: boolean
  agentPrompt: string
  receipt?: string
  slicePlan?: Extract<TerraSlicePlanResponse, { ok: true }>
  qaRun?: TerraPrintQaUiRun
  autoQaKey?: string
}

const initialTerraWorkbenchState: TerraWorkbenchUiState = {
  tab: 'prepare',
  internetQuery: '',
  internetSearchStatus: 'idle',
  flowCalibration: false,
  bedLeveling: false,
  timelapse: false,
  capturePrint: false,
  agentPrompt: '',
}

function terraWorkbenchTabForStation(stationId: TerraForgeStationId): TerraWorkbenchTab {
  if (stationId === 'terra-model-hunt') return 'web-search'
  if (stationId === 'terra-printer-control') return 'printer'
  return 'prepare'
}

type TerraAgentMotionTarget = {
  stationId: TerraForgeStationId
  kind: 'work' | 'approval' | 'talk'
  label: string
  badge: LivingV3BadgeKind
  packetLabel: string
}

function terraAgentMotionTarget(
  workbench: TerraWorkbenchUiState,
  printerStatus: TerraPrinterStatusResponse | null,
  capabilities: TerraWorkbenchCapabilitiesResponse | null,
  modelAssets: TerraModelAssetsResponse | null,
): TerraAgentMotionTarget {
  const lifecycle = printerStatus?.metrics.printLifecycle ?? capabilities?.printer.metrics.printLifecycle ?? 'unknown'
  if (workbench.qaRun?.status === 'running') {
    return {
      stationId: 'terra-printer-control',
      kind: 'work',
      label: 'Terra is inspecting the live camera frame',
      badge: 'active-task',
      packetLabel: 'Camera QA',
    }
  }
  if (workbench.tab === 'printer' || lifecycle === 'printing' || lifecycle === 'paused' || lifecycle === 'completed' || lifecycle === 'error') {
    return {
      stationId: 'terra-printer-control',
      kind: lifecycle === 'error' ? 'approval' : 'work',
      label: lifecycle === 'error' ? 'Terra is holding at Printer Control for fault review' : 'Terra is watching printer readback',
      badge: lifecycle === 'error' ? 'alert' : 'approval',
      packetLabel: 'Printer',
    }
  }
  if (workbench.internetSearchStatus === 'running') {
    return {
      stationId: 'terra-model-hunt',
      kind: 'work',
      label: 'Terra is searching Printables for source-backed models',
      badge: 'active-task',
      packetLabel: 'Web hunt',
    }
  }
  if (workbench.tab === 'web-search') {
    return {
      stationId: 'terra-model-hunt',
      kind: 'work',
      label: 'Terra is ready in Model Hunt',
      badge: 'active-task',
      packetLabel: 'Model hunt',
    }
  }
  if (workbench.tab === 'library' || (modelAssets?.totalMatches ?? capabilities?.modelLibrary.totalMatches ?? 0) <= 0) {
    return {
      stationId: 'terra-model-hunt',
      kind: 'work',
      label: 'Terra is searching the model library surface',
      badge: 'active-task',
      packetLabel: 'Models',
    }
  }
  if (workbench.tab === 'agent') {
    return {
      stationId: capabilities?.agent.currentFocus.stationId ?? 'terra-modeling-studio',
      kind: 'talk',
      label: 'Terra is reading Obsidian memory and 3D skills',
      badge: capabilities?.obsidian.exists ? 'active-task' : 'blocked',
      packetLabel: 'Memory',
    }
  }
  if (workbench.tab === 'slice' || workbench.slicePlan) {
    return {
      stationId: 'terra-modeling-studio',
      kind: 'work',
      label: 'Terra is building a no-execute slice plan',
      badge: 'active-task',
      packetLabel: 'Slice plan',
    }
  }
  return {
    stationId: 'terra-modeling-studio',
    kind: 'work',
    label: 'Terra is preparing the selected 3D model',
    badge: 'active-task',
    packetLabel: 'Prepare',
  }
}

function terraTaskFromCurrentState(state: LivingV3HermesAdapterState) {
  const task = state.tasks.find((candidate) => candidate.agentId === 'terra')
  return task ? { roomId: task.roomId, point: task.target } : undefined
}

function terraMotionTargetKey(target: TerraAgentMotionTarget) {
  return `${target.stationId}:${target.kind}:${target.badge}:${target.packetLabel}`
}

function formatTerraMetric(value: number | undefined, suffix = '') {
  return Number.isFinite(value ?? NaN) ? `${Math.round((value as number) * 10) / 10}${suffix}` : '--'
}

function formatTerraDuration(seconds: number | undefined) {
  if (!Number.isFinite(seconds ?? NaN)) return '--'
  const total = Math.max(0, Math.round(seconds as number))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function terraProgressValue(status: TerraPrinterStatusResponse | null) {
  const raw = status?.metrics.progressPercent
  return Number.isFinite(raw ?? NaN) ? Math.max(0, Math.min(100, raw as number)) : undefined
}

function terraProgressLabel(status: TerraPrinterStatusResponse | null) {
  const lifecycle = status?.metrics.printLifecycle ?? 'unknown'
  const progress = terraProgressValue(status)
  if (progress !== undefined) return `${Math.round(progress * 10) / 10}%`
  if (lifecycle === 'completed') return 'Done'
  if (lifecycle === 'printing') return 'Printing'
  if (lifecycle === 'paused') return 'Paused'
  return 'Waiting for status'
}

function terraConnectionLabel(status: TerraPrinterStatusResponse | null) {
  if (!status) return 'Checking…'
  if (status.state === 'ready') return 'Live'
  if (status.configured) return 'Discovered'
  return 'Setup needed'
}

type TerraHealthState = 'green' | 'yellow' | 'red' | 'gray'

type TerraHealthSummary = {
  state: TerraHealthState
  label: string
  detail: string
  checks: Array<{ label: string; ok: boolean; note: string }>
}

function terraHealthSummary(
  status: TerraPrinterStatusResponse | null,
  capabilities: TerraWorkbenchCapabilitiesResponse | null,
  modelAssets: TerraModelAssetsResponse | null,
): TerraHealthSummary {
  const lifecycle = status?.metrics.printLifecycle ?? 'unknown'
  const hasLibrary = (modelAssets?.totalMatches ?? capabilities?.modelLibrary.totalMatches ?? 0) > 0
  const hasSlicer = Boolean(capabilities?.slicer.appInstalled && capabilities.slicer.cliAvailable)
  const hasProfiles = Boolean((capabilities?.slicer.profileCounts.machines ?? 0) > 0 && (capabilities?.slicer.profileCounts.processes ?? 0) > 0 && (capabilities?.slicer.profileCounts.filaments ?? 0) > 0)
  const hasPrinterDiscovery = Boolean(status?.host || status?.printerId || status?.configured)
  const hasStatusRead = Boolean(status?.state === 'ready' || status?.statusUrl || status?.metrics.progressSource)
  const hasCamera = Boolean(status?.state === 'ready' && (status.cameraUrl || status.snapshotUrl))
  const checks = [
    { label: 'Model library', ok: hasLibrary, note: hasLibrary ? 'Local 3MF files indexed' : 'No local model index yet' },
    { label: 'Slicer', ok: hasSlicer, note: hasSlicer ? 'ElegooSlicer CLI discovered' : 'Slicer CLI not verified' },
    { label: 'Profiles', ok: hasProfiles, note: hasProfiles ? 'Machine/process/filament profiles ready' : 'Missing profile discovery' },
    { label: 'Printer status', ok: hasStatusRead, note: hasStatusRead ? 'Read-only status/progress source connected' : 'No verified status/progress source' },
    { label: 'Camera', ok: hasCamera, note: hasCamera ? 'Camera frame source connected' : 'No reachable camera stream' },
  ]
  if (!status || (!hasPrinterDiscovery && !hasSlicer && !hasLibrary)) {
    return { state: 'gray', label: 'Offline', detail: 'No printer workspace sources are connected yet.', checks }
  }
  if (status.error && status.state === 'ready') {
    return { state: 'red', label: 'Fault', detail: status.error, checks }
  }
  if (lifecycle === 'error') {
    return { state: 'red', label: 'Fault', detail: 'Printer lifecycle reported an error.', checks }
  }
  if (checks.every((check) => check.ok)) {
    return { state: 'green', label: 'Connected', detail: 'Model library, slicer, profiles, printer status, and camera are connected.', checks }
  }
  return {
    state: 'yellow',
    label: 'Partial',
    detail: typeof status.message === 'string' && status.message.trim()
      ? status.message
      : 'Some printer workspace sources are missing or not readable.',
    checks,
  }
}

function TerraHealthBeacon({ health }: { health: TerraHealthSummary }) {
  return (
    <div className={`living-v3__terra-health-beacon is-${health.state}`} data-terra-health={health.state} aria-label={`Terra health: ${health.label}`} title={health.detail}>
      <span aria-hidden="true" />
      <div>
        <b>{health.label}</b>
        <small>{health.state === 'green' ? 'All systems connected' : health.state === 'yellow' ? 'Needs attention' : health.state === 'red' ? 'Fault detected' : 'Offline'}</small>
      </div>
    </div>
  )
}

function TerraPrintProgressCard({ status }: { status: TerraPrinterStatusResponse | null }) {
  const metrics = status?.metrics ?? {}
  const progress = terraProgressValue(status)
  const lifecycle = metrics.printLifecycle ?? 'unknown'
  const isComplete = lifecycle === 'completed' || (progress ?? 0) >= 99.5
  const hasProgressSource = Boolean(metrics.progressSource)
  const source = metrics.progressSource ?? (status?.statusUrl ? 'Status connected, progress missing' : 'No live progress source')
  return (
    <section className="living-v3__terra-progress-card" data-terra-print-lifecycle={lifecycle} data-terra-progress-source={hasProgressSource ? 'live' : 'missing'} aria-label="Live print progress">
      <div className="living-v3__terra-progress-head">
        <div>
          <p>Monitor</p>
          <h3>{terraProgressLabel(status)}</h3>
          <span>{metrics.jobName ?? source}</span>
        </div>
        <strong className={isComplete ? 'is-complete' : lifecycle === 'error' ? 'is-risk' : hasProgressSource ? 'is-live' : 'is-muted'}>{isComplete ? 'DONE' : hasProgressSource ? lifecycle.toUpperCase() : 'NEEDS LIVE'}</strong>
      </div>
      <div className="living-v3__terra-progress-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-label="Verified print completion percentage">
        <span style={{ width: `${progress ?? 0}%` }} />
      </div>
      <dl className="living-v3__terra-progress-facts">
        <div><dt>Left</dt><dd>{formatTerraDuration(metrics.remainingSeconds)}</dd></div>
        <div><dt>Bed</dt><dd>{formatTerraMetric(metrics.bedTempC, ' °C')}</dd></div>
        <div><dt>Nozzle</dt><dd>{formatTerraMetric(metrics.nozzleTempC, ' °C')}</dd></div>
      </dl>
      <details className="living-v3__terra-proof living-v3__terra-compact-proof">
        <summary>Progress source</summary>
        <span>{source}</span>
        <span>{status?.message ?? 'Waiting for printer readback'}</span>
      </details>
    </section>
  )
}

function signalStateClass(state: TerraVisualQaSignal['state']) {
  return `is-${state}`
}

async function analyzeTerraCameraImage(imageUrl: string, expectedPreviewAvailable: boolean): Promise<TerraVisualQaReport> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Camera frame could not be loaded for visual QA.'))
    img.src = imageUrl
  })
  const width = Math.max(1, Math.min(160, image.naturalWidth || 160))
  const height = Math.max(1, Math.round(width * ((image.naturalHeight || 90) / (image.naturalWidth || 160))))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas visual QA context is unavailable.')
  context.drawImage(image, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  const luminance = new Float32Array(width * height)
  let sum = 0
  let min = 255
  let max = 0
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    const value = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]
    luminance[index] = value
    sum += value
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  const average = sum / luminance.length
  const contrast = max - min
  let edgeCount = 0
  let brightEdgeCount = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const dx = Math.abs(luminance[i] - luminance[i + 1])
      const dy = Math.abs(luminance[i] - luminance[i + width])
      const edge = Math.max(dx, dy)
      if (edge > 32) edgeCount += 1
      if (edge > 40 && luminance[i] > 138) brightEdgeCount += 1
    }
  }
  const interior = Math.max(1, (width - 2) * (height - 2))
  const edgeDensity = edgeCount / interior
  const brightEdgeDensity = brightEdgeCount / interior
  const signals: Array<TerraVisualQaSignal> = [
    average < 18
      ? { id: 'dark-frame', label: 'Camera visibility', state: 'risk', value: `avg ${average.toFixed(0)}`, note: 'Frame is very dark; agent cannot trust the inspection.' }
      : average > 238
        ? { id: 'bright-frame', label: 'Camera visibility', state: 'risk', value: `avg ${average.toFixed(0)}`, note: 'Frame is over-bright; print details may be washed out.' }
        : { id: 'exposure', label: 'Camera visibility', state: 'ok', value: `avg ${average.toFixed(0)}`, note: 'Exposure is usable for a first-pass camera check.' },
    contrast < 18
      ? { id: 'blank-low-contrast', label: 'Blank / covered frame', state: 'risk', value: `contrast ${contrast.toFixed(0)}`, note: 'Low contrast can mean a covered lens, empty view, or failed camera frame.' }
      : { id: 'contrast', label: 'Detail contrast', state: 'ok', value: `contrast ${contrast.toFixed(0)}`, note: 'Frame contains enough contrast for heuristic analysis.' },
    edgeDensity < 0.012
      ? { id: 'low-detail', label: 'Blur / low detail', state: 'risk', value: `${(edgeDensity * 100).toFixed(1)}% edges`, note: 'Very few edges; camera may be blurred or not pointed at the print.' }
      : { id: 'detail', label: 'Detail density', state: 'ok', value: `${(edgeDensity * 100).toFixed(1)}% edges`, note: 'Detail density is present.' },
    brightEdgeDensity > 0.13 && edgeDensity > 0.22
      ? { id: 'spaghetti-risk', label: 'Stringing / spaghetti risk', state: 'risk', value: `${(brightEdgeDensity * 100).toFixed(1)}% bright edges`, note: 'High bright thin-edge clutter can indicate loose filament strands or print failure. Needs human/Hermes visual confirmation.' }
      : { id: 'spaghetti-scan', label: 'Stringing / spaghetti risk', state: 'ok', value: `${(brightEdgeDensity * 100).toFixed(1)}% bright edges`, note: 'No high-clutter stringing signal in this single frame.' },
    expectedPreviewAvailable
      ? { id: 'expected-preview', label: 'Expected model preview', state: 'unknown', value: 'side-by-side', note: 'Expected preview is available; semantic shape match still needs visual/Hermes review, not a fake pass.' }
      : { id: 'expected-preview-missing', label: 'Expected model preview', state: 'unknown', value: 'missing', note: 'No expected preview was selected, so Terra cannot compare shape intent.' },
  ]
  const riskCount = signals.filter((signal) => signal.state === 'risk').length
  return {
    analyzedAtMs: Date.now(),
    verdict: riskCount > 0 ? 'needs_review' : 'camera_ok',
    frame: { width: image.naturalWidth || width, height: image.naturalHeight || height },
    signals,
    summary: riskCount > 0 ? `${riskCount} visual risk signal(s) detected in the camera frame.` : 'Camera frame passed first-pass heuristic QA. Semantic shape match still requires visual confirmation.',
  }
}

function TerraAssetLibrary({
  result,
  loading,
  error,
  onRefresh,
  selectedAssetId,
  onSelectAsset,
}: {
  result: TerraModelAssetsResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  selectedAssetId?: string
  onSelectAsset?: (asset: TerraModelAssetClient) => void
}) {
  const assets = result?.assets ?? []
  const rootSummary = result?.roots.filter((root) => root.exists).map((root) => root.label).slice(0, 4).join(' · ') || 'Downloads · HermesFactory · Documents'
  return (
    <section className="living-v3__terra-asset-library" data-terra-assets-count={assets.length} aria-label="Local 3MF model library">
      <div className="living-v3__terra-panel-head">
        <div>
          <b>3MF Library</b>
          <span>{loading ? 'Scanning…' : `${assets.length}/${result?.totalMatches ?? 0} files`} · {rootSummary}</span>
        </div>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      {error && <p className="living-v3__terra-error">{error}</p>}
      {!loading && !error && assets.length === 0 && <p className="living-v3__terra-empty">No .3mf files found in the safe local roots.</p>}
      <div className="living-v3__terra-asset-grid">
        {assets.map((asset) => {
          const selected = selectedAssetId === asset.id
          return (
          <article
            key={asset.id}
            title={asset.path}
            data-preview-kind={asset.preview.kind}
            data-selected={selected ? 'true' : 'false'}
            className={selected ? 'is-selected' : ''}
            onClick={() => onSelectAsset?.(asset)}
            tabIndex={onSelectAsset ? 0 : undefined}
            onKeyDown={(event) => {
              if (!onSelectAsset) return
              if (event.key === 'Enter' || event.key === ' ') onSelectAsset(asset)
            }}
          >
            <div className="living-v3__terra-asset-preview">
              {asset.preview.dataUrl ? (
                <img src={asset.preview.dataUrl} alt={`${asset.name} preview`} loading="lazy" />
              ) : (
                <span>3MF</span>
              )}
              <em>{asset.preview.kind === 'embedded' ? 'embedded preview' : asset.preview.kind === 'generated' ? 'generated render' : 'no preview'}</em>
            </div>
            <div className="living-v3__terra-asset-meta">
              <span>{asset.rootLabel}</span>
              <b>{asset.name}</b>
              <small>{asset.sizeLabel} · {asset.modifiedLabel}</small>
              <small>{asset.preview.source ?? asset.preview.note ?? '3MF package'}</small>
              <code>{asset.displayPath}</code>
            </div>
          </article>
          )
        })}
      </div>
      {result?.errors.length ? (
        <details className="living-v3__terra-proof">
          <summary>Scan notes</summary>
          {result.errors.map((item) => <span key={item}>{item}</span>)}
        </details>
      ) : null}
    </section>
  )
}

function TerraInternetModelSearchPanel({
  query,
  status,
  result,
  error,
  onQueryChange,
  onRunSearch,
  onStageCandidate,
}: {
  query: string
  status: TerraWorkbenchUiState['internetSearchStatus']
  result?: TerraInternetModelSearchResponse
  error?: string
  onQueryChange: (value: string) => void
  onRunSearch: () => void
  onStageCandidate: (candidate: TerraInternetModelCandidateClient) => void
}) {
  const candidates = result?.candidates ?? []
  const busy = status === 'running'
  const blocked = status === 'blocked' || status === 'failed' || result?.status === 'blocked'
  return (
    <section className="living-v3__terra-web-search" data-terra-model-search={result?.status ?? status} aria-label="Internet model search">
      <div className="living-v3__terra-web-search-hero">
        <div>
          <p>Model Hunt</p>
          <h3>{busy ? 'Terra is searching…' : 'Search free printable models'}</h3>
          <span>Printables · free · non-AI · popular · read-only. No download, slice, upload, or print starts here.</span>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onRunSearch() }}>
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="desk organizer, cable clip, articulated toy…" aria-label="Terra internet model search query" />
          <button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search models'}</button>
        </form>
      </div>

      <div className="living-v3__terra-web-readback" role="status">
        <b>{busy ? 'קיבלתי — Terra מחפשת עכשיו' : blocked ? 'החיפוש נחסם / לא זמין' : candidates.length ? `${candidates.length} מועמדים מוכנים` : 'מוכן לחיפוש'}</b>
        <span>{result?.sourceNote ?? 'התוצאה תחזור ככרטיסים קצרים: מקור / רישיון / סיכון / השלב הבא.'}</span>
        {error && <small>{error}</small>}
        {result?.error && <small>{result.error}</small>}
      </div>

      <div className="living-v3__terra-web-candidates" data-terra-web-candidate-count={candidates.length}>
        {candidates.map((candidate) => (
          <article key={candidate.id}>
            <div className="living-v3__terra-web-image">
              {candidate.imageUrl ? <img src={candidate.imageUrl} alt={`${candidate.title} preview`} loading="lazy" /> : <span>NO IMAGE</span>}
              <b>{candidate.score}</b>
            </div>
            <div className="living-v3__terra-web-card-body">
              <span>{candidate.source} · {candidate.category ?? 'category unknown'}</span>
              <h4>{candidate.title}</h4>
              <p>{candidate.license ?? 'License missing — check before commercial/remix use'}</p>
              <div className="living-v3__terra-web-metrics">
                <small>{candidate.likes} likes</small>
                <small>{candidate.downloads} downloads</small>
                <small>{candidate.rating ? `${candidate.rating} rating` : 'no rating'}</small>
              </div>
              <div className="living-v3__terra-web-risks">
                {(candidate.riskFlags.length ? candidate.riskFlags : ['basic license/source check still required']).map((flag) => <small key={flag}>{flag}</small>)}
              </div>
              <div className="living-v3__terra-web-actions">
                <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
                <button type="button" onClick={() => onStageCandidate(candidate)}>Stage for Terra</button>
              </div>
            </div>
          </article>
        ))}
        {!busy && !blocked && result && candidates.length === 0 && <p className="living-v3__terra-empty">No strong candidates came back. Try a simpler keyword.</p>}
      </div>

      <details className="living-v3__terra-proof living-v3__terra-compact-proof">
        <summary>Search locks / readback</summary>
        <span>skill: {result?.skillBasis ?? 'free-trending-printable-model-discovery'}</span>
        <span>filters: free · aiGenerated=false · popular · {result?.filters.publishedDateLimitDays ?? 60} days</span>
        {(result?.lockedActions ?? ['download_model_file', 'slice_model', 'printer_upload', 'printer_start']).map((item) => <span key={item}>locked: {item}</span>)}
      </details>
    </section>
  )
}

function TerraPrinterPanel({
  status,
  loading,
  error,
  frameNonce,
  onRefresh,
}: {
  status: TerraPrinterStatusResponse | null
  loading: boolean
  error: string | null
  frameNonce: number
  onRefresh: () => void
}) {
  const manualFrameRequested = frameNonce > 0
  const imageUrl = manualFrameRequested
    && (status?.state === 'ready' || status?.state === 'configured')
    && status.cameraRequestMode !== 'unavailable'
    ? `/api/war-room/terra-printer-frame?ts=${frameNonce}`
    : undefined
  const metrics = status?.metrics ?? {}
  const liveLabel = terraConnectionLabel(status)
  return (
    <section className="living-v3__terra-printer-panel" data-terra-printer-state={status?.state ?? 'loading'} aria-label="Printer read-only status">
      <div className="living-v3__terra-panel-head">
        <div>
          <b>{status?.name ?? 'Printer'}</b>
          <span>{loading ? 'Checking…' : liveLabel}</span>
        </div>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      {error && <p className="living-v3__terra-error">{error}</p>}
      <div className="living-v3__terra-printer-live" aria-label="Printer live read-only panel">
        <div className="living-v3__terra-camera-wrap" data-live-state={status?.state ?? 'loading'}>
          {imageUrl ? (
            <img className="living-v3__terra-camera-feed" src={imageUrl} alt="Printer live camera feed" />
          ) : (
            <div className="living-v3__terra-camera-placeholder"><span>{status?.configured ? 'MANUAL FRAME ONLY' : 'SETUP NEEDED'}</span></div>
          )}
          <strong>{imageUrl ? 'FRAME' : status?.state === 'ready' ? 'MANUAL' : liveLabel.toUpperCase()}</strong>
        </div>
        <dl>
          <div><dt>Connection</dt><dd>{liveLabel}</dd></div>
          <div><dt>Host</dt><dd>{status?.host ?? status?.cameraUrl?.replace(/^https?:\/\//, '').split('/')[0] ?? '--'}</dd></div>
          <div><dt>Temps</dt><dd>{formatTerraMetric(metrics.bedTempC, ' °C')} / {formatTerraMetric(metrics.nozzleTempC, ' °C')}</dd></div>
        </dl>
      </div>
      <details className="living-v3__terra-proof living-v3__terra-compact-proof">
        <summary>Printer details</summary>
        <span>{status?.message ?? 'Waiting for readback'}</span>
        <span>source: {status?.source ?? 'local route'}</span>
        <span>config: {status?.configPath ?? '~/.hermes/terra-printer.json'}</span>
        {status?.host && <span>host: {status.host}</span>}
        {status?.firmwareVersion && <span>firmware: {status.firmwareVersion}</span>}
        {(status?.discoveryNotes ?? []).slice(0, 4).map((note) => <span key={note}>{note}</span>)}
      </details>
    </section>
  )
}

function TerraLiveNowConsole({
  status,
  health,
  selectedAsset,
  onRefresh,
  onOpenLibrary,
  onOpenSlice,
  onRunQa,
}: {
  status: TerraPrinterStatusResponse | null
  health: TerraHealthSummary
  selectedAsset?: TerraModelAssetClient
  onRefresh: () => void
  onOpenLibrary: () => void
  onOpenSlice: () => void
  onRunQa: () => void
}) {
  const progress = terraProgressValue(status)
  const lifecycle = status?.metrics.printLifecycle ?? 'unknown'
  const hasProgress = progress !== undefined || lifecycle !== 'unknown'
  const hasCamera = Boolean(status?.state === 'ready' && (status.cameraUrl || status.snapshotUrl))
  const hasPrinterSite = Boolean(status?.statusUrl)
  const controlRows = [
    {
      label: 'Print meter',
      value: hasProgress ? terraProgressLabel(status) : 'No verified source',
      state: hasProgress ? 'ok' : 'needs',
      note: hasProgress ? 'Progress is coming from a verified read-only field.' : 'Needs a readable API/MQTT status channel before showing percent or ETA.',
    },
    {
      label: 'Camera stream',
      value: hasCamera ? 'Live' : 'Unavailable',
      state: hasCamera ? 'ok' : 'needs',
      note: hasCamera ? 'Frame capture and visual QA are available.' : 'No reachable camera frame source right now.',
    },
    {
      label: 'Printer site',
      value: hasPrinterSite ? 'Available' : 'No dashboard',
      state: hasPrinterSite ? 'ok' : 'muted',
      note: hasPrinterSite ? 'A status/dashboard URL is available.' : 'The printer is discoverable, but does not expose a usable web/status page here.',
    },
    {
      label: 'Safety',
      value: 'Side effects locked',
      state: 'muted',
      note: 'Commands appear only after a real sender and approval flow exist.',
    },
  ]
  return (
    <section className="living-v3__terra-live-now" aria-label="Printer command center">
      <div className="living-v3__terra-live-now-main">
        <TerraHealthBeacon health={health} />
        <p>Printer Command Center</p>
        <h3>{health.label}</h3>
        <span>{health.detail}</span>
        <div>
          <button type="button" onClick={onRefresh}>Refresh status</button>
          <button type="button" onClick={onOpenSlice}>Prepare slicer</button>
          <button type="button" onClick={onOpenLibrary}>Model library</button>
          {hasCamera && <button type="button" onClick={onRunQa}>Inspect camera frame</button>}
        </div>
      </div>
      <div className="living-v3__terra-live-now-grid">
        {controlRows.map((row) => (
          <article key={row.label} className={`is-${row.state}`}>
            <span>{row.label}</span>
            <b>{row.value}</b>
            <small>{row.note}</small>
          </article>
        ))}
      </div>
      <div className="living-v3__terra-live-now-next">
        <b>Connection map</b>
        <span>Camera and print meter are separate features, but both need a readable live printer channel. The printer is discovered; status/progress and camera readback are not available yet.</span>
        <div className="living-v3__terra-health-checks">
          {health.checks.map((check) => (
            <span key={check.label} className={check.ok ? 'is-ok' : 'is-missing'}>
              <b>{check.label}</b>
              <small>{check.note}</small>
            </span>
          ))}
        </div>
        {selectedAsset && <small>Selected model: {selectedAsset.name}</small>}
      </div>
    </section>
  )
}

function TerraPrintQaAgentPanel({
  status,
  selectedAsset,
  frameNonce,
  qaRun,
  onRunQa,
}: {
  status: TerraPrinterStatusResponse | null
  selectedAsset?: TerraModelAssetClient
  frameNonce: number
  qaRun?: TerraPrintQaUiRun
  onRunQa: (options?: { auto?: boolean; runKey?: string }) => void
}) {
  const manualFrameRequested = frameNonce > 0
  const imageUrl = manualFrameRequested
    && (status?.state === 'ready' || status?.state === 'configured')
    && status.cameraRequestMode !== 'unavailable'
    ? `/api/war-room/terra-printer-frame?qa=${frameNonce}`
    : undefined
  const canInspectFrame = Boolean(imageUrl)
  const lifecycle = status?.metrics.printLifecycle ?? 'unknown'
  const isComplete = lifecycle === 'completed' || (terraProgressValue(status) ?? 0) >= 99.5
  const visual = qaRun?.visual
  const response = qaRun?.response
  const statusLabel = qaRun?.status === 'running'
    ? 'Inspecting…'
    : qaRun?.status === 'blocked'
      ? 'Camera blocked'
      : qaRun?.status === 'failed'
        ? 'QA failed'
        : visual?.verdict === 'needs_review'
          ? 'Needs review'
          : visual?.verdict === 'camera_ok'
            ? 'Camera QA ok'
            : isComplete
              ? 'Ready after completion'
              : 'Waiting for completion or manual run'
  return (
    <section className="living-v3__terra-qa-agent" data-terra-qa-state={qaRun?.status ?? 'idle'} data-terra-qa-verdict={visual?.verdict ?? response?.verdict ?? 'waiting'} aria-label="Terra post-print camera QA agent">
      <div className="living-v3__terra-qa-head">
        <div>
          <p>Terra QA Agent</p>
          <h3>{statusLabel}</h3>
          <span>{isComplete ? 'Completion detected — checking camera.' : 'One click inspection. Auto-runs after completion.'}</span>
        </div>
        {canInspectFrame ? (
          <button type="button" disabled={qaRun?.status === 'running'} onClick={() => onRunQa({ auto: false })}>
            Inspect current frame
          </button>
        ) : (
          <span className="living-v3__terra-unavailable-action">Camera unavailable</span>
        )}
      </div>
      <div className="living-v3__terra-qa-compare">
        <figure>
          <figcaption>Expected model</figcaption>
          {selectedAsset?.preview.dataUrl ? <img src={selectedAsset.preview.dataUrl} alt={`${selectedAsset.name} expected model preview`} /> : <div><span>NO PREVIEW</span></div>}
          <small>{selectedAsset?.name ?? 'No model selected'}</small>
        </figure>
        <figure>
          <figcaption>Camera frame</figcaption>
          {imageUrl ? <img src={imageUrl} alt="Printer camera frame for QA" /> : <div><span>NO CAMERA</span></div>}
          <small>{response?.frame.captured ? `${response.frame.bytes ?? '--'} bytes · ${response.frame.width ?? '?'}×${response.frame.height ?? '?'}` : response?.frame.error ?? status?.message ?? 'waiting for camera'}</small>
        </figure>
      </div>
      {qaRun?.error && <p className="living-v3__terra-error">{qaRun.error}</p>}
      {response && <p className="living-v3__terra-qa-note">{response.note}</p>}
      {visual ? (
        <div className="living-v3__terra-qa-report">
          <strong>{visual.summary}</strong>
          <div>
            {visual.signals.map((signal) => (
              <article key={signal.id} className={signalStateClass(signal.state)}>
                <span>{signal.label}</span>
                <b>{signal.value}</b>
                <small>{signal.note}</small>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="living-v3__terra-qa-empty">
          <span><b>Camera</b>{status?.state === 'ready' ? 'Ready' : 'Needs connection'}</span>
          <span><b>Failure scan</b>Spaghetti · blur · dark frame</span>
          <span><b>Compare</b>{selectedAsset?.preview.dataUrl ? 'Model preview ready' : 'Choose model'}</span>
        </div>
      )}
      <details className="living-v3__terra-proof living-v3__terra-compact-proof">
        <summary>QA safety gates</summary>
        {(response?.lockedActions ?? ['qa_pass_auto_approve', 'printer_stop', 'printer_retry', 'printer_remove_part']).map((action) => <span key={action}>{action}</span>)}
      </details>
    </section>
  )
}

function TerraForgeStationSurface({
  station,
  modelAssets,
  modelAssetsLoading,
  modelAssetsError,
  printerStatus,
  printerLoading,
  printerError,
  onRefreshModelAssets,
  printerFrameNonce,
  onRefreshPrinter,
  onRequestPrinterFrame,
}: {
  station: LivingV3StationDefinition
  modelAssets: TerraModelAssetsResponse | null
  modelAssetsLoading: boolean
  modelAssetsError: string | null
  printerStatus: TerraPrinterStatusResponse | null
  printerLoading: boolean
  printerError: string | null
  printerFrameNonce: number
  onRefreshModelAssets: () => void
  onRefreshPrinter: () => void
  onRequestPrinterFrame?: () => void
}) {
  const config = isTerraForgeStationId(station.id) ? TERRA_FORGE_TOOL_CONFIG[station.id] : undefined
  if (!config) return null
  const isPrinter = station.id === 'terra-printer-control'

  return (
    <div className="living-v3__terra-shell" data-station-app="terra-forge-tool" data-terra-tool={config.toolId}>
      <div className="living-v3__terra-fastbar" aria-label="Terra Forge skill gates">
        <b>Terra</b>
        <div>{config.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
        <small>{config.safety}</small>
      </div>

      <div className="living-v3__terra-command-row">
        <label>
          <span>{config.eyebrow}</span>
          <input placeholder={config.placeholder} aria-label={`${station.label} input`} />
        </label>
        <WorkspaceStationCta
          actionId={`terra.${config.toolId}`}
          label={config.primaryAction}
          sublabel="Locked until real sender + approval + readback are wired"
          status="locked"
          ownerAgentId="terra"
          ownerLabel="Terra"
          targetRoomId="terra-forge"
          targetStationId={station.id as TerraForgeStationId}
          targetToolLabel={config.title}
          motionSignal="blocked-at-gate"
          position="standard-dock-right"
          disabled
          secondaryActions={[
            {
              id: isPrinter ? 'refresh-printer' : 'refresh-model-assets',
              label: isPrinter ? 'Refresh printer' : 'Refresh models',
              onClick: isPrinter ? onRefreshPrinter : onRefreshModelAssets,
            },
          ]}
          proofSummary="Terra can prepare/read local assets here. Printer/model side effects stay locked until approval and readback exist."
          proofItems={[config.safety, ...config.proof.slice(0, 2)]}
        />
      </div>

      <div className="living-v3__terra-cards">
        {config.cards.map((card) => (
          <article key={card.label}>
            <span>{card.label}</span>
            <b>{card.value}</b>
            <small>{card.meta}</small>
          </article>
        ))}
      </div>

      {isPrinter ? (
        <TerraPrinterPanel
          status={printerStatus}
          loading={printerLoading}
          error={printerError}
          frameNonce={printerFrameNonce}
          onRefresh={onRequestPrinterFrame ?? onRefreshPrinter}
        />
      ) : (
        <TerraAssetLibrary
          result={modelAssets}
          loading={modelAssetsLoading}
          error={modelAssetsError}
          onRefresh={onRefreshModelAssets}
        />
      )}

      <details className="living-v3__terra-proof">
        <summary>Skills / readback</summary>
        {config.proof.map((item) => <span key={item}>{item}</span>)}
      </details>
    </div>
  )
}

function terraDefaultProfile(profiles: Array<TerraSlicerProfileClient>, selectedId?: string) {
  return profiles.find((profile) => profile.id === selectedId) ?? profiles.find((profile) => profile.default) ?? profiles.at(0)
}

function TerraStatePill({ state }: { state: TerraWorkflowStepClient['state'] }) {
  return <span className={`living-v3__terra-state-pill is-${state}`}>{state}</span>
}

function TerraProfileSelect({
  label,
  profiles,
  value,
  onChange,
}: {
  label: string
  profiles: Array<TerraSlicerProfileClient>
  value?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="living-v3__terra-profile-select">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.name}{profile.default ? ' · default' : ''}</option>
        ))}
      </select>
      <small>{profiles.find((profile) => profile.id === value)?.displayPath ?? `${profiles.length} live profiles`}</small>
    </label>
  )
}

function TerraToggle({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: (value: boolean) => void; note: string }) {
  return (
    <label className="living-v3__terra-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
      <small>{note}</small>
    </label>
  )
}

function TerraCapabilityMatrix({ capabilities }: { capabilities: Array<TerraWorkbenchCapabilityClient> }) {
  return (
    <div className="living-v3__terra-capability-grid" aria-label="Terra verified capability matrix">
      {capabilities.map((capability) => (
        <article key={capability.id} className={`is-${capability.state}`}>
          <div>
            <b>{capability.label}</b>
            <TerraStatePill state={capability.state} />
          </div>
          <p>{capability.note}</p>
          <small>{capability.source}</small>
          <div>{capability.evidence.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
        </article>
      ))}
    </div>
  )
}

type TerraSlicePlanPayload = {
  modelPath?: string
  machineProfilePath?: string
  processProfilePath?: string
  filamentProfilePath?: string
  flowCalibration: boolean
  bedLeveling: boolean
  timelapse: boolean
  capturePrint: boolean
}

function WarRoomQuickSwitch({
  value,
  label = 'Switch War Room surface',
  onSwitch,
}: {
  value: LivingV3RoomId | ''
  label?: string
  onSwitch: (roomId: LivingV3RoomId) => void
}) {
  return (
    <select
      className="living-v3__workspace-room-switcher"
      aria-label={label}
      value={value}
      onChange={(event) => {
        const roomId = event.target.value as LivingV3RoomId | ''
        if (roomId) onSwitch(roomId)
      }}
    >
      {LIVING_V3_WORLD_CONFIG.rooms.map((room) => (
        <option key={room.id} value={room.id}>{room.label}</option>
      ))}
    </select>
  )
}

function TerraForgePrimaryWorkspace({
  selectedStation,
  modelAssets,
  modelAssetsLoading,
  modelAssetsError,
  printerStatus,
  printerLoading,
  printerError,
  printerFrameNonce,
  capabilities,
  capabilitiesLoading,
  capabilitiesError,
  state,
  onUpdateState,
  onSwitchRoom,
  onSelectStation,
  onRefreshModelAssets,
  onRefreshPrinter,
  onRequestPrinterFrame,
  onRefreshCapabilities,
  onRunInternetModelSearch,
  onStageInternetCandidate,
  onBuildSlicePlan,
  onRunPrintQa,
  onStageReceipt,
}: {
  selectedStation: LivingV3StationDefinition
  modelAssets: TerraModelAssetsResponse | null
  modelAssetsLoading: boolean
  modelAssetsError: string | null
  printerStatus: TerraPrinterStatusResponse | null
  printerLoading: boolean
  printerError: string | null
  printerFrameNonce: number
  capabilities: TerraWorkbenchCapabilitiesResponse | null
  capabilitiesLoading: boolean
  capabilitiesError: string | null
  state: TerraWorkbenchUiState
  onUpdateState: (patch: Partial<TerraWorkbenchUiState>) => void
  onSwitchRoom: (roomId: LivingV3RoomId) => void
  onSelectStation: (stationId: TerraForgeStationId) => void
  onRefreshModelAssets: () => void
  onRefreshPrinter: () => void
  onRequestPrinterFrame: () => void
  onRefreshCapabilities: () => void
  onRunInternetModelSearch: () => void
  onStageInternetCandidate: (candidate: TerraInternetModelCandidateClient) => void
  onBuildSlicePlan: (payload: TerraSlicePlanPayload) => void
  onRunPrintQa: (options?: { auto?: boolean; runKey?: string }) => void
  onStageReceipt: (receipt: string) => void
}) {
  const assets = modelAssets?.assets ?? []
  const selectedAsset = assets.find((asset) => asset.id === state.selectedAssetId) ?? assets.at(0)
  const stagedInternetCandidate = state.internetSearch?.candidates.find((candidate) => candidate.id === state.internetCandidateId)
  const machines = capabilities?.slicer.profiles.machines ?? []
  const processes = capabilities?.slicer.profiles.processes ?? []
  const filaments = capabilities?.slicer.profiles.filaments ?? []
  const machineProfile = terraDefaultProfile(machines, state.selectedMachineProfileId)
  const processProfile = terraDefaultProfile(processes, state.selectedProcessProfileId)
  const filamentProfile = terraDefaultProfile(filaments, state.selectedFilamentProfileId)
  const livePrinterStatus = printerStatus ?? capabilities?.printer ?? null
  const terraAgent = livingV3AgentById('terra')
  const terraAgentProfile = capabilities?.agent
  const readyTerraSkills = terraAgentProfile?.skills.filter((skill) => skill.state === 'ready') ?? []
  const health = terraHealthSummary(livePrinterStatus, capabilities, modelAssets)
  const workspaceTitle = selectedStation.id === 'terra-printer-control'
    ? '3D Printer Control'
    : selectedStation.id === 'terra-model-hunt'
      ? '3D Model Hunt'
      : '3D Model Preparation'
  const workspaceSubtitle = selectedStation.id === 'terra-printer-control'
    ? (capabilitiesLoading ? 'Refreshing model, slicer, printer, and camera readbacks…' : capabilities?.slicer.selectedMachine ?? 'ElegooSlicer capability discovery')
    : selectedStation.id === 'terra-model-hunt'
      ? `${state.internetSearch?.candidates.length ?? 0} web candidates · ${modelAssets?.totalMatches ?? capabilities?.modelLibrary.totalMatches ?? 0} local 3MF files`
      : 'Select a model, machine profile, process, filament, calibration, and capture settings'
  const canPlanSlice = Boolean(selectedAsset && machineProfile && processProfile && filamentProfile && capabilities?.slicer.cliAvailable)
  const lifecycle = livePrinterStatus?.metrics.printLifecycle ?? 'unknown'
  const completionKey = `${livePrinterStatus?.metrics.jobName ?? selectedAsset?.name ?? 'unknown-job'}:${selectedAsset?.id ?? 'no-model'}:${Math.round(terraProgressValue(livePrinterStatus) ?? 0)}:${lifecycle}`
  const runTerraPrimaryAction = () => {
    if (selectedStation.id === 'terra-model-hunt') {
      onRunInternetModelSearch()
      return
    }
    if (selectedStation.id === 'terra-printer-control') {
      onRefreshPrinter()
      return
    }
    if (canPlanSlice) {
      onBuildSlicePlan({
        modelPath: selectedAsset?.path,
        machineProfilePath: machineProfile?.path,
        processProfilePath: processProfile?.path,
        filamentProfilePath: filamentProfile?.path,
        flowCalibration: state.flowCalibration,
        bedLeveling: state.bedLeveling,
        timelapse: state.timelapse,
        capturePrint: state.capturePrint,
      })
      return
    }
    onRefreshModelAssets()
  }

  const activeArtifactImage = selectedAsset?.preview.dataUrl ?? stagedInternetCandidate?.imageUrl
  const activeArtifactName = selectedAsset?.name ?? stagedInternetCandidate?.title ?? 'Choose a model'
  const activeArtifactMeta = selectedAsset?.displayPath ?? stagedInternetCandidate?.sourceUrl ?? 'Start with Library or Web Hunt'
  const forgePipeline = [
    { id: 'idea', label: 'Find', state: state.internetSearch?.candidates.length || selectedAsset || stagedInternetCandidate ? 'ready' : 'waiting', value: state.internetSearch?.candidates.length ? `${state.internetSearch.candidates.length} sources` : stagedInternetCandidate ? 'shortlisted' : 'start hunt', tab: 'web-search' as TerraWorkbenchTab, action: 'Search' },
    { id: 'model', label: 'Model', state: selectedAsset ? 'ready' : stagedInternetCandidate ? 'waiting' : 'blocked', value: selectedAsset ? 'selected model' : stagedInternetCandidate ? 'candidate ready' : 'choose model', tab: selectedAsset ? 'prepare' as TerraWorkbenchTab : 'library' as TerraWorkbenchTab, action: selectedAsset ? 'Prepare' : 'Choose' },
    { id: 'qa', label: 'Mesh', state: selectedAsset?.preview.dataUrl ? 'ready' : selectedAsset ? 'waiting' : 'blocked', value: selectedAsset?.preview.kind ?? 'needs preview', tab: 'prepare' as TerraWorkbenchTab, action: 'Check' },
    { id: 'slicer', label: 'Slice', state: canPlanSlice ? 'ready' : 'blocked', value: capabilities?.slicer.cliAvailable ? 'CLI ready' : 'setup needed', tab: canPlanSlice ? 'slice' as TerraWorkbenchTab : 'prepare' as TerraWorkbenchTab, action: canPlanSlice ? 'Build' : 'Setup' },
    { id: 'printer', label: 'Printer', state: livePrinterStatus?.state === 'ready' ? 'ready' : livePrinterStatus?.configured ? 'waiting' : 'blocked', value: livePrinterStatus?.state === 'unreachable' ? 'offline' : livePrinterStatus?.state ?? 'checking', tab: 'printer' as TerraWorkbenchTab, action: 'Open' },
    { id: 'gate', label: 'Gate', state: state.qaRun?.visual ? 'ready' : 'locked', value: state.qaRun?.visual?.verdict ?? 'locked', tab: 'printer' as TerraWorkbenchTab, action: 'Inspect' },
  ]
  const forgePrimaryActions = [
    { id: 'choose', label: selectedAsset ? 'Change model' : 'Choose model', hint: activeArtifactName, disabled: false, run: () => onUpdateState({ tab: selectedAsset ? 'library' : 'web-search' }) },
    { id: 'prepare', label: 'Profiles', hint: machineProfile && processProfile && filamentProfile ? 'Ready' : 'Pick machine/process/filament', disabled: false, run: () => onUpdateState({ tab: 'prepare' }) },
    { id: 'slice', label: canPlanSlice ? 'Build dry-run' : 'Setup slice', hint: canPlanSlice ? 'No printer start' : 'Needs model + profiles', disabled: false, run: () => (canPlanSlice ? runTerraPrimaryAction() : onUpdateState({ tab: 'prepare' })) },
    { id: 'printer', label: 'Printer readback', hint: livePrinterStatus?.state ?? 'checking', disabled: false, run: () => onUpdateState({ tab: 'printer' }) },
    { id: 'locked', label: 'Printer start locked', hint: 'Approval + sender missing', disabled: true, run: () => undefined },
  ]
  const forgeReadbackCards = [
    { label: 'Model', value: activeArtifactName, meta: activeArtifactMeta },
    { label: 'Machine', value: machineProfile?.name ?? 'none', meta: machineProfile?.displayPath ?? 'profile missing' },
    { label: 'Process', value: processProfile?.name ?? 'none', meta: processProfile?.displayPath ?? 'profile missing' },
    { label: 'Filament', value: filamentProfile?.name ?? 'none', meta: filamentProfile?.displayPath ?? 'profile missing' },
    { label: 'Output', value: state.slicePlan?.outputFile.split('/').pop() ?? 'not staged', meta: state.slicePlan?.note ?? 'dry-run plan only' },
  ]
  const manualCameraFrameRequested = printerFrameNonce > 0
  const canRequestCameraFrame = Boolean(
    (livePrinterStatus?.state === 'ready' || livePrinterStatus?.state === 'configured')
      && livePrinterStatus.cameraRequestMode !== 'unavailable',
  )
  const cameraFrameSrc = manualCameraFrameRequested && (livePrinterStatus?.state === 'ready' || livePrinterStatus?.state === 'configured')
    && livePrinterStatus.cameraRequestMode !== 'unavailable'
    ? `/api/war-room/terra-printer-frame?studio=${printerFrameNonce}`
    : undefined
  const materialOptions = filaments.slice(0, 8).map((profile) => ({
    id: profile.id,
    label: profile.name,
    material: profile.material ?? 'unknown material',
    color: profile.color,
    note: profile.default ? 'default profile' : profile.source,
    active: profile.id === filamentProfile?.id,
    onSelect: () => onUpdateState({ selectedFilamentProfileId: profile.id, receipt: `Filament/color changed locally to ${profile.name}. Printer filament change is still approval-gated.` }),
  }))
  const forgeProduction = {
    camera: {
      title: cameraFrameSrc ? 'Printer camera readback' : canRequestCameraFrame ? 'Camera is disconnected' : 'Camera unavailable',
      status: printerLoading
        ? 'Checking printer status only…'
        : cameraFrameSrc
          ? 'A real frame was requested through the verified printer route. Failures stay visible; no substitute image is used.'
          : canRequestCameraFrame
            ? 'Choose Connect camera to request one verified frame from the printer. Nothing runs in the background.'
            : livePrinterStatus?.message ?? 'Waiting for printer readback',
      liveLabel: cameraFrameSrc ? 'FRAME REQUESTED' : canRequestCameraFrame ? 'CAMERA IDLE' : 'NO CAMERA',
      imageSrc: cameraFrameSrc,
      actionLabel: printerLoading ? 'Checking…' : cameraFrameSrc ? 'Reload camera' : 'Connect camera',
      actionDisabled: !canRequestCameraFrame || printerLoading,
      inspectLabel: 'Inspect camera frame',
      inspectDisabled: !canRequestCameraFrame || state.qaRun?.status === 'running',
      onRefresh: onRequestPrinterFrame,
      onInspect: () => onRunPrintQa({ auto: false }),
    },
    printer: {
      name: livePrinterStatus?.name ?? 'Elegoo printer',
      connection: terraConnectionLabel(livePrinterStatus),
      progress: terraProgressLabel(livePrinterStatus),
      temps: `${formatTerraMetric(livePrinterStatus?.metrics.bedTempC, '°')} / ${formatTerraMetric(livePrinterStatus?.metrics.nozzleTempC, '°')}`,
      lifecycle,
      jobName: livePrinterStatus?.metrics.jobName ?? 'no active job',
      controls: [
        { id: 'refresh-readback', label: 'Refresh status', hint: 'status only; camera opens separately', disabled: printerLoading, tone: 'safe' as const, run: onRefreshPrinter },
        { id: 'stage-approval', label: 'Approval gate', hint: 'stage print-control request only', disabled: false, tone: 'warn' as const, run: () => onStageReceipt('Printer control request staged locally. Live pause/resume/cancel/heat/start remain locked until explicit approval + sender readback.') },
        { id: 'pause', label: 'Pause', hint: 'locked: no live sender', disabled: true, tone: 'warn' as const, run: () => undefined },
        { id: 'resume', label: 'Resume', hint: 'locked: approval required', disabled: true, tone: 'safe' as const, run: () => undefined },
        { id: 'cancel', label: 'Cancel', hint: 'danger locked', disabled: true, tone: 'danger' as const, run: () => undefined },
        { id: 'heat', label: 'Heat / cool', hint: 'temperature write locked', disabled: true, tone: 'danger' as const, run: () => undefined },
        { id: 'upload-start', label: 'Upload / start', hint: 'blocked until QA approval', disabled: true, tone: 'danger' as const, run: () => undefined },
        { id: 'filament-change', label: 'Filament change', hint: 'color profile only for now', disabled: true, tone: 'warn' as const, run: () => undefined },
      ],
    },
    material: {
      selectedLabel: filamentProfile?.name ?? 'Choose filament/color',
      selectedMaterial: filamentProfile?.material ?? 'No filament selected',
      color: filamentProfile?.color,
      supportNote: capabilities?.slicer.machine.supportsFilamentChange ? 'Printer profile supports filament change; live action locked.' : 'Local color/profile only until printer sender exists.',
      options: materialOptions.length > 0 ? materialOptions : [{
        id: 'missing-filament-profile',
        label: 'No filament profiles',
        material: 'Run slicer capability scan',
        color: '#9ca36f',
        note: 'profiles missing',
        active: true,
        disabled: true,
        onSelect: () => undefined,
      }],
    },
  }

  useEffect(() => {
    const complete = lifecycle === 'completed' || (terraProgressValue(livePrinterStatus) ?? 0) >= 99.5
    if (!complete || !state.capturePrint || state.autoQaKey === completionKey) return
    onRunPrintQa({ auto: true, runKey: completionKey })
  }, [completionKey, lifecycle, livePrinterStatus, onRunPrintQa, state.autoQaKey, state.capturePrint])

  return (
    <section
      className="living-v3__terra-workspace-mode"
      aria-label="Terra Forge full professional workbench"
      data-terra-workspace-mode="primary"
      data-terra-primary-ui="camera-workbench-v9"
      data-terra-ui-rework="terra-camera-workbench-v9"
      data-selected-station-id={selectedStation.id}
      data-terra-printer-state={livePrinterStatus?.state ?? 'loading'}
      data-terra-slicer-cli={capabilities?.slicer.cliAvailable ? 'ready' : 'blocked'}
      data-terra-active-tab={state.tab}
      data-terra-health-state={health.state}
    >
      <header className="living-v3__terra-workspace-header">
        <div className="living-v3__terra-workspace-title">
          <p>Terra Forge</p>
          <h2>{workspaceTitle}</h2>
          <span>{workspaceSubtitle}</span>
        </div>
        <div className="living-v3__terra-workspace-actions">
          <WarRoomQuickSwitch
            value={selectedStation.roomId}
            label="Switch War Room from Terra Forge"
            onSwitch={onSwitchRoom}
          />
          <TerraHealthBeacon health={health} />
        </div>
      </header>

      <TerraModelPrintStudio
        model={{ title: activeArtifactName, meta: activeArtifactMeta, src: activeArtifactImage }}
        specs={[
          { label: 'Machine', value: machineProfile?.name ?? 'not selected', tone: machineProfile ? 'ready' : 'waiting' },
          { label: 'Material', value: filamentProfile?.material ?? filamentProfile?.name ?? 'not selected', tone: filamentProfile ? 'ready' : 'waiting' },
          {
            label: 'Print envelope',
            value: capabilities?.slicer.machine.bedSizeMm
              ? `${capabilities.slicer.machine.bedSizeMm[0]} × ${capabilities.slicer.machine.bedSizeMm[1]} × ${capabilities.slicer.machine.zHeightMm ?? '—'} mm`
              : 'not detected',
            tone: capabilities?.slicer.machine.bedSizeMm ? 'ready' : 'waiting',
          },
          { label: 'Output', value: state.slicePlan?.outputFile.split('/').pop() ?? 'not staged', tone: state.slicePlan ? 'ready' : 'locked' },
        ]}
        steps={forgePipeline.map((step) => ({ ...step, state: step.state as 'ready' | 'waiting' | 'blocked' | 'locked', onClick: () => onUpdateState({ tab: step.tab }) }))}
        actions={forgePrimaryActions}
        readback={forgeReadbackCards}
        production={forgeProduction}
      />

      {(capabilitiesError || state.receipt) && (
        <div className="living-v3__terra-inline-status" role="status">
          {capabilitiesError && <span>{capabilitiesError}</span>}
          {state.receipt && <span>{state.receipt}</span>}
        </div>
      )}

      <details className="living-v3__terra-advanced-drawer" data-terra-legacy-controls="collapsed">
        <summary>Advanced controls / proof</summary>
        <div className="living-v3__terra-workspace-body">
          <main className="living-v3__terra-workspace-main">
          {state.tab === 'web-search' && (
            <TerraInternetModelSearchPanel
              query={state.internetQuery}
              status={state.internetSearchStatus}
              result={state.internetSearch}
              error={state.internetSearchError}
              onQueryChange={(value) => onUpdateState({ internetQuery: value })}
              onRunSearch={onRunInternetModelSearch}
              onStageCandidate={onStageInternetCandidate}
            />
          )}

          {state.tab === 'library' && (
            <TerraAssetLibrary
              result={modelAssets}
              loading={modelAssetsLoading}
              error={modelAssetsError}
              onRefresh={onRefreshModelAssets}
              selectedAssetId={selectedAsset?.id}
              onSelectAsset={(asset) => onUpdateState({ selectedAssetId: asset.id, tab: 'prepare', receipt: `Selected model: ${asset.name}` })}
            />
          )}

          {state.tab === 'prepare' && (
            <section className="living-v3__terra-prepare-board" aria-label="Prepare model for slicing">
              <div className="living-v3__terra-selected-model">
                <div className="living-v3__terra-selected-preview">
                  {selectedAsset?.preview.dataUrl ? <img src={selectedAsset.preview.dataUrl} alt={`${selectedAsset.name} selected preview`} /> : <span>3MF</span>}
                </div>
                <div>
                  <p>Selected model</p>
                  <h3>{selectedAsset?.name ?? 'Choose a .3mf model'}</h3>
                  <span>{selectedAsset?.displayPath ?? (stagedInternetCandidate ? `Web candidate staged: ${stagedInternetCandidate.sourceUrl}` : 'No model selected yet')}</span>
                  {stagedInternetCandidate && (
                    <p className="living-v3__terra-web-staged">
                      Web candidate: <b>{stagedInternetCandidate.title}</b> · {stagedInternetCandidate.license ?? 'license check required'} · download/import still locked.
                    </p>
                  )}
                  <div>
                    <button type="button" onClick={() => onUpdateState({ tab: 'library' })}>Choose model</button>
                    <button type="button" onClick={() => onUpdateState({ tab: 'slice' })} disabled={!selectedAsset}>Go to slice</button>
                  </div>
                </div>
              </div>

              <div className="living-v3__terra-profile-board">
                <TerraProfileSelect label="Machine" profiles={machines} value={machineProfile?.id} onChange={(value) => onUpdateState({ selectedMachineProfileId: value, receipt: 'Machine profile changed from live ElegooSlicer profiles.' })} />
                <TerraProfileSelect label="Process" profiles={processes} value={processProfile?.id} onChange={(value) => onUpdateState({ selectedProcessProfileId: value, receipt: 'Process profile changed from live ElegooSlicer profiles.' })} />
                <TerraProfileSelect label="Filament / color" profiles={filaments} value={filamentProfile?.id} onChange={(value) => onUpdateState({ selectedFilamentProfileId: value, receipt: 'Filament profile changed from live ElegooSlicer profiles.' })} />
              </div>

              <div className="living-v3__terra-toggle-board">
                <TerraToggle label="Flow calibration" checked={state.flowCalibration} onChange={(value) => onUpdateState({ flowCalibration: value, receipt: `Flow calibration ${value ? 'enabled' : 'disabled'} locally.` })} note={capabilities?.slicer.settings.flowCalibration ? 'on in ElegooSlicer config' : 'available only if profile/printer supports it'} />
                <TerraToggle label="Bed leveling / mesh" checked={state.bedLeveling} onChange={(value) => onUpdateState({ bedLeveling: value, receipt: `Bed leveling ${value ? 'enabled' : 'disabled'} locally.` })} note={capabilities?.slicer.machine.supportsBedMeshCalibration ? 'BED_MESH_CALIBRATE detected in machine profile' : 'support unknown'} />
                <TerraToggle label="Timelapse" checked={state.timelapse} onChange={(value) => onUpdateState({ timelapse: value, receipt: `Timelapse ${value ? 'enabled' : 'disabled'} locally.` })} note={capabilities?.slicer.settings.timelapse ? 'on in ElegooSlicer print settings' : 'not enabled in current slicer config'} />
                <TerraToggle label="Capture print frames" checked={state.capturePrint} onChange={(value) => onUpdateState({ capturePrint: value, receipt: `Frame capture ${value ? 'planned' : 'not planned'}.` })} note={livePrinterStatus?.cameraUrl ? 'camera frame proxy is live' : 'needs camera'} />
              </div>
            </section>
          )}

          {state.tab === 'slice' && (
            <section className="living-v3__terra-slice-board" aria-label="Slice and handoff plan">
              <div className="living-v3__terra-slice-hero">
                <div>
                  <p>No-execute slice plan</p>
                  <h3>{canPlanSlice ? 'Ready to build verified command plan' : 'Missing model/profile/CLI'}</h3>
                  <span>{capabilities?.slicer.cliEvidence ?? 'Waiting for slicer discovery'}</span>
                </div>
                <button
                  type="button"
                  disabled={!canPlanSlice}
                  onClick={() => onBuildSlicePlan({
                    modelPath: selectedAsset?.path,
                    machineProfilePath: machineProfile?.path,
                    processProfilePath: processProfile?.path,
                    filamentProfilePath: filamentProfile?.path,
                    flowCalibration: state.flowCalibration,
                    bedLeveling: state.bedLeveling,
                    timelapse: state.timelapse,
                    capturePrint: state.capturePrint,
                  })}
                >
                  Build slice plan
                </button>
              </div>
              <div className="living-v3__terra-slice-summary">
                <span><b>Model</b>{selectedAsset?.name ?? 'none'}</span>
                <span><b>Machine</b>{machineProfile?.name ?? 'none'}</span>
                <span><b>Process</b>{processProfile?.name ?? 'none'}</span>
                <span><b>Filament</b>{filamentProfile?.name ?? 'none'}</span>
                <span><b>Actions</b>slice execution / upload / print start locked</span>
              </div>
              {state.slicePlan ? (
                <details className="living-v3__terra-slice-plan" open>
                  <summary>Verified dry-run command plan</summary>
                  <code>{state.slicePlan.commandPreview}</code>
                  <span>Output: {state.slicePlan.outputFile}</span>
                  <span>{state.slicePlan.note}</span>
                </details>
              ) : (
                <p className="living-v3__terra-empty">No slice command has been staged in this browser yet.</p>
              )}
            </section>
          )}

          {state.tab === 'printer' && (
            <section className="living-v3__terra-printer-workbench living-v3__terra-printer-workbench--natural" aria-label="Live printer control workbench">
              <TerraLiveNowConsole
                status={livePrinterStatus}
                health={health}
                selectedAsset={selectedAsset}
                onRefresh={onRefreshPrinter}
                onOpenLibrary={() => onUpdateState({ tab: 'library' })}
                onOpenSlice={() => onUpdateState({ tab: canPlanSlice ? 'slice' : 'prepare' })}
                onRunQa={() => onRunPrintQa({ auto: false })}
              />
              <details className="living-v3__terra-printer-advanced living-v3__terra-compact-proof">
                <summary>Full readback: progress / camera / QA</summary>
                <div className="living-v3__terra-printer-advanced-grid">
                  <TerraPrintProgressCard status={livePrinterStatus} />
                  <TerraPrinterPanel
                    status={livePrinterStatus}
                    loading={printerLoading}
                    error={printerError}
                    frameNonce={printerFrameNonce}
                    onRefresh={onRefreshPrinter}
                  />
                  <TerraPrintQaAgentPanel
                    status={livePrinterStatus}
                    selectedAsset={selectedAsset}
                    frameNonce={printerFrameNonce}
                    qaRun={state.qaRun}
                    onRunQa={onRunPrintQa}
                  />
                </div>
              </details>
              <details className="living-v3__terra-machine-actions living-v3__terra-compact-proof">
                <summary>
                  <b>Machine actions</b>
                  <span>Controls appear only after a real sender + approval path is wired.</span>
                </summary>
                <div className="living-v3__terra-action-lock-list">
                  {(livePrinterStatus?.lockedActions ?? ['pause', 'resume', 'cancel', 'heat', 'upload', 'start_print']).map((action) => (
                    <span key={action}>
                      <b>{action}</b>
                      <small>not rendered as a button yet</small>
                    </span>
                  ))}
                </div>
              </details>
            </section>
          )}

          {state.tab === 'agent' && (
            <section className="living-v3__terra-agent-board" aria-label="Terra agent, Obsidian memory, and 3D skills">
              <div className="living-v3__terra-agent-card" data-terra-agent-profile={terraAgentProfile ? 'connected' : 'loading'}>
                <div className="living-v3__terra-agent-identity">
                  {terraAgent && <img src={terraAgent.portraitPath} alt="Terra earth operator portrait" />}
                  <div>
                    <p>Terra Agent</p>
                    <h3>{terraAgentProfile?.role ?? '3D modeling · search · slicing · printer memory'}</h3>
                    <span>{terraAgentProfile ? `Current focus: ${terraAgentProfile.currentFocus.label}` : 'Earth operator runtime · loading live profile'}</span>
                  </div>
                </div>
                <div className="living-v3__terra-agent-live-grid" aria-label="Terra live profile sources">
                  <span>
                    <b>Obsidian</b>
                    {terraAgentProfile?.memory.exists ? 'connected' : 'needs vault'}
                    <small>{terraAgentProfile?.memory.memoryNotePath ?? capabilities?.obsidian.memoryNotePath ?? 'checking Obsidian vault'}</small>
                  </span>
                  <span>
                    <b>Skills</b>
                    {terraAgentProfile ? `${readyTerraSkills.length}/${terraAgentProfile.skills.length} ready` : 'checking'}
                    <small>{readyTerraSkills.slice(0, 3).map((skill) => skill.name).join(' · ') || 'waiting for Hermes skills'}</small>
                  </span>
                  <span>
                    <b>Touching</b>
                    {terraAgentProfile?.currentFocus.stationId ?? 'terra-modeling-studio'}
                    <small>{terraAgentProfile?.currentFocus.reason ?? 'Terra chooses her tool from room state.'}</small>
                  </span>
                </div>
                <div className="living-v3__terra-agent-skills" aria-label="Terra 3D skill bindings">
                  {(terraAgentProfile?.skills ?? []).map((skill) => (
                    <span key={skill.name} data-skill-state={skill.state} title={skill.path ?? skill.use}>
                      <b>{skill.label}</b>
                      <small>{skill.state === 'ready' ? skill.name : `${skill.name} missing`}</small>
                    </span>
                  ))}
                </div>
                <textarea value={state.agentPrompt} onChange={(event) => onUpdateState({ agentPrompt: event.target.value })} placeholder="Ask Terra to model, find, slice, inspect, or remember a 3D-print decision…" dir="auto" />
                <button type="button" onClick={() => onStageReceipt(state.agentPrompt.trim() ? `Terra prompt staged with Obsidian + 3D skills: ${state.agentPrompt.trim().slice(0, 90)}` : 'Write a Terra agent prompt first.')}>Stage Terra agent task</button>
                {terraAgentProfile && (
                  <details className="living-v3__terra-agent-guardrails">
                    <summary>Safety guardrails</summary>
                    {terraAgentProfile.guardrails.map((guardrail) => <span key={guardrail}>{guardrail}</span>)}
                  </details>
                )}
              </div>
              <details className="living-v3__terra-proof living-v3__terra-capability-details">
                <summary>Technical capability matrix</summary>
                <TerraCapabilityMatrix capabilities={capabilities?.capabilities ?? []} />
              </details>
            </section>
          )}
          </main>
        </div>
      </details>
    </section>
  )
}

type EtsyToolSurface = 'simple' | 'scout' | 'smart-intake' | 'sheet-intake'

type EtsySheetIntakeUiState = {
  sourceType: 'pasted_text' | 'local_file' | 'public_csv_url'
  pastedText: string
  localPath: string
  publicCsvUrl: string
  loading: boolean
  error?: string
  run?: EtsySheetIntakeRunManifest
  filter: EtsySheetIntakeGalleryFilter
  selectedProductId?: string
  receipt?: string
}

const initialSheetIntakeUiState: EtsySheetIntakeUiState = {
  sourceType: 'pasted_text',
  pastedText: 'title,image_url,source_url,price,search_volume,variants,notes\n',
  localPath: 'data/etsy-market-lab/imports/products.csv',
  publicCsvUrl: '',
  loading: false,
  filter: 'all',
}

const sheetIntakeFilters: Array<{ id: EtsySheetIntakeGalleryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'missing-image', label: 'Missing image' },
  { id: 'weak-evidence', label: 'Weak evidence' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'needs-source', label: 'Needs source' },
  { id: 'shotlab-ready', label: 'ShotLab ready' },
]

type SmartIntakeUiState = {
  input: string
  mission?: SmartIntakeMission
  selectedMatchId?: string
  selectedImageId?: string
  error?: string
  receipt?: string
  workerStatus: 'idle' | 'running' | 'completed' | 'failed'
  workerRun?: ControlledAgentUiResult
  workerError?: string
  workerReceipt?: string
}

const initialSmartIntakeUiState: SmartIntakeUiState = {
  input: '',
  workerStatus: 'idle',
}

type EtsyLiveScoutUiState = {
  status: 'idle' | 'running' | 'completed' | 'blocked' | 'failed'
  result?: EtsyLiveScoutClientResult
  error?: string
  receipt?: string
}

const initialEtsyLiveScoutUiState: EtsyLiveScoutUiState = {
  status: 'idle',
}

type EtsyPipelineHandlers = {
  updateSearchInput: (value: string) => void
  updateSearchMode: (value: EtsyProductSearchMode) => void
  createSearchPacket: () => void
  prepareScoutPacket: () => void
  runScoutWorker: () => void
  runLiveScout: (options?: { keepSurface?: boolean }) => void
  resetPipeline: () => void
  evidenceLoading: boolean
  selectCandidate: (candidateId: string) => void
  addCandidateToVisualBoard: (candidateId: string) => void
  sendCandidateToThoth: (candidateId: string) => void
  rejectCandidate: (candidateId: string) => void
  stageSheetRow: () => void
  setSupplierFilter: (filter: EtsySupplierFilter) => void
  saveSupplierLead: (lead: EtsySupplierLead) => void
  sendSupplierLeadToAnubis: (lead: EtsySupplierLead) => void
  toggleTruthField: (field: EtsyTruthField, checked: boolean) => void
  createTruthPacket: () => void
  updateQaItemStatus: (qaItemId: string, status: EtsyQaStatus) => void
  createQaReport: () => void
  setShotLabPreset: (value: EtsyRoomState['shotLabDraft']['preset']) => void
  setShotLabImageCount: (value: number) => void
  setShotLabSourceImageRequirements: (value: string | ((current: string) => string)) => void
  setShotLabVariantNotes: (value: string | ((current: string) => string)) => void
  createShotLabHandoffPacket: () => void
  createSeoPacket: () => void
  createDraftPayload: () => void
  createDraftApprovalPacket: () => void
  goToStation: (stationId: EtsyMarketLabStationId) => void
  roomState: EtsyRoomState
  etsyToolSurface: EtsyToolSurface
  setEtsyToolSurface: (surface: EtsyToolSurface) => void
  smartIntake: SmartIntakeUiState
  liveScout: EtsyLiveScoutUiState
  chatMemory: Array<EtsyPrepChatMemorySnippet>
  updateSmartIntakeInput: (value: string) => void
  runSmartIntakeMission: () => void
  runSmartIntakeWorker: () => void
  selectSmartIntakeMatch: (matchId: string) => void
  selectSmartIntakeImage: (imageId: string) => void
  chooseSmartIntakeMatch: (matchId: string) => void
  prepareSmartIntakeShotLabHandoff: (matchId: string) => void
  sheetIntake: EtsySheetIntakeUiState
  setSheetIntakeSourceType: (value: EtsySheetIntakeUiState['sourceType']) => void
  updateSheetIntakePastedText: (value: string) => void
  updateSheetIntakeLocalPath: (value: string) => void
  updateSheetIntakePublicCsvUrl: (value: string) => void
  importSheetIntake: () => void
  setSheetIntakeFilter: (filter: EtsySheetIntakeGalleryFilter) => void
  selectSheetIntakeProduct: (productId: string) => void
  chooseSheetIntakeProduct: (productId: string) => void
}

function EtsyPipelineStrip({
  pipeline,
  roomState,
  operatorLabel,
}: {
  pipeline: EtsyPipelineState
  roomState: EtsyRoomState
  operatorLabel: string
}) {
  const candidate = activeEtsyProductCandidate(pipeline)
  const roomCandidate = activeEtsyRoomCandidate(roomState)
  const requestText = (pipeline.searchPacket?.requestText ?? pipeline.searchInput.trim()) || 'none yet'
  const packetStatus = pipeline.draftApprovalPacket
    ? 'draft waiting approval'
    : pipeline.visualQaReport
      ? 'QA report ready'
      : pipeline.productTruthPacket?.status === 'ready'
        ? 'truth ready'
        : pipeline.metricPacket?.stagedSheetRow
          ? 'metrics staged'
          : candidate
            ? 'candidate active'
            : pipeline.searchPacket
              ? 'candidate review'
              : 'waiting for request'

  return (
    <div
      className="living-v3__etsy-pipeline-strip"
      aria-label="Etsy local pipeline state"
      data-etsy-room="market-lab"
      data-etsy-stage={roomState.stage}
      data-etsy-packet-id={roomState.approvalPacket?.packetId ?? roomState.draftPayload?.packetId ?? roomState.seoPacket?.packetId ?? roomState.shotLabHandoffPacket?.packetId ?? roomState.selectedProductPacket?.packetId ?? roomState.scoutPacket?.packetId ?? ''}
    >
      <div className="living-v3__etsy-pipeline-line">
        {(['scout_request', 'candidates_ready', 'candidate_selected', 'shotlab_packet_ready', 'seo_packet_ready', 'draft_payload_ready', 'approval_waiting'] as const).map((stage, index, list) => (
          <span key={stage} className={roomState.stage === stage ? 'is-current' : ''}>
            {etsyRoomStageLabels[stage]}{index < list.length - 1 ? ' ->' : ''}
          </span>
        ))}
      </div>
      <div className="living-v3__etsy-pipeline-facts">
        <span><b>Request</b>{roomState.scoutPacket?.query ?? requestText}</span>
        <span><b>Product</b>{roomState.selectedProductPacket?.selectedProductTitle ?? roomCandidate?.title ?? 'Choose a product'}</span>
        <span><b>Stage</b>{etsyRoomStageLabels[roomState.stage]}</span>
        <span><b>Next</b>{roomState.allowedNow[0] ?? nextEtsyPipelineStationLabel(pipeline.stage)}</span>
        <span><b>Status</b>{roomState.approvalPacket?.approvalStatus ?? roomState.lastReceipt ?? packetStatus}</span>
        <span><b>Operator</b>{operatorLabel}</span>
        <span><b>Origin</b>{roomCandidate?.dataOrigin ?? 'local-user-input'}</span>
        <span><b>Signal</b>{pipeline.oracleSignalPacket?.selectedKeyword ?? 'none'}</span>
      </div>
    </div>
  )
}

function EtsyEmptyState({ children }: { children: string }) {
  return (
    <div className="living-v3__etsy-empty living-v3__etsy-empty--interactive" data-empty-state="animated">
      <span aria-hidden="true">⌁</span>
      <b>{children}</b>
      <small>Choose the next station action above to populate this board.</small>
    </div>
  )
}

function EtsyStationBlockedState({
  title,
  missing,
  why,
  actions,
  onGoToStation,
  children,
}: {
  title: string
  missing: string
  why: string
  actions: Array<{ label: string; stationId: EtsyMarketLabStationId }>
  onGoToStation: (stationId: EtsyMarketLabStationId) => void
  children?: ReactNode
}) {
  return (
    <section className="living-v3__etsy-blocked-card living-v3__etsy-blocked-card--guided" data-etsy-blocked-state="true" data-component-source="animateui-empty-state">
      <div className="living-v3__etsy-blocked-visual" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p>{title}</p>
        <h3>{missing}</h3>
        <span>{why}</span>
      </div>
      <div className="living-v3__etsy-blocked-preview">
        {children}
      </div>
      <div className="living-v3__etsy-blocked-actions">
        {actions.map((action) => {
          const meta = etsyStationLibraryMeta(action.stationId)
          return (
            <button
              key={`${action.stationId}-${action.label}`}
              className="living-v3__has-tooltip"
              type="button"
              data-ui-tooltip={`Open ${meta.label}. ${meta.hint}`}
              aria-label={`Open ${meta.label}: ${meta.hint}`}
              onClick={() => onGoToStation(action.stationId)}
            >
              {meta.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function EtsySkeletonSlots({ labels }: { labels: Array<string> }) {
  return (
    <div className="living-v3__etsy-skeleton-slots" aria-hidden="true">
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  )
}

function EtsyReadinessList({ items }: { items: Array<{ label: string; ready: boolean }> }) {
  return (
    <div className="living-v3__etsy-readiness-list" aria-label="Etsy readiness checklist">
      {items.map((item) => (
        <span key={item.label} className={item.ready ? 'is-ready' : 'is-missing'}>
          <b>{item.ready ? 'ready' : 'missing'}</b>
          {item.label}
        </span>
      ))}
    </div>
  )
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
  onVisualBoard,
  onSendToThoth,
  onReject,
}: {
  candidate: EtsyProductCandidate
  selected: boolean
  onSelect: () => void
  onVisualBoard: () => void
  onSendToThoth: () => void
  onReject: () => void
}) {
  return (
    <article
      className={`living-v3__etsy-card living-v3__etsy-product-card ${selected ? 'is-selected' : ''} ${candidate.status === 'rejected' ? 'is-rejected' : ''}`}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      aria-label={`${candidate.title} candidate card`}
    >
      <LocalThumb label={candidate.title} tone={candidate.tone} />
      <div>
        <h3>{candidate.title}</h3>
        <p>{candidate.niche}</p>
        <span>{candidate.signal}</span>
        <div className="living-v3__etsy-mini-tags">
          {candidate.tags.slice(0, 4).map((tag, index) => <small key={`${tag}-${index}`}>{tag}</small>)}
        </div>
        <div className="living-v3__etsy-evidence-badges" aria-label={`${candidate.title} evidence summary`}>
          <small>{etsyEvidenceLabel(candidate.dataOrigin)}</small>
          <small>{etsyEvidenceLabel(candidate.evidenceQuality)}</small>
          <small>{candidate.evidenceCount} evidence</small>
          <small>{candidate.confidence}% confidence</small>
        </div>
        <p className="living-v3__etsy-source-line">
          Sources: {candidate.sourceRecordIds.slice(0, 3).join(', ') || 'local fallback — no evidence match'}
        </p>
      </div>
      <div className="living-v3__etsy-card-actions">
        <button type="button" onClick={(event) => { event.stopPropagation(); onVisualBoard() }}>Add to Visual Board</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onSendToThoth() }}>Send to SEO</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onReject() }}>Reject</button>
      </div>
    </article>
  )
}

function etsyWorkspacePacketId(roomState: EtsyRoomState) {
  return roomState.approvalPacket?.packetId
    ?? roomState.draftPayload?.packetId
    ?? roomState.seoPacket?.packetId
    ?? roomState.shotLabHandoffPacket?.packetId
    ?? roomState.selectedProductPacket?.packetId
    ?? roomState.scoutPacket?.packetId
    ?? ''
}

function etsyWorkspaceProductTitle(pipeline: EtsyPipelineState, roomState: EtsyRoomState) {
  return roomState.selectedProductPacket?.selectedProductTitle
    ?? activeEtsyRoomCandidate(roomState)?.title
    ?? activeEtsyProductCandidate(pipeline)?.title
    ?? 'Choose a product'
}

function etsyWorkspaceNextAction(pipeline: EtsyPipelineState, roomState: EtsyRoomState) {
  if (roomState.approvalPacket || pipeline.draftApprovalPacket) return 'Review approval'
  if (roomState.draftPayload) return 'Request DLV approval'
  if (roomState.seoPacket) return 'Create draft preview'
  if (roomState.shotLabHandoffPacket) return 'Build SEO packet'
  if (roomState.selectedProductPacket) return 'Stage ShotLab handoff'
  if (roomState.candidates.length || pipeline.candidates.length) return 'Choose product'
  return 'Open Oracle search'
}

function EtsyPrerequisiteRail({
  pipeline,
  roomState,
  selectedStationId,
}: {
  pipeline: EtsyPipelineState
  roomState: EtsyRoomState
  selectedStationId: LivingV3StationDefinition['id']
}) {
  const selectedProductReady = Boolean(roomState.selectedProductPacket || activeEtsyProductCandidate(pipeline))
  const sourceTruthReady = Boolean(pipeline.productTruthPacket)
  const shotLabSeoReady = Boolean(roomState.shotLabHandoffPacket || roomState.seoPacket)
  const draftReady = Boolean(roomState.draftPayload || pipeline.draftPacket || roomState.approvalPacket)
  const steps = [
    {
      label: 'Oracle feed',
      done: Boolean(roomState.scoutPacket || roomState.candidates.length || pipeline.searchPacket || pipeline.candidates.length),
      active: selectedStationId === 'etsy-loki-product-hunt',
    },
    {
      label: 'Choose product',
      done: selectedProductReady,
      active: selectedStationId === 'etsy-loki-product-hunt' && !selectedProductReady,
    },
    {
      label: 'Source truth',
      done: sourceTruthReady,
      active: selectedStationId === 'etsy-loki-source-leads' || selectedStationId === 'etsy-thor-source-truth',
    },
    {
      label: 'ShotLab/SEO',
      done: shotLabSeoReady,
      active: selectedStationId === 'etsy-thor-shotlab-prep' || selectedStationId === 'etsy-thor-seo-metrics',
    },
    {
      label: 'Draft',
      done: draftReady,
      active: selectedStationId === 'etsy-odin-draft-approval' || selectedStationId === 'etsy-thor-qa-review',
    },
  ]

  return (
    <ol className="living-v3__etsy-prereq-rail" aria-label="Etsy workspace prerequisites">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={`${step.done ? 'is-done' : ''} ${step.active ? 'is-current' : ''}`}
        >
          <b>{index + 1}</b>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

type EtsyStationViewMode = 'work' | 'flow' | 'motion'

function etsyStationLibraryMeta(stationId: LivingV3StationDefinition['id']) {
  const meta: Record<string, {
    accent: string
    sigil: string
    label: string
    tab: string
    action: string
    summary: string
    hint: string
    output: string
    toolNoun: string
    skillTools: Array<string>
  }> = {
    'etsy-loki-product-hunt': {
      accent: '#2ee0a6',
      sigil: '⌕',
      label: 'Product Inbox',
      tab: 'Inbox',
      action: 'Receive',
      summary: 'Oracle product cards → visual board → one chosen candidate.',
      hint: 'Search happens in Oracle. This station only receives product cards and chooses one.',
      output: 'Chosen product',
      toolNoun: 'Visual inbox',
      skillTools: ['Oracle feed', 'Image cards', 'Shortlist', 'Choose'],
    },
    'etsy-thor-seo-metrics': {
      accent: '#66b7ff',
      sigil: '#',
      label: 'SEO and Metrics',
      tab: 'SEO',
      action: 'Write',
      summary: 'Keyword metrics → title/tag set → sheet-ready row.',
      hint: 'Use after choosing a product. Metrics stay local until approval.',
      output: 'SEO packet',
      toolNoun: 'Keyword workbench',
      skillTools: ['Vol/Comp/Score', 'Tag formula', 'Title builder', 'Compliance'],
    },
    'etsy-loki-source-leads': {
      accent: '#33d4c7',
      sigil: '◎',
      label: 'Source Leads',
      tab: 'Sources',
      action: 'Compare',
      summary: 'Saved leads → price/risk/match board → source packet.',
      hint: 'Compare source leads without calling Etsy, AliExpress, Alibaba, or supplier APIs.',
      output: 'Source lead',
      toolNoun: 'Lead board',
      skillTools: ['Supplier check', 'Price proof', 'Risk tags', 'Save/Reject'],
    },
    'etsy-thor-source-truth': {
      accent: '#f4c95d',
      sigil: '✓',
      label: 'Source Truth',
      tab: 'Truth',
      action: 'Check',
      summary: 'Proof fields → allowed/blocked claims → truth packet.',
      hint: 'Use before copy, alt text, image claims, or listing attributes.',
      output: 'Truth packet',
      toolNoun: 'Claim checker',
      skillTools: ['Materials', 'Variants', 'Attributes', 'Claim locks'],
    },
    'etsy-thor-shotlab-prep': {
      accent: '#b18cff',
      sigil: '▧',
      label: 'ShotLab Prep',
      tab: 'ShotLab',
      action: 'Prep',
      summary: 'Source media → shot list → local image handoff.',
      hint: 'This prepares a local handoff only. Paid generation remains locked.',
      output: 'Media brief',
      toolNoun: 'Media board',
      skillTools: ['Hero shot', 'Variant grid', 'Source images', 'Preset'],
    },
    'etsy-thor-qa-review': {
      accent: '#ff9a57',
      sigil: '◐',
      label: 'QA Review',
      tab: 'QA',
      action: 'Review',
      summary: 'Images/copy → issue chips → QA report.',
      hint: 'Approve/reject visual and copy problems before the draft gate.',
      output: 'QA report',
      toolNoun: 'Inspection board',
      skillTools: ['Image QA', 'Claim QA', 'Variant QA', 'Issue chips'],
    },
    'etsy-odin-draft-approval': {
      accent: '#8eb2ff',
      sigil: '↗',
      label: 'Draft Approval',
      tab: 'Draft',
      action: 'Approve',
      summary: 'SEO + media + truth → local draft → DLV gate.',
      hint: 'Approval is local. Upload, publish, supplier messages, and paid actions stay locked.',
      output: 'Approval packet',
      toolNoun: 'Decision console',
      skillTools: ['Draft preview', 'Alt text', 'Missing attrs', 'Approval lock'],
    },
  }
  return meta[stationId] ?? {
    accent: '#2ee0a6',
    sigil: '•',
    label: 'Station',
    tab: 'Station',
    action: 'Work',
    summary: 'Local station surface.',
    hint: 'This station stays local and approval-gated.',
    output: 'Local packet',
    toolNoun: 'Local tool',
    skillTools: ['Local packet', 'Approval lock'],
  }
}

function syncEtsyPipelineToRoomCandidate(state: EtsyPipelineState, candidate: EtsyRoomProductCandidate) {
  return syncEtsyPipelineToExternalProduct(state, {
    candidateId: candidate.candidateId,
    packetId: candidate.packetId,
    title: candidate.title,
    niche: candidate.niche,
    signal: `${candidate.evidenceIds.length} evidence refs; ${candidate.missingFields.length} missing fields`,
    sourceRecordIds: candidate.sourceRecordIds,
    evidenceIds: candidate.evidenceIds,
    evidenceQuality: candidate.dataOrigin === 'fallback-local-mock'
      ? 'fallback-local-mock'
      : candidate.evidenceIds.length === 0
        ? 'missing-evidence'
        : candidate.missingFields.length
          ? 'partial-local'
          : 'verified-local',
    dataOrigin: candidate.dataOrigin === 'fallback-local-mock'
      ? 'fallback-mock'
      : candidate.dataOrigin === 'oracle-local-alura'
        ? 'alura-cache'
        : candidate.dataOrigin === 'live-readonly-research'
          ? 'product-intelligence'
          : 'local-product-research',
    confidence: candidate.score ?? 0,
    sourceLabels: [candidate.sourceType],
  })
}

function etsyStationReadyState(stationId: EtsyMarketLabStationId, pipeline: EtsyPipelineState, roomState: EtsyRoomState) {
  const hasSearch = Boolean(roomState.scoutPacket || pipeline.searchPacket || roomState.candidates.length || pipeline.candidates.length)
  const activeProduct = activeEtsyProductCandidate(pipeline)
  const activeLead = activeEtsySupplierLead(pipeline)
  const hasProduct = Boolean(roomState.selectedProductPacket || activeProduct)
  const hasLead = Boolean(activeLead)
  const hasTruth = Boolean(pipeline.productTruthPacket)
  const canStartTruth = Boolean(activeProduct || activeLead || pipeline.productTruthPacket)
  const hasShotLab = Boolean(roomState.shotLabHandoffPacket)
  const hasSeo = Boolean(roomState.seoPacket || pipeline.metricPacket)
  const hasQaCards = pipeline.qaItems.length > 0
  const hasQaReport = Boolean(pipeline.visualQaReport)
  const hasDraftInputs = hasSeo && hasShotLab
  const hasDraft = Boolean(roomState.draftPayload || roomState.approvalPacket || pipeline.draftPacket)
  switch (stationId) {
    case 'etsy-loki-product-hunt':
      return { state: hasProduct ? 'done' : hasSearch ? 'ready' : 'locked', label: hasProduct ? 'chosen' : hasSearch ? 'cards ready' : 'needs Oracle' }
    case 'etsy-thor-seo-metrics':
      return { state: hasSeo ? 'done' : hasProduct ? 'ready' : 'locked', label: hasSeo ? 'SEO ready' : hasProduct ? 'ready' : 'needs product' }
    case 'etsy-loki-source-leads':
      return { state: hasLead ? 'done' : hasProduct ? 'ready' : 'locked', label: hasLead ? 'lead chosen' : hasProduct ? 'add leads' : 'needs product' }
    case 'etsy-thor-source-truth':
      return { state: hasTruth ? 'done' : canStartTruth ? 'ready' : 'locked', label: hasTruth ? 'truth ready' : canStartTruth ? 'check proof' : hasProduct ? 'needs source lead' : 'needs product' }
    case 'etsy-thor-shotlab-prep':
      return { state: hasShotLab ? 'done' : hasProduct ? 'ready' : 'locked', label: hasShotLab ? 'brief ready' : hasProduct ? 'plan media' : 'needs product' }
    case 'etsy-thor-qa-review':
      return { state: hasQaReport ? 'done' : hasQaCards ? 'ready' : 'locked', label: hasQaReport ? 'report ready' : hasQaCards ? 'inspect' : 'needs QA cards' }
    case 'etsy-odin-draft-approval':
      return {
        state: hasDraft ? 'done' : hasDraftInputs ? 'ready' : 'locked',
        label: hasDraft ? 'draft ready' : hasDraftInputs ? 'package' : !hasSeo && !hasShotLab ? 'needs packets' : !hasSeo ? 'needs SEO' : 'needs ShotLab',
      }
    default:
      return { state: 'locked', label: 'local' }
  }
}

function EtsyStationInteractionDeck({
  selectedStation,
  pipeline,
  roomState,
  mode,
  onModeChange,
}: {
  selectedStation: LivingV3StationDefinition
  pipeline: EtsyPipelineState
  roomState: EtsyRoomState
  mode: EtsyStationViewMode
  onModeChange: (mode: EtsyStationViewMode) => void
}) {
  const meta = etsyStationLibraryMeta(selectedStation.id)
  const packetId = etsyWorkspacePacketId(roomState)
  const productTitle = etsyWorkspaceProductTitle(pipeline, roomState)
  const nextAction = etsyWorkspaceNextAction(pipeline, roomState)
  const hasProduct = Boolean(roomState.selectedProductPacket || activeEtsyProductCandidate(pipeline))
  const readyCount = [
    Boolean(roomState.scoutPacket || pipeline.searchPacket),
    hasProduct,
    Boolean(pipeline.productTruthPacket),
    Boolean(roomState.shotLabHandoffPacket || roomState.seoPacket),
    Boolean(roomState.draftPayload || roomState.approvalPacket),
  ].filter(Boolean).length
  const flowSteps = ['Find', 'Prove', 'Prepare', 'Draft', 'Approve']
  const stationReady = etsyStationReadyState(selectedStation.id as EtsyMarketLabStationId, pipeline, roomState)
  return (
    <section
      className="living-v3__etsy-station-deck living-v3__etsy-station-deck--tool-room"
      data-etsy-station-deck="v2-tool-room"
      data-etsy-station-view={mode}
      style={styleVars({ '--etsy-station-accent': meta.accent })}
    >
      <div className="living-v3__etsy-station-deck-hero">
        <div className="living-v3__etsy-station-orb" aria-hidden="true">
          <span>{meta.sigil}</span>
        </div>
        <div>
          <p>{meta.toolNoun}</p>
          <h3>{meta.label}</h3>
          <span>{meta.summary}</span>
        </div>
      </div>

      <div className="living-v3__etsy-station-tool-shelf" aria-label={`${meta.label} skill tools`}>
        {meta.skillTools.map((tool) => <span key={tool}>{tool}</span>)}
      </div>

      <div className="living-v3__etsy-station-modebar" aria-label="Station view mode">
        {(['work', 'flow', 'motion'] as const).map((item) => {
          const label = item === 'work' ? 'Tool' : item === 'flow' ? 'Flow' : 'Lock'
          const hint = item === 'work'
            ? 'Shows the actual tool pieces for this station.'
            : item === 'flow'
              ? 'Shows this station inside the Etsy prep workflow.'
              : meta.hint
          return (
            <button
              key={item}
              type="button"
              className={`living-v3__has-tooltip ${mode === item ? 'is-active' : ''}`}
              data-ui-tooltip={hint}
              aria-label={`${label}: ${hint}`}
              onClick={() => onModeChange(item)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <section className="living-v3__etsy-station-quickline" aria-label={`${meta.label} local work state`}>
        <div>
          <span>Product</span>
          <b>{productTitle}</b>
        </div>
        <div>
          <span>Stage</span>
          <b>{stationReady.label}</b>
        </div>
        <div>
          <span>Packet</span>
          <b>{packetId || 'not created'}</b>
        </div>
        <div>
          <span>Next</span>
          <b>{nextAction}</b>
        </div>
      </section>

      <div className="living-v3__etsy-station-deck-body">
        {mode === 'work' && (
          <>
            <span><b>Product</b>{productTitle}</span>
            <span><b>Next action</b>{nextAction}</span>
            <span><b>Output</b>{meta.output}</span>
            <span><b>Packet</b>{packetId || 'not created yet'}</span>
          </>
        )}
        {mode === 'flow' && (
          <div className="living-v3__etsy-flow-map" aria-label="Station packet flow">
            {flowSteps.map((label, index) => (
              <span key={label} className={index < readyCount ? 'is-ready' : index === readyCount ? 'is-current' : ''}>
                <b>{index + 1}</b>{label}
              </span>
            ))}
          </div>
        )}
        {mode === 'motion' && (
          <>
            <span><b>Local only</b>No Etsy upload, publish, supplier message, paid generation, or external marketplace call.</span>
            <span><b>Worker gate</b>usageAllowed:false · workerSpawnAllowed:false</span>
            <span><b>Why</b>{meta.hint}</span>
            <span><b>Output</b>{meta.output}</span>
          </>
        )}
      </div>
    </section>
  )
}

function EtsyMarketLabPrimaryWorkspace({
  selectedStation,
  workspaceState,
  handlers,
  operatorLabel,
  operatorStatus,
  stationSurface,
  stationReceipt,
  onOpenOpportunityResearch,
  onSelectStation,
  onResetPipeline,
}: {
  selectedStation: LivingV3StationDefinition
  workspaceState: EtsyProductWorkspaceStateV2
  handlers: EtsyPipelineHandlers
  operatorLabel: string
  operatorStatus: string
  stationSurface: ReactNode
  stationReceipt?: string
  onOpenOpportunityResearch: () => void
  onSelectStation: (stationId: EtsyMarketLabStationId) => void
  onResetPipeline: () => void
}) {
  return (
    <EtsyProductMissionWorkspace
      selectedStationId={selectedStation.id as EtsyMarketLabStationId}
      workspaceState={workspaceState}
      operatorLabel={operatorLabel}
      operatorStatus={operatorStatus}
      stationSurface={stationSurface}
      stationReceipt={stationReceipt}
      actions={{
        onOpenOpportunityResearch,
        onSelectStation,
        onResetPipeline,
        selectCandidate: handlers.selectCandidate,
        createTruthPacket: handlers.createTruthPacket,
        setShotLabPreset: handlers.setShotLabPreset,
        setShotLabImageCount: handlers.setShotLabImageCount,
        setShotLabSourceImageRequirements: handlers.setShotLabSourceImageRequirements,
        setShotLabVariantNotes: handlers.setShotLabVariantNotes,
        createShotLabHandoffPacket: handlers.createShotLabHandoffPacket,
        createSeoPacket: handlers.createSeoPacket,
        createDraftPayload: handlers.createDraftPayload,
        createDraftApprovalPacket: handlers.createDraftApprovalPacket,
        updateQaItemStatus: handlers.updateQaItemStatus,
      }}
    />
  )
}

function toolStatusLabel(tool: WorkspaceToolContract) {
  if (tool.status === 'ready') return 'ready'
  if (tool.status === 'partial') return 'missing pieces'
  if (tool.status === 'blocked') return 'blocked'
  return 'future'
}

type WorkspaceKernelDemoKind = 'etsy-intake' | 'cad-print' | 'daily-news'

type WorkspaceKernelApiPayload = {
  ok: boolean
  stateVersion?: string
  result?: WorkspaceKernelPersistedState
  state?: WorkspaceKernelPersistedState
  telemetry?: WorkspaceKernelTelemetrySnapshot
  displayStates?: Array<KernelAgentDisplayState>
  packet?: WorkspaceContextPacket
  lockedActions?: Array<string>
  localOnly?: true
  usageAllowed?: false
  workerSpawnAllowed?: false
  externalRequestsAllowed?: false
  liveActionsAllowed?: false
  writebackAllowed?: false
  persistence?: WorkspaceCoreOpsPersistenceView
  error?: string
}

function isWorkspaceContextPacket(value: unknown): value is WorkspaceContextPacket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const packet = value as Partial<WorkspaceContextPacket>
  return packet.version === 'obsidian-context-packet-v1'
    && typeof packet.packetId === 'string'
    && Array.isArray(packet.sourceNotes)
    && packet.localOnly === true
    && packet.writebackAllowed === false
}

function latestObsidianContextPacketFromState(state?: WorkspaceKernelPersistedState | null) {
  if (!state) return null
  const artifacts = state.runs
    .flatMap((run) => run.artifacts)
    .filter((artifact) => artifact.kind === 'obsidian-context-packet')
    .sort((left, right) => right.createdAtMs - left.createdAtMs)
  for (const artifact of artifacts) {
    const packet = artifact.payload.packet
    if (isWorkspaceContextPacket(packet)) return packet
  }
  return null
}

function workspaceKernelApprovalStatus(run: WorkspaceRun) {
  return run.approvals[0]?.status ?? (run.status === 'waiting_approval' ? 'waiting_operator' : 'not_required')
}

function workspaceKernelDomainLabel(run: WorkspaceRun) {
  const blueprint = getWorkspaceBlueprintById(run.blueprintId)
  return blueprint?.domain ?? 'command'
}

function hermesCommandTaskStatus(status: WorkspaceRun['status']): HermesCommandTaskSummary['status'] {
  if (status === 'waiting_approval') return 'waiting'
  if (status === 'cancelled') return 'blocked'
  return status
}

function hermesCommandTaskTitle(run: WorkspaceRun) {
  const source = (run.actionInput.text?.trim() || run.actionSummary).replace(/\s+/g, ' ')
  const withoutCounters = source.replace(/\s*;\s*(?:missing|locked)\s+\d+\b.*$/i, '')
  const withoutFallbackOrigin = withoutCounters.replace(/\s+Origin\s+fallback[-\w;: ]*$/i, '')
  return withoutFallbackOrigin.trim() || 'משימה ללא כותרת'
}

function CommandRoomManagerSurface({
  surfaceMode,
  onOpenHermesCommand,
  onOpenMissionControl,
  prompt,
  onPromptChange,
  onRoute,
  onStationAction,
  onAskHermesCommand,
  onAttachObsidianContext,
  onKernelStage,
  onKernelOpen,
  route,
  stationActionResult,
  hermesCommandRun,
  actionRun,
  conversation,
  onApproveCouncil,
  onSkipCouncil,
  contextPacket,
  contextStatus,
  kernelTelemetry,
  kernelRuns,
  kernelEvents,
  kernelDisplayStates,
  missionPacketRail,
  missionPacketRailStatus,
  missionPacketRailReadback,
  missionAgentMinds,
  missionRun,
  kernelStoreStatus,
  kernelStateVersion,
  controlLabel,
  controlTitle,
  frozen,
  canAskHermes,
  agentRoster,
  activeAgentId,
  onTalkAgent,
  onFocusAgent,
  onAssignAgentPrimaryStation,
  onRestAgent,
  onRunControlledAgent,
}: {
  surfaceMode: 'command' | 'mission-control'
  onOpenHermesCommand: (taskId?: string) => void
  onOpenMissionControl: () => void
  prompt: string
  onPromptChange: (value: string) => void
  onRoute: () => void
  onStationAction: () => void
  onAskHermesCommand: () => void
  onAttachObsidianContext: () => void
  onKernelStage: (kind: WorkspaceKernelDemoKind) => void
  onKernelOpen: (runId: string) => void
  route: WorkspaceToolRoute | null
  stationActionResult: WorkspaceStationActionRouterResult | null
  hermesCommandRun: HermesCommandRunState
  actionRun: HermesCommandActionRunCard
  conversation: Array<HermesCommandMessage>
  onApproveCouncil: () => void
  onSkipCouncil: () => void
  contextPacket: WorkspaceContextPacket | null
  contextStatus: string | null
  kernelTelemetry: WorkspaceKernelTelemetrySnapshot | null
  kernelRuns: Array<WorkspaceRun>
  kernelEvents: Array<WorkspaceEvent>
  kernelDisplayStates: Array<KernelAgentDisplayState>
  missionPacketRail: Array<WorkspacePacketMissionRailItem>
  missionPacketRailStatus: PacketHandoffRailStatus
  missionPacketRailReadback?: string
  missionAgentMinds: Array<WorkspaceAgentMindProfile>
  missionRun: WorkspaceRun | null
  kernelStoreStatus: string
  kernelStateVersion?: string
  controlLabel: string
  controlTitle: string
  frozen: boolean
  canAskHermes: boolean
  agentRoster: Array<CommandAgentControlRow>
  activeAgentId?: LivingV3AgentId
  onTalkAgent: (agentId: LivingV3AgentId) => void
  onFocusAgent: (agentId: LivingV3AgentId) => void
  onAssignAgentPrimaryStation: (agentId: LivingV3AgentId) => void
  onRestAgent: (agentId: LivingV3AgentId) => void
  onRunControlledAgent: (agentId: ControlledUiAgentId, operatorNote?: string) => void
}) {
  const tools = getWorkspaceToolRegistry()
  const recommendation = recommendWorkspaceTool(prompt)
  const activeRoute = route?.taskText === prompt.trim().slice(0, 8_000) ? route : null
  const hermesCommandOutput = hermesCommandRun.result?.result?.output as { command?: { answer?: string; recommendedRoute?: { actionLabel: string; roomId: string; stationId?: string }; suggestedActions?: Array<string> }; answer?: string } | undefined
  const hermesCommand = hermesCommandOutput?.command
  const hermesCommandAnswer = hermesCommand?.answer ?? hermesCommandOutput?.answer ?? hermesCommandRun.answer
  const kernelRunsByDomain = kernelRuns.reduce<Record<string, Array<WorkspaceRun>>>((groups, run) => {
    const domain = workspaceKernelDomainLabel(run)
    return { ...groups, [domain]: [...(groups[domain] ?? []), run] }
  }, {})
  const etsyKernelTimeline = buildEtsyKernelStageTimeline(kernelRuns)
  const commandHasPrompt = prompt.trim().length > 0
  const actionRoomLabel = actionRun.targetRoomId
    ? livingV3RoomById(actionRun.targetRoomId as LivingV3RoomId)?.label ?? actionRun.targetRoomId
    : activeRoute?.target.roomId
      ? livingV3RoomById(activeRoute.target.roomId)?.label ?? activeRoute.target.roomId
      : undefined
  const actionStationLabel = actionRun.targetStationId
    ? livingV3StationById(actionRun.targetStationId as LivingV3StationDefinition['id'])?.label ?? actionRun.targetStationId
    : activeRoute?.target.stationId
      ? livingV3StationById(activeRoute.target.stationId)?.label ?? activeRoute.target.stationId
      : undefined
  const actionStatusLabel: Record<HermesCommandActionRunStatus, string> = {
    idle: 'מוכן',
    running: 'בודק עכשיו',
    waiting_operator: 'מחכה לך',
    completed: 'הסתיים',
    blocked: 'חסום בטוח',
    failed: 'נכשל בטוח',
  }
  const onlineAgentCount = agentRoster.filter((agent) => agent.statusTone !== 'visual').length
  const controlledProfileCount = agentRoster.reduce((count, agent) => count + agent.controlledProfiles.length, 0)
  const [localActiveAgentId, setLocalActiveAgentId] = useState<LivingV3AgentId | undefined>(activeAgentId)
  useEffect(() => {
    if (activeAgentId) setLocalActiveAgentId(activeAgentId)
  }, [activeAgentId])
  const activeRosterRow = agentRoster.find((agent) => agent.agentId === (localActiveAgentId ?? activeAgentId)) ?? agentRoster.find((agent) => agent.statusTone === 'active' || agent.statusTone === 'approval') ?? agentRoster.at(0)
  const commandActionAgentLabel = agentRoster.find((agent) => agent.agentId === actionRun.assignedAgentId)?.label ?? actionRun.assignedAgentId
  function selectAgentInCommandRoster(agentId: LivingV3AgentId) {
    setLocalActiveAgentId(agentId)
  }
  const commandFocusTitle = actionRun.status === 'running'
    ? 'Hermes בודק את זה עכשיו'
    : actionRun.status === 'waiting_operator'
      ? 'החלטה שלך'
      : actionRun.status === 'completed'
        ? 'יש תשובה / תוצר'
        : actionRun.status === 'blocked'
          ? 'זה חסום — צריך לבנות יכולת'
          : actionRun.status === 'failed'
            ? 'נכשל בלי פעולה חיצונית'
            : commandHasPrompt
              ? 'מוכן להרצה'
              : 'כתוב בקשה אחת במרכז'
  const commandFocusBody = hermesCommandAnswer
    ?? (actionRun.status !== 'idle' ? actionRun.readback : undefined)
    ?? stationActionResult?.route.stationHandoff.readback
    ?? activeRoute?.stationHandoff.readback
    ?? contextPacket?.nextAction
    ?? (commandHasPrompt ? 'אני אראה כאן ניתוב, תוצאה או חסימה לפי הטקסט שכתבת — בלי קיר סטטי.' : 'המרכז הוא אזור העבודה: כתוב מה אתה רוצה, ואז המידע הרלוונטי יופיע כאן.')
  const commandFocusNext = hermesCommand?.recommendedRoute?.actionLabel
    ?? actionRun.visualNextStep
  const commandFocusMeta = [
    actionStatusLabel[actionRun.status],
    actionRoomLabel,
    actionStationLabel,
    commandActionAgentLabel,
  ].filter(Boolean).join(' · ')
  const commandAgentSummaries: Array<HermesCommandAgentSummary> = agentRoster.map((agent) => ({
    id: agent.agentId,
    label: agent.label,
    shortLabel: agent.shortLabel,
    portraitPath: agent.portraitPath,
    roomLabel: agent.roomLabel,
    activityLabel: agent.activityLabel,
    statusTone: agent.statusTone,
    lastMessage: agent.lastMessage,
  }))
  const commandTaskSummaries: Array<HermesCommandTaskSummary> = kernelRuns
    .slice(-8)
    .reverse()
    .map((run) => {
      const displayState = kernelDisplayStates.find((display) => display.currentRunId === run.runId)
      const visualAgent = displayState ? agentRoster.find((agent) => agent.agentId === displayState.agentId) : undefined
      return {
        id: run.runId,
        title: hermesCommandTaskTitle(run),
        status: hermesCommandTaskStatus(run.status),
        roomLabel: livingV3RoomById(run.ownerRoomId)?.label ?? run.ownerRoomId,
        agentLabel: visualAgent?.label ?? run.assignedWorkerProfileId ?? 'Hermes',
        readback: run.readback,
        updatedAtMs: run.updatedAtMs,
      }
    })
  return (
    <div
      className="living-v3__manager-shell living-v3__manager-shell--chat"
      data-station-app="command-room-manager"
      data-command-table-mode="natural-action"
      data-command-library-pass="natural-v1"
    >
      <section
        className="living-v3__hermes-command-panel living-v3__hermes-command-panel--primary"
        data-hermes-command-profile="v1"
        data-hermes-command-status={hermesCommandRun.status}
        data-hermes-command-run-id={hermesCommandRun.result?.runId ?? ''}
        data-command-action-run="natural-v1"
        data-command-action-run-id={actionRun.runId}
        data-command-action-status={actionRun.status}
        data-command-action-agent={actionRun.assignedAgentId}
        data-command-action-room={actionRun.targetRoomId ?? ''}
        data-command-action-station={actionRun.targetStationId ?? ''}
      >
        <div className="living-v3__command-desk" data-command-desk-layout="action-v2">
          <HermesCommandCockpit
            surfaceMode={surfaceMode}
            onOpenHermesCommand={onOpenHermesCommand}
            onOpenMissionControl={onOpenMissionControl}
            prompt={prompt}
            onPromptChange={onPromptChange}
            onRun={onAskHermesCommand}
            runDisabled={!canAskHermes || actionRun.status === 'running'}
            actionRun={actionRun}
            focusTitle={commandFocusTitle}
            focusBody={commandFocusBody}
            conversation={conversation}
            onApproveCouncil={onApproveCouncil}
            onSkipCouncil={onSkipCouncil}
            agents={commandAgentSummaries}
            tasks={commandTaskSummaries}
            activeAgentId={activeRosterRow?.agentId}
            onSelectAgent={(agentId) => {
              selectAgentInCommandRoster(agentId as LivingV3AgentId)
            }}
            sourceDetails={(
            <>
              <PacketHandoffRail
                items={missionPacketRail}
                status={missionPacketRailStatus}
                runId={missionRun?.runId}
                readback={missionPacketRailReadback}
              />
              <details className="living-v3__command-details">
                <summary>Sources</summary>
                <div className="living-v3__mission-minds" aria-label="Separated agent minds">
                  {missionAgentMinds.map((mind) => (
                    <article
                      key={mind.mindId}
                      data-agent-mind={mind.mindId}
                      data-agent-mind-scope={mind.contextScope}
                      data-agent-mind-room={mind.roomId}
                      title={`${mind.focus}. ${mind.isolationRule}`}
                    >
                      <span>{mind.label}</span>
                      <b>{mind.agentId}</b>
                      <small>{mind.domain}</small>
                      <em>{mind.contextScope} · {mind.obsidianAnchors.length} vault anchor{mind.obsidianAnchors.length === 1 ? '' : 's'}</em>
                    </article>
                  ))}
                </div>
              </details>
            </>
            )}
          />
          <details className="living-v3__command-side-stack living-v3__command-side-stack--collapsed">
            <summary>פרטים טכניים</summary>
            <div>
            <details className="living-v3__command-debug-drawer" data-command-debug-drawer="collapsed-v1">
              <summary>
                <span>Agent team</span>
                <b>{onlineAgentCount}/{agentRoster.length}</b>
              </summary>
              <section
                className="living-v3__agent-control-tool"
                data-hermes-agent-control-tool="status-control-v1"
                data-agent-control-count={agentRoster.length}
                data-agent-control-online-count={onlineAgentCount}
                data-agent-control-controlled-profile-count={controlledProfileCount}
                data-agent-control-active-agent={activeRosterRow?.agentId ?? ''}
                aria-label="Hermes agent status and control"
              >
                <div className="living-v3__agent-control-head">
                  <div>
                    <span>Agent Control</span>
                    <b>Roster</b>
                  </div>
                  <small>{onlineAgentCount}/{agentRoster.length} active · {controlledProfileCount} backend profile{controlledProfileCount === 1 ? '' : 's'}</small>
                </div>
                {activeRosterRow ? (
                  <div className="living-v3__agent-control-active">
                    <span>Now selected</span>
                    <b>{`${activeRosterRow.label} · ${activeRosterRow.activityLabel}`}</b>
                    <small>{`${activeRosterRow.roomLabel}${activeRosterRow.primaryStationLabel ? ` / ${activeRosterRow.primaryStationLabel}` : ''}`}</small>
                    <div className="living-v3__agent-control-active-actions">
                        <button type="button" data-agent-control-talk={activeRosterRow.agentId} onClick={() => onTalkAgent(activeRosterRow.agentId)}>Talk</button>
                        <button type="button" data-agent-control-focus={activeRosterRow.agentId} onClick={() => onFocusAgent(activeRosterRow.agentId)}>Focus</button>
                        <button
                          type="button"
                          data-agent-control-work={activeRosterRow.agentId}
                          onClick={() => onAssignAgentPrimaryStation(activeRosterRow.agentId)}
                          disabled={!activeRosterRow.primaryStationId}
                          title={activeRosterRow.primaryStationLabel ? `Send to ${activeRosterRow.primaryStationLabel}` : 'This agent has no assigned station yet'}
                        >
                          Work
                        </button>
                        <button type="button" data-agent-control-rest={activeRosterRow.agentId} onClick={() => onRestAgent(activeRosterRow.agentId)}>Rest</button>
                        {activeRosterRow.controlledProfiles.map((profile) => (
                          <button
                            key={profile.agentId}
                            type="button"
                            data-agent-control-run={profile.agentId}
                            className={`is-${profile.runState.status}`}
                            onClick={() => onRunControlledAgent(profile.agentId, `Operator launched ${profile.label} from Hermes Agent Control.`)}
                            disabled={!canAskHermes || profile.runState.status === 'running'}
                            title={canAskHermes ? profile.runState.label : 'Open with bodyRuntime=1 to run this backend profile'}
                          >
                            Run
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="living-v3__agent-control-active">
                    <span>Now selected</span>
                    <b>No agents available</b>
                    <small>Waiting for the local roster readback.</small>
                  </div>
                )}
                <div className="living-v3__agent-control-list" aria-label="All War Room agents">
                  {agentRoster.map((agent) => (
                    <article
                      key={agent.agentId}
                      className={`living-v3__agent-control-card is-${agent.statusTone} ${agent.agentId === activeRosterRow?.agentId ? 'is-selected' : ''}`}
                      style={{ '--agent-accent': agent.accent } as CSSProperties}
                      data-agent-control-card={agent.agentId}
                      data-agent-control-status={agent.statusTone}
                      data-agent-control-room={agent.roomId}
                      data-agent-control-primary-station={agent.primaryStationId ?? ''}
                      data-agent-control-backend-profiles={agent.controlledProfiles.map((profile) => profile.agentId).join(',')}
                    >
                      <button
                        type="button"
                        className="living-v3__agent-control-row-main"
                        data-agent-control-focus={agent.agentId}
                        onClick={() => selectAgentInCommandRoster(agent.agentId)}
                      >
                        <span className="living-v3__agent-control-dot" aria-hidden="true" />
                        <span className="living-v3__agent-control-row-name">
                          <b>{agent.shortLabel}</b>
                          <small>{agent.label}</small>
                        </span>
                        <span className="living-v3__agent-control-row-status">{agent.activityLabel}</span>
                        <span className="living-v3__agent-control-row-place">{agent.roomLabel}{agent.primaryStationLabel ? ` / ${agent.primaryStationLabel}` : ''}</span>
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </details>
            <details className="living-v3__command-secondary-tools">
              <summary>Quick tools</summary>
              <aside className="living-v3__command-toolbelt" data-command-toolbelt="v3" aria-label="Hermes Command tools">
              <div className="living-v3__command-toolbelt-head">
                <span>Quick tools</span>
                <b>After the ask</b>
              </div>
              <LocalOnlyButton className="living-v3__command-tool living-v3__command-tool--route" onClick={onRoute}>
                <span>Router Compass</span>
                <b>Route locally</b>
                <small>Find the right room/station without running external actions.</small>
                <kbd>local</kbd>
              </LocalOnlyButton>
              <LocalOnlyButton className="living-v3__command-tool living-v3__command-tool--station" onClick={onStationAction}>
                <span>Station Handoff</span>
                <b>Apply to station</b>
                <small>Convert the message into a local station event.</small>
                <kbd>event</kbd>
              </LocalOnlyButton>
              <LocalOnlyButton className="living-v3__command-tool living-v3__command-tool--context" onClick={onAttachObsidianContext}>
                <span>Memory Packet</span>
                <b>Attach context</b>
                <small>Pull relevant vault context into the command desk.</small>
                <kbd>vault</kbd>
              </LocalOnlyButton>
              </aside>
            </details>
            </div>
          </details>
        </div>
      </section>
      {(contextPacket || contextStatus) && (
        <details
          className="living-v3__manager-context-result"
          data-obsidian-context-packet={contextPacket ? 'v1' : undefined}
          data-obsidian-context-source-count={contextPacket ? contextPacket.sourceNotes.length : undefined}
          data-obsidian-context-local-only={contextPacket ? 'true' : undefined}
          data-hermes-intent-event-bridge={contextPacket ? 'v4' : undefined}
        >
          <summary>Obsidian Context Packet</summary>
          {contextPacket ? (
            <div>
              <span>{contextPacket.sourceNotes.filter((source) => source.status === 'loaded').length}/{contextPacket.sourceNotes.length} sources loaded</span>
              <b>{contextPacket.targetRoomId}{contextPacket.targetStationId ? ` / ${contextPacket.targetStationId}` : ''}</b>
              <p>{contextPacket.mission}</p>
              <small>{contextPacket.nextAction}</small>
              {contextPacket.blocker && <small>Blocker: {contextPacket.blocker}</small>}
              <small>localOnly:true · writebackAllowed:false · bridge:v4</small>
            </div>
          ) : (
            <div>
              <span>{contextStatus}</span>
            </div>
          )}
        </details>
      )}
      <details className="living-v3__manager-advanced" data-command-advanced-collapsed="true">
        <summary>Technical details</summary>
        <div className="living-v3__manager-advanced-body">
          <div className="living-v3__manager-recommendation" data-tool-recommendation={recommendation.decision} data-tool-target={recommendation.toolId ?? ''}>
        <span>Recommendation</span>
        <b>{recommendation.decision.replace(/_/g, ' ')}</b>
        <h3>{recommendation.label}</h3>
        <p>{recommendation.reason}</p>
        <div className="living-v3__manager-readback">
          <span><b>Ready</b>{recommendation.ready.slice(0, 3).join(', ') || 'none'}</span>
          <span><b>Missing</b>{recommendation.missing.slice(0, 3).join(', ') || 'none'}</span>
          <span><b>Blocked</b>{recommendation.blocked.slice(0, 3).join(', ') || 'none'}</span>
        </div>
      </div>
      {activeRoute && (
        <div
          className={`living-v3__manager-route-result is-${activeRoute.stationHandoff.status}`}
          data-tool-route-id={activeRoute.routeId}
          data-tool-route-action={activeRoute.target.action}
          data-tool-route-surface={activeRoute.target.surfaceId}
        >
          <span>Typed route result</span>
          <b>{activeRoute.stationHandoff.stationLabel}</b>
          <p>{activeRoute.stationHandoff.readback}</p>
          <small>{activeRoute.stationHandoff.nextUiStep}</small>
          <small>Safety: localOnly:true · usageAllowed:false · workerSpawnAllowed:false · externalRequestsAllowed:false</small>
        </div>
      )}
      {stationActionResult && (
        <div
          className={`living-v3__manager-station-action-result is-${stationActionResult.route.stationHandoff.status}`}
          data-hermes-action-bridge="v3"
          data-station-action-id={stationActionResult.actionId}
          data-station-action-kind={stationActionResult.event.kind}
          data-station-action-agent={stationActionResult.movement.agentId}
          data-station-action-motion={stationActionResult.movement.mode}
        >
          <span>Station Action Router V2 → Hermes Action Bridge V3</span>
          <b>{stationActionResult.route.stationHandoff.stationLabel}</b>
          <p>{stationActionResult.route.stationHandoff.readback}</p>
          <small>Agent: {stationActionResult.movement.agentId} · Motion: {stationActionResult.movement.mode}</small>
          <small>UI actions: {stationActionResult.uiActions.map((action) => action.type).join(', ')}</small>
          <small>Safety: localOnly:true · usageAllowed:false · workerSpawnAllowed:false · externalRequestsAllowed:false</small>
        </div>
      )}
      <section
        className="living-v3__kernel-console"
        data-workspace-kernel="v1"
        data-workspace-kernel-store="v2"
        data-workspace-kernel-event-count={kernelEvents.length}
        data-workspace-kernel-last-run-id={kernelTelemetry?.runId ?? ''}
        data-workspace-kernel-last-agent={kernelTelemetry?.agentId ?? ''}
        data-workspace-kernel-last-motion={kernelTelemetry?.motion ?? ''}
        data-workspace-kernel-last-room={kernelTelemetry?.roomId ?? ''}
        data-workspace-kernel-last-station={kernelTelemetry?.stationId ?? ''}
        data-workspace-kernel-last-artifact={kernelTelemetry?.artifactKind ?? ''}
        data-workspace-kernel-safety="local-only-locked"
        aria-label="Universal Action Kernel"
      >
        <div className="living-v3__kernel-head">
          <div>
            <span>Universal Action Kernel</span>
            <h3>Intent → Blueprint → Run → Artifact → Approval</h3>
          </div>
          <small>Store V2: {kernelStoreStatus}{kernelStateVersion ? ` / ${kernelStateVersion}` : ''}</small>
        </div>
        <div className="living-v3__kernel-actions">
          <button type="button" onClick={() => onKernelStage('etsy-intake')}>Stage Etsy intake</button>
          <button type="button" onClick={() => onKernelStage('cad-print')}>Stage CAD packet</button>
          <button type="button" onClick={() => onKernelStage('daily-news')}>Stage news packet</button>
        </div>
        <div className="living-v3__kernel-control-spine" aria-label="Kernel Control Spine V2 readback">
          <div className="living-v3__kernel-motion-row">
            {kernelDisplayStates.length === 0 ? (
              <span data-kernel-agent-display-state="idle">No durable motion event yet.</span>
            ) : kernelDisplayStates.map((display) => (
              <span
                key={`${display.agentId}-${display.lastEventId ?? display.currentRunId}`}
                data-kernel-agent-display-state={display.mode}
                data-workspace-kernel-event-id={display.lastEventId ?? ''}
              >
                <b>{display.agentId}</b>
                <small>{display.mode} · {display.roomId}{display.stationId ? ` / ${display.stationId}` : ''}</small>
                <small>{display.currentArtifactKind ?? 'kernel event'}</small>
              </span>
            ))}
          </div>
          <div className="living-v3__kernel-event-stream" data-workspace-kernel-event-count={kernelEvents.length}>
            {kernelEvents.length === 0 ? (
              <span data-workspace-kernel-event-id="">No durable kernel events yet.</span>
            ) : kernelEvents.slice(-5).reverse().map((event) => (
              <span key={event.eventId} data-workspace-kernel-event-id={event.eventId}>
                <b>{event.type}</b>
                <small>{event.roomId}{event.stationId ? ` / ${event.stationId}` : ''}</small>
                <small>{event.message}</small>
              </span>
            ))}
          </div>
        </div>
        {kernelTelemetry && (
          <div
            className="living-v3__kernel-telemetry"
            data-workspace-kernel-last-run-id={kernelTelemetry.runId}
            data-workspace-kernel-last-blueprint-id={kernelTelemetry.blueprintId}
            data-workspace-kernel-last-station-action-id={kernelTelemetry.stationActionId ?? ''}
            data-workspace-kernel-last-agent={kernelTelemetry.agentId}
            data-workspace-kernel-last-motion={kernelTelemetry.motion}
            data-workspace-kernel-last-room={kernelTelemetry.roomId}
            data-workspace-kernel-last-station={kernelTelemetry.stationId ?? ''}
            data-workspace-kernel-last-artifact={kernelTelemetry.artifactKind}
            data-workspace-kernel-last-approval={kernelTelemetry.approvalStatus}
            data-workspace-kernel-safety={kernelTelemetry.safety}
          >
            <span>Persistent Kernel Telemetry</span>
            <b>{kernelTelemetry.agentId} · {kernelTelemetry.motion}</b>
            <small>{kernelTelemetry.roomId}{kernelTelemetry.stationId ? ` / ${kernelTelemetry.stationId}` : ''}</small>
            <small>{kernelTelemetry.artifactKind} · approval {kernelTelemetry.approvalStatus} · locked {kernelTelemetry.lockedActionCount}</small>
          </div>
        )}
        <div className="living-v3__kernel-timeline" aria-label="Etsy kernel stage timeline">
          {etsyKernelTimeline.map((item) => (
            <span
              key={item.stageId}
              className={item.hasArtifact ? 'is-ready' : 'is-pending'}
              data-workspace-kernel-stage={item.stageId}
              data-workspace-kernel-stage-artifact={item.artifactKind}
              data-workspace-kernel-stage-ready={item.hasArtifact ? 'true' : 'false'}
            >
              <b>{item.label}</b>
              <small>{item.hasArtifact ? `${item.status}${item.hasEvent ? ' / event' : ''}` : 'pending'}</small>
            </span>
          ))}
        </div>
        <div className="living-v3__kernel-run-groups">
          {kernelRuns.length === 0 ? (
            <p>No kernel runs staged yet.</p>
          ) : Object.entries(kernelRunsByDomain).map(([domain, runs]) => (
            <div key={domain} className="living-v3__kernel-run-group">
              <span>{domain}</span>
              <div className="living-v3__kernel-run-list">
                {runs.map((run) => {
                  const blueprint = getWorkspaceBlueprintById(run.blueprintId)
                  const artifact = run.artifacts.at(0)
                  const approvalStatus = workspaceKernelApprovalStatus(run)
                  return (
                    <button
                      key={run.runId}
                      type="button"
                      className="living-v3__kernel-run-card"
                      data-workspace-run-id={run.runId}
                      data-workspace-blueprint-id={run.blueprintId}
                      data-workspace-domain={blueprint?.domain ?? 'command'}
                      data-workspace-run-status={run.status}
                      data-workspace-approval-status={approvalStatus}
                      onClick={() => onKernelOpen(run.runId)}
                    >
                      <b>{run.blueprintId}</b>
                      <span>{run.status} / {run.stage}</span>
                      <small>{run.ownerRoomId}{run.ownerStationId ? ` / ${run.ownerStationId}` : ''}</small>
                      <small>Worker: {run.assignedWorkerProfileId ?? 'unassigned'}</small>
                      <small>Artifact: {artifact?.kind ?? 'pending'}</small>
                      <small>Approval: {approvalStatus}</small>
                      <small>Next: {run.nextAction}</small>
                      <small>Locked: {run.lockedActions.length}</small>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <span className="living-v3__manager-section-label">Tool Registry</span>
      <div className="living-v3__manager-tool-grid" aria-label="Workspace tool registry">
        {tools.map((tool) => (
          <article key={tool.id} className={`living-v3__manager-tool is-${tool.status}`} data-tool-id={tool.id}>
            <div>
              <span>{toolStatusLabel(tool)}</span>
              <h3>{tool.label}</h3>
              <p>{tool.description}</p>
            </div>
            <div className="living-v3__manager-tool-meta">
              <small>{tool.owningSurface.label}</small>
              <small>Allowed: {tool.allowedActions.slice(0, 2).join(', ') || 'none yet'}</small>
              <small>Locked: {tool.lockedActions.slice(0, 3).join(', ')}</small>
            </div>
          </article>
        ))}
      </div>
        </div>
      </details>
    </div>
  )
}

function SheetProductThumb({ product }: { product: EtsySheetIntakeNormalizedProduct }) {
  const safeImage = product.thumbnailRef && (product.thumbnailRef.startsWith('/war-room/') || product.thumbnailRef.startsWith('data:image/'))
  if (safeImage) {
    return (
      <div className="living-v3__sheet-thumb">
        <img src={product.thumbnailRef} alt="" />
        <span>{product.title.slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }
  return <LocalThumb label={product.title} tone={product.shotLabReadiness === 'ready' ? '#72e0d4' : product.duplicateOf ? '#ffc75f' : '#ff8b4a'} />
}

function SmartImageTile({
  item,
  selected,
  onSelect,
}: {
  item: SmartIntakeImageItem
  selected: boolean
  onSelect: () => void
}) {
  const tone = item.previewMode === 'local_reference'
    ? '#72e0d4'
    : item.previewMode === 'external_ref_not_loaded'
      ? '#ffc75f'
      : '#ff8b4a'
  return (
    <button
      className={`living-v3__smart-image-tile ${selected ? 'is-selected' : ''}`}
      type="button"
      onClick={onSelect}
      title={item.ref}
    >
      <LocalThumb label={item.label} tone={tone} />
      <span>{item.label}</span>
      <small>{item.previewMode.replace(/_/g, ' ')}</small>
    </button>
  )
}

function SmartIntakeWorkbench({ state, handlers }: { state: SmartIntakeUiState; handlers: EtsyPipelineHandlers }) {
  const mission = state.mission
  const selectedMatch = selectedSmartIntakeMatch(mission, state.selectedMatchId)
  const imageSet = imageSetForSmartIntakeMatch(mission, selectedMatch?.matchId)
  const selectedImageId = state.selectedImageId ?? imageSet?.bestImageId
  const dossier = dossierForSmartIntakeMatch(mission, selectedMatch?.matchId)
  const selectedEvidence = mission?.evidence.filter((evidence) => selectedMatch?.evidenceIds.includes(evidence.evidenceId)) ?? []
  const workerResult = state.workerRun?.result
  const workerOutput = workerResult?.output
  const workerSmartIntake = workerOutput?.smartIntake
  const workerUsage = workerResult?.usage
  const workerUsageReadback = workerUsage?.reportedCost
    ?? workerUsage?.reportedUsageLine
    ?? (workerUsage ? `actual cost not reported; ${workerUsage.budget}` : undefined)

  return (
    <div className="living-v3__smart-intake" data-smart-intake-mission={mission?.missionId ?? ''}>
      <div className="living-v3__smart-mission-grid">
        <label className="living-v3__etsy-wide-field">
          <span>Smart mission input</span>
          <textarea
            value={state.input}
            onChange={(event) => handlers.updateSmartIntakeInput(event.target.value)}
            placeholder="Paste AliExpress links, Google Docs/Sheets/Drive refs, local files/images, and a free-form prompt"
            dir="auto"
          />
        </label>
        <div className="living-v3__smart-safety">
          <b>Mock-executable swarm</b>
          <span>{'Source Intake -> Image Match -> Dossier Builder -> ShotLab Prep / Approval'}</span>
          <small>Local-only. No live Etsy, supplier actions, Google writes/OAuth, browser automation, paid ShotLab, or worker fan-out.</small>
          <LocalOnlyButton className="living-v3__etsy-primary" onClick={handlers.runSmartIntakeMission}>
            Run Smart Intake V2
          </LocalOnlyButton>
          <LocalOnlyButton
            className="living-v3__etsy-primary"
            disabled={!mission || state.workerStatus === 'running'}
            onClick={handlers.runSmartIntakeWorker}
          >
            {state.workerStatus === 'running' ? 'Hermes Worker running...' : 'Run Hermes Worker V1'}
          </LocalOnlyButton>
          <small>One controlled Hermes one-shot, max-turns=1, toolsets:none. Guidance only; live actions stay locked.</small>
        </div>
      </div>

      {(state.error || state.workerError) && <div className="living-v3__etsy-warning">{state.error ?? state.workerError}</div>}

      {mission ? (
        <>
          <div className="living-v3__smart-readback">
            <span><b>Sources</b>{mission.sources.length}</span>
            <span><b>Evidence</b>{mission.evidence.length}</span>
            <span><b>Matches</b>{mission.productMatches.length}</span>
            <span><b>Dossiers</b>{mission.markdownDossiers.length}</span>
            <span><b>Safety</b>usageAllowed:false · workerSpawnAllowed:false</span>
          </div>

          {(state.workerStatus !== 'idle' || workerResult || state.workerReceipt) && (
            <section className="living-v3__smart-worker" aria-label="Hermes Worker V1 Result">
              <div className="living-v3__smart-panel-head">
                <span>Hermes Worker V1 Result</span>
                <b>{workerOutput?.summary ?? (state.workerStatus === 'running' ? 'Running one bounded local-only worker...' : 'No parsed worker output yet')}</b>
              </div>
              <div className="living-v3__smart-worker-readback">
                <span><b>Status</b>{workerOutput?.status ?? state.workerStatus}</span>
                <span><b>Run</b>{state.workerRun?.runId ?? workerResult?.sessionId ?? 'pending'}</span>
                <span><b>Session</b>{workerResult?.sessionId ?? 'not reported'}</span>
                <span><b>Usage</b>{workerUsageReadback ?? 'pending'}</span>
                <span><b>Frozen</b>usageAllowed:false · workerSpawnAllowed:false</span>
              </div>
              {workerOutput?.nextSafeStep && (
                <p className="living-v3__smart-worker-next">Next local handoff: {workerOutput.nextSafeStep}</p>
              )}
              {workerSmartIntake?.refinedProductMatches.length ? (
                <div className="living-v3__smart-worker-grid">
                  {workerSmartIntake.refinedProductMatches.map((match) => (
                    <article key={`${match.title}-${match.score}`}>
                      <b>{match.title}</b>
                      <span>{match.niche} · Score {match.score}</span>
                      <small>{match.recommendedNextStep}</small>
                      {match.imageNotes.slice(0, 3).map((note) => <em key={note}>{note}</em>)}
                    </article>
                  ))}
                </div>
              ) : null}
              <div className="living-v3__smart-worker-lists">
                <div>
                  <b>Source readback</b>
                  {(workerSmartIntake?.sourceReadback.length ? workerSmartIntake.sourceReadback : []).slice(0, 5).map((source) => (
                    <span key={`${source.sourceId}-${source.status}`}>{source.sourceId}: {source.status} · {source.note}</span>
                  ))}
                  {!workerSmartIntake?.sourceReadback.length && <span>No source readback yet.</span>}
                </div>
                <div>
                  <b>Missing evidence</b>
                  {(workerSmartIntake?.missingEvidence.length ? workerSmartIntake.missingEvidence : workerSmartIntake?.warnings ?? []).slice(0, 6).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                  {!workerSmartIntake?.missingEvidence.length && !workerSmartIntake?.warnings.length && <span>Worker has not reported evidence gaps yet.</span>}
                </div>
                <div>
                  <b>Locked actions</b>
                  {(workerOutput?.blockedActions ?? []).slice(0, 8).map((action) => (
                    <span key={action}>{action}</span>
                  ))}
                </div>
              </div>
              {workerSmartIntake?.dossierMarkdownAdditions.length ? (
                <pre className="living-v3__smart-worker-pre">{workerSmartIntake.dossierMarkdownAdditions.join('\n\n')}</pre>
              ) : null}
              {state.workerReceipt && <div className="living-v3__etsy-action-receipt" role="status">{state.workerReceipt}</div>}
            </section>
          )}

          <div className="living-v3__smart-task-rail" aria-label="Smart Intake station task progress">
            {mission.agentTasks.map((task) => (
              <article key={task.taskId} className={`is-${task.status}`} data-smart-task={task.stationId}>
                <span>{smartIntakeStationLabels[task.stationId]}</span>
                <h3>{task.label}</h3>
                <p>{task.readback}</p>
                <small>{task.safetyState.replace(/_/g, ' ')}</small>
              </article>
            ))}
          </div>

          <div className="living-v3__smart-source-grid" aria-label="Detected Smart Intake sources">
            {mission.sources.map((source) => (
              <article key={source.sourceId} className={`living-v3__smart-source is-${source.accessState}`}>
                <span>{smartIntakeSourceKindLabels[source.kind]}</span>
                <h3>{source.label}</h3>
                <p>{source.normalizedRef}</p>
                <small>{source.service} · {source.accessState.replace(/_/g, ' ')}</small>
              </article>
            ))}
          </div>

          <div className="living-v3__smart-review-grid">
            <section className="living-v3__smart-panel" aria-label="Product and image matching review">
              <div className="living-v3__smart-panel-head">
                <span>Product / image matching review</span>
                <b>{mission.finalRecommendation}</b>
              </div>
              <div className="living-v3__smart-match-list">
                {mission.productMatches.map((match) => (
                  <button
                    key={match.matchId}
                    className={selectedMatch?.matchId === match.matchId ? 'is-selected' : ''}
                    type="button"
                    onClick={() => handlers.selectSmartIntakeMatch(match.matchId)}
                  >
                    <LocalThumb label={match.title} tone={match.readiness === 'ready' ? '#72e0d4' : '#ffc75f'} />
                    <span>{match.title}</span>
                    <small>Score {match.score} · {match.readiness}</small>
                  </button>
                ))}
              </div>

              <div className="living-v3__smart-image-zone" aria-label="Best image selection area">
                <div>
                  <span>Best image selection</span>
                  <p>{imageSet?.label ?? 'No image set yet'}</p>
                </div>
                <div className="living-v3__smart-image-grid">
                  {imageSet?.items.map((item) => (
                    <SmartImageTile
                      key={item.imageId}
                      item={item}
                      selected={selectedImageId === item.imageId}
                      onSelect={() => handlers.selectSmartIntakeImage(item.imageId)}
                    />
                  )) ?? <EtsyEmptyState>Run the mission to stage image references.</EtsyEmptyState>}
                </div>
              </div>
            </section>

            <aside className="living-v3__smart-panel living-v3__smart-dossier-panel" aria-label="Smart Intake dossier preview">
              <div className="living-v3__smart-panel-head">
                <span>Dossier preview</span>
                <b>{selectedMatch?.title ?? 'No product selected'}</b>
              </div>
              <div className="living-v3__etsy-evidence-badges">
                {selectedEvidence.slice(0, 5).map((evidence) => (
                  <small key={evidence.evidenceId}>{evidence.label}</small>
                ))}
                <small>{selectedMatch?.missingEvidence.length ?? 0} missing</small>
                <small>{selectedMatch?.warnings.length ?? 0} warnings</small>
              </div>
              <pre className="living-v3__sheet-dossier">{dossier?.markdown ?? 'Run Smart Intake to build a markdown dossier.'}</pre>
            </aside>
          </div>

          <div className="living-v3__smart-warning-grid" aria-label="Smart Intake warnings and missing evidence">
            <div>
              <b>Warnings</b>
              {(selectedMatch?.warnings.length ? selectedMatch.warnings : mission.warnings).slice(0, 6).map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
            <div>
              <b>Missing evidence</b>
              {(selectedMatch?.missingEvidence.length ? selectedMatch.missingEvidence : mission.missingEvidence).slice(0, 6).map((missing) => (
                <span key={missing}>{missing}</span>
              ))}
            </div>
          </div>

          <div className="living-v3__smart-gallery" aria-label="Smart Intake final gallery">
            {mission.gallery.map((item) => {
              const match = mission.productMatches.find((candidate) => candidate.matchId === item.matchId)
              if (!match) return null
              return (
                <article key={item.galleryItemId} className={`living-v3__etsy-card living-v3__smart-gallery-card ${selectedMatch?.matchId === item.matchId ? 'is-selected' : ''}`}>
                  <LocalThumb label={item.title} tone={item.readiness === 'ready' ? '#72e0d4' : '#ffc75f'} />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{match.niche}</p>
                    <span>Score {item.score} · {item.imageCount} image refs · {item.missingCount} missing</span>
                  </div>
                  <div className="living-v3__etsy-card-actions">
                    <button type="button" onClick={() => handlers.chooseSmartIntakeMatch(item.matchId)}>Choose Product</button>
                    <button type="button" onClick={() => handlers.prepareSmartIntakeShotLabHandoff(item.matchId)}>Prepare ShotLab handoff</button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <EtsyEmptyState>Paste messy source material and run Smart Intake V2 to create local task progress, evidence, image sets, dossiers, and gallery matches.</EtsyEmptyState>
      )}

      {state.receipt && <div className="living-v3__etsy-action-receipt" role="status">{state.receipt}</div>}
    </div>
  )
}

function EtsySheetIntakeTool({ state, handlers }: { state: EtsySheetIntakeUiState; handlers: EtsyPipelineHandlers }) {
  const products = state.run?.products ?? []
  const visibleProducts = filterSheetIntakeProducts(products, state.filter)
  const selectedProduct = products.find((product) => product.productId === state.selectedProductId) ?? visibleProducts.at(0)
  return (
    <div className="living-v3__sheet-intake" data-sheet-intake-run={state.run?.runId ?? ''}>
      <div className="living-v3__sheet-source-tabs" aria-label="Sheet Intake source mode">
        {([
          ['pasted_text', 'Paste'],
          ['local_file', 'Local file'],
          ['public_csv_url', 'Public CSV'],
        ] as const).map(([sourceType, label]) => (
          <button
            key={sourceType}
            className={state.sourceType === sourceType ? 'is-active' : ''}
            type="button"
            onClick={() => handlers.setSheetIntakeSourceType(sourceType)}
          >
            {label}
          </button>
        ))}
      </div>
      {state.sourceType === 'pasted_text' && (
        <label className="living-v3__etsy-wide-field">
          <span>Pasted CSV / TSV / JSON</span>
          <textarea value={state.pastedText} onChange={(event) => handlers.updateSheetIntakePastedText(event.target.value)} />
        </label>
      )}
      {state.sourceType === 'local_file' && (
        <div className="living-v3__etsy-toolbar living-v3__etsy-toolbar--single">
          <label>
            <span>Safe local path</span>
            <input value={state.localPath} onChange={(event) => handlers.updateSheetIntakeLocalPath(event.target.value)} />
          </label>
        </div>
      )}
      {state.sourceType === 'public_csv_url' && (
        <div className="living-v3__etsy-toolbar living-v3__etsy-toolbar--single">
          <label>
            <span>Public CSV URL</span>
            <input value={state.publicCsvUrl} onChange={(event) => handlers.updateSheetIntakePublicCsvUrl(event.target.value)} />
          </label>
        </div>
      )}
      <div className="living-v3__etsy-status-strip">
        <span>Local-only intake. Google auth, Sheets writes, live Etsy, suppliers, browser automation, and paid ShotLab stay locked.</span>
        <LocalOnlyButton className="living-v3__etsy-primary" disabled={state.loading} onClick={handlers.importSheetIntake}>
          {state.loading ? 'Importing locally...' : 'Import Sheet Intake'}
        </LocalOnlyButton>
      </div>
      {state.error && <div className="living-v3__etsy-warning">{state.error}</div>}
      {state.run && (
        <>
          <div className="living-v3__sheet-qa-grid" aria-label="Sheet Intake QA readback">
            <span><b>Total rows</b>{state.run.qa.totalRows}</span>
            <span><b>Valid</b>{state.run.qa.validProducts}</span>
            <span><b>Rejected</b>{state.run.qa.rejectedRows}</span>
            <span><b>Duplicates</b>{state.run.qa.duplicates}</span>
            <span><b>Missing images</b>{state.run.qa.missingImages}</span>
            <span><b>Needs source</b>{state.run.qa.missingSourceUrls}</span>
            <span><b>Weak evidence</b>{state.run.qa.weakEvidence}</span>
            <span><b>Unsafe</b>{state.run.qa.unsafeHandoff}</span>
          </div>
          <div className="living-v3__etsy-output">
            <b>Final recommendation</b>
            <span>{state.run.qa.finalRecommendation}</span>
            <span>Manifest: {state.run.artifactRoot}/manifest.json</span>
          </div>
        </>
      )}
      <div className="living-v3__sheet-filters" aria-label="Product gallery filters">
        {sheetIntakeFilters.map((filter) => (
          <button key={filter.id} className={state.filter === filter.id ? 'is-active' : ''} type="button" onClick={() => handlers.setSheetIntakeFilter(filter.id)}>
            {filter.label}
          </button>
        ))}
      </div>
      <div className="living-v3__sheet-layout">
        <div className="living-v3__sheet-gallery" aria-label="Sheet Intake Product Gallery">
          {visibleProducts.length ? visibleProducts.map((product) => (
            <article
              key={product.productId}
              className={`living-v3__etsy-card living-v3__sheet-product ${state.selectedProductId === product.productId ? 'is-selected' : ''} ${product.duplicateOf ? 'is-duplicate' : ''}`}
              data-sheet-product-id={product.productId}
              onClick={() => handlers.selectSheetIntakeProduct(product.productId)}
            >
              <SheetProductThumb product={product} />
              <div>
                <h3>{product.title}</h3>
                <p>{product.sourceLabel} · row {product.sourceRowId}</p>
                <span>Score {product.score} · {product.scoreExplanation}</span>
                <div className="living-v3__etsy-evidence-badges">
                  <small>{product.shotLabReadiness === 'ready' ? 'ShotLab ready' : 'ShotLab partial'}</small>
                  <small>{product.seoReadiness === 'ready' ? 'SEO ready' : 'SEO partial'}</small>
                  <small>{product.evidenceIds.length} evidence</small>
                  <small>{product.missingFields.length} missing</small>
                </div>
                <p className="living-v3__etsy-source-line">
                  {product.sourceUrl ?? product.supplierUrl ?? 'needs source URL'}
                </p>
              </div>
              <div className="living-v3__etsy-card-actions">
                <button type="button" onClick={(event) => { event.stopPropagation(); handlers.chooseSheetIntakeProduct(product.productId) }}>Choose Product</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); handlers.chooseSheetIntakeProduct(product.productId) }}>Choose for ShotLab prep</button>
              </div>
            </article>
          )) : (
            <EtsyEmptyState>Import a small CSV, TSV, or JSON sheet to create local product dossiers and gallery cards.</EtsyEmptyState>
          )}
        </div>
        <aside className="living-v3__sheet-detail" aria-label="Sheet Intake product detail drawer">
          {selectedProduct ? (
            <>
              <div className="living-v3__sheet-detail-head">
                <SheetProductThumb product={selectedProduct} />
                <div>
                  <span>{selectedProduct.shotLabReadiness}</span>
                  <h3>{selectedProduct.title}</h3>
                  <p>{selectedProduct.recommendedNextStep}</p>
                </div>
              </div>
              <div className="living-v3__etsy-evidence-badges">
                {selectedProduct.warnings.length ? selectedProduct.warnings.slice(0, 5).map((warningItem) => (
                  <small key={`${selectedProduct.productId}-${warningItem.code}`}>{warningItem.label}</small>
                )) : <small>No QA warning</small>}
              </div>
              <pre className="living-v3__sheet-dossier">{selectedProduct.dossierMarkdown ?? 'Dossier will appear after import.'}</pre>
            </>
          ) : (
            <EtsyEmptyState>Select a product to preview its markdown dossier.</EtsyEmptyState>
          )}
        </aside>
      </div>
      {state.receipt && <div className="living-v3__etsy-action-receipt" role="status">{state.receipt}</div>}
    </div>
  )
}

function simpleProductSourceKindFromUrl(url: string) {
  const lower = url.toLowerCase()
  if (lower.includes('etsy.com/listing/')) return 'etsy' as const
  if (lower.includes('aliexpress.') || lower.includes('alibaba.') || lower.includes('1688.com')) return 'supplier' as const
  return 'other' as const
}

type SimpleProductSourceDetail = {
  kind: 'etsy' | 'supplier' | 'other'
  label: string
  url: string
  title?: string
  imageUrl?: string
  priceText?: string
  shopName?: string
  marketplace?: string
  salesText?: string
  demandText?: string
  tags?: Array<string>
}

function simpleProductSourceDetails(candidate?: EtsyRoomState['candidates'][number]): Array<SimpleProductSourceDetail> {
  if (!candidate) return []
  if (candidate.sourceDetails?.length) return candidate.sourceDetails
  return (candidate.sourceRecordIds)
    .filter((source) => /^https?:\/\//i.test(source))
    .map((url): SimpleProductSourceDetail => {
      const kind = simpleProductSourceKindFromUrl(url)
      return {
        kind,
        label: kind === 'etsy' ? 'מתחרה' : kind === 'supplier' ? 'ספק' : 'מקור',
        marketplace: kind === 'etsy' ? 'Etsy' : kind === 'supplier' ? 'ספק' : 'מקור',
        url,
      }
    })
}

function simpleProductHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

function simpleProductPrimaryImage(candidate?: EtsyRoomState['candidates'][number], preferredKind?: 'etsy' | 'supplier') {
  const details = simpleProductSourceDetails(candidate)
  return details.find((detail) => (!preferredKind || detail.kind === preferredKind) && detail.imageUrl)?.imageUrl
    ?? details.find((detail) => detail.imageUrl)?.imageUrl
}

function simpleProductPriceNumber(priceText?: string) {
  if (!priceText) return undefined
  const match = priceText.replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/)
  if (!match) return undefined
  const value = Number(match[0])
  return Number.isFinite(value) ? value : undefined
}

function simpleProductCurrency(priceText?: string) {
  if (!priceText) return undefined
  if (priceText.includes('₪') || /\bILS\b/i.test(priceText)) return '₪'
  if (priceText.includes('$') || /\bUSD\b/i.test(priceText)) return '$'
  if (priceText.includes('€')) return '€'
  if (priceText.includes('£')) return '£'
  return undefined
}

function simpleProductProfitGap(etsySource?: SimpleProductSourceDetail, supplierSource?: SimpleProductSourceDetail) {
  const competitorPrice = simpleProductPriceNumber(etsySource?.priceText)
  const supplierPrice = simpleProductPriceNumber(supplierSource?.priceText)
  if (competitorPrice === undefined || supplierPrice === undefined) return 'צריך מחיר מתחרה וספק'
  const competitorCurrency = simpleProductCurrency(etsySource?.priceText)
  const supplierCurrency = simpleProductCurrency(supplierSource?.priceText)
  if (competitorCurrency && supplierCurrency && competitorCurrency !== supplierCurrency) return 'צריך המרת מטבע'
  const gap = competitorPrice - supplierPrice
  const currency = competitorCurrency ?? supplierCurrency ?? ''
  if (gap <= 0) return 'אין פער מחיר ברור'
  return `${currency}${Math.round(gap * 100) / 100} פער גולמי`
}

function simpleProductMatchLabel(candidate: EtsyRoomState['candidates'][number], supplierSource?: SimpleProductSourceDetail) {
  if (!supplierSource) return 'חסר ספק'
  if (candidate.missingFields.some((field) => /exact|visual|match|התאמה|ויזואל/i.test(field))) return 'צריך התאמה ויזואלית'
  return 'התאמה חלקית'
}

function simpleProductTags(candidate: EtsyRoomState['candidates'][number], etsySource?: SimpleProductSourceDetail) {
  const fromSource = etsySource?.tags ?? []
  if (fromSource.length) return fromSource.slice(0, 6)
  return candidate.title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3)
    .slice(0, 6)
}

function simpleProductDecision(candidate: EtsyRoomState['candidates'][number], etsySource?: SimpleProductSourceDetail, supplierSource?: SimpleProductSourceDetail) {
  if (!etsySource?.priceText) return 'חסר מחיר מתחרה'
  if (!supplierSource?.priceText) return 'חסר מחיר ספק'
  if (!etsySource.salesText && !etsySource.demandText) return 'צריך הוכחת מכירות'
  if (candidate.missingFields.some((field) => /Alura|monthly|sales|40/i.test(field))) return 'צריך אימות מכירות'
  if (candidate.score !== null && candidate.score >= 75) return 'מועמד חזק'
  return 'מועמד לבדיקה'
}

function SimpleProductImage({
  imageUrl,
  label,
}: {
  imageUrl?: string
  label: string
}) {
  return imageUrl ? (
    <img src={imageUrl} alt={label} loading="lazy" />
  ) : (
    <div className="living-v3__product-image-fallback" aria-label={`${label}: image not extracted yet`}>
      <b>אין תמונה</b>
      <span>מקור בלי תמונה</span>
    </div>
  )
}

function SimpleProductConsole({
  pipeline,
  roomState,
  handlers,
}: {
  pipeline: EtsyPipelineState
  roomState: EtsyRoomState
  handlers: EtsyPipelineHandlers
}) {
  const [targetShop, setTargetShop] = useState('DolaroBoutique')
  const inputValue = pipeline.searchInput || handlers.smartIntake.input
  const liveResults = useMemo(() => roomState.candidates.filter((candidate) =>
    candidate.dataOrigin === 'live-readonly-research'
    && !isLegacyEtsyDemoTitle(candidate.title)
  ), [roomState.candidates])
  const visibleLiveResults = useMemo(() => liveResults.slice(0, 6), [liveResults])
  const hiddenLiveResultCount = Math.max(0, liveResults.length - visibleLiveResults.length)
  const selectedRoomCandidate = roomState.selectedCandidateId
    ? roomState.candidates.find((candidate) => candidate.candidateId === roomState.selectedCandidateId)
    : undefined
  const selectedTitle = roomState.selectedProductPacket?.selectedProductTitle ?? selectedRoomCandidate?.title
  const hasSelectedProduct = Boolean(roomState.selectedProductPacket || selectedRoomCandidate)
  const supplierNeeds = selectedRoomCandidate?.missingFields ?? roomState.selectedProductPacket?.missingFields ?? []
  const sourceLinks = selectedRoomCandidate?.sourceRecordIds ?? roomState.selectedProductPacket?.sourceRecordIds ?? []
  const evidenceIds = selectedRoomCandidate?.evidenceIds ?? roomState.selectedProductPacket?.evidenceIds ?? []
  const searchRunning = handlers.liveScout.status === 'running'
  const liveBlocked = handlers.liveScout.status === 'blocked' || handlers.liveScout.status === 'failed'
  const canSearch = inputValue.trim().length > 0 && !searchRunning
  const supplierPassed = Boolean(hasSelectedProduct && supplierNeeds.length === 0 && evidenceIds.length > 0)
  const shotLabReady = Boolean(roomState.shotLabHandoffPacket)
  const seoReady = Boolean(roomState.seoPacket)
  const draftReady = Boolean(roomState.draftPayload || pipeline.draftPacket)
  const approvalReady = Boolean(roomState.approvalPacket || pipeline.draftApprovalPacket)
  const tableLinks = [
    {
      id: 'approval',
      label: 'אישור מוצר',
      href: '#product-approval-in-screen',
      note: 'מחליטים כאן: ירוק / חסר / לא להמשיך.',
    },
    {
      id: 'supplier',
      label: 'טבלת ספק',
      href: 'https://docs.google.com/spreadsheets/d/1Zfjc7-xMbRzB2MH0JhLhf_j6Lz5Q3MMBntoTzGBPKm4/edit?pli=1&gid=0#gid=0',
      note: 'מחיר, Can Supply, הערות, בלי כתיבה אוטומטית.',
    },
    {
      id: 'proof',
      label: 'מתחרה מול ספק',
      href: 'https://docs.google.com/spreadsheets/d/14ri1qDkrRJMxasnqQdYkkp2xtrB4X5Mh-WPru3kUK-s/edit?gid=0#gid=0',
      note: 'התאמה ויזואלית לפני ShotLab ודראפט.',
    },
  ]
  const selectedSourceDetails = selectedRoomCandidate ? simpleProductSourceDetails(selectedRoomCandidate) : []
  const selectedEtsySource = selectedSourceDetails.find((source) => source.kind === 'etsy')
  const selectedSupplierSource = selectedSourceDetails.find((source) => source.kind === 'supplier')
  const selectedImageUrl = selectedRoomCandidate ? simpleProductPrimaryImage(selectedRoomCandidate) : undefined
  const selectedPriceGap = selectedRoomCandidate ? simpleProductProfitGap(selectedEtsySource, selectedSupplierSource) : 'בחר מוצר'
  const selectedMatchLabel = selectedRoomCandidate ? simpleProductMatchLabel(selectedRoomCandidate, selectedSupplierSource) : 'בחר מוצר'
  const selectedDecision = selectedRoomCandidate ? simpleProductDecision(selectedRoomCandidate, selectedEtsySource, selectedSupplierSource) : 'בחר מוצר'
  const selectedTags = selectedRoomCandidate ? simpleProductTags(selectedRoomCandidate, selectedEtsySource) : []
  const visibleBlockers = Array.from(new Set(supplierNeeds)).slice(0, 4)
  const pipelineSteps = [
    { id: 'search', label: 'חיפוש', ready: liveResults.length > 0, text: liveResults.length ? `${liveResults.length} תוצאות` : 'הרץ חיפוש Chrome' },
    { id: 'choose', label: 'בחירה', ready: hasSelectedProduct, text: selectedTitle ?? 'בחר מוצר אחד' },
    { id: 'match', label: 'ספק', ready: supplierPassed, text: selectedSupplierSource ? 'נמצא ספק' : 'צריך הוכחת ספק' },
    { id: 'media', label: 'מדיה', ready: shotLabReady, text: shotLabReady ? 'בריף ShotLab מוכן' : 'צריך תמונות מקור' },
    { id: 'seo', label: 'SEO', ready: seoReady, text: seoReady ? 'SEO מוכן' : 'תגיות/כותרת ממתינות' },
    { id: 'draft', label: 'דראפט', ready: approvalReady, text: approvalReady ? 'אישור מוכן' : 'נעול' },
  ]
  const simpleReadinessPercent = Math.max(0, Math.min(100,
    (approvalReady ? 100 : draftReady ? 84 : seoReady ? 68 : shotLabReady ? 52 : hasSelectedProduct ? 34 : liveResults.length ? 18 : 6)
      - Math.min(24, supplierNeeds.length * 4),
  ))
  const simpleProofPercent = Math.max(0, Math.min(100, evidenceIds.length * 22 + sourceLinks.length * 12))
  const simpleDemandPercent = Math.max(0, Math.min(100, selectedRoomCandidate?.score ?? liveResults[0]?.score ?? 0))
  const simpleSeoPercent = Math.max(0, Math.min(100, roomState.seoPacket?.metrics.score ?? selectedRoomCandidate?.score ?? 0))
  const simpleCockpitMetrics = [
    { id: 'evidence', label: 'מקור', value: simpleProofPercent, detail: evidenceIds.length ? `${evidenceIds.length} evidence` : 'pending' },
    { id: 'demand', label: 'ביקוש', value: simpleDemandPercent, detail: liveResults.length ? `${liveResults.length} products` : 'search first' },
    { id: 'readiness', label: 'דראפט', value: simpleReadinessPercent, detail: approvalReady ? 'approval gate' : draftReady ? 'draft local' : 'locked' },
    { id: 'seo', label: 'SEO', value: simpleSeoPercent, detail: seoReady ? `${roomState.seoPacket?.tagCandidates.length ?? 0} tags` : 'not written' },
  ]
  const runProductSearch = () => {
    if (!canSearch) return
    handlers.updateSearchInput(inputValue)
    handlers.updateSmartIntakeInput(inputValue)
    handlers.runLiveScout({ keepSurface: true })
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runProductSearch()
  }

  const chooseCandidate = (candidateId: string) => {
    handlers.selectCandidate(candidateId)
  }

  const runNextDraftStep = () => {
    if (!hasSelectedProduct) return
    if (!shotLabReady) {
      handlers.createShotLabHandoffPacket()
      return
    }
    if (!seoReady) {
      handlers.createSeoPacket()
      return
    }
    if (!draftReady) {
      handlers.createDraftPayload()
      return
    }
    if (!approvalReady) handlers.createDraftApprovalPacket()
  }

  const draftStepLabel = !hasSelectedProduct
    ? 'בחר מוצר קודם'
    : !shotLabReady
      ? 'הכן לשוטלאב'
      : !seoReady
        ? 'כתוב כותרת/תיאור/תגים'
        : !draftReady
          ? 'בנה דראפט'
          : !approvalReady
            ? 'בקש אישור דראפט'
            : 'בקשת דראפט מוכנה'

  const searchStatus = searchRunning
    ? 'מחפש באינטרנט עכשיו'
    : liveResults.length
      ? `${liveResults.length} תוצאות אינטרנט`
      : liveBlocked
        ? 'חיפוש נחסם / לא נמצאו תוצאות'
        : 'כתוב מוצר ולחץ חיפוש'

  return (
    <div className="living-v3__simple-product-console" data-simple-product-console="v1" data-product-command-shell="v2" data-internet-search-default="true" dir="rtl">
      {roomState.researchMissionPacket && (
        <section className="living-v3__research-mission-handoff" data-research-mission-handoff="staged" role="status">
          <div>
            <p>RESEARCH MISSION STAGED</p>
            <h3><bdi dir="auto">{roomState.researchMissionPacket.target}</bdi></h3>
            <span>{roomState.researchMissionPacket.depth} · {roomState.researchMissionPacket.modules.length} modules · המחקר החיצוני עדיין לא התחיל</span>
          </div>
          <div>
            <b><bdi dir="ltr">{roomState.researchMissionPacket.missionId}</bdi></b>
            <small>נשמר מקומית · בדוק לפני כל הרצה חיצונית</small>
          </div>
        </section>
      )}
      <section className="living-v3__simple-product-hero" aria-label="חיפוש מוצר באינטרנט">
        <form onSubmit={submitSearch} className="living-v3__simple-product-search">
          <label>
            <span>אטסי</span>
            <textarea
              value={inputValue}
              onChange={(event) => {
                handlers.updateSearchInput(event.target.value)
                handlers.updateSmartIntakeInput(event.target.value)
              }}
              placeholder="מה לחפש? למשל: כוס קרמיקה עם ספק זהה ותמונות מקור"
              dir="auto"
            />
          </label>
          <button className="living-v3__simple-product-primary" type="submit" disabled={!canSearch}>
            {searchRunning ? 'מחפש…' : 'חפש'}
          </button>
          <span className="living-v3__simple-product-status">{searchStatus}</span>
          {liveBlocked && (
            <small className="living-v3__simple-product-error">
              {liveResults.length ? 'מוצגות התוצאות האחרונות.' : 'החיפוש נחסם או לא החזיר תוצאות.'}
            </small>
          )}
        </form>
      </section>

      <section className="living-v3__product-progress-strip" aria-label="מצב עבודה">
        {pipelineSteps.map((step) => (
          <span key={step.id} data-step-id={step.id} data-state={step.ready ? 'ready' : step.id === 'search' && searchRunning ? 'active' : 'waiting'}>
            {step.label}
          </span>
        ))}
      </section>

      <section className="living-v3__product-cockpit" data-etsy-product-prep-cockpit="v1" data-etsy-primary-cockpit="v1" aria-label="Etsy product prep cockpit">
        <article className="living-v3__product-cockpit-artifact" data-product-artifact-state={hasSelectedProduct ? 'selected' : liveResults.length ? 'candidate' : 'empty'}>
          <div className="living-v3__product-cockpit-media">
            <SimpleProductImage imageUrl={selectedImageUrl ?? simpleProductPrimaryImage(liveResults[0])} label={`${selectedTitle ?? liveResults[0]?.title} cockpit image`} />
          </div>
          <div>
            <p>מוצר</p>
            <h3>{selectedTitle ?? liveResults[0]?.title}</h3>
            <span>{hasSelectedProduct ? selectedDecision : liveResults.length ? 'בחר מוצר אחד.' : 'התוצאות יופיעו כאן.'}</span>
          </div>
          <div className="living-v3__product-cockpit-locks">
            <span>Live נעול</span>
            <span>ספק נעול</span>
          </div>
        </article>

        <div className="living-v3__product-cockpit-pills" data-etsy-readiness-radar="v1" aria-label="מצב מוצר">
          {simpleCockpitMetrics.slice(0, 3).map((metric) => (
            <span key={metric.id} data-cockpit-metric={metric.id}>
              <b>{metric.label}</b>{metric.value}
            </span>
          ))}
        </div>

        <article className="living-v3__product-cockpit-next" data-etsy-next-action={hasSelectedProduct && !approvalReady ? 'ready' : 'blocked'}>
          <p>הבא</p>
          <h3>{draftStepLabel}</h3>
          <button type="button" onClick={runNextDraftStep} disabled={!hasSelectedProduct || approvalReady}>{draftStepLabel}</button>
        </article>
      </section>

      <section className="living-v3__product-workbench" aria-label="Product research workbench" data-product-grade-ui="v1">
        <div className="living-v3__product-results-board">
          <div className="living-v3__product-board-head">
            <div>
              <span>תוצאות</span>
              <h3>{liveResults.length ? `${Math.min(liveResults.length, visibleLiveResults.length)} מוצרים` : 'אין תוצאות'}</h3>
            </div>
            <small>{hiddenLiveResultCount ? `${searchStatus} · עוד ${hiddenLiveResultCount} שמורים` : searchStatus}</small>
          </div>

          {searchRunning && (
            <div className="living-v3__product-skeleton" aria-live="polite">
              <span />
              <div>
                <b>הדפדפן של הרמס קורא מרקטפלייסים</b>
                <small>מביא כרטיסי Etsy וספקים.</small>
              </div>
            </div>
          )}

          {visibleLiveResults.length ? visibleLiveResults.map((candidate) => {
            const sources = simpleProductSourceDetails(candidate)
            const etsySource = sources.find((source) => source.kind === 'etsy')
            const supplierSource = sources.find((source) => source.kind === 'supplier')
            const etsyImage = simpleProductPrimaryImage(candidate, 'etsy')
            const supplierImage = simpleProductPrimaryImage(candidate, 'supplier')
            const hasImages = Boolean(etsyImage || supplierImage)
            const priceGap = simpleProductProfitGap(etsySource, supplierSource)
            const matchLabel = simpleProductMatchLabel(candidate, supplierSource)
            const decision = simpleProductDecision(candidate, etsySource, supplierSource)
            const tags = simpleProductTags(candidate, etsySource)
            return (
              <article
                key={candidate.candidateId}
                className={candidate.selected ? 'living-v3__product-result-card is-selected' : 'living-v3__product-result-card'}
                data-simple-product-result="internet"
                data-has-product-image={hasImages ? 'true' : 'false'}
              >
                <div className="living-v3__product-media-pair">
                  <figure>
                    <SimpleProductImage imageUrl={etsyImage} label={`${candidate.title} Etsy image`} />
                    <figcaption>Etsy</figcaption>
                  </figure>
                  <figure>
                    <SimpleProductImage imageUrl={supplierImage} label={`${candidate.title} supplier image`} />
                    <figcaption>{supplierSource?.marketplace ?? 'Supplier'}</figcaption>
                  </figure>
                </div>

                <div className="living-v3__product-card-body">
                  <div className="living-v3__product-card-title">
                    <div>
                      <span>החלטה מהירה</span>
                      <h4>{candidate.title}</h4>
                    </div>
                    <b>{decision}</b>
                  </div>

                  <div className="living-v3__product-money-grid" aria-label="נתוני מחיר ומכירות">
                    <article>
                      <span>מחיר מתחרה</span>
                      <b><bdi dir="ltr">{etsySource?.priceText ?? 'חסר'}</bdi></b>
                      <small>{etsySource?.salesText ?? etsySource?.demandText ?? 'מכירות לא נמצאו בחיפוש'}</small>
                    </article>
                    <article>
                      <span>מחיר ספק</span>
                      <b><bdi dir="ltr">{supplierSource?.priceText ?? 'חסר'}</bdi></b>
                      <small>{supplierSource?.marketplace ?? 'צריך ספק'}</small>
                    </article>
                    <article>
                      <span>פער</span>
                      <b><bdi dir="auto">{priceGap}</bdi></b>
                      <small>{matchLabel}</small>
                    </article>
                  </div>

                  <div className="living-v3__product-tag-row" aria-label="תגיות מוצר">
                    {tags.length ? tags.map((tag) => <span key={`${candidate.candidateId}-${tag}`}>{tag}</span>) : <span>תגיות חסרות</span>}
                  </div>

                  <div className="living-v3__product-source-grid">
                    {sources.slice(0, 2).map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        <span>{source.kind === 'etsy' ? 'מתחרה' : source.kind === 'supplier' ? 'ספק' : 'מקור'}</span>
                        <b><bdi dir="ltr">{source.priceText ?? simpleProductHost(source.url)}</bdi></b>
                        <small>{source.marketplace ?? simpleProductHost(source.url)}</small>
                      </a>
                    ))}
                  </div>

                  <div className="living-v3__product-card-actions">
                    <button type="button" onClick={() => chooseCandidate(candidate.candidateId)}>
                      {candidate.selected ? 'נבחר' : 'בחר מוצר'}
                    </button>
                    <details>
                      <summary>מקורות</summary>
                      <small>חסר: {candidate.missingFields.slice(0, 4).join(', ') || 'לא מוצג'}</small>
                      <small>מקורות: {candidate.evidenceIds.slice(0, 3).join(', ')}</small>
                    </details>
                  </div>
                </div>
              </article>
            )
          }) : (
            <div className="living-v3__product-empty-state">
              <b>אין תוצאות</b>
              <span>כתוב חיפוש ולחץ חפש.</span>
            </div>
          )}
        </div>

        <aside className="living-v3__product-dossier" id="product-approval-in-screen" aria-label="Selected product dossier">
          <div className="living-v3__product-dossier-head">
            <span>מוצר שנבחר</span>
            <h3>{selectedTitle ?? 'בחר תוצאה'}</h3>
          </div>

          <div className="living-v3__product-dossier-visual">
            <SimpleProductImage imageUrl={selectedImageUrl} label={`${selectedTitle ?? 'Selected product'} image`} />
          </div>

          <div className="living-v3__product-dossier-links">
            {selectedEtsySource ? <a className="living-v3__product-link--etsy" href={selectedEtsySource.url} target="_blank" rel="noreferrer">פתח מתחרה</a> : <span className="living-v3__product-link--missing">חסר מתחרה</span>}
            {selectedSupplierSource ? <a className="living-v3__product-link--supplier" href={selectedSupplierSource.url} target="_blank" rel="noreferrer">פתח ספק</a> : <span className="living-v3__product-link--missing">חסר ספק</span>}
          </div>

          <div className="living-v3__product-dossier-metrics" aria-label="סיכום מוצר שנבחר">
            <article>
              <span>החלטה</span>
              <b>{selectedDecision}</b>
            </article>
            <article>
              <span>מתחרה</span>
              <b><bdi dir="ltr">{selectedEtsySource?.priceText ?? 'חסר'}</bdi></b>
              <small>{selectedEtsySource?.salesText ?? selectedEtsySource?.demandText ?? 'אין מכירות גלויות'}</small>
            </article>
            <article>
              <span>ספק</span>
              <b><bdi dir="ltr">{selectedSupplierSource?.priceText ?? 'חסר'}</bdi></b>
              <small>{selectedMatchLabel}</small>
            </article>
            <article>
              <span>פער</span>
              <b><bdi dir="auto">{selectedPriceGap}</bdi></b>
            </article>
          </div>

          <div className="living-v3__product-tag-row" aria-label="תגיות המוצר שנבחר">
            {selectedTags.length ? selectedTags.map((tag) => <span key={`selected-${tag}`}>{tag}</span>) : <span>תגיות חסרות</span>}
          </div>

          <div className="living-v3__product-next-action">
            <button className="living-v3__simple-product-primary" type="button" onClick={runNextDraftStep} disabled={!hasSelectedProduct || approvalReady}>
              {draftStepLabel}
            </button>
            <button className="living-v3__simple-product-secondary" type="button" onClick={handlers.createDraftApprovalPacket} disabled={!draftReady || approvalReady}>
              בקש אישור
            </button>
          </div>

          <label className="living-v3__product-shop-select">
            <span>חנות לדראפט</span>
            <select value={targetShop} onChange={(event) => setTargetShop(event.target.value)}>
              <option value="DolaroBoutique">DolaroBoutique</option>
              <option value="CeramicByLove">CeramicByLove</option>
              <option value="ShotLab Etsy">ShotLab Etsy</option>
            </select>
          </label>

          <div className="living-v3__product-blockers">
            <b>עוד לא GREEN</b>
            {visibleBlockers.length ? visibleBlockers.map((field) => <span key={field}>{field}</span>) : <span>בחר מוצר כדי לראות מה חסר.</span>}
          </div>

          <details className="living-v3__product-proof-drawer">
            <summary>מקורות, טבלאות ופעולות נעולות</summary>
            <div>
              {tableLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target={link.href.startsWith('http') ? '_blank' : undefined}
                  rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
                >
                  <b>{link.label}</b>
                  <span>{link.note}</span>
                </a>
              ))}
            </div>
            <small>מקורות: {sourceLinks.length ? sourceLinks.slice(0, 3).join(' | ') : 'עוד אין'}</small>
            <small>ShotLab: {shotLabReady ? 'מוכן' : 'צריך תמונות מקור מאושרות'}</small>
            <small>SEO: {seoReady ? roomState.seoPacket?.titleCandidates[0] : 'ממתין'}</small>
            <small>דראפט: {draftReady ? roomState.draftPayload?.title ?? pipeline.draftPacket?.title ?? 'דראפט מקומי מוכן' : 'נעול'}</small>
          </details>
        </aside>
      </section>

    </div>
  )
}

function renderEtsyStationApp(stationId: LivingV3StationDefinition['id'], pipeline: EtsyPipelineState, handlers: EtsyPipelineHandlers) {
  if (!isEtsyMarketLabStationId(stationId)) return null
  const appId = etsyMarketLabStationAppId(stationId)
  const roomState = handlers.roomState
  const roomCandidate = activeEtsyRoomCandidate(roomState)
  const activeCandidate = activeEtsyProductCandidate(pipeline)
  const metricRows = pipeline.metricPacket?.rows ?? (activeCandidate ? createEtsyMetricRows(activeCandidate) : [])
  const supplierLeads = visibleEtsySupplierLeads(pipeline)
  const activeLead = activeEtsySupplierLead(pipeline)
  const truthPacket = pipeline.productTruthPacket
  const qaItems = pipeline.qaItems
  const draftPreview = pipeline.draftPacket ?? buildEtsyDraftPreview(pipeline)
  const rawSelectedProductTitle = roomState.selectedProductPacket?.selectedProductTitle
    ?? roomCandidate?.title
    ?? activeCandidate?.title
    ?? 'Choose a product'
  const selectedProductTitle = isLegacyEtsyDemoTitle(rawSelectedProductTitle) ? 'Choose a product' : rawSelectedProductTitle
  const hasRoomSelectedProduct = Boolean(roomState.selectedProductPacket)
  const hasSelectedProduct = hasRoomSelectedProduct || Boolean(activeCandidate)
  const hasSeoPacket = Boolean(roomState.seoPacket)
  const hasShotLabPacket = Boolean(roomState.shotLabHandoffPacket)
  const canCreateTruthPacket = Boolean(activeCandidate || activeLead || truthPacket)
  const canCreateQaReport = qaItems.length > 0
  const hasDraftPreview = Boolean(roomState.draftPayload || pipeline.draftPacket)
  const evidenceQuality = roomCandidate?.evidenceIds.length
    ? `${roomCandidate.evidenceIds.length} evidence`
    : activeCandidate
      ? `${activeCandidate.evidenceCount} evidence · ${activeCandidate.evidenceQuality}`
      : 'evidence pending'

  switch (stationId) {
    case 'etsy-loki-product-hunt':
      return <SimpleProductConsole pipeline={pipeline} roomState={roomState} handlers={handlers} />
    case 'etsy-thor-seo-metrics':
      return (
        <div className="living-v3__etsy-app living-v3__etsy-app--practical living-v3__etsy-app--library-pass living-v3__etsy-app--ledger" data-station-app={appId} data-etsy-stage={roomState.stage} data-etsy-station-redesign="v2" data-etsy-clean-pass="v1" data-component-source="simple-clean-station">
          <div className="living-v3__etsy-surface-head">
            <div>
              <p>SEO</p>
              <h3>{selectedProductTitle}</h3>
            </div>
            <div className="living-v3__etsy-compact-chips">
              <span>Sheets locked</span>
              <span>{evidenceQuality}</span>
            </div>
            <LocalOnlyButton
              className="living-v3__etsy-primary"
              disabled={!hasRoomSelectedProduct}
              disabledReason="Choose a product before creating an SEO packet."
              onClick={handlers.createSeoPacket}
            >
              Create SEO
            </LocalOnlyButton>
          </div>

          {!hasRoomSelectedProduct ? (
            <EtsyStationBlockedState
              title="SEO is waiting"
              missing="Choose a product first"
              why="Open Search, choose one product, then come back here for title, tags, and metrics."
              actions={[{ label: 'Go to Product Search', stationId: 'etsy-loki-product-hunt' }]}
              onGoToStation={handlers.goToStation}
            >
              <EtsySkeletonSlots labels={['Title candidates', 'Tag set', 'Metrics row']} />
              <LocalOnlyButton
                className="living-v3__etsy-primary"
                disabled
                disabledReason="Create an SEO packet before staging a local sheet row."
              >
                Stage Sheet Row Locally
              </LocalOnlyButton>
            </EtsyStationBlockedState>
          ) : (
            <>
              <div className="living-v3__etsy-metric-cards" aria-label="SEO metric summary">
                <div><span>Vol</span><b>{formatMetric(roomState.seoPacket?.metrics.volume, 'missing')}</b></div>
                <div><span>Comp</span><b>{formatMetric(roomState.seoPacket?.metrics.competition, 'missing')}</b></div>
                <div><span>Score</span><b>{formatMetric(roomState.seoPacket?.metrics.score ?? activeCandidate?.metricRows[0]?.keywordScore, 'missing')}</b></div>
                <div><span>Row</span><b>{pipeline.metricPacket?.stagedSheetRow ? 'ready' : 'not staged'}</b></div>
              </div>

              <div className="living-v3__etsy-work-grid living-v3__etsy-work-grid--three">
                <section className="living-v3__etsy-work-card">
                  <p>Title candidates</p>
                  {(roomState.seoPacket?.titleCandidates ?? [`${selectedProductTitle} Gift Jewelry`, `${selectedProductTitle} Minimalist Gift`]).map((title) => <span key={title}>{title}</span>)}
                </section>
                <section className="living-v3__etsy-work-card">
                  <p>Tags</p>
                  <div className="living-v3__etsy-tag-cloud">{(roomState.seoPacket?.tagCandidates ?? activeCandidate?.tags ?? ['gift jewelry']).slice(0, 13).map((tag) => <span key={tag}>{tag}</span>)}</div>
                </section>
                <section className="living-v3__etsy-work-card">
                  <p>Compliance</p>
                  {(roomState.seoPacket?.complianceWarnings ?? ['No lookalike wording', 'No material claims without evidence', 'No keyword stuffing']).map((warning) => <span key={warning}>{warning}</span>)}
                </section>
              </div>

              <div className="living-v3__etsy-work-grid">
                <section className="living-v3__etsy-work-card">
                  <p>Missing metrics</p>
                  {(roomState.seoPacket?.missingKeywordMetrics ?? ['search volume', 'competition', 'safe local SEO source']).map((item) => <span key={item}>{item}</span>)}
                </section>
                <section className="living-v3__etsy-work-card living-v3__etsy-work-card--output">
                  <p>Paste-ready output</p>
                  <textarea readOnly aria-label="Paste-ready SEO output" value={[
                    `Product: ${selectedProductTitle}`,
                    `Title: ${roomState.seoPacket?.titleCandidates[0] ?? `${selectedProductTitle} Gift Jewelry`}`,
                    `Tags: ${(roomState.seoPacket?.tagCandidates ?? activeCandidate?.tags ?? ['gift jewelry']).slice(0, 13).join(', ')}`,
                  ].join('\n')} />
                  <LocalOnlyButton
                    className="living-v3__etsy-primary"
                    disabled={!hasSeoPacket}
                    disabledReason="Create an SEO packet before staging a local sheet row."
                    onClick={handlers.stageSheetRow}
                  >
                    Stage Sheet Row Locally
                  </LocalOnlyButton>
                </section>
              </div>
            </>
          )}
        </div>
      )
    case 'etsy-loki-source-leads':
      return (
        <div className="living-v3__etsy-app living-v3__etsy-app--practical living-v3__etsy-app--library-pass living-v3__etsy-app--net" data-station-app={appId} data-etsy-station-redesign="v2" data-etsy-clean-pass="v1" data-component-source="simple-clean-station">
          <div className="living-v3__etsy-surface-head">
            <div>
              <p>Source Leads</p>
              <h3>{selectedProductTitle}</h3>
            </div>
            <div className="living-v3__etsy-filter-row" aria-label="Source lead filters">
              {['All', 'Etsy', 'AliExpress', 'Alibaba'].map((filter) => (
                <button key={filter} className={pipeline.supplierFilter === filter ? 'is-active' : ''} type="button" onClick={() => handlers.setSupplierFilter(filter as EtsySupplierFilter)}>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="living-v3__etsy-board-grid" aria-label="Source lead board">
            {!hasSelectedProduct ? (
              <EtsyStationBlockedState
                title="Sources are waiting"
                missing="Choose a product first"
                why="Pick one product before comparing source leads, match, price, and risk."
                actions={[{ label: 'Go to Product Search', stationId: 'etsy-loki-product-hunt' }]}
                onGoToStation={handlers.goToStation}
              >
                <EtsySkeletonSlots labels={['Etsy reference', 'AliExpress lead', 'Alibaba lead']} />
              </EtsyStationBlockedState>
            ) : supplierLeads.length ? supplierLeads.map((lead) => (
              <article key={lead.leadId} className={`living-v3__etsy-lead-card ${lead.saved ? 'is-selected' : ''}`}>
                <LocalThumb label={lead.sourceType} tone={lead.sourceType === 'Etsy' ? '#9db5a3' : lead.sourceType === 'AliExpress' ? '#6f9f97' : '#c6a06a'} />
                <div>
                  <div className="living-v3__etsy-card-kicker">
                    <span>{lead.sourceType}</span>
                    {lead.saved && <span>Saved</span>}
                  </div>
                  <h3>{lead.title}</h3>
                  <dl className="living-v3__etsy-card-stats">
                    <div><dt>Price</dt><dd>{lead.price}</dd></div>
                    <div><dt>Match</dt><dd>{lead.matchScore}%</dd></div>
                    <div><dt>Risk</dt><dd>{lead.risk}</dd></div>
                    <div><dt>Evidence</dt><dd>{lead.evidenceIds.length || 'missing'}</dd></div>
                  </dl>
                </div>
                <div className="living-v3__etsy-card-actions">
                  <button type="button" onClick={() => handlers.saveSupplierLead(lead)}>Save</button>
                  <button type="button" onClick={() => handlers.sendSupplierLeadToAnubis(lead)}>Send to Truth</button>
                  <button type="button">Reject</button>
                </div>
              </article>
            )) : (
              <EtsyEmptyState>Save or send a source lead from a selected product.</EtsyEmptyState>
            )}
          </div>

          {activeLead && (
            <div className="living-v3__etsy-inline-status">
              <span>Saved lead</span>
              <b>{activeLead.sourceType}: {activeLead.title}</b>
            </div>
          )}
        </div>
      )
    case 'etsy-thor-source-truth':
      return (
        <div className="living-v3__etsy-app living-v3__etsy-app--practical living-v3__etsy-app--library-pass living-v3__etsy-app--truth" data-station-app={appId} data-etsy-station-redesign="v2" data-etsy-clean-pass="v1" data-component-source="simple-clean-station">
          <div className="living-v3__etsy-surface-head">
            <div>
              <p>Source Truth</p>
              <h3>{selectedProductTitle}</h3>
            </div>
            <div className="living-v3__etsy-compact-chips">
              <span>{activeLead ? `${activeLead.sourceType} saved` : 'No saved lead'}</span>
              <span>{truthPacket ? truthPacket.evidenceQuality : evidenceQuality}</span>
            </div>
            <LocalOnlyButton
              className="living-v3__etsy-primary"
              disabled={!canCreateTruthPacket}
              disabledReason="Select a pipeline product or save a candidate-backed source lead before creating product truth."
              onClick={handlers.createTruthPacket}
            >
              Create Product Truth Packet
            </LocalOnlyButton>
          </div>

          {!canCreateTruthPacket ? (
            <EtsyStationBlockedState
              title="Truth check is waiting"
              missing="Select a product or source lead"
              why="Choose a product or source lead, then mark what is proven, missing, and unsafe to claim."
              actions={[
                { label: 'Go to Product Search', stationId: 'etsy-loki-product-hunt' },
                { label: 'Go to Source Leads', stationId: 'etsy-loki-source-leads' },
              ]}
              onGoToStation={handlers.goToStation}
            >
              <EtsySkeletonSlots labels={['Materials', 'Dimensions', 'Variants', 'Claims']} />
            </EtsyStationBlockedState>
          ) : (
            <>
              <div className="living-v3__etsy-checklist-grid" aria-label="Source truth checklist">
                {etsyTruthFields.map((item) => {
                  const attached = truthPacket ? !truthPacket.missingEvidence.includes(item) : false
                  return (
                    <label key={item} className={`living-v3__etsy-truth-check ${attached ? 'is-attached' : ''}`}>
                      <input
                        type="checkbox"
                        checked={attached}
                        onChange={(event) => handlers.toggleTruthField(item, event.target.checked)}
                      />
                      <span>{item}</span>
                      <small>{attached ? 'evidence attached' : 'missing proof'}</small>
                    </label>
                  )
                })}
              </div>

              <div className="living-v3__etsy-work-grid">
                <section className="living-v3__etsy-work-card">
                  <p>Allowed claims</p>
                  {(truthPacket?.claimsAllowed ?? ['giftable', 'jewelry', 'style-led only']).map((claim) => <span key={claim}>{claim}</span>)}
                </section>
                <section className="living-v3__etsy-work-card">
                  <p>Blocked claims</p>
                  {(truthPacket?.claimsBlocked ?? ['hypoallergenic', 'waterproof', 'handmade', 'premium material']).map((claim) => <span key={claim}>{claim}</span>)}
                </section>
                <section className="living-v3__etsy-work-card">
                  <p>Unknowns</p>
                  {(truthPacket?.unknowns ?? ['materials', 'dimensions', 'variant truth']).map((unknown) => <span key={unknown}>{unknown}</span>)}
                </section>
              </div>
            </>
          )}
        </div>
      )
    case 'etsy-thor-shotlab-prep':
      return (
        <div className="living-v3__etsy-app living-v3__etsy-app--practical living-v3__etsy-app--library-pass living-v3__etsy-app--shotlab" data-station-app={appId} data-etsy-stage={roomState.stage} data-etsy-station-redesign="v2" data-etsy-clean-pass="v1" data-component-source="simple-clean-station">
          <div className="living-v3__etsy-surface-head">
            <div>
              <p>ShotLab</p>
              <h3>{selectedProductTitle}</h3>
            </div>
            <div className="living-v3__etsy-compact-chips">
              <span>Generation locked</span>
              <span>{roomState.shotLabHandoffPacket ? 'handoff ready' : 'source media pending'}</span>
            </div>
            <LocalOnlyButton
              className="living-v3__etsy-primary"
              disabled={!hasRoomSelectedProduct}
              disabledReason="Choose a product before creating a ShotLab handoff."
              onClick={handlers.createShotLabHandoffPacket}
            >
              Create ShotLab Handoff Packet
            </LocalOnlyButton>
          </div>

          {!hasRoomSelectedProduct ? (
            <EtsyStationBlockedState
              title="Images are waiting"
              missing="Choose a product first"
              why="Pick a product, then define the image set and missing source media."
              actions={[{ label: 'Go to Product Search', stationId: 'etsy-loki-product-hunt' }]}
              onGoToStation={handlers.goToStation}
            >
              <EtsySkeletonSlots labels={['Hero source', 'Detail source', 'Variant proof', 'Scale proof']} />
            </EtsyStationBlockedState>
          ) : (
            <>
              <div className="living-v3__etsy-production-grid">
                <div className="living-v3__etsy-media-slots" aria-label="ShotLab media slots">
                  {Array.from({ length: roomState.shotLabDraft.imageCount }, (_, index) => (
                    <div key={index} className="living-v3__etsy-media-slot">
                      <span>{index + 1}</span>
                      <b>{['Hero', 'Detail', 'Scale', 'Variant', 'Texture', 'Lifestyle', 'Back', 'Proof'][index] ?? 'Source'}</b>
                      <small>{roomState.shotLabHandoffPacket ? 'mapped locally' : 'source required'}</small>
                    </div>
                  ))}
                </div>

                <div className="living-v3__etsy-work-card living-v3__etsy-work-card--controls">
                  <label>
                    <span>Preset</span>
                    <select value={roomState.shotLabDraft.preset} onChange={(event) => handlers.setShotLabPreset(event.target.value as EtsyRoomState['shotLabDraft']['preset'])} aria-label="ShotLab preset selector">
                      <option value="Boutique Premium">Boutique Premium</option>
                      <option value="Minimalist Zen">Minimalist Zen</option>
                      <option value="Earthy Organic">Earthy Organic</option>
                    </select>
                  </label>
                  <label>
                    <span>Image count</span>
                    <select value={roomState.shotLabDraft.imageCount} onChange={(event) => handlers.setShotLabImageCount(Number(event.target.value))} aria-label="Image count selector">
                      <option value="4">4 images</option>
                      <option value="6">6 images</option>
                      <option value="8">8 images</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="living-v3__etsy-work-grid">
                <label className="living-v3__etsy-work-card living-v3__etsy-work-card--output">
                  <p>Required source images</p>
                  <textarea value={roomState.shotLabDraft.sourceImageRequirements} onChange={(event) => handlers.setShotLabSourceImageRequirements(event.target.value)} />
                </label>
                <label className="living-v3__etsy-work-card living-v3__etsy-work-card--output">
                  <p>Variant truth</p>
                  <textarea value={roomState.shotLabDraft.variantNotes} onChange={(event) => handlers.setShotLabVariantNotes(event.target.value)} dir="auto" />
                </label>
                <section className="living-v3__etsy-work-card">
                  <p>Missing media</p>
                  {(roomState.shotLabHandoffPacket?.missingSourceMedia ?? ['hero source image', 'detail source image', 'scale proof']).map((item) => <span key={item}>{item}</span>)}
                </section>
              </div>
            </>
          )}
        </div>
      )
    case 'etsy-thor-qa-review':
      return (
        <div className="living-v3__etsy-app living-v3__etsy-app--practical living-v3__etsy-app--library-pass living-v3__etsy-app--inspection" data-station-app={appId} data-etsy-station-redesign="v2" data-etsy-clean-pass="v1" data-component-source="simple-clean-station">
          <div className="living-v3__etsy-surface-head">
            <div>
              <p>QA Inspection</p>
              <h3>{selectedProductTitle}</h3>
            </div>
            <div className="living-v3__etsy-compact-chips">
              <span>{truthPacket ? 'truth packet ready' : 'truth pending'}</span>
              <span>{pipeline.visualQaReport ? 'report ready' : `${qaItems.length} QA cards`}</span>
            </div>
            <LocalOnlyButton
              className="living-v3__etsy-primary"
              disabled={!canCreateQaReport}
              disabledReason="Create a product truth packet before creating a QA report."
              onClick={handlers.createQaReport}
            >
              Create QA Report
            </LocalOnlyButton>
          </div>

          <div className="living-v3__etsy-qa-grid" aria-label="Image QA board">
            {qaItems.length ? qaItems.map((image) => (
              <article key={image.qaItemId} className="living-v3__etsy-qa-card">
                <LocalThumb label={image.label} tone={image.tone} />
                <div className="living-v3__etsy-card-kicker">
                  <span>{image.status}</span>
                  <span>{image.issues.length ? `${image.issues.length} issues` : 'clean'}</span>
                </div>
                <h3>{image.label}</h3>
                <div className="living-v3__etsy-toggle-row" aria-label={`${image.label} approve or reject`}>
                  <button type="button" className={image.status === 'approved' ? 'is-active' : ''} onClick={() => handlers.updateQaItemStatus(image.qaItemId, 'approved')}>Approve</button>
                  <button type="button" className={image.status === 'rejected' ? 'is-active' : ''} onClick={() => handlers.updateQaItemStatus(image.qaItemId, 'rejected')}>Reject</button>
                </div>
                <div className="living-v3__etsy-issue-chips">
                  {(['bad claim', 'variant mismatch', 'AI weirdness', ...issueChips, ...image.issues].slice(0, 6)).map((chip) => (
                    <button key={chip} type="button">{chip}</button>
                  ))}
                </div>
              </article>
            )) : (
              <EtsyStationBlockedState
                title="QA is waiting"
                missing="Truth + media needed"
                why="Create truth and image context first, then approve or reject each item."
                actions={[
                  { label: 'Go to Source Truth', stationId: 'etsy-thor-source-truth' },
                  { label: 'Go to ShotLab', stationId: 'etsy-thor-shotlab-prep' },
                ]}
                onGoToStation={handlers.goToStation}
              >
                <EtsySkeletonSlots labels={['Claims', 'Variant match', 'AI artifacts', 'Source match']} />
              </EtsyStationBlockedState>
            )}
          </div>

          {pipeline.visualQaReport && (
            <div className="living-v3__etsy-inline-status">
              <span>QA report</span>
              <b>{pipeline.visualQaReport.summary}</b>
            </div>
          )}
        </div>
      )
    case 'etsy-odin-draft-approval':
      return (
        <div className="living-v3__etsy-app living-v3__etsy-app--practical living-v3__etsy-app--library-pass living-v3__etsy-app--draft" data-station-app={appId} data-etsy-stage={roomState.stage} data-etsy-station-redesign="v2" data-etsy-clean-pass="v1" data-component-source="simple-clean-station">
          <div className="living-v3__etsy-surface-head">
            <div>
              <p>Draft</p>
              <h3>{selectedProductTitle}</h3>
            </div>
            <div className="living-v3__etsy-compact-chips">
              <span>ShotLab {hasShotLabPacket ? 'ready' : 'pending'}</span>
              <span>SEO {hasSeoPacket ? 'ready' : 'pending'}</span>
              <span>Draft {roomState.draftPayload ? 'ready' : 'pending'}</span>
            </div>
            <div className="living-v3__etsy-action-pair">
              <LocalOnlyButton
                className="living-v3__etsy-primary"
                disabled={!(hasSeoPacket && hasShotLabPacket)}
                disabledReason="Create both SEO and ShotLab handoff packets before creating the local draft preview."
                onClick={handlers.createDraftPayload}
              >
                Create Draft Preview
              </LocalOnlyButton>
              <LocalOnlyButton
                className="living-v3__etsy-primary"
                disabled={!roomState.draftPayload}
                disabledReason="Create the local draft preview before requesting DLV approval."
                onClick={handlers.createDraftApprovalPacket}
              >
                Request DLV Approval
              </LocalOnlyButton>
            </div>
          </div>

          {hasDraftPreview && draftPreview ? (
            <div className="living-v3__etsy-review-grid" aria-label="Etsy draft approval console">
              <section className="living-v3__etsy-review-card living-v3__etsy-review-card--hero">
                <p>Draft title</p>
                <h3>{roomState.draftPayload?.title ?? draftPreview.title}</h3>
                <span className={bidiClassNameFor(roomState.draftPayload?.description ?? draftPreview.descriptionSummary)} dir={textDirectionFor(roomState.draftPayload?.description ?? draftPreview.descriptionSummary)}>
                  {roomState.draftPayload?.description ?? draftPreview.descriptionSummary}
                </span>
              </section>
              <section className="living-v3__etsy-review-card">
                <p>Tags</p>
                <div className="living-v3__etsy-tag-cloud">{(roomState.draftPayload?.tags ?? draftPreview.tags).map((tag) => <span key={tag}>{tag}</span>)}</div>
              </section>
              <section className="living-v3__etsy-review-card">
                <p>Alt text drafts</p>
                {(roomState.draftPayload?.altTextDrafts ?? ['hero product image', 'detail product image', 'scale product image']).map((alt) => <span key={alt}>{alt}</span>)}
              </section>
              <section className="living-v3__etsy-review-card">
                <p>Missing attributes</p>
                {(roomState.draftPayload?.missingAttributes ?? draftPreview.attributesMissing).map((item) => <span key={item}>{item}</span>)}
              </section>
              <section className="living-v3__etsy-review-card">
                <p>Price / quantity</p>
                <b>{roomState.draftPayload?.pricePlaceholder ?? draftPreview.price}</b>
                <b>{roomState.draftPayload?.quantityPlaceholder ?? draftPreview.quantity}</b>
              </section>
              <section className="living-v3__etsy-review-card">
                <p>Readiness</p>
                <span>ShotLab: {roomState.approvalPacket?.shotLabReadiness ?? (roomState.shotLabHandoffPacket ? 'ready' : 'pending')}</span>
                <span>SEO: {roomState.approvalPacket?.seoReadiness ?? (roomState.seoPacket ? 'ready' : 'pending')}</span>
                <span>Evidence: {roomState.approvalPacket?.evidenceQuality ?? evidenceQuality}</span>
              </section>
            </div>
          ) : (
            <EtsyStationBlockedState
              title="Draft is waiting"
              missing="SEO + ShotLab needed"
              why="Create SEO and image handoff first, then package the local draft for approval."
              actions={[
                { label: 'Go to SEO', stationId: 'etsy-thor-seo-metrics' },
                { label: 'Go to ShotLab', stationId: 'etsy-thor-shotlab-prep' },
              ]}
              onGoToStation={handlers.goToStation}
            >
              <EtsyReadinessList
                items={[
                  { label: 'ShotLab handoff', ready: hasShotLabPacket },
                  { label: 'SEO packet', ready: hasSeoPacket },
                  { label: 'Draft preview', ready: Boolean(roomState.draftPayload) },
                  { label: 'DLV approval', ready: Boolean(roomState.approvalPacket) },
                ]}
              />
            </EtsyStationBlockedState>
          )}

          <div className="living-v3__etsy-locked-row living-v3__etsy-locked-row--compact">
            <button type="button" disabled data-locked-action="Etsy upload draft">Upload Draft locked</button>
            <button type="button" disabled data-locked-action="Etsy publish">Publish locked</button>
          </div>

          {roomState.approvalPacket && (
            <div className="living-v3__etsy-inline-status" data-etsy-packet-id={roomState.approvalPacket.packetId} data-approval-status={roomState.approvalPacket.approvalStatus}>
              <span>DLV approval</span>
              <b>{roomState.approvalPacket.approvalStatus}</b>
              <span className={bidiClassNameFor(roomState.approvalPacket.nextIfApproved)} dir={textDirectionFor(roomState.approvalPacket.nextIfApproved)}>{roomState.approvalPacket.nextIfApproved}</span>
            </div>
          )}
        </div>
      )
    default:
      return null
  }
}

function roomBadges(roomId: LivingV3RoomId, snapshots: Array<LivingV3AgentSnapshot>, state: LivingV3HermesAdapterState) {
  return [
    ...state.alerts.filter((alert) => alert.roomId === roomId).map((alert) => ({ id: alert.id, badge: alert.badge, label: alert.label })),
    ...state.approvals
      .filter((approval) => livingV3StationById(approval.stationId)?.roomId === roomId)
      .map((approval) => ({ id: approval.id, badge: 'approval' as const, label: approval.label })),
    ...snapshots
      .filter((snapshot) => snapshot.roomId === roomId && snapshot.activity === 'sleeping')
      .map((snapshot) => ({ id: `sleep-${snapshot.agentId}`, badge: 'sleeping' as const, label: `${snapshot.agentId} resting` })),
  ].slice(0, 3)
}

export function LivingWarRoomV3({
  bodyRuntimeMode = 'local-adapter',
  etsyFocusMode = false,
  goblinFocusMode = false,
}: {
  bodyRuntimeMode?: BodyRuntimeMode
  etsyFocusMode?: boolean
  goblinFocusMode?: boolean
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const processedOracleSignalPacketsRef = useRef<Set<string>>(new Set())
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startCenter: LivingV3CameraState['center']
    moved: boolean
  } | null>(null)
  const agentWindowActionRef = useRef<AgentWindowLayoutAction | null>(null)
  const suppressClickRef = useRef(false)
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT)
  const [camera, setCamera] = useState<LivingV3CameraState>(() =>
    etsyFocusMode
      ? fitLivingV3RoomCamera('etsy-market-lab', INITIAL_VIEWPORT)
      : goblinFocusMode
        ? fitLivingV3RoomCamera('agora-opportunity', INITIAL_VIEWPORT)
      : fitLivingV3MapCamera(INITIAL_VIEWPORT),
  )
  const cameraRef = useRef<LivingV3CameraState>(camera)
  const viewportRef = useRef(INITIAL_VIEWPORT)
  const stagePointerFrameRef = useRef<number | null>(null)
  const pendingStagePointerRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null)
  const stageWheelFrameRef = useRef<number | null>(null)
  const pendingStageWheelRef = useRef<{ clientX: number; clientY: number; deltaY: number } | null>(null)
  const agentWindowFrameRef = useRef<number | null>(null)
  const pendingAgentWindowPointerRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [adapterState, setAdapterState] = useState(() => createInitialLivingV3HermesState(Date.now() - INITIAL_OFFSET_MS))
  const [selection, setSelection] = useState<LivingV3Selection>(() =>
    etsyFocusMode
      ? { kind: 'station', id: 'etsy-loki-product-hunt' }
      : goblinFocusMode
        ? { kind: 'station', id: 'agora-intake' }
        : null,
  )
  const [drafts, setDrafts] = useState<Partial<Record<LivingV3AgentId, string>>>(
    () => Object.fromEntries(LIVING_V3_WORLD_CONFIG.agents.map((agent) => [agent.id, ''])) as Record<LivingV3AgentId, string>,
  )
  const [messages, setMessages] = useState<Array<AgentMessage>>(loadStoredLivingV3Messages)
  const [agentWindowLayouts, setAgentWindowLayouts] = useState<AgentWindowLayoutMap>(loadStoredAgentWindowLayouts)
  const [navigationDebugOpen, setNavigationDebugOpen] = useState(loadStoredNavigationDebug)
  const [stationActionReceipts, setStationActionReceipts] = useState<Record<LivingV3StationDefinition['id'], string>>(
    () => ({} as Record<LivingV3StationDefinition['id'], string>),
  )
  const [oracleSearch, setOracleSearch] = useState<OracleSearchUiState>(initialOracleSearchState)
  const [etsyWorkspaceState, setEtsyWorkspaceState] = useState(loadStoredEtsyProductWorkspaceState)
  const etsyWorkspaceStateRef = useRef(etsyWorkspaceState)
  const etsyRoomState = etsyWorkspaceState.roomState
  const etsyPipeline = etsyWorkspaceState.pipelineState
  const etsyRoomStateRef = useRef(etsyRoomState)
  const etsyWorkspaceSyncQueueRef = useRef<Promise<void>>(Promise.resolve())
  const etsyWorkspaceLocalMutationRef = useRef(0)
  const etsyWorkspaceSyncedMutationRef = useRef(0)
  const bodyRuntimeEnabled = bodyRuntimeMode === 'body-runtime'

  function etsyWorkspaceHasVisibleSharedState(state: EtsyProductWorkspaceStateV2) {
    return Boolean(
      state.productOrder.length
      || state.roomState.prompt.trim()
      || state.pipelineState.candidates.length
      || state.pipelineState.searchPacket
      || state.pipelineState.productTruthPacket,
    )
  }

  function replaceEtsyWorkspaceLocally(
    projections: { roomState?: EtsyRoomState; pipelineState?: EtsyPipelineState },
    reason: string,
    sync = true,
  ) {
    const current = etsyWorkspaceStateRef.current
    const next = replaceEtsyProductWorkspaceProjectionsLocally(current, projections, Date.now())
    etsyWorkspaceStateRef.current = next
    etsyRoomStateRef.current = next.roomState
    etsyWorkspaceLocalMutationRef.current += 1
    setEtsyWorkspaceState(next)
    if (sync) scheduleEtsyWorkspaceSync(reason)
    return next
  }

  function setEtsyRoomState(
    update: EtsyRoomState | ((current: EtsyRoomState) => EtsyRoomState),
    options?: { reason?: string; sync?: boolean },
  ) {
    const current = etsyWorkspaceStateRef.current
    const roomState = resolveEtsyProjectionState(current.roomState, update)
    if (roomState === current.roomState) return
    replaceEtsyWorkspaceLocally({ roomState }, options?.reason ?? 'Etsy room projection updated', options?.sync ?? true)
  }

  function setEtsyPipeline(update: EtsyPipelineState | ((current: EtsyPipelineState) => EtsyPipelineState)) {
    const current = etsyWorkspaceStateRef.current
    const pipelineState = resolveEtsyProjectionState(current.pipelineState, update)
    if (pipelineState === current.pipelineState) return
    replaceEtsyWorkspaceLocally({ pipelineState }, 'Etsy pipeline projection updated')
  }

  function applyAuthoritativeEtsyWorkspaceState(workspaceState: EtsyProductWorkspaceStateV2) {
    const normalized = parseEtsyProductWorkspaceStateV2(workspaceState) ?? workspaceState
    etsyWorkspaceStateRef.current = normalized
    etsyRoomStateRef.current = normalized.roomState
    setEtsyWorkspaceState(normalized)
  }

  function scheduleEtsyWorkspaceSync(reason: string) {
    const request = etsyWorkspaceSyncQueueRef.current.then(async () => {
      const sentMutation = etsyWorkspaceLocalMutationRef.current
      if (etsyWorkspaceSyncedMutationRef.current >= sentMutation) return
      const desired = etsyWorkspaceStateRef.current
      const commandId = typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `etsy-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const result = await applySharedEtsyProductWorkspaceCommandClient({
        type: 'replace_projections',
        commandId,
        baseRevision: desired.revision,
        reason,
        roomState: desired.roomState,
        pipelineState: desired.pipelineState,
      })
      const authoritative = result.workspaceState
      if (result.commandStatus === 'conflict') {
        etsyWorkspaceSyncedMutationRef.current = etsyWorkspaceLocalMutationRef.current
        applyAuthoritativeEtsyWorkspaceState(authoritative)
        setStationActionReceipts((current) => ({
          ...current,
          'etsy-loki-product-hunt': `Sync conflict blocked safely at revision ${result.expectedRevision ?? authoritative.revision}. Server state restored; reapply the last local action.`,
        }))
        return
      }
      etsyWorkspaceSyncedMutationRef.current = sentMutation
      if (etsyWorkspaceLocalMutationRef.current === sentMutation) {
        applyAuthoritativeEtsyWorkspaceState(authoritative)
      } else {
        const local = etsyWorkspaceStateRef.current
        const rebased = migrateEtsyProductWorkspaceStateV2({
          roomState: local.roomState,
          pipelineState: local.pipelineState,
          nowMs: Date.now(),
          previous: authoritative,
          revision: authoritative.revision,
          events: authoritative.events,
          appliedCommandIds: authoritative.appliedCommandIds,
        })
        etsyWorkspaceStateRef.current = rebased
        etsyRoomStateRef.current = rebased.roomState
        setEtsyWorkspaceState(rebased)
        scheduleEtsyWorkspaceSync('Rebased Etsy workspace update')
      }
    })
    etsyWorkspaceSyncQueueRef.current = request.then(() => undefined, () => undefined)
    void request.catch((error) => {
      setStationActionReceipts((current) => ({
        ...current,
        'etsy-loki-product-hunt': `Shared workspace sync failed safely: ${error instanceof Error ? error.message : String(error)}`,
      }))
    })
  }

  function syncSharedEtsyRoomState(next: EtsyRoomState, reason: string) {
    if (next !== etsyWorkspaceStateRef.current.roomState) {
      replaceEtsyWorkspaceLocally({ roomState: next }, reason)
      return
    }
    scheduleEtsyWorkspaceSync(reason)
  }

  useEffect(() => {
    if (!isLegacyEtsyDemoState(etsyPipeline) && !isLegacyEtsyDemoState(etsyRoomState)) return
    const initial = createInitialEtsyPipelineState()
    const initialRoom = createInitialEtsyRoomState()
    setEtsyPipeline(initial)
    setEtsyRoomState(initialRoom)
    setStationActionReceipts((current) => ({
      ...current,
      'etsy-loki-product-hunt': 'Old local seed cleared. Search in Oracle to send real product cards.',
    }))
    try {
      window.localStorage.removeItem(ETSY_PIPELINE_STORAGE_KEY)
      window.localStorage.removeItem(ETSY_ROOM_STORAGE_KEY)
    } catch {
      // Local cleanup is best-effort only.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void readSharedEtsyRoomState()
      .then((result) => {
        if (cancelled) return
        const local = etsyWorkspaceStateRef.current
        if (result.empty) {
          if (etsyWorkspaceHasVisibleSharedState(local)) {
            etsyWorkspaceLocalMutationRef.current += 1
            scheduleEtsyWorkspaceSync('Browser local Etsy V1 state migrated to the V2 shared workspace')
          } else {
            applyAuthoritativeEtsyWorkspaceState(result.workspaceState)
          }
          return
        }
        const authoritative = result.workspaceState
        const serverHasPipeline = Boolean(
          authoritative.pipelineState.candidates.length
          || authoritative.pipelineState.searchPacket
          || authoritative.pipelineState.productTruthPacket,
        )
        const localHasPipeline = Boolean(
          local.pipelineState.candidates.length
          || local.pipelineState.searchPacket
          || local.pipelineState.productTruthPacket,
        )
        if (authoritative.revision === 0 && localHasPipeline && !serverHasPipeline) {
          const migrated = migrateEtsyProductWorkspaceStateV2({
            roomState: etsyWorkspaceHasVisibleSharedState(authoritative) ? authoritative.roomState : local.roomState,
            pipelineState: local.pipelineState,
            nowMs: Date.now(),
            previous: authoritative,
            revision: authoritative.revision,
            events: authoritative.events,
            appliedCommandIds: authoritative.appliedCommandIds,
          })
          applyAuthoritativeEtsyWorkspaceState(migrated)
          etsyWorkspaceLocalMutationRef.current += 1
          scheduleEtsyWorkspaceSync('Merged browser pipeline projection into the V2 shared workspace')
          return
        }
        etsyWorkspaceSyncedMutationRef.current = etsyWorkspaceLocalMutationRef.current
        applyAuthoritativeEtsyWorkspaceState(authoritative)
        setStationActionReceipts((current) => ({
          ...current,
          'etsy-loki-product-hunt': `Loaded Etsy V2 workspace revision ${authoritative.revision}: ${authoritative.productOrder.length} product${authoritative.productOrder.length === 1 ? '' : 's'}.`,
        }))
      })
      .catch(() => {
        // Shared room state is best-effort. The local browser state still works if the server store is unavailable.
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      void readSharedEtsyRoomState()
        .then((result) => {
          if (cancelled || result.empty) return
          const current = etsyWorkspaceStateRef.current
          const hasUnsyncedLocalWork = etsyWorkspaceLocalMutationRef.current > etsyWorkspaceSyncedMutationRef.current
          if (!hasUnsyncedLocalWork && result.workspaceState.revision > current.revision) {
            applyAuthoritativeEtsyWorkspaceState(result.workspaceState)
            setStationActionReceipts((receipts) => ({
              ...receipts,
              'etsy-loki-product-hunt': `Synced Etsy V2 workspace revision ${result.workspaceState.revision} from another client.`,
            }))
          }
        })
        .catch(() => undefined)
    }
    const timer = window.setInterval(poll, 3_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    void refreshTerraModelAssets()
    void refreshTerraPrinterStatus()
    void refreshTerraCapabilities()
  }, [])

  const { state: bodyState, error: bodyStateError, refresh: refreshBodyState } = useWarRoomState(bodyRuntimeEnabled ? 1000 : 0)
  const { events: bodyEvents, error: bodyEventsError, refresh: refreshBodyEvents } = useWarRoomEvents(bodyRuntimeEnabled ? 1000 : 0)
  const [bodyActionError, setBodyActionError] = useState<string | null>(null)
  const bodyRuntimeAdapterState = useMemo(() =>
    bodyState ? livingV3AdapterStateFromBodyRuntime(bodyState, bodyEvents, nowMs) : null,
  [bodyState, bodyEvents, nowMs])
  const visualAdapterState = bodyRuntimeEnabled && bodyRuntimeAdapterState && !bodyStateError ? bodyRuntimeAdapterState : adapterState
  const bodyRuntimeStatus = bodyRuntimeEnabled
    ? bodyStateError || bodyEventsError || bodyActionError
      ? 'BODY!'
      : bodyRuntimeAdapterState
        ? 'BODY'
        : 'BODY...'
    : null
  const { state: agentControlState, error: agentControlError, refresh: refreshAgentControl } = useWarRoomAgentControl(1500)
  const [agentControlActionError, setAgentControlActionError] = useState<string | null>(null)
  const [oracleScoutRun, setOracleScoutRun] = useState<OracleScoutRunState>({
    status: 'idle',
    label: 'Oracle Scout ready',
  })
  const [controlledAgentRunStates, setControlledAgentRunStates] = useState<Record<ControlledUiAgentId, ControlledRunState>>(
    initialControlledAgentRunStates,
  )
  const [managerPrompt, setManagerPrompt] = useState(loadStoredHermesCommandPrompt)
  const [councilLaunchRequest, setCouncilLaunchRequest] = useState<CouncilLaunchRequest | null>(null)
  const [managerRoute, setManagerRoute] = useState<WorkspaceToolRoute | null>(null)
  const [managerStationActionResult, setManagerStationActionResult] = useState<WorkspaceStationActionRouterResult | null>(null)
  const [hermesCommandRun, setHermesCommandRun] = useState<HermesCommandRunState>({
    status: 'idle',
    label: 'Hermes Command ready',
  })
  const [hermesCommandActionRun, setHermesCommandActionRun] = useState<HermesCommandActionRunCard>(loadStoredHermesCommandActionRun)
  const [workspaceKernelRuns, setWorkspaceKernelRuns] = useState<Array<WorkspaceRun>>([])
  const [workspaceKernelEvents, setWorkspaceKernelEvents] = useState<Array<WorkspaceEvent>>([])
  const [workspaceKernelDisplayStates, setWorkspaceKernelDisplayStates] = useState<Array<KernelAgentDisplayState>>([])
  const [workspaceKernelTelemetry, setWorkspaceKernelTelemetry] = useState<WorkspaceKernelTelemetrySnapshot | null>(null)
  const [workspaceKernelStoreStatus, setWorkspaceKernelStoreStatus] = useState('loading')
  const [workspaceKernelPersistence, setWorkspaceKernelPersistence] = useState<WorkspaceCoreOpsPersistenceView | null>(null)
  const [workspaceKernelStateVersion, setWorkspaceKernelStateVersion] = useState<string | undefined>(undefined)
  const [workspacePacketMissionResults, setWorkspacePacketMissionResults] = useState<Array<WorkspacePacketMissionResult>>([])
  const [workspacePacketMissionStatus, setWorkspacePacketMissionStatus] = useState<PacketHandoffRailStatus>('idle')
  const [workspacePacketMissionReadback, setWorkspacePacketMissionReadback] = useState<string | undefined>(undefined)
  const [obsidianContextPacket, setObsidianContextPacket] = useState<WorkspaceContextPacket | null>(null)
  const [obsidianContextStatus, setObsidianContextStatus] = useState<string | null>(null)
  const [etsyToolSurface, setEtsyToolSurface] = useState<EtsyToolSurface>('simple')
  const [etsyLiveScout, setEtsyLiveScout] = useState<EtsyLiveScoutUiState>(initialEtsyLiveScoutUiState)
  const [smartIntake, setSmartIntake] = useState<SmartIntakeUiState>(initialSmartIntakeUiState)
  const [sheetIntake, setSheetIntake] = useState<EtsySheetIntakeUiState>(initialSheetIntakeUiState)
  const [terraModelAssets, setTerraModelAssets] = useState<TerraModelAssetsResponse | null>(null)
  const [terraModelAssetsLoading, setTerraModelAssetsLoading] = useState(false)
  const [terraModelAssetsError, setTerraModelAssetsError] = useState<string | null>(null)
  const [terraPrinterStatus, setTerraPrinterStatus] = useState<TerraPrinterStatusResponse | null>(null)
  const [terraPrinterLoading, setTerraPrinterLoading] = useState(false)
  const [terraPrinterError, setTerraPrinterError] = useState<string | null>(null)
  const [terraPrinterFrameNonce, setTerraPrinterFrameNonce] = useState(0)
  const [terraCapabilities, setTerraCapabilities] = useState<TerraWorkbenchCapabilitiesResponse | null>(null)
  const [terraCapabilitiesLoading, setTerraCapabilitiesLoading] = useState(false)
  const [terraCapabilitiesError, setTerraCapabilitiesError] = useState<string | null>(null)
  const [terraWorkbench, setTerraWorkbench] = useState<TerraWorkbenchUiState>(initialTerraWorkbenchState)

  // Printer camera access must stay explicit/manual. Elegoo's LAN camera stream can
  // be opened by the slicer with a returned VideoUrl, so repeatedly reloading a raw
  // guessed stream URL can starve or wedge the camera for ElegooSlicer too.
  async function refreshTerraModelAssets() {
    setTerraModelAssetsLoading(true)
    setTerraModelAssetsError(null)
    try {
      const response = await fetch('/api/war-room/terra-assets?limit=180', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const data = await response.json() as TerraModelAssetsResponse | { ok: false; error?: string }
      if (!response.ok || !data.ok) throw new Error(('error' in data && data.error) || `Terra assets request failed (${response.status})`)
      setTerraModelAssets(data)
    } catch (error) {
      setTerraModelAssetsError((error as Error).message)
    } finally {
      setTerraModelAssetsLoading(false)
    }
  }

  async function refreshTerraPrinterStatus() {
    setTerraPrinterLoading(true)
    setTerraPrinterError(null)
    try {
      const response = await fetch('/api/war-room/terra-printer', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const data = await response.json() as TerraPrinterStatusResponse | { ok: false; error?: string }
      if (!response.ok || !data.ok) throw new Error(('error' in data && data.error) || `Terra printer request failed (${response.status})`)
      setTerraPrinterStatus(data)
    } catch (error) {
      setTerraPrinterError((error as Error).message)
    } finally {
      setTerraPrinterLoading(false)
    }
  }

  async function refreshTerraCapabilities() {
    setTerraCapabilitiesLoading(true)
    setTerraCapabilitiesError(null)
    try {
      const response = await fetch('/api/war-room/terra-capabilities', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const data = await response.json() as TerraWorkbenchCapabilitiesResponse | { ok: false; error?: string }
      if (!response.ok || !data.ok) throw new Error(('error' in data && data.error) || `Terra capabilities request failed (${response.status})`)
      setTerraCapabilities(data)
      setTerraWorkbench((current) => ({
        ...current,
        flowCalibration: current.flowCalibration || data.slicer.settings.flowCalibration,
        bedLeveling: current.bedLeveling || data.slicer.settings.bedLeveling || data.slicer.machine.supportsBedMeshCalibration,
        timelapse: current.timelapse || data.slicer.settings.timelapse,
      }))
    } catch (error) {
      setTerraCapabilitiesError((error as Error).message)
    } finally {
      setTerraCapabilitiesLoading(false)
    }
  }

  async function runTerraInternetModelSearch() {
    const rawQuery = terraWorkbench.internetQuery.trim()
    setTerraWorkbench((current) => ({
      ...current,
      tab: 'web-search',
      internetSearchStatus: 'running',
      internetSearchError: undefined,
      receipt: 'קיבלתי — Terra מחפשת מודלים עכשיו. זה חיפוש read-only בלבד.',
    }))
    try {
      const response = await fetch('/api/war-room/terra-model-search', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: rawQuery, limit: 12, days: 60 }),
      })
      const data = await response.json() as TerraInternetModelSearchResponse | { ok: false; error?: string }
      if (!response.ok || !data.ok) throw new Error(('error' in data && data.error) || `Terra model search failed (${response.status})`)
      const blocked = data.status === 'blocked'
      setTerraWorkbench((current) => ({
        ...current,
        tab: 'web-search',
        internetSearch: data,
        internetSearchStatus: blocked ? 'blocked' : 'ready',
        internetSearchError: data.error,
        receipt: blocked
          ? `Terra search blocked safely: ${data.error ?? 'source unavailable'}`
          : `Terra found ${data.candidates.length} model candidate${data.candidates.length === 1 ? '' : 's'}. Downloads/slicing/printing are still locked.`,
      }))
      setMessages((current) => [
        ...current,
        {
          id: `agent-terra-web-search-${Date.now()}`,
          agentId: 'terra' as const,
          from: 'agent' as const,
          text: blocked
            ? 'Terra: קיבלתי.\nעכשיו: מקור החיפוש חסום/לא זמין.\nהבא: נסה מילה אחרת או חיפוש ידני.'
            : `Terra: קיבלתי.\nעכשיו: מצאתי ${data.candidates.length} מועמדים.\nהבא: בחר Stage for Terra ואז נבדוק הדפסה.`,
        },
      ].slice(-LIVING_V3_MESSAGES_LIMIT))
    } catch (error) {
      const message = (error as Error).message
      setTerraWorkbench((current) => ({
        ...current,
        tab: 'web-search',
        internetSearchStatus: 'failed',
        internetSearchError: message,
        receipt: `Terra model search failed safely: ${message}`,
      }))
    }
  }

  function stageTerraInternetCandidate(candidate: TerraInternetModelCandidateClient) {
    const prompt = `Terra model hunt candidate: ${candidate.title}\nSource: ${candidate.sourceUrl}\nLicense: ${candidate.license ?? 'check license'}\nNext: verify dimensions/license, download manually if approved, then import as local 3MF before slicing.`
    setTerraWorkbench((current) => ({
      ...current,
      tab: 'prepare',
      internetCandidateId: candidate.id,
      agentPrompt: prompt,
      receipt: `Internet model shortlisted: ${candidate.title}. Download/import/slice/print stay locked until DLV approves.`,
    }))
    setMessages((current) => [
      ...current,
      {
        id: `agent-terra-candidate-${candidate.id}-${Date.now()}`,
        agentId: 'terra' as const,
        from: 'agent' as const,
        text: `Terra: קיבלתי.\nעכשיו: ${candidate.title} נכנס לבקרה.\nהבא: בדיקת רישיון ואז ייבוא קובץ מקומי לפני סלייס.`,
      },
    ].slice(-LIVING_V3_MESSAGES_LIMIT))
  }

  function updateTerraWorkbench(patch: Partial<TerraWorkbenchUiState>) {
    setTerraWorkbench((current) => ({ ...current, ...patch }))
  }

  async function buildTerraSlicePlan(payload: TerraSlicePlanPayload) {
    setTerraWorkbench((current) => ({ ...current, receipt: 'Building verified dry-run slice plan…' }))
    try {
      const response = await fetch('/api/war-room/terra-slice-plan', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json() as TerraSlicePlanResponse
      if (!response.ok || !data.ok) throw new Error(!data.ok ? data.error : `Slice plan request failed (${response.status})`)
      setTerraWorkbench((current) => ({
        ...current,
        tab: 'slice',
        slicePlan: data,
        receipt: `Slice plan staged. No slicer/printer side effect ran. Output target: ${data.outputFile}`,
      }))
    } catch (error) {
      setTerraWorkbench((current) => ({ ...current, receipt: `Slice plan blocked: ${(error as Error).message}` }))
    }
  }

  async function runTerraPrintQa(options: { auto?: boolean; runKey?: string } = {}) {
    const assets = terraModelAssets?.assets ?? []
    const selectedAsset = assets.find((asset) => asset.id === terraWorkbench.selectedAssetId) ?? assets.at(0)
    const runKey = options.runKey ?? `${selectedAsset?.id ?? 'no-model'}:${Date.now()}`
    const startedAtMs = Date.now()
    setTerraPrinterFrameNonce(startedAtMs)
    setTerraWorkbench((current) => ({
      ...current,
      tab: 'printer',
      autoQaKey: options.auto ? runKey : current.autoQaKey,
      receipt: options.auto ? 'Print completed. Terra QA Agent is inspecting the live camera frame…' : 'Terra QA Agent is inspecting the current camera frame…',
      qaRun: { status: 'running', auto: Boolean(options.auto), runKey, startedAtMs },
    }))
    try {
      const response = await fetch('/api/war-room/terra-print-qa', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelName: selectedAsset?.name,
          modelPath: selectedAsset?.path,
          expectedPreviewAvailable: Boolean(selectedAsset?.preview.dataUrl),
        }),
      })
      const data = await response.json() as TerraPrintQaResponse
      if (!response.ok || !data.ok) throw new Error(!data.ok ? data.error : `Print QA request failed (${response.status})`)
      let visual: TerraVisualQaReport | undefined
      const cameraUrl = data.printer.cameraUrl ?? terraPrinterStatus?.cameraUrl
      const snapshotUrl = data.printer.snapshotUrl ?? terraPrinterStatus?.snapshotUrl
      if (data.frame.captured) {
        const imageUrl = cameraUrl ? `/api/war-room/terra-printer-frame?qa=${Date.now()}` : snapshotUrl
        if (imageUrl) {
          try {
            visual = await analyzeTerraCameraImage(imageUrl, Boolean(selectedAsset?.preview.dataUrl))
          } catch (error) {
            visual = {
              analyzedAtMs: Date.now(),
              verdict: 'blocked',
              frame: { width: data.frame.width ?? 0, height: data.frame.height ?? 0 },
              signals: [{ id: 'canvas-analysis-blocked', label: 'Visual analysis', state: 'unknown', value: 'blocked', note: (error as Error).message }],
              summary: 'Camera frame was captured, but browser-side canvas analysis was blocked.',
            }
          }
        }
      }
      const status: TerraPrintQaUiRun['status'] = data.verdict === 'blocked'
        ? 'blocked'
        : visual?.verdict === 'blocked'
          ? 'blocked'
          : 'ready'
      setTerraWorkbench((current) => ({
        ...current,
        tab: 'printer',
        qaRun: { status, auto: Boolean(options.auto), runKey, startedAtMs, completedAtMs: Date.now(), response: data, visual },
        receipt: status === 'blocked'
          ? 'Terra QA blocked: camera/status frame unavailable. No printer action was sent.'
          : `Terra QA completed: ${visual?.summary ?? data.note}`,
      }))
    } catch (error) {
      setTerraWorkbench((current) => ({
        ...current,
        tab: 'printer',
        qaRun: { status: 'failed', auto: Boolean(options.auto), runKey, startedAtMs, completedAtMs: Date.now(), error: (error as Error).message },
        receipt: `Terra QA failed safely: ${(error as Error).message}`,
      }))
    }
  }

  function stageTerraReceipt(receipt: string) {
    setTerraWorkbench((current) => ({ ...current, receipt }))
  }

  const terraMotionTarget = useMemo(() => terraAgentMotionTarget(
    terraWorkbench,
    terraPrinterStatus,
    terraCapabilities,
    terraModelAssets,
  ), [
    terraWorkbench.tab,
    terraWorkbench.internetSearchStatus,
    terraWorkbench.qaRun?.status,
    Boolean(terraWorkbench.slicePlan),
    terraPrinterStatus?.metrics.printLifecycle,
    terraCapabilities?.printer.metrics.printLifecycle,
    terraCapabilities?.agent.currentFocus.stationId,
    terraCapabilities?.obsidian.exists,
    terraModelAssets?.totalMatches,
    terraCapabilities?.modelLibrary.totalMatches,
  ])
  const terraMotionKey = terraMotionTargetKey(terraMotionTarget)

  useEffect(() => {
    if (bodyRuntimeEnabled) return
    const now = Date.now()
    setAdapterState((current) => assignLivingV3Task(current, {
      agentId: 'terra',
      kind: terraMotionTarget.kind,
      label: terraMotionTarget.label,
      roomId: 'terra-forge',
      stationId: terraMotionTarget.stationId,
      from: terraTaskFromCurrentState(current),
      badge: terraMotionTarget.badge,
      packetLabel: terraMotionTarget.packetLabel,
    }, now))
  }, [bodyRuntimeEnabled, terraMotionKey])

  const agentControlLabel = agentControlState.mode === 'local_only'
    ? 'SAFE'
    : agentControlState.mode === 'armed_manual'
      ? 'ARMED'
      : agentControlState.mode === 'connected'
        ? 'CONNECTED'
        : 'FROZEN'
  const agentControlTitle = agentControlActionError
    ?? agentControlError
    ?? agentControlState.warning
    ?? agentControlState.reason
  const agentControlIsFrozen = agentControlState.frozen || agentControlState.mode === 'frozen' || Boolean(agentControlError)
  const missionRun = useMemo(() => latestWorkspaceMissionRun(workspaceKernelRuns), [workspaceKernelRuns])
  const missionPacketRail = useMemo(
    () => buildWorkspacePacketMissionRail(workspacePacketMissionResults),
    [workspacePacketMissionResults],
  )
  useEffect(() => {
    const runId = missionRun?.runId
    if (!runId) {
      setWorkspacePacketMissionResults([])
      setWorkspacePacketMissionStatus('idle')
      setWorkspacePacketMissionReadback(undefined)
      return
    }
    const controller = new AbortController()
    setWorkspacePacketMissionStatus('loading')
    setWorkspacePacketMissionReadback(`Reading persisted Packets for ${runId}.`)
    void (async () => {
      try {
        const response = await fetch(`/api/war-room/workspace-kernel/packets?runId=${encodeURIComponent(runId)}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const payload = await response.json() as {
          ok?: boolean
          error?: string
          result?: { packets?: unknown }
        }
        if (!response.ok || payload.ok !== true || !Array.isArray(payload.result?.packets)) {
          throw new Error(payload.error ?? `Packet store returned HTTP ${response.status}.`)
        }
        const parsed = parseWorkspacePacketMissionResults(payload.result.packets)
        if (parsed.length !== payload.result.packets.length) {
          throw new Error('Packet store returned a malformed Packet mission projection.')
        }
        if (controller.signal.aborted) return
        setWorkspacePacketMissionResults(parsed)
        setWorkspacePacketMissionStatus('ready')
        setWorkspacePacketMissionReadback(`Local Packet store · ${parsed.length} verified Packet${parsed.length === 1 ? '' : 's'}.`)
      } catch (error) {
        if (controller.signal.aborted) return
        setWorkspacePacketMissionResults([])
        setWorkspacePacketMissionStatus('error')
        setWorkspacePacketMissionReadback(error instanceof Error ? error.message : 'Packet rail unavailable.')
      }
    })()
    return () => controller.abort()
  }, [missionRun?.runId, workspaceKernelStateVersion])
  const missionAgentMinds = useMemo(() => workspaceAgentMindsForRun(missionRun), [missionRun])
  const workspaceCoreOpsSnapshot = useMemo(() => buildWorkspaceCoreOpsSnapshot({
    runs: workspaceKernelRuns,
    events: workspaceKernelEvents,
    telemetry: workspaceKernelTelemetry ?? undefined,
    stateVersion: workspaceKernelStateVersion,
  }, {
    nowMs,
    source: workspaceKernelPersistence?.provider === 'supabase' && workspaceKernelPersistence.status === 'connected'
      ? 'workspace-kernel-supabase-mirror'
      : 'workspace-kernel-local-state',
  }), [workspaceKernelRuns, workspaceKernelEvents, workspaceKernelTelemetry, workspaceKernelStateVersion, workspaceKernelPersistence?.provider, workspaceKernelPersistence?.status, nowMs])

  function applyOracleSignalPacketFromBridge(packet: OracleSignalPacket, receipt = `Oracle event bridge delivered ${packet.selectedKeyword} to Etsy Market Lab.`) {
    if (processedOracleSignalPacketsRef.current.has(packet.packetId)) return
    processedOracleSignalPacketsRef.current.add(packet.packetId)
    setOracleSearch((current) => ({
      ...current,
      query: packet.selectedKeyword,
      sourceMode: packet.sourceMode,
      lastSignalPacket: packet,
      receipt,
      error: undefined,
    }))
    setEtsyPipeline((current) => ({
      ...applyOracleSignalToEtsyPipeline(current, packet),
      lastReceipt: receipt,
    }))
    const nextRoomState = prepareProductScoutPacketLocal(etsyRoomState, {
      prompt: packet.selectedKeyword,
      oracleSignalPacket: packet,
    })
    setEtsyRoomState(nextRoomState)
    syncEtsyRoomKernelRuns(nextRoomState, Date.now(), 'product-candidate-packet')
    syncSharedEtsyRoomState(nextRoomState, 'Oracle signal packet received')
    setStationActionReceipts((current) => ({
      ...current,
      'oracle-signal-basin': receipt,
      'etsy-loki-product-hunt': `Oracle signal received: ${packet.selectedKeyword}.`,
    }))
  }

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => () => {
    if (stagePointerFrameRef.current !== null) window.cancelAnimationFrame(stagePointerFrameRef.current)
    if (stageWheelFrameRef.current !== null) window.cancelAnimationFrame(stageWheelFrameRef.current)
    if (agentWindowFrameRef.current !== null) window.cancelAnimationFrame(agentWindowFrameRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    let timeoutId: number | null = null
    const schedule = () => {
      if (cancelled) return
      const delay = document.visibilityState === 'visible' ? LIVING_V3_ACTIVE_CLOCK_MS : LIVING_V3_BACKGROUND_CLOCK_MS
      timeoutId = window.setTimeout(tick, delay)
    }
    const tick = () => {
      setNowMs(Date.now())
      schedule()
    }
    const handleVisibilityChange = () => setNowMs(Date.now())
    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    void refreshWorkspaceKernelStateFromStore()
  }, [])

  useEffect(() => {
    const selectedRoomCandidate = etsyRoomState.candidates.find((candidate) => candidate.candidateId === etsyRoomState.selectedCandidateId)
    if (!selectedRoomCandidate) return
    setEtsyPipeline((current) => {
      const alreadyScoped = current.selectedCandidateId === selectedRoomCandidate.candidateId
        && (!current.searchPacket || current.searchPacket.packetId === selectedRoomCandidate.packetId)
        && (!current.metricPacket || current.metricPacket.candidateId === selectedRoomCandidate.candidateId)
        && current.supplierLeads.every((lead) => lead.candidateId === selectedRoomCandidate.candidateId)
        && (!current.productTruthPacket || current.productTruthPacket.candidateId === selectedRoomCandidate.candidateId)
        && current.qaItems.every((item) => item.candidateId === selectedRoomCandidate.candidateId)
        && (!current.visualQaReport || current.visualQaReport.candidateId === selectedRoomCandidate.candidateId)
        && (!current.draftPacket || current.draftPacket.candidateId === selectedRoomCandidate.candidateId)
        && (!current.draftApprovalPacket || current.draftApprovalPacket.candidateId === selectedRoomCandidate.candidateId)
      return alreadyScoped ? current : syncEtsyPipelineToRoomCandidate(current, selectedRoomCandidate)
    })
  }, [etsyRoomState.candidates, etsyRoomState.selectedCandidateId])

  useEffect(() => {
    etsyWorkspaceStateRef.current = etsyWorkspaceState
    etsyRoomStateRef.current = etsyWorkspaceState.roomState
    try {
      window.localStorage.setItem(ETSY_PRODUCT_WORKSPACE_STORAGE_KEY, JSON.stringify(etsyWorkspaceState))
      if (etsyWorkspaceState.revision > 0) {
        window.localStorage.removeItem(ETSY_PIPELINE_STORAGE_KEY)
        window.localStorage.removeItem(ETSY_ROOM_STORAGE_KEY)
      }
    } catch {
      // Local V2 persistence is best-effort; the server-authoritative workspace remains available.
    }
  }, [etsyWorkspaceState])

  useEffect(() => {
    try {
      window.localStorage.setItem(LIVING_V3_MESSAGES_STORAGE_KEY, JSON.stringify(messages.slice(-LIVING_V3_MESSAGES_LIMIT)))
    } catch {
      // Local chat memory is best-effort and browser-scoped.
    }
  }, [messages])

  useEffect(() => {
    try {
      window.localStorage.setItem(LIVING_V3_AGENT_WINDOW_LAYOUT_STORAGE_KEY, JSON.stringify(agentWindowLayouts))
    } catch {
      // Agent panel layout is a browser preference; if storage is blocked the window still works.
    }
  }, [agentWindowLayouts])

  useEffect(() => {
    try {
      window.localStorage.setItem(LIVING_V3_NAV_DEBUG_STORAGE_KEY, navigationDebugOpen ? '1' : '0')
    } catch {
      // Navigation debug visibility is optional and browser-scoped.
    }
  }, [navigationDebugOpen])

  useEffect(() => {
    try {
      window.localStorage.setItem(HERMES_COMMAND_PROMPT_STORAGE_KEY, managerPrompt)
    } catch {
      // Command prompt persistence is browser-scoped and best-effort.
    }
  }, [managerPrompt])

  useEffect(() => {
    try {
      window.localStorage.setItem(HERMES_COMMAND_ACTION_RUN_STORAGE_KEY, JSON.stringify(hermesCommandActionRun))
    } catch {
      // Command action-run persistence is browser-scoped and best-effort.
    }
  }, [hermesCommandActionRun])

  useEffect(() => {
    setAgentWindowLayouts((current) => Object.fromEntries(
      Object.entries(current).map(([agentId, layout]) => [agentId, clampAgentWindowLayout(layout, viewport)]),
    ) as AgentWindowLayoutMap)
  }, [viewport])

  useEffect(() => {
    if (!bodyRuntimeEnabled) return
    const signalEvent = [...bodyEvents].reverse().find((event) => event.type === 'etsy.signal.received')
    const packet = oracleSignalPacketFromPayload(signalEvent?.payload)
    if (!packet) return
    applyOracleSignalPacketFromBridge(packet, typeof signalEvent?.payload?.readback === 'string'
      ? signalEvent.payload.readback
      : `Oracle event bridge delivered ${packet.selectedKeyword} to Etsy Market Lab.`)
  }, [bodyRuntimeEnabled, bodyEvents])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const listener = (event: globalThis.WheelEvent) => handleStageWheel(event)
    element.addEventListener('wheel', listener, { passive: false })
    return () => element.removeEventListener('wheel', listener)
  }, [])

  useLayoutEffect(() => {
    const element = stageRef.current
    if (!element) return
    const updateViewport = () => {
      const rect = element.getBoundingClientRect()
      const nextViewport = { w: Math.max(320, rect.width), h: Math.max(320, rect.height) }
      setViewport((current) => (current.w === nextViewport.w && current.h === nextViewport.h ? current : nextViewport))
    }
    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setCamera((current) => {
      if (current.mode === 'room' && current.focusedRoomId) return fitLivingV3RoomCamera(current.focusedRoomId, viewport)
      if (current.mode === 'map') return fitLivingV3MapCamera(viewport)
      return clampLivingV3Camera(current, viewport, LIVING_V3_WORLD_CONFIG.worldSize)
    })
  }, [viewport])

  const snapshots = useMemo(() => buildLivingV3AgentSnapshots(visualAdapterState, nowMs), [visualAdapterState, nowMs])
  const navigationDoors = useMemo(() => livingV3NavigationDoors(LIVING_V3_WORLD_CONFIG), [])
  const openNavigationDoorIds = useMemo(() => new Set(
    snapshots
      .filter((snapshot) => ['walking', 'carrying'].includes(snapshot.activity))
      .flatMap((snapshot) => snapshot.navigation.doorIds),
  ), [snapshots])
  const navigationDebugSnapshots = useMemo(() => (
    navigationDebugOpen
      ? snapshots.filter((snapshot) => snapshot.navigation.waypointCount > 1 && (snapshot.activity === 'walking' || snapshot.navigation.bridgePath.length > 0 || snapshot.navigation.status === 'blocked'))
      : []
  ), [navigationDebugOpen, snapshots])
  const roomStatuses = useMemo(() => buildLivingV3RoomStatuses(visualAdapterState, snapshots), [visualAdapterState, snapshots])

  const selectedAgent = selection?.kind === 'agent' ? livingV3AgentById(selection.id) : null
  const selectedStation = selection?.kind === 'station' ? livingV3StationById(selection.id) : null
  const selectedStationIsEtsy = selectedStation ? isEtsyMarketLabStationId(selectedStation.id) : false
  const selectedStationUsesEtsyWorkspace = selectedStationIsEtsy
  const selectedStationUsesCouncilWorkspace = selectedStation?.id === 'council-table'
  const selectedStationIsOracle = selectedStation?.id === 'oracle-signal-basin'
  const selectedStationUsesOracleWorkspace = selectedStationIsOracle
  const selectedStationIsGoblin = selectedStation?.id === 'agora-intake'
  const selectedStationUsesGoblinWorkspace = selectedStationIsGoblin
  const selectedStationIsAtlantis = selectedStation?.id === 'atlantis-index'
  const selectedStationUsesAtlantisWorkspace = selectedStationIsAtlantis
  const selectedStationIsTerra = isTerraForgeStationId(selectedStation?.id)
  const selectedStationUsesTerraWorkspace = selectedStationIsTerra
  const selectedStationUsesGatewayLayer = selectedStation?.id === 'gateway-console'
  const selectedStationUsesPrimaryWorkspace = Boolean(selectedStation && (
    selectedStationUsesEtsyWorkspace
    || selectedStationUsesGoblinWorkspace
    || selectedStationUsesAtlantisWorkspace
    || selectedStationUsesTerraWorkspace
    || selectedStationUsesCouncilWorkspace
    || selectedStationUsesOracleWorkspace
  ))
  const selectedStationSuppressesGlobalOverlays = selectedStationUsesPrimaryWorkspace || selectedStationUsesGatewayLayer
  const selectedStationIsHermesCommand = selectedStation?.id === 'command-table'
  const selectedStationIsMissionControl = selectedStation?.id === 'mission-router'
  const selectedStationIsCommandManager = selectedStationIsHermesCommand || selectedStationIsMissionControl
  const commandFocusModeActive = selectedStationIsCommandManager
  const selectedEtsyOperatorId = selectedStationIsEtsy && selectedStation ? etsyMarketLabStationOperatorId(selectedStation.id) : null
  const selectedEtsyOperator = selectedEtsyOperatorId ? livingV3AgentById(selectedEtsyOperatorId) : null
  const selectedEtsyOperatorSnapshot = selectedEtsyOperatorId ? getAgentSnapshot(snapshots, selectedEtsyOperatorId) : null
  const selectedSnapshot = selectedAgent ? getAgentSnapshot(snapshots, selectedAgent.id) : null
  const selectedAgentWindowLayout = selectedAgent ? currentAgentWindowLayout(selectedAgent.id) : null
  const selectedMessages = useMemo(() => (
    selectedAgent ? messages.filter((message) => message.agentId === selectedAgent.id).slice(-LIVING_V3_AGENT_VISIBLE_MESSAGES) : []
  ), [messages, selectedAgent?.id])
  const focusedRoom = camera.focusedRoomId ? livingV3RoomById(camera.focusedRoomId) : null
  const focusedRoomStatus = focusedRoom ? roomStatuses.find((status) => status.roomId === focusedRoom.id) : null
  const visibleSnapshots = useMemo(() => snapshots.filter((snapshot) => !hiddenPrimaryAgentIds.has(snapshot.agentId)), [snapshots])
  const focusedRoomSnapshots = useMemo(() => (
    focusedRoom ? visibleSnapshots.filter((snapshot) => snapshot.roomId === focusedRoom.id) : []
  ), [focusedRoom?.id, visibleSnapshots])
  const commandAgentControlRoster = useMemo<Array<CommandAgentControlRow>>(() => {
    const lastMessageByAgent = messages.reduce<Partial<Record<LivingV3AgentId, string>>>((current, message) => ({
      ...current,
      [message.agentId]: message.text,
    }), {})
    return LIVING_V3_WORLD_CONFIG.agents.map((agent) => {
      const snapshot = getAgentSnapshot(snapshots, agent.id)
      const roomId = snapshot?.roomId ?? agent.home.roomId
      const room = livingV3RoomById(roomId)
      const primaryStationId = agent.primaryStationIds.at(0)
      const primaryStation = primaryStationId ? livingV3StationById(primaryStationId) : null
      const controlledProfiles = controlledAgentButtons
        .filter((profile) => profile.visualAgentId === agent.id)
        .map((profile) => ({
          agentId: profile.agentId,
          label: profile.label,
          runState: controlledAgentRunStates[profile.agentId],
        }))
      const hasControlledProfile = controlledProfiles.length > 0
      return {
        agentId: agent.id,
        label: agent.label,
        shortLabel: agent.shortLabel,
        role: agent.role,
        accent: agent.accent,
        portraitPath: agent.portraitPath,
        roomId,
        roomLabel: room?.label ?? roomId,
        activityLabel: activityLabels[snapshot?.activity ?? 'idle'],
        packetLabel: snapshot?.packetLabel ?? snapshot?.label ?? agent.role,
        statusTone: commandAgentStatusTone(snapshot, hasControlledProfile),
        visualStatusLabel: commandAgentVisualStatusLabel(agent.id, hasControlledProfile),
        primaryStationId,
        primaryStationLabel: primaryStation?.label,
        lastMessage: lastMessageByAgent[agent.id],
        controlledProfiles,
      }
    })
  }, [controlledAgentRunStates, messages, snapshots])
  const councilCleanStageActive = focusedRoom?.id === 'council-strategists' || selectedStationUsesCouncilWorkspace
  const zoomLevel = getLivingV3ZoomLevel(camera.scale, camera.focusedRoomId)
  const oracleBridgeReadback = useMemo(() => bodyEvents
    .filter((event) => oracleBridgeEventTypes.has(event.type) || event.type.startsWith('etsy.'))
    .slice(-7)
    .reverse(),
  [bodyEvents])
  const localEtsyRoomReadback = useMemo(() => etsyRoomState.events.slice(-5).reverse(), [etsyRoomState.events])

  const worldStyle = useMemo(() => styleVars({
    width: `${LIVING_V3_WORLD_CONFIG.worldSize.w}px`,
    height: `${LIVING_V3_WORLD_CONFIG.worldSize.h}px`,
    transform: `translate(${viewport.w / 2 - camera.center.x * camera.scale}px, ${viewport.h / 2 - camera.center.y * camera.scale}px) scale(${camera.scale})`,
  }), [camera.center.x, camera.center.y, camera.scale, viewport.h, viewport.w])

  async function refreshBodyRuntime() {
    if (!bodyRuntimeEnabled) return
    await Promise.allSettled([refreshBodyState(), refreshBodyEvents()])
  }

  async function tryBodyIntent(intent: AgentIntent) {
    if (!bodyRuntimeEnabled) return false
    try {
      await sendWarRoomIntent({ ...intent, source: intent.source ?? 'ui' })
      setBodyActionError(null)
      await refreshBodyRuntime()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Only run_oracle_scout_local is allowed')) {
        setBodyActionError(message)
      }
      return false
    }
  }

  function applyKernelDisplayStates(displayStates: Array<KernelAgentDisplayState>, createdAt = Date.now()) {
    const capped = displayStates.slice(0, 4)
    if (capped.length === 0) return
    setAdapterState((state) => capped.reduce((nextState, display, index) =>
      assignLivingV3Task(nextState, kernelAgentDisplayStateToLivingTask(display), createdAt + index),
    state))
  }

  function applyWorkspaceKernelApiPayload(payload: WorkspaceKernelApiPayload, applyMotion = true) {
    const state = payload.state ?? payload.result
    if (!payload.ok || !state) {
      setWorkspaceKernelStoreStatus(payload.error ?? 'unavailable')
      return
    }
    const displayStates = payload.displayStates ?? buildKernelAgentDisplayStates(state)
    setWorkspaceKernelRuns(state.runs)
    setWorkspaceKernelEvents(state.events)
    setWorkspaceKernelDisplayStates(displayStates)
    setWorkspaceKernelTelemetry(payload.telemetry ?? state.telemetry ?? null)
    setWorkspaceKernelStateVersion(payload.stateVersion ?? state.stateVersion)
    setWorkspaceKernelPersistence(payload.persistence ?? null)
    setWorkspaceKernelStoreStatus(payload.persistence?.provider === 'supabase' && payload.persistence.status === 'connected'
      ? `Supabase · ${payload.persistence.runCount ?? state.runs.length} runs · ${payload.persistence.approvalCount ?? state.runs.reduce((count, run) => count + run.approvals.length, 0)} approvals`
      : payload.persistence?.status === 'error'
        ? 'Supabase fallback: local store'
        : 'local store')
    const contextPacket = payload.packet ?? latestObsidianContextPacketFromState(state)
    if (contextPacket) {
      setObsidianContextPacket(contextPacket)
      setObsidianContextStatus(`Obsidian Context Packet ${contextPacket.packetId} is persisted locally.`)
    }
    if (applyMotion) applyKernelDisplayStates(displayStates)
  }

  async function refreshWorkspaceKernelStateFromStore(applyMotion = true) {
    try {
      const response = await fetch('/api/war-room/workspace-kernel/state', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const payload = await response.json() as WorkspaceKernelApiPayload
      applyWorkspaceKernelApiPayload(payload, applyMotion)
    } catch (error) {
      setWorkspaceKernelStoreStatus(error instanceof Error ? error.message : 'kernel store unavailable')
    }
  }

  async function persistWorkspaceKernelStateToStore(
    runs: Array<WorkspaceRun>,
    telemetry?: WorkspaceKernelTelemetrySnapshot | null,
    applyMotion = true,
  ) {
    try {
      const response = await fetch('/api/war-room/workspace-kernel/state', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runs, telemetry }),
      })
      const payload = await response.json() as WorkspaceKernelApiPayload
      applyWorkspaceKernelApiPayload(payload, applyMotion)
    } catch (error) {
      setWorkspaceKernelStoreStatus(error instanceof Error ? error.message : 'kernel store unavailable')
    }
  }

  function consumeDragClick() {
    const shouldSuppress = suppressClickRef.current
    suppressClickRef.current = false
    return shouldSuppress
  }

  function focusMap() {
    suppressClickRef.current = false
    const nextCamera = fitLivingV3MapCamera(viewportRef.current)
    cameraRef.current = nextCamera
    setCamera(nextCamera)
    setSelection(null)
  }

  function focusRoom(roomId: LivingV3RoomId, nextSelection: LivingV3Selection = null) {
    suppressClickRef.current = false
    const nextCamera = fitLivingV3RoomCamera(roomId, viewportRef.current)
    const canonicalSelection = roomId === 'council-strategists' && nextSelection === null
      ? { kind: 'station' as const, id: 'council-table' as const }
      : nextSelection
    cameraRef.current = nextCamera
    setCamera(nextCamera)
    setSelection(canonicalSelection)
  }

  function openAgentControlChat(agentId: LivingV3AgentId) {
    const agent = livingV3AgentById(agentId)
    const snapshot = getAgentSnapshot(snapshots, agentId)
    fitAgentWindowLayout(agentId)
    focusRoom(snapshot?.roomId ?? agent?.home.roomId ?? 'olympus-command', { kind: 'agent', id: agentId })
  }

  function focusAgentFromCommandControl(agentId: LivingV3AgentId) {
    const agent = livingV3AgentById(agentId)
    const snapshot = getAgentSnapshot(snapshots, agentId)
    focusRoom(snapshot?.roomId ?? agent?.home.roomId ?? 'olympus-command')
  }

  function assignAgentPrimaryStationFromCommand(agentId: LivingV3AgentId) {
    const stationId = livingV3AgentById(agentId)?.primaryStationIds[0]
    if (!stationId) return
    assignStation(agentId, stationId)
  }

  function restAgentFromCommandControl(agentId: LivingV3AgentId) {
    void (async () => {
      const ok = await tryBodyIntent({ type: 'rest', agentId, correlationId: `command-agent-rest-${agentId}-${Date.now()}` })
      if (!ok) setAdapterState((state) => moveLivingV3AgentToRoom(state, agentId, 'pantheon-quarters'))
      focusRoom('pantheon-quarters', { kind: 'agent', id: agentId })
    })()
  }

  function handleStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, input, .living-v3__hud, .living-v3__drawer, .living-v3__room-edge')) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenter: cameraRef.current.center,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function applyStagePointerMove(pointerId: number, clientX: number, clientY: number) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    const dx = clientX - drag.startX
    const dy = clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    setCamera((current) => {
      const next = clampLivingV3Camera({
        ...current,
        mode: current.focusedRoomId ? 'room' : 'free',
        center: {
          x: drag.startCenter.x - dx / current.scale,
          y: drag.startCenter.y - dy / current.scale,
        },
      }, viewportRef.current, LIVING_V3_WORLD_CONFIG.worldSize)
      cameraRef.current = next
      return next
    })
  }

  function handleStagePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    pendingStagePointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
    if (stagePointerFrameRef.current !== null) return
    stagePointerFrameRef.current = window.requestAnimationFrame(() => {
      stagePointerFrameRef.current = null
      const pending = pendingStagePointerRef.current
      pendingStagePointerRef.current = null
      if (pending) applyStagePointerMove(pending.pointerId, pending.clientX, pending.clientY)
    })
  }

  function handleStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (stagePointerFrameRef.current !== null) {
      window.cancelAnimationFrame(stagePointerFrameRef.current)
      stagePointerFrameRef.current = null
      pendingStagePointerRef.current = null
    }
    applyStagePointerMove(event.pointerId, event.clientX, event.clientY)
    suppressClickRef.current = drag.moved
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function applyStageWheel(input: { clientX: number; clientY: number; deltaY: number }) {
    const element = stageRef.current
    if (!element) return
    const cameraSnapshot = cameraRef.current
    const viewportSnapshot = viewportRef.current
    const rect = element.getBoundingClientRect()
    const screen = { x: input.clientX - rect.left, y: input.clientY - rect.top }
    const viewportCenter = { x: viewportSnapshot.w / 2, y: viewportSnapshot.h / 2 }
    const worldPoint = {
      x: cameraSnapshot.center.x + (screen.x - viewportCenter.x) / cameraSnapshot.scale,
      y: cameraSnapshot.center.y + (screen.y - viewportCenter.y) / cameraSnapshot.scale,
    }
    const nextScale = Math.max(0.36, Math.min(2.25, cameraSnapshot.scale * Math.exp(-input.deltaY * 0.0013)))
    const focusedRoomId = nextScale < 0.68 ? null : cameraSnapshot.focusedRoomId
    const next = clampLivingV3Camera({
      center: {
        x: worldPoint.x - (screen.x - viewportCenter.x) / nextScale,
        y: worldPoint.y - (screen.y - viewportCenter.y) / nextScale,
      },
      scale: nextScale,
      mode: focusedRoomId ? 'room' : nextScale < 0.65 ? 'map' : 'free',
      focusedRoomId,
    }, viewportSnapshot, LIVING_V3_WORLD_CONFIG.worldSize)
    cameraRef.current = next
    setCamera(next)
  }

  function handleStageWheel(event: globalThis.WheelEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('textarea, input, select, [data-scroll-surface="true"], .council-chamber, .workspace-core-ops-panel, .etsy-prep, .living-v3__drawer, .living-v3__hud')) {
      return
    }
    event.preventDefault()
    const existing = pendingStageWheelRef.current
    pendingStageWheelRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      deltaY: (existing?.deltaY ?? 0) + event.deltaY,
    }
    if (stageWheelFrameRef.current !== null) return
    stageWheelFrameRef.current = window.requestAnimationFrame(() => {
      stageWheelFrameRef.current = null
      const pending = pendingStageWheelRef.current
      pendingStageWheelRef.current = null
      if (pending) applyStageWheel(pending)
    })
  }

  function currentAgentWindowLayout(agentId: LivingV3AgentId) {
    return clampAgentWindowLayout(agentWindowLayouts[agentId] ?? defaultAgentWindowLayout(viewportRef.current), viewportRef.current)
  }

  function applyAgentWindowLayoutFromPointer(clientX: number, clientY: number) {
    const action = agentWindowActionRef.current
    if (!action) return
    const dx = clientX - action.startClientX
    const dy = clientY - action.startClientY
    const next = action.mode === 'move'
      ? { ...action.startLayout, x: action.startLayout.x + dx, y: action.startLayout.y + dy }
      : { ...action.startLayout, w: action.startLayout.w + dx, h: action.startLayout.h + dy }
    setAgentWindowLayouts((current) => ({
      ...current,
      [action.agentId]: clampAgentWindowLayout(next, viewportRef.current),
    }))
  }

  function updateAgentWindowLayoutFromPointer(clientX: number, clientY: number) {
    pendingAgentWindowPointerRef.current = { clientX, clientY }
    if (agentWindowFrameRef.current !== null) return
    agentWindowFrameRef.current = window.requestAnimationFrame(() => {
      agentWindowFrameRef.current = null
      const pending = pendingAgentWindowPointerRef.current
      pendingAgentWindowPointerRef.current = null
      if (pending) applyAgentWindowLayoutFromPointer(pending.clientX, pending.clientY)
    })
  }

  function flushAgentWindowLayoutFromPointer(clientX: number, clientY: number) {
    if (agentWindowFrameRef.current !== null) {
      window.cancelAnimationFrame(agentWindowFrameRef.current)
      agentWindowFrameRef.current = null
      pendingAgentWindowPointerRef.current = null
    }
    applyAgentWindowLayoutFromPointer(clientX, clientY)
  }

  function beginAgentWindowLayoutAction(event: PointerEvent<HTMLElement>, agentId: LivingV3AgentId, mode: AgentWindowLayoutAction['mode']) {
    event.preventDefault()
    event.stopPropagation()
    agentWindowActionRef.current = {
      agentId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayout: currentAgentWindowLayout(agentId),
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some nested handles may already have capture elsewhere; document listeners below still finish the action.
    }
  }

  function resetAgentWindowLayout(agentId: LivingV3AgentId) {
    setAgentWindowLayouts((current) => ({
      ...current,
      [agentId]: defaultAgentWindowLayout(viewport),
    }))
  }

  function fitAgentWindowLayout(agentId: LivingV3AgentId) {
    const w = Math.min(720, Math.max(MIN_AGENT_WINDOW_SIZE.w, viewport.w - 48))
    const h = Math.min(760, Math.max(MIN_AGENT_WINDOW_SIZE.h, viewport.h - 92))
    setAgentWindowLayouts((current) => ({
      ...current,
      [agentId]: clampAgentWindowLayout({
        x: Math.max(16, viewport.w - w - 20),
        y: 72,
        w,
        h,
      }, viewport),
    }))
  }

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => updateAgentWindowLayoutFromPointer(event.clientX, event.clientY)
    const up = (event: globalThis.PointerEvent) => {
      flushAgentWindowLayoutFromPointer(event.clientX, event.clientY)
      agentWindowActionRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  function sendAgentMessage(agentId: LivingV3AgentId, event?: FormEvent) {
    event?.preventDefault()
    const text = drafts[agentId]?.trim() ?? ''
    if (!text) return
    const createdAt = Date.now()
    const agent = livingV3AgentById(agentId)
    const label = agent?.label ?? 'Agent'
    setDrafts((current) => ({ ...current, [agentId]: '' }))
    if (agentId === 'hermes') setManagerPrompt(text)
    setMessages((current) => [
      ...current,
      { id: `operator-${agentId}-${createdAt}`, agentId, from: 'operator' as const, text },
    ].slice(-LIVING_V3_MESSAGES_LIMIT))
    setStationActionReceipts((current) => ({
      ...current,
      ...(agent?.primaryStationIds[0] ? {
        [agent.primaryStationIds[0]]: `${label} Action Run started. Checking capability, routing, and safe host tool before any result is shown.`,
      } : {}),
    }))
    const snapshot = getAgentSnapshot(snapshots, agentId)
    setAdapterState((state) =>
      assignLivingV3Task(state, {
        agentId,
        kind: 'talk',
        label: `AI answering: ${text}`,
        roomId: snapshot?.roomId ?? agent?.home.roomId ?? 'olympus-command',
        from: snapshot ? { roomId: snapshot.roomId, point: snapshot.roomPoint } : undefined,
        target: snapshot?.roomPoint,
        badge: 'active-task',
        packetLabel: 'live ai chat',
      }, createdAt),
    )
    void (async () => {
      try {
        const result = await runLiveAgentChat(agentId, text)
        const output = result.result?.output
        const answer = output?.answer
          ?? result.result?.error
          ?? result.error
          ?? `${label}: לא הצלחתי לענות כרגע.`
        const actionRun = result.actionSystemRun
        const actionReceiptText = actionRun && actionRun.intent !== 'chat'
          ? `${actionRun.readback}\n${actionRun.visualNextStep}`
          : null
        setMessages((current) => [
          ...current,
          {
            id: `agent-${agentId}-live-${Date.now()}`,
            agentId: actionRun?.assignedAgentId ?? agentId,
            from: (actionReceiptText ? 'receipt' : 'agent') as AgentMessage['from'],
            text: actionReceiptText ?? answer,
          },
        ].slice(-LIVING_V3_MESSAGES_LIMIT))
        if (result.terraModelSearch) {
          const search = result.terraModelSearch
          if (search.ok) {
            setTerraWorkbench((current) => ({
              ...current,
              tab: 'web-search',
              internetQuery: search.query,
              internetSearch: search,
              internetSearchStatus: search.status === 'blocked' ? 'blocked' : 'ready',
              internetSearchError: search.error,
              receipt: search.status === 'blocked'
                ? `Terra Action Run blocked safely: ${search.error ?? 'source unavailable'}`
                : `Terra Action Run found ${search.candidates.length}/${search.totalCount} model candidates. Download/slice/print still locked.`,
            }))
          } else {
            setTerraWorkbench((current) => ({
              ...current,
              tab: 'web-search',
              internetSearchStatus: 'failed',
              internetSearchError: search.error,
              receipt: `Terra Action Run failed safely: ${search.error}`,
            }))
          }
          focusRoom('terra-forge', { kind: 'station', id: 'terra-model-hunt' })
        }
        if (result.actionSystemRun) {
          const completedActionRun = result.actionSystemRun
          setStationActionReceipts((current) => ({
            ...current,
            ...(agent?.primaryStationIds[0] ? { [agent.primaryStationIds[0]]: completedActionRun.readback } : {}),
            ...(completedActionRun.targetStationId ? { [completedActionRun.targetStationId]: `${completedActionRun.readback} ${completedActionRun.visualNextStep}` } : {}),
            'mission-router': `${completedActionRun.status}: ${completedActionRun.readback}`,
          }))
        }
        if (result.result?.usage && !result.actionSystemRun) {
          setStationActionReceipts((current) => ({
            ...current,
            ...(agent?.primaryStationIds[0] ? {
              [agent.primaryStationIds[0]]: `${label} live AI answered on demand. Idle remains local/free. Usage: ${result.result?.usage?.reportedCost ?? result.result?.usage?.reportedUsageLine ?? result.result?.usage?.budget}.`,
            } : {}),
          }))
        }
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setMessages((current) => [
          ...current,
          {
            id: `agent-${agentId}-live-error-${Date.now()}`,
            agentId,
            from: 'agent' as const,
            text: `${label}: נכשלתי להריץ AI עכשיו. ${message}`,
          },
        ].slice(-LIVING_V3_MESSAGES_LIMIT))
        setBodyActionError(message)
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      }
    })()
  }

  function assignStation(agentId: LivingV3AgentId, stationId: LivingV3StationDefinition['id']) {
    const station = livingV3StationById(stationId)
    const snapshot = getAgentSnapshot(snapshots, agentId)
    if (!station) return
    const createdAt = Date.now()
    const applyLocalFallback = () => setAdapterState((state) =>
      assignLivingV3Task(state, {
        agentId,
        kind: station.hermesIntent === 'approval' ? 'approval' : station.hermesIntent === 'rest' ? 'rest' : 'work',
        label: `Operate ${station.label}`,
        roomId: station.roomId,
        stationId: station.id,
        from: snapshot ? { roomId: snapshot.roomId, point: snapshot.roomPoint } : undefined,
        badge: station.badge,
        packetLabel: station.hermesIntent === 'approval' ? 'approval packet' : 'work packet',
      }),
    )
    void (async () => {
      const moveOk = await tryBodyIntent({
        type: 'move_to_station',
        agentId,
        roomId: station.roomId,
        stationId: station.id,
        correlationId: `ui-station-${agentId}-${station.id}-${createdAt}`,
      })
      const workOk = station.hermesIntent === 'rest'
        ? await tryBodyIntent({
          type: 'rest',
          agentId,
          correlationId: `ui-station-${agentId}-${station.id}-${createdAt}`,
        })
        : await tryBodyIntent({
          type: 'work_at_station',
          agentId,
          roomId: station.roomId,
          stationId: station.id,
          taskId: `ui-${station.id}-${createdAt}`,
          correlationId: `ui-station-${agentId}-${station.id}-${createdAt}`,
        })
      if (station.hermesIntent === 'approval') {
        await tryBodyIntent({
          type: 'request_approval',
          agentId,
          taskId: `ui-${station.id}-${createdAt}`,
          reason: `Manual local approval requested at ${station.label}.`,
          correlationId: `ui-station-${agentId}-${station.id}-${createdAt}`,
        })
      }
      if (!moveOk || !workOk) applyLocalFallback()
    })()
    focusRoom(station.roomId, { kind: 'station', id: stationId })
  }

  function activateEtsyStationOperator(stationId: LivingV3StationDefinition['id'], actionLabel?: string) {
    const station = livingV3StationById(stationId)
    if (!station || !isEtsyMarketLabStationId(stationId)) return
    const operatorId = etsyMarketLabStationOperatorId(stationId)
    const snapshot = getAgentSnapshot(snapshots, operatorId)
    const createdAt = Date.now()
    const status = etsyOperatorStatusForStation(stationId, actionLabel)
    const taskId = status
    const correlationId = `ui-etsy-operator-${operatorId}-${station.id}-${createdAt}`
    const taskKind = station.hermesIntent === 'approval' ? 'approval' : 'work'
    const packetLabel = etsyOperatorPacketLabel(status)
    const applyLocalFallback = () => setAdapterState((state) =>
      assignLivingV3Task(state, {
        agentId: operatorId,
        kind: taskKind,
        label: status,
        roomId: station.roomId,
        stationId: station.id,
        from: snapshot ? { roomId: snapshot.roomId, point: snapshot.roomPoint } : undefined,
        badge: station.badge,
        packetLabel,
      }, createdAt),
    )

    void (async () => {
      if (!bodyRuntimeEnabled) {
        applyLocalFallback()
        return
      }
      const moveOk = await tryBodyIntent({
        type: 'move_to_station',
        agentId: operatorId,
        roomId: station.roomId,
        stationId: station.id,
        correlationId,
      })
      const workOk = await tryBodyIntent({
        type: 'work_at_station',
        agentId: operatorId,
        roomId: station.roomId,
        stationId: station.id,
        taskId,
        correlationId,
      })
      if (station.hermesIntent === 'approval') {
        await tryBodyIntent({
          type: 'request_approval',
          agentId: operatorId,
          taskId,
          reason: `${status} at ${station.label}. Local-only approval packet.`,
          correlationId,
        })
      }
      if (!moveOk || !workOk) applyLocalFallback()
    })()
  }

  function recordEtsyStationAction(stationId: LivingV3StationDefinition['id'], actionLabel: string, receipt?: string) {
    const station = livingV3StationById(stationId)
    activateEtsyStationOperator(stationId, actionLabel)
    setStationActionReceipts((current) => ({
      ...current,
      [stationId]: receipt ?? `${actionLabel} staged locally${station ? ` at ${station.label}` : ''}. No external action ran.`,
    }))
  }

  function recordWorkspaceKernelTelemetry(run: WorkspaceRun, artifactKind?: WorkspaceArtifactKind, stationAction?: WorkspaceStationActionRouterResult | null) {
    const telemetry = workspaceKernelTelemetryFromRun(run, {
      stationActionId: stationAction?.actionId,
      agentId: stationAction?.movement.agentId,
      motion: stationAction?.movement.mode,
      artifactKind,
      eventId: run.events[run.events.length - 1]?.eventId,
    })
    setWorkspaceKernelTelemetry(telemetry)
    return telemetry
  }

  function syncEtsyRoomKernelRuns(roomState: EtsyRoomState, createdAt = Date.now(), preferredArtifactKind?: WorkspaceArtifactKind) {
    const result = syncEtsyPipelineToWorkspaceRun(workspaceKernelRuns, roomState, createdAt)
    setWorkspaceKernelRuns(result.runs)
    const telemetryRun = preferredArtifactKind
      ? result.runs.find((run) => run.artifacts.some((artifact) => artifact.kind === preferredArtifactKind))
      : result.createdRuns[result.createdRuns.length - 1]
    let telemetry: WorkspaceKernelTelemetrySnapshot | null = workspaceKernelTelemetry
    if (telemetryRun) {
      telemetry = recordWorkspaceKernelTelemetry(telemetryRun, preferredArtifactKind ?? telemetryRun.artifacts[0]?.kind)
    }
    void persistWorkspaceKernelStateToStore(result.runs, telemetry)
    return result
  }

  function stageSmartIntakeMissionKernelRun(mission: SmartIntakeMission, inputText: string, createdAt = Date.now()) {
    const existingMissionRun = workspaceKernelRuns.find((run) =>
      run.artifacts.some((artifact) => artifact.kind === 'product-candidate-packet' && artifact.payload.missionId === mission.missionId),
    )
    if (existingMissionRun) {
      recordWorkspaceKernelTelemetry(existingMissionRun, 'product-candidate-packet')
      return existingMissionRun
    }
    const run = createSmartIntakeMissionKernelRun(mission, inputText, createdAt)
    const nextRuns = [run, ...workspaceKernelRuns].slice(0, 18)
    setWorkspaceKernelRuns(nextRuns)
    const telemetry = recordWorkspaceKernelTelemetry(run, 'product-candidate-packet')
    void persistWorkspaceKernelStateToStore(nextRuns, telemetry)
    return run
  }

  function etsyKernelArtifactKindForAction(actionLabel: string): WorkspaceArtifactKind | undefined {
    if (/scout|intake|candidate/i.test(actionLabel)) return 'product-candidate-packet'
    if (/select|selected|choose/i.test(actionLabel)) return 'selected-product-packet'
    if (/shotlab/i.test(actionLabel)) return 'shotlab-handoff-packet'
    if (/\bseo\b/i.test(actionLabel)) return 'seo-packet'
    if (/draft payload|draft preview/i.test(actionLabel)) return 'etsy-draft-preview-packet'
    if (/approval/i.test(actionLabel)) return 'approval-packet'
    return undefined
  }

  function applyEtsyPipelineAction(
    stationId: LivingV3StationDefinition['id'],
    actionLabel: string,
    updater: (state: EtsyPipelineState) => EtsyPipelineState,
  ) {
    const next = updater(etsyPipeline)
    setEtsyPipeline(next)
    recordEtsyStationAction(stationId, actionLabel, next.lastReceipt)
  }

  function applyEtsyRoomAction(
    stationId: LivingV3StationDefinition['id'],
    actionLabel: string,
    updater: (state: EtsyRoomState) => EtsyRoomState,
    apiIntent?: Parameters<typeof sendEtsyRoomLocalIntent>[0],
  ) {
    const next = updater(etsyWorkspaceStateRef.current.roomState)
    const backendPersists = Boolean(apiIntent && bodyRuntimeEnabled)
    setEtsyRoomState(next, { reason: actionLabel, sync: !backendPersists })
    syncEtsyRoomKernelRuns(next, Date.now(), etsyKernelArtifactKindForAction(actionLabel))
    if (!backendPersists) syncSharedEtsyRoomState(next, actionLabel)
    recordEtsyStationAction(stationId, actionLabel, next.lastReceipt)
    if (apiIntent && bodyRuntimeEnabled) {
      void sendEtsyRoomLocalIntent(apiIntent)
        .then((result) => {
          if (result.etsyRoomState) {
            if (result.etsyRoomState.run.runId === next.run.runId) {
              if (result.workspaceState) {
                etsyWorkspaceSyncedMutationRef.current = etsyWorkspaceLocalMutationRef.current
                applyAuthoritativeEtsyWorkspaceState(result.workspaceState)
              } else {
                setEtsyRoomState(result.etsyRoomState, { reason: `${actionLabel} backend result` })
                syncSharedEtsyRoomState(result.etsyRoomState, `${actionLabel} backend result`)
              }
              syncEtsyRoomKernelRuns(result.etsyRoomState, Date.now(), etsyKernelArtifactKindForAction(actionLabel))
            } else {
              setStationActionReceipts((current) => ({
                ...current,
                [stationId]: `${next.lastReceipt ?? actionLabel} Current product selection stayed active.`,
              }))
            }
          }
          setBodyActionError(null)
          return Promise.all([refreshBodyRuntime(), refreshAgentControl()])
        })
        .catch((error) => {
          setBodyActionError(error instanceof Error ? error.message : String(error))
          void readSharedEtsyRoomState()
            .then((shared) => {
              etsyWorkspaceSyncedMutationRef.current = etsyWorkspaceLocalMutationRef.current
              applyAuthoritativeEtsyWorkspaceState(shared.workspaceState)
            })
            .catch(() => undefined)
        })
    }
  }

  function updateShotLabDraftLocally(
    patch: Partial<EtsyRoomState['shotLabDraft']> | ((current: EtsyRoomState['shotLabDraft']) => Partial<EtsyRoomState['shotLabDraft']>),
    reason: string,
  ) {
    const current = etsyRoomStateRef.current
    const resolvedPatch = typeof patch === 'function' ? patch(current.shotLabDraft) : patch
    const next = {
      ...current,
      run: { ...current.run, updatedAtMs: Math.max(Date.now(), current.run.updatedAtMs + 1) },
      shotLabDraft: { ...current.shotLabDraft, ...resolvedPatch },
    }
    etsyRoomStateRef.current = next
    setEtsyRoomState(next)
    syncSharedEtsyRoomState(next, reason)
  }

  function runSmartIntakeMission() {
    const input = smartIntake.input.trim()
    if (!input) {
      const message = 'כתוב מוצר או הדבק קישור לפני החיפוש.'
      setSmartIntake((current) => ({ ...current, error: message, receipt: undefined }))
      recordEtsyStationAction('etsy-loki-product-hunt', 'Search missing input', message)
      return
    }
    const mission = createSmartIntakeMission(input)
    const match = selectedSmartIntakeMatch(mission)
    const imageSet = imageSetForSmartIntakeMatch(mission, match?.matchId)
    setSmartIntake((current) => ({
      ...current,
      mission,
      selectedMatchId: match?.matchId,
      selectedImageId: imageSet?.bestImageId,
      error: undefined,
      workerStatus: 'idle',
      workerRun: undefined,
      workerError: undefined,
      workerReceipt: undefined,
      receipt: `נמצאו ${mission.productMatches.length} תוצאות מקומיות.`,
    }))
    stageSmartIntakeMissionKernelRun(mission, input)
    recordEtsyStationAction('etsy-loki-product-hunt', 'Search products', `נמצאו ${mission.sources.length} מקורות ונבנתה חבילת מוצר מקומית.`)
  }

  function runSmartIntakeWorker() {
    const mission = smartIntake.mission
    if (!mission) {
      const message = 'Run Smart Intake V2 before launching Hermes Worker V1.'
      setSmartIntake((current) => ({ ...current, error: message, workerError: undefined }))
      recordEtsyStationAction('etsy-loki-product-hunt', 'Smart Intake Hermes Worker gated', message)
      return
    }
    setSmartIntake((current) => ({
      ...current,
      workerStatus: 'running',
      workerRun: undefined,
      workerError: undefined,
      workerReceipt: undefined,
      error: undefined,
    }))
    recordEtsyStationAction('etsy-loki-product-hunt', 'Run Hermes Worker V1', `Smart Intake worker started for ${mission.missionId}.`)
    void (async () => {
      try {
        const result = await runControlledAgent(
          'smart-intake',
          `Review Smart Intake mission ${mission.missionId} and return typed local-only guidance.`,
          {
            smartIntakeInput: smartIntake.input,
            smartIntakeMission: mission,
          },
        )
        const summary = result.result?.output?.summary ?? result.result?.error ?? result.error ?? 'Hermes Worker V1 returned without a parsed summary.'
        setSmartIntake((current) => ({
          ...current,
          workerStatus: result.ok ? 'completed' : 'failed',
          workerRun: result,
          workerError: result.ok ? undefined : summary,
          workerReceipt: result.ok
            ? 'Hermes Worker V1 completed one controlled local-only run and returned refined product/dossier guidance. Agents returned to FROZEN.'
            : undefined,
          receipt: current.receipt,
        }))
        recordEtsyStationAction(
          'etsy-loki-product-hunt',
          result.ok ? 'Hermes Worker V1 result' : 'Hermes Worker V1 failed',
          summary,
        )
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setSmartIntake((current) => ({
          ...current,
          workerStatus: 'failed',
          workerError: message,
          workerReceipt: undefined,
        }))
        setBodyActionError(message)
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      }
    })()
  }

  function smartIntakeSelectedImageIds(matchId: string) {
    const imageSet = imageSetForSmartIntakeMatch(smartIntake.mission, matchId)
    if (!imageSet) return []
    if (smartIntake.selectedImageId && imageSet.items.some((item) => item.imageId === smartIntake.selectedImageId)) {
      return [smartIntake.selectedImageId]
    }
    return imageSet.bestImageId ? [imageSet.bestImageId] : imageSet.items.slice(0, 1).map((item) => item.imageId)
  }

  function chooseSmartIntakeMatch(matchId: string, mode: 'odin' | 'shotlab' = 'odin') {
    const mission = smartIntake.mission
    const match = mission?.productMatches.find((item) => item.matchId === matchId)
    if (!mission || !match) {
      const message = 'Run Smart Intake V2 before choosing a product match.'
      setSmartIntake((current) => ({ ...current, error: message }))
      recordEtsyStationAction('etsy-loki-product-hunt', 'Smart Intake V2 handoff failed', message)
      return
    }
    const selectedImageIds = smartIntakeSelectedImageIds(matchId)
    let next = applySmartIntakeMatchToEtsyRoomLocal(etsyRoomState, {
      mission,
      match,
      selectedImageIds,
    })
    if (mode === 'shotlab') {
      next = createShotLabHandoffLocal(next, {
        imageCount: Math.max(1, selectedImageIds.length || 1),
        preset: next.shotLabDraft.preset,
        sourceImageRequirements: `Smart Intake selected image refs: ${selectedImageIds.join(', ') || 'missing source image ref'}`,
        variantNotes: 'Use only verified variants from Smart Intake dossier. Keep unknown material/stone/personalization claims off.',
      })
    }
    setEtsyRoomState(next)
    syncEtsyRoomKernelRuns(next, Date.now(), mode === 'shotlab' ? 'shotlab-handoff-packet' : 'selected-product-packet')
    syncSharedEtsyRoomState(next, mode === 'shotlab' ? 'Smart Intake ShotLab handoff' : 'Smart Intake product selected')
    setSmartIntake((current) => ({
      ...current,
      selectedMatchId: matchId,
      selectedImageId: selectedImageIds[0] ?? current.selectedImageId,
      receipt: mode === 'shotlab'
        ? `Smart Intake staged ${match.title} and prepared a local ShotLab handoff packet.`
        : `Smart Intake selected ${match.title}. Continue through the existing local flow.`,
      error: undefined,
    }))
    recordEtsyStationAction(
      'etsy-loki-product-hunt',
      mode === 'shotlab' ? 'Prepare Smart Intake ShotLab handoff' : 'Choose Smart Intake match',
      next.lastReceipt,
    )
  }

  async function importSheetIntake() {
    setSheetIntake((current) => ({ ...current, loading: true, error: undefined, receipt: undefined }))
    try {
      const payload = sheetIntake.sourceType === 'pasted_text'
        ? { sourceType: 'pasted_text' as const, pastedText: sheetIntake.pastedText }
        : sheetIntake.sourceType === 'local_file'
          ? { sourceType: 'local_file' as const, localPath: sheetIntake.localPath }
          : { sourceType: 'public_csv_url' as const, publicCsvUrl: sheetIntake.publicCsvUrl }
      const result = await runEtsySheetIntakeClient(payload)
      const run = result.run
      if (!run) throw new Error(result.error ?? 'Sheet Intake did not return a run manifest.')
      setSheetIntake((current) => ({
        ...current,
        loading: false,
        error: undefined,
        run,
        selectedProductId: run.products[0]?.productId,
        filter: 'all',
        receipt: `Sheet Intake run ${run.runId} created ${run.products.length} product dossiers.`,
      }))
      recordEtsyStationAction('etsy-loki-product-hunt', 'Import Sheet Intake', `Sheet Intake run ${run.runId} wrote ${run.products.length} dossiers locally.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSheetIntake((current) => ({ ...current, loading: false, error: message }))
      recordEtsyStationAction('etsy-loki-product-hunt', 'Import Sheet Intake failed', message)
    }
  }

  function chooseSheetIntakeProduct(productId: string) {
    const product = sheetIntake.run?.products.find((item) => item.productId === productId)
    if (!product || !sheetIntake.run) {
      setSheetIntake((current) => ({ ...current, error: 'Import Sheet Intake before choosing a product.' }))
      return
    }
    const next = applySheetIntakeProductToEtsyRoomLocal(etsyRoomState, {
      product,
      sheetRunId: sheetIntake.run.runId,
      manifestPath: `${sheetIntake.run.artifactRoot}/manifest.json`,
    })
    setEtsyRoomState(next)
    syncEtsyRoomKernelRuns(next, Date.now(), 'selected-product-packet')
    syncSharedEtsyRoomState(next, 'Sheet Intake product selected')
    setSheetIntake((current) => ({
      ...current,
      selectedProductId: productId,
      receipt: `נבחר מוצר: ${product.title}. אפשר להמשיך לבדיקת ספק או להכנת דראפט מקומי.`,
      error: undefined,
    }))
    recordEtsyStationAction('etsy-loki-product-hunt', 'Choose Sheet Intake product', next.lastReceipt)
  }

  function runEtsyLiveScout(options: { keepSurface?: boolean } = {}) {
    const query = (etsyPipeline.searchInput.trim()
      || etsyRoomState.prompt
      || oracleSearch.lastSignalPacket?.selectedKeyword
      || oracleSearch.query).trim()
    if (!query) {
      const message = 'Open Oracle Product Search and type a product signal before running live read-only scout.'
      setEtsyLiveScout({ status: 'blocked', error: message, receipt: message })
      recordEtsyStationAction('etsy-loki-product-hunt', 'Live Read-Only Scout blocked', message)
      return
    }
    const startedAt = Date.now()
    if (!options.keepSurface) setEtsyToolSurface('scout')
    focusRoom('etsy-market-lab', { kind: 'station', id: 'etsy-loki-product-hunt' })
    setEtsyLiveScout({
      status: 'running',
      receipt: `Live read-only scout requested for "${query}".`,
    })
    recordEtsyStationAction('etsy-loki-product-hunt', 'Run Live Read-Only Scout', `Live read-only scout requested for "${query}".`)
    setMessages((current) => [
      ...current,
      {
        id: `etsy-live-scout-operator-${startedAt}`,
        agentId: 'loki',
        from: 'operator',
        text: query,
      },
      {
        id: `etsy-live-scout-start-${startedAt}`,
        agentId: 'loki',
        from: 'agent',
        text: 'Starting live read-only scout through the controlled backend. Live actions and worker fan-out stay locked.',
      },
    ])
    void (async () => {
      try {
        const result = await runEtsyLiveScoutClient({
          query,
          operatorNote: 'Run from Product Search live read-only scout action.',
          sourceHints: [],
          maxCandidates: 3,
          mode: 'read-only-live-research',
        })
        applyWorkspaceKernelApiPayload({
          ok: true,
          state: result.state,
          telemetry: result.telemetry,
          displayStates: result.displayStates,
        })

        if (result.liveRun.status === 'completed' && result.liveRun.candidates.length > 0) {
          const nextRoomState = result.sharedRoomState ?? applyEtsyLiveResearchRunToEtsyRoomLocal(etsyRoomState, {
            liveRun: result.liveRun,
            nowMs: Date.now(),
          })
          setEtsyRoomState(nextRoomState)
          if (!result.sharedRoomState) syncSharedEtsyRoomState(nextRoomState, 'Live read-only scout completed')
          setEtsyLiveScout({
            status: 'completed',
            result,
            receipt: `${result.liveRun.candidates.length} live read-only candidate${result.liveRun.candidates.length === 1 ? '' : 's'} ready in Product Search.`,
          })
          recordEtsyStationAction('etsy-loki-product-hunt', 'Live Read-Only Scout completed', nextRoomState.lastReceipt)
        } else {
          const blockedReason = result.liveRun.blockedReason ?? 'Live read-only research connector/tool unavailable.'
          setEtsyLiveScout({
            status: result.liveRun.status === 'failed' ? 'failed' : 'blocked',
            result,
            error: blockedReason,
            receipt: blockedReason,
          })
          recordEtsyStationAction('etsy-loki-product-hunt', 'Live Read-Only Scout blocked', blockedReason)
        }
        setMessages((current) => [
          ...current,
          {
            id: `etsy-live-scout-result-${Date.now()}`,
            agentId: 'loki',
            from: 'agent',
            text: result.liveRun.status === 'completed'
              ? `Live read-only scout returned ${result.liveRun.candidates.length} source-backed candidate${result.liveRun.candidates.length === 1 ? '' : 's'}.`
              : `Live read-only scout blocked: ${result.liveRun.blockedReason ?? 'missing connector'}`,
          },
        ])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setEtsyLiveScout({ status: 'failed', error: message, receipt: message })
        recordEtsyStationAction('etsy-loki-product-hunt', 'Live Read-Only Scout failed', message)
        setBodyActionError(message)
      }
    })()
  }

  const etsyPipelineHandlers: EtsyPipelineHandlers = {
    updateSearchInput: (value) => setEtsyPipeline((current) => setEtsySearchInput(current, value)),
    updateSearchMode: (value) => setEtsyPipeline((current) => setEtsySearchMode(current, value)),
    createSearchPacket: () => {
      const requestText = etsyPipeline.searchInput
      const mode = etsyPipeline.searchMode
      const cleanRequest = requestText.trim().toLowerCase()
      const oracleSignalPacket = etsyPipeline.oracleSignalPacket?.selectedKeyword.trim().toLowerCase() === cleanRequest
        ? etsyPipeline.oracleSignalPacket
        : undefined
      applyEtsyPipelineAction('etsy-loki-product-hunt', 'Create local search packet', (current) =>
        createEtsyProductSearchPacket(current, { requestText, mode, oracleSignalPacket }),
      )
      applyEtsyRoomAction(
        'etsy-loki-product-hunt',
        'Prepare product scout packet',
        (current) => prepareProductScoutPacketLocal(current, { prompt: requestText, oracleSignalPacket }),
        { type: 'prepare_product_scout_packet_local', prompt: requestText, oracleSignalPacket },
      )
    },
    prepareScoutPacket: () => {
      const prompt = etsyPipeline.searchInput.trim() || etsyRoomState.prompt
      const oracleSignalPacket = etsyPipeline.oracleSignalPacket
      applyEtsyRoomAction(
        'etsy-loki-product-hunt',
        'Prepare product scout packet',
        (current) => prepareProductScoutPacketLocal(current, { prompt, oracleSignalPacket }),
        { type: 'prepare_product_scout_packet_local', prompt, oracleSignalPacket },
      )
    },
    runScoutWorker: () => activateControlledAgentRun('scout'),
    runLiveScout: runEtsyLiveScout,
    resetPipeline: () => {
      const current = etsyWorkspaceStateRef.current
      const commandId = typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `etsy-workspace-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`
      setStationActionReceipts((receipts) => ({ ...receipts, 'etsy-loki-product-hunt': 'Resetting the shared Etsy V2 workspace…' }))
      void applySharedEtsyProductWorkspaceCommandClient({
        type: 'reset_workspace',
        commandId,
        baseRevision: current.revision,
        reason: 'Operator reset the Etsy product workspace',
      })
        .then((result) => {
          etsyWorkspaceSyncedMutationRef.current = etsyWorkspaceLocalMutationRef.current
          applyAuthoritativeEtsyWorkspaceState(result.workspaceState)
          setStationActionReceipts((receipts) => ({
            ...receipts,
            'etsy-loki-product-hunt': result.commandStatus === 'conflict'
              ? 'Reset conflict blocked safely; the latest server workspace was restored.'
              : 'Shared Etsy V2 workspace reset. No external marketplace data was changed.',
          }))
        })
        .catch((error) => {
          setStationActionReceipts((receipts) => ({
            ...receipts,
            'etsy-loki-product-hunt': `Workspace reset failed safely: ${error instanceof Error ? error.message : String(error)}`,
          }))
        })
    },
    evidenceLoading: false,
    selectCandidate: (candidateId) => {
      const roomCandidate = etsyRoomState.candidates.find((candidate) => candidate.candidateId === candidateId)
      if (roomCandidate) {
        applyEtsyRoomAction(
          'etsy-loki-product-hunt',
          'Select candidate',
          (current) => selectEtsyCandidateLocal(current, candidateId),
          { type: 'select_etsy_candidate_local', candidateId },
        )
        applyEtsyPipelineAction('etsy-loki-product-hunt', 'Synchronize product scope', (current) =>
          syncEtsyPipelineToRoomCandidate(current, roomCandidate),
        )
        return
      }
      applyEtsyPipelineAction('etsy-loki-product-hunt', 'Select candidate', (current) =>
        selectEtsyCandidate(current, candidateId),
      )
    },
    addCandidateToVisualBoard: (candidateId) => applyEtsyPipelineAction('etsy-loki-product-hunt', 'Add to Visual Board', (current) =>
      addEtsyCandidateToVisualBoard(current, candidateId),
    ),
    sendCandidateToThoth: (candidateId) => applyEtsyPipelineAction('etsy-loki-product-hunt', 'Send to SEO', (current) =>
      sendEtsyCandidateToThoth(current, candidateId),
    ),
    rejectCandidate: (candidateId) => {
      const roomHasCandidate = etsyRoomState.candidates.some((candidate) => candidate.candidateId === candidateId)
      if (roomHasCandidate) {
        applyEtsyRoomAction(
          'etsy-loki-product-hunt',
          'Reject and delete local candidate',
          (current) => rejectEtsyCandidateLocal(current, candidateId),
          { type: 'reject_etsy_candidate_local', candidateId },
        )
        return
      }
      applyEtsyPipelineAction('etsy-loki-product-hunt', 'Reject and delete local candidate', (current) =>
        rejectEtsyCandidate(current, candidateId),
      )
    },
    stageSheetRow: () => {
      if (!etsyRoomState.seoPacket) {
        recordEtsyStationAction('etsy-thor-seo-metrics', 'Stage Sheet Row blocked', 'Create an SEO packet before staging a local sheet row.')
        return
      }
      applyEtsyPipelineAction('etsy-thor-seo-metrics', 'Stage Sheet Row Locally', (current) =>
        stageEtsySheetRowLocally(current),
      )
    },
    setSupplierFilter: (filter) => setEtsyPipeline((current) => setEtsySupplierFilter(current, filter)),
    saveSupplierLead: (lead) => applyEtsyPipelineAction('etsy-loki-source-leads', 'Save source lead', (current) =>
      saveEtsySupplierLead(current, lead),
    ),
    sendSupplierLeadToAnubis: (lead) => applyEtsyPipelineAction('etsy-loki-source-leads', 'Send to Truth', (current) =>
      sendEtsySupplierLeadToAnubis(current, lead),
    ),
    toggleTruthField: (field, checked) => applyEtsyPipelineAction('etsy-thor-source-truth', 'Update Product Truth Packet', (current) =>
      toggleEtsyTruthField(current, field, checked),
    ),
    createTruthPacket: () => {
      if (!activeEtsyProductCandidate(etsyPipeline) && !activeEtsySupplierLead(etsyPipeline) && !etsyPipeline.productTruthPacket) {
        recordEtsyStationAction('etsy-thor-source-truth', 'Create Product Truth Packet blocked', 'Select a product or save a candidate-backed source lead before creating product truth.')
        return
      }
      applyEtsyPipelineAction('etsy-thor-source-truth', 'Create Product Truth Packet', (current) =>
        createEtsyProductTruthPacket(current),
      )
    },
    updateQaItemStatus: (qaItemId, status) => applyEtsyPipelineAction('etsy-thor-qa-review', status === 'approved' ? 'Approve QA item' : 'Reject QA item', (current) =>
      updateEtsyQaItemStatus(current, qaItemId, status),
    ),
    createQaReport: () => applyEtsyPipelineAction('etsy-thor-qa-review', 'Create QA Report', (current) =>
      createEtsyVisualQaReport(current),
    ),
    setShotLabPreset: (value) => updateShotLabDraftLocally({ preset: value }, 'ShotLab preset updated locally'),
    setShotLabImageCount: (value) => updateShotLabDraftLocally({ imageCount: value }, 'ShotLab image recipe updated locally'),
    setShotLabSourceImageRequirements: (value) => updateShotLabDraftLocally(
      (current) => ({ sourceImageRequirements: typeof value === 'function' ? value(current.sourceImageRequirements) : value }),
      'ShotLab source requirements updated locally',
    ),
    setShotLabVariantNotes: (value) => updateShotLabDraftLocally(
      (current) => ({ variantNotes: typeof value === 'function' ? value(current.variantNotes) : value }),
      'ShotLab variant notes updated locally',
    ),
    createShotLabHandoffPacket: () => {
      if (!etsyRoomState.selectedProductPacket) {
        recordEtsyStationAction('etsy-thor-shotlab-prep', 'Create ShotLab Handoff blocked', 'Choose a product before creating a ShotLab handoff.')
        return
      }
      applyEtsyRoomAction(
        'etsy-thor-shotlab-prep',
        'Create ShotLab Handoff Packet',
        (current) => createShotLabHandoffLocal(current, current.shotLabDraft),
        { type: 'create_shotlab_handoff_local', ...etsyRoomState.shotLabDraft },
      )
    },
    createSeoPacket: () => {
      if (!etsyRoomState.selectedProductPacket) {
        recordEtsyStationAction('etsy-thor-seo-metrics', 'Create SEO Packet blocked', 'Choose a product before creating an SEO packet.')
        return
      }
      applyEtsyRoomAction(
        'etsy-thor-seo-metrics',
        'Create SEO Packet',
        (current) => createSeoPacketLocal(current),
        { type: 'create_seo_packet_local' },
      )
    },
    createDraftPayload: () => {
      if (!etsyRoomState.seoPacket) {
        recordEtsyStationAction('etsy-odin-draft-approval', 'Create Draft Payload blocked', 'Create an SEO packet before creating the local draft preview.')
        return
      }
      applyEtsyRoomAction(
        'etsy-odin-draft-approval',
        'Create Draft Payload',
        (current) => createDraftPayloadLocal(current),
        { type: 'create_draft_payload_local' },
      )
    },
    createDraftApprovalPacket: () => {
      if (!etsyRoomState.draftPayload) {
        recordEtsyStationAction('etsy-odin-draft-approval', 'Create DLV Approval Packet blocked', 'Create the local draft preview before requesting DLV approval.')
        return
      }
      applyEtsyRoomAction(
        'etsy-odin-draft-approval',
        'Create DLV Approval Packet',
        (current) => requestDlvApprovalLocal(current),
        { type: 'request_dlv_approval_local' },
      )
      if (activeEtsyProductCandidate(etsyPipeline)) {
        applyEtsyPipelineAction('etsy-odin-draft-approval', 'Create Draft Approval Packet', (current) =>
          createEtsyDraftApprovalPacket(current),
        )
      }
    },
    goToStation: (stationId) => {
      activateEtsyStationOperator(stationId)
      setSelection({ kind: 'station', id: stationId })
      focusRoom('etsy-market-lab', { kind: 'station', id: stationId })
    },
    roomState: etsyRoomState,
    etsyToolSurface,
    setEtsyToolSurface,
    smartIntake,
    liveScout: etsyLiveScout,
    chatMemory: messages.slice(-14) as Array<EtsyPrepChatMemorySnippet>,
    updateSmartIntakeInput: (value) => setSmartIntake((current) => ({ ...current, input: value })),
    runSmartIntakeMission,
    runSmartIntakeWorker,
    selectSmartIntakeMatch: (matchId) => {
      const imageSet = imageSetForSmartIntakeMatch(smartIntake.mission, matchId)
      setSmartIntake((current) => ({ ...current, selectedMatchId: matchId, selectedImageId: imageSet?.bestImageId ?? current.selectedImageId }))
    },
    selectSmartIntakeImage: (imageId) => setSmartIntake((current) => ({ ...current, selectedImageId: imageId })),
    chooseSmartIntakeMatch: (matchId) => chooseSmartIntakeMatch(matchId, 'odin'),
    prepareSmartIntakeShotLabHandoff: (matchId) => chooseSmartIntakeMatch(matchId, 'shotlab'),
    sheetIntake,
    setSheetIntakeSourceType: (value) => setSheetIntake((current) => ({ ...current, sourceType: value, error: undefined })),
    updateSheetIntakePastedText: (value) => setSheetIntake((current) => ({ ...current, pastedText: value })),
    updateSheetIntakeLocalPath: (value) => setSheetIntake((current) => ({ ...current, localPath: value })),
    updateSheetIntakePublicCsvUrl: (value) => setSheetIntake((current) => ({ ...current, publicCsvUrl: value })),
    importSheetIntake: () => { void importSheetIntake() },
    setSheetIntakeFilter: (filter) => setSheetIntake((current) => ({ ...current, filter })),
    selectSheetIntakeProduct: (productId) => setSheetIntake((current) => ({ ...current, selectedProductId: productId })),
    chooseSheetIntakeProduct,
  }

  const oracleSearchHandlers: OracleSearchHandlers = {
    updateQuery: (value) => setOracleSearch((current) => ({ ...current, query: value })),
    updateSourceMode: (value) => setOracleSearch((current) => ({ ...current, sourceMode: value })),
    runSearch: () => {
      const query = oracleSearch.query.trim()
      setOracleSearch((current) => ({ ...current, loading: true, error: undefined }))
      setAdapterState((state) =>
        assignLivingV3Task(state, {
          agentId: 'oracle',
          kind: 'work',
          label: 'Reading local Alura cache',
          roomId: 'oracle-signals',
          stationId: 'oracle-signal-basin',
          badge: 'active-task',
          packetLabel: 'Alura cache',
        }),
      )
      void searchOracleLocalAlura(query, oracleSearch.sourceMode, 8)
        .then((result) => {
          setOracleSearch((current) => ({
            ...current,
            loading: false,
            result,
            error: result.ok ? undefined : result.error ?? 'Oracle local search failed',
          }))
          setStationActionReceipts((current) => ({
            ...current,
            'oracle-signal-basin': result.ok
              ? `Oracle read ${result.sourceFilesUsed.length} local source files. No live Alura request ran.`
              : result.error ?? 'Oracle local search failed safely.',
          }))
        })
        .catch((error) => {
          setOracleSearch((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : 'Oracle local search failed',
          }))
        })
    },
    sendSignalToEtsy: (result, keywordResult) => {
      const packet = createOracleSignalPacket(result, keywordResult)
      setOracleSearch((current) => ({
        ...current,
        selectedKeywordId: keywordResult.id,
        lastSignalPacket: packet,
      }))
      const next = applyOracleSignalToEtsyPipeline(etsyPipeline, packet)
      setEtsyPipeline(next)
      const nextRoomState = prepareProductScoutPacketLocal(etsyRoomState, {
        prompt: packet.selectedKeyword,
        oracleSignalPacket: packet,
      })
      setEtsyRoomState(nextRoomState)
      syncEtsyRoomKernelRuns(nextRoomState, Date.now(), 'product-candidate-packet')
      syncSharedEtsyRoomState(nextRoomState, 'Oracle signal sent to Etsy room')
      setStationActionReceipts((current) => ({
        ...current,
        'oracle-signal-basin': `Signal packet sent locally: ${packet.selectedKeyword}.`,
        'etsy-loki-product-hunt': `Oracle signal received: ${packet.selectedKeyword}.`,
      }))
      setAdapterState((state) =>
        assignLivingV3Task(state, {
          agentId: 'oracle',
          kind: 'work',
          label: 'Signal packet sent to Etsy Market Lab',
          roomId: 'oracle-signals',
          stationId: 'oracle-signal-basin',
          badge: 'active-task',
          packetLabel: 'signal packet',
        }),
      )
      focusRoom('etsy-market-lab')
    },
  }

  function sendEveryoneToRest() {
    const createdAt = Date.now()
    const movableSnapshots = snapshots.filter((snapshot) => !isCouncilRoomGeneralAgent(snapshot.agentId))
    const applyLocalFallback = () => setAdapterState((state) =>
      movableSnapshots.reduce((nextState, snapshot, index) =>
        assignLivingV3Task(nextState, {
          agentId: snapshot.agentId,
          kind: 'rest',
          label: 'Pantheon Quarters recovery',
          roomId: 'pantheon-quarters',
          stationId: 'pantheon-rest-pods',
          from: { roomId: snapshot.roomId, point: snapshot.roomPoint },
          badge: 'sleeping',
          packetLabel: null,
        }, createdAt + index * 120), state),
    )
    void (async () => {
      if (!bodyRuntimeEnabled) {
        applyLocalFallback()
        return
      }
      const results = await Promise.all(movableSnapshots.map((snapshot) =>
        tryBodyIntent({
          type: 'rest',
          agentId: snapshot.agentId,
          correlationId: `ui-rest-${createdAt}`,
        }),
      ))
      if (results.some((result) => !result)) applyLocalFallback()
    })()
    focusRoom('pantheon-quarters')
  }

  function runDemoWorkflow() {
    const createdAt = Date.now()
    if (bodyRuntimeEnabled) {
      void (async () => {
        const results = await Promise.all([
          tryBodyIntent({ type: 'work_at_station', agentId: 'hermes', roomId: 'olympus-command', stationId: 'mission-router', taskId: `demo-route-${createdAt}`, correlationId: `ui-demo-${createdAt}` }),
          tryBodyIntent({ type: 'work_at_station', agentId: 'loki', roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt', taskId: `demo-scout-${createdAt}`, correlationId: `ui-demo-${createdAt}` }),
          tryBodyIntent({ type: 'work_at_station', agentId: 'thor', roomId: 'etsy-market-lab', stationId: 'etsy-thor-seo-metrics', taskId: `demo-ledger-${createdAt}`, correlationId: `ui-demo-${createdAt}` }),
          tryBodyIntent({ type: 'request_approval', agentId: 'odin', taskId: `demo-draft-${createdAt}`, reason: 'Draft courier gate remains local-only.', correlationId: `ui-demo-${createdAt}` }),
        ])
        if (results.some((result) => !result)) setAdapterState(createInitialLivingV3HermesState(createdAt))
      })()
    } else {
      setAdapterState(createInitialLivingV3HermesState(createdAt))
    }
    focusMap()
  }

  function createLocalApproval() {
    const createdAt = Date.now()
    const applyLocalFallback = () => setAdapterState((state) =>
      createLivingV3ApprovalPacket(
        raiseLivingV3Alert(state, {
          roomId: 'olympus-command',
          stationId: 'mission-router',
          agentId: 'hermes',
          badge: 'approval',
          label: 'New local approval packet',
        }, createdAt),
        {
          agentId: 'hermes',
          stationId: 'mission-router',
          label: 'Manual operator approval required',
        },
        createdAt + 1,
      ),
    )
    void (async () => {
      if (!bodyRuntimeEnabled) {
        applyLocalFallback()
        return
      }
      try {
        await requestWarRoomApproval({
          agentId: 'hermes',
          roomId: 'olympus-command',
          stationId: 'mission-router',
          reason: 'Manual operator approval required.',
          requestedAction: 'Operator local decision',
          allowedAction: 'Create local approval packet only',
          lockedAction: 'Any live Etsy, supplier, paid, purchase, Discord, or account action',
          riskLevel: 'medium',
          source: 'ui',
          correlationId: `ui-approval-${createdAt}`,
        })
        setBodyActionError(null)
        await refreshBodyRuntime()
      } catch (error) {
        setBodyActionError(error instanceof Error ? error.message : String(error))
        applyLocalFallback()
      }
    })()
  }

  function decideWorkspaceCoreOpsApproval(notification: WorkspaceCoreOpsNotification, decision: WorkspaceCoreOpsApprovalDecision) {
    if (!notification.approvalId) return
    void (async () => {
      try {
        setWorkspaceKernelStoreStatus(decision === 'approved' ? 'recording approval' : 'recording cancellation')
        const response = await fetch('/api/war-room/workspace-kernel/resolve-run', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: decision === 'approved' ? 'approved' : 'rejected',
            approvalId: notification.approvalId,
            reason: decision === 'approved'
              ? 'Operator approved from Workspace Notifications. Live execution remains locked until a specific sender is connected.'
              : 'Operator cancelled from Workspace Notifications. No live action was executed.',
          }),
        })
        const payload = await response.json() as WorkspaceKernelApiPayload
        applyWorkspaceKernelApiPayload(payload)
      } catch (error) {
        setWorkspaceKernelStoreStatus(error instanceof Error ? error.message : 'kernel approval update failed')
      }
    })()
  }

  function runHermesCommandPrompt(
    promptTextInput: string,
    startedAt = Date.now(),
    options: { focusCommandTable?: boolean } = {},
  ) {
    const promptText = promptTextInput.trim()
    if (!promptText) {
      setHermesCommandRun({ status: 'failed', label: 'Write a message for Hermes first.', error: 'Missing command-room prompt.' })
      return
    }
    const snapshot = getAgentSnapshot(snapshots, 'hermes')
    setHermesCommandRun({ status: 'running', label: 'Hermes is checking what can actually run...' })
    setHermesCommandActionRun({
      runId: `command-running-${startedAt}`,
      status: 'running',
      prompt: promptText,
      intent: 'checking',
      capability: 'checking',
      assignedAgentId: 'hermes',
      targetRoomId: 'olympus-command',
      targetStationId: 'command-table',
      readback: 'Hermes בודק מה ביקשת ומה באמת מותר להריץ.',
      visualNextStep: 'אם יש כלי בטוח הוא ייפתח. אם חסרה יכולת, תקבל תוכנית בנייה בלי לבצע פעולה חיצונית.',
      createdAtMs: startedAt,
      updatedAtMs: startedAt,
    })
    if (options.focusCommandTable !== false) focusRoom('olympus-command', { kind: 'station', id: 'command-table' })
    setAdapterState((state) => assignLivingV3Task(state, {
      agentId: 'hermes',
      kind: 'talk',
      label: 'Hermes is checking capability and routing',
      roomId: 'olympus-command',
      stationId: 'command-table',
      from: snapshot ? { roomId: snapshot.roomId, point: snapshot.roomPoint } : undefined,
      badge: 'active-task',
      packetLabel: 'action check',
    }, startedAt))
    const operatorMessage: AgentMessage = {
      id: `hermes-command-operator-${startedAt}`,
      agentId: 'hermes',
      from: 'operator',
      text: promptText,
    }
    setMessages((current) => [
      ...current,
      operatorMessage,
    ].slice(-LIVING_V3_MESSAGES_LIMIT))
    void (async () => {
      try {
        const result = await runLiveAgentChat('hermes', promptText)
        const output = result.result?.output
        const actionRun = result.actionSystemRun
        const isActionReceipt = Boolean(actionRun && actionRun.intent !== 'chat')
        const answer = isActionReceipt && actionRun
          ? `${actionRun.readback}\n${actionRun.visualNextStep}`
          : output?.answer ?? result.result?.error ?? result.error ?? 'Hermes finished without parsed output.'
        const completedLabel = actionRun?.intent === 'terra_model_search'
          ? 'Hermes sent Terra to Model Hunt'
          : actionRun?.intent === 'council_consultation_offer'
            ? 'Hermes is waiting for your Council decision'
          : actionRun?.status === 'blocked_missing_capability'
            ? 'Missing tool — build plan ready'
            : `Hermes answered ${output?.confidence ?? '?'}%`
        setHermesCommandRun({
          status: result.ok || actionRun ? 'completed' : 'failed',
          label: completedLabel,
          result,
          answer,
          error: result.ok || actionRun ? undefined : answer,
        })
        setHermesCommandActionRun({
          runId: actionRun?.actionRunId ?? result.runId,
          status: actionRun?.status === 'waiting_operator'
            ? 'waiting_operator'
            : actionRun?.status === 'blocked_missing_capability' || actionRun?.status === 'blocked_tool_error'
            ? 'blocked'
            : result.ok || actionRun
              ? 'completed'
              : 'failed',
          prompt: promptText,
          intent: actionRun?.intent ?? 'chat',
          capability: actionRun?.capability ?? 'not_needed',
          assignedAgentId: actionRun?.assignedAgentId ?? 'hermes',
          targetRoomId: actionRun?.targetRoomId,
          targetStationId: actionRun?.targetStationId,
          toolId: actionRun?.toolId,
          readback: actionRun?.readback ?? answer,
          visualNextStep: actionRun?.visualNextStep ?? 'התשובה נשמרה כאן. אם זו פעולה אמיתית, בקש במפורש מה להכין/למצוא/לבנות.',
          missingCapabilityTitle: actionRun?.missingCapability?.title,
          buildPlan: actionRun?.missingCapability?.buildPlan,
          createdAtMs: startedAt,
          updatedAtMs: Date.now(),
        })
        setControlledAgentRunStates((current) => ({
          ...current,
          'hermes-command': {
            status: result.ok || actionRun ? 'completed' : 'failed',
            label: completedLabel,
            runId: result.runId,
          },
        }))
        const receiptAgentId: LivingV3AgentId = actionRun?.assignedAgentId ?? 'hermes'
        const resultMessage: AgentMessage = {
          id: `hermes-command-result-${Date.now()}`,
          agentId: receiptAgentId,
          from: isActionReceipt ? 'receipt' : 'agent',
          text: answer,
        }
        setMessages((current) => [
          ...current,
          resultMessage,
        ].slice(-LIVING_V3_MESSAGES_LIMIT))

        if (result.terraModelSearch) {
          const search = result.terraModelSearch
          if (search.ok) {
            setTerraWorkbench((current) => ({
              ...current,
              tab: 'web-search',
              internetQuery: search.query,
              internetSearch: search,
              internetSearchStatus: search.status === 'blocked' ? 'blocked' : 'ready',
              internetSearchError: search.error,
              receipt: search.status === 'blocked'
                ? `Terra Action Run blocked safely: ${search.error ?? 'source unavailable'}`
                : `Terra Action Run found ${search.candidates.length}/${search.totalCount} model candidates. Download/slice/print still locked.`,
            }))
          } else {
            setTerraWorkbench((current) => ({
              ...current,
              tab: 'web-search',
              internetSearchStatus: 'failed',
              internetSearchError: search.error,
              receipt: `Terra Action Run failed safely: ${search.error}`,
            }))
          }
          focusRoom('terra-forge', { kind: 'station', id: 'terra-model-hunt' })
        }

        setStationActionReceipts((current) => ({
          ...current,
          'command-table': actionRun ? actionRun.readback : answer,
          ...(actionRun?.targetStationId ? { [actionRun.targetStationId]: `${actionRun.readback} ${actionRun.visualNextStep}` } : {}),
          ...(actionRun ? { 'mission-router': `${actionRun.status}: ${actionRun.readback}` } : {}),
        }))
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setHermesCommandRun({ status: 'failed', label: message, error: message })
        setHermesCommandActionRun({
          runId: `command-error-${Date.now()}`,
          status: 'failed',
          prompt: promptText,
          intent: 'failed',
          capability: 'missing',
          assignedAgentId: 'hermes',
          targetRoomId: 'olympus-command',
          targetStationId: 'command-table',
          readback: `לא הצלחתי להריץ את Command: ${message}`,
          visualNextStep: 'לא בוצעה פעולה חיצונית. אפשר לנסות שוב או לפתוח Proof לפרטים.',
          createdAtMs: startedAt,
          updatedAtMs: Date.now(),
        })
        setControlledAgentRunStates((current) => ({
          ...current,
          'hermes-command': { status: 'failed', label: message },
        }))
        const errorMessage: AgentMessage = {
          id: `hermes-command-error-${Date.now()}`,
          agentId: 'hermes',
          from: 'agent',
          text: `לא הצלחתי לענות כאן: ${message}`,
        }
        setMessages((current) => [
          ...current,
          errorMessage,
        ].slice(-LIVING_V3_MESSAGES_LIMIT))
        setBodyActionError(message)
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      }
    })()
  }

  function askHermesCommand() {
    runHermesCommandPrompt(managerPrompt)
  }

  function approveCouncilConsultation() {
    if (hermesCommandActionRun.intent !== 'council_consultation_offer' || hermesCommandActionRun.status !== 'waiting_operator') return
    const approvedAt = Date.now()
    setCouncilLaunchRequest({
      requestId: `${hermesCommandActionRun.runId}-approved-${approvedAt}`,
      topic: hermesCommandActionRun.prompt,
      autoStart: true,
    })
    setHermesCommandActionRun((current) => ({
      ...current,
      status: 'completed',
      assignedAgentId: 'julius',
      readback: 'אישרת התייעצות. Hermes פתח את המועצה ומפקח על הדיון.',
      visualNextStep: 'המועצה רצה עכשיו. בסיום ההחלטה תחזור ל-Hermes כתוכנית עבודה.',
      updatedAtMs: approvedAt,
    }))
    setHermesCommandRun({ status: 'completed', label: 'Council consultation approved by DLV' })
    setMessages((current) => [
      ...current,
      {
        id: `hermes-council-approved-${approvedAt}`,
        agentId: 'hermes' as const,
        from: 'receipt' as const,
        text: 'אישרת התייעצות. Hermes פתח את המועצה ומפקח על הדיון.',
      },
    ].slice(-LIVING_V3_MESSAGES_LIMIT))
    focusRoom('council-strategists', { kind: 'station', id: 'council-table' })
  }

  function skipCouncilConsultation() {
    if (hermesCommandActionRun.intent !== 'council_consultation_offer' || hermesCommandActionRun.status !== 'waiting_operator') return
    const skippedAt = Date.now()
    setCouncilLaunchRequest(null)
    setHermesCommandActionRun((current) => ({
      ...current,
      status: 'completed',
      readback: 'בחרת להמשיך בלי המועצה. לא הופעל אף Agent נוסף.',
      visualNextStep: 'Hermes נשאר מנהל המשימה. אפשר לדייק את המטרה או לבחור פעולה אחרת.',
      updatedAtMs: skippedAt,
    }))
    setHermesCommandRun({ status: 'completed', label: 'Council consultation skipped by DLV' })
    setMessages((current) => [
      ...current,
      {
        id: `hermes-council-skipped-${skippedAt}`,
        agentId: 'hermes' as const,
        from: 'receipt' as const,
        text: 'ממשיכים בלי המועצה. לא הופעל אף Agent נוסף.',
      },
    ].slice(-LIVING_V3_MESSAGES_LIMIT))
  }

  function executeManagerRoute() {
    const createdAt = Date.now()
    const route = routeWorkspaceToolIntent(managerPrompt, createdAt)
    const targetStationId = route.target.stationId
    const targetStation = targetStationId ? livingV3StationById(targetStationId) : null
    const receipt = `Typed route ${route.routeId}: ${route.stationHandoff.readback} Next: ${route.stationHandoff.nextUiStep}`
    setManagerRoute(route)
    setStationActionReceipts((current) => ({
      ...current,
      'mission-router': receipt,
      ...(targetStationId ? { [targetStationId]: receipt } : {}),
    }))
    setMessages((current) => [
      ...current,
      {
        id: `manager-route-operator-${createdAt}`,
        agentId: 'hermes',
        from: 'operator',
        text: route.taskText,
      },
      {
        id: `manager-route-result-${createdAt}`,
        agentId: 'hermes',
        from: 'agent',
        text: `${route.stationHandoff.readback} ${route.stationHandoff.nextUiStep} Safety: localOnly=true, usageAllowed=false, workerSpawnAllowed=false.`,
      },
    ])

    if (route.target.action === 'open_and_prefill_smart_intake') {
      const mission = createSmartIntakeMission(route.taskText)
      const match = selectedSmartIntakeMatch(mission)
      const imageSet = imageSetForSmartIntakeMatch(mission, match?.matchId)
      setEtsyToolSurface('smart-intake')
      setSmartIntake((current) => ({
        ...current,
        input: route.taskText,
        mission,
        selectedMatchId: match?.matchId,
        selectedImageId: imageSet?.bestImageId,
        error: undefined,
        workerStatus: 'idle',
        workerRun: undefined,
        workerError: undefined,
        workerReceipt: undefined,
        receipt: `Manager route staged Smart Intake mission ${mission.missionId} locally.`,
      }))
      stageSmartIntakeMissionKernelRun(mission, route.taskText, createdAt + 1)
    } else if (route.target.action === 'open_and_prefill_sheet_intake') {
      setEtsyToolSurface('sheet-intake')
      setSheetIntake((current) => ({
        ...current,
        sourceType: 'pasted_text',
        pastedText: route.taskText,
        error: undefined,
        receipt: `Manager route opened Sheet Intake locally. Import remains manual and local-only.`,
      }))
    } else if (route.target.action === 'open_product_gallery') {
      setEtsyToolSurface('sheet-intake')
    }

    if (targetStationId && isEtsyMarketLabStationId(targetStationId)) {
      activateEtsyStationOperator(targetStationId, `Typed route: ${route.recommendation.label}`)
    } else if (targetStation) {
      setAdapterState((state) => assignLivingV3Task(state, {
        agentId: 'hermes',
        kind: route.stationHandoff.status === 'blocked' ? 'approval' : 'work',
        label: `Typed route: ${route.recommendation.label}`,
        roomId: route.target.roomId,
        stationId: targetStation.id,
        badge: route.stationHandoff.status === 'blocked' ? 'blocked' : 'active-task',
        packetLabel: 'typed intent',
      }, createdAt))
    }

    if (targetStationId) {
      focusRoom(route.target.roomId, { kind: 'station', id: targetStationId })
    } else {
      focusRoom(route.target.roomId)
    }
  }

  function applyStationActionPrefill(action: Extract<WorkspaceStationUiAction, { type: 'prefill_tool' }>, result: WorkspaceStationActionRouterResult) {
    if (action.surfaceId === 'smart-intake') {
      const mission = createSmartIntakeMission(action.value)
      const match = selectedSmartIntakeMatch(mission)
      const imageSet = imageSetForSmartIntakeMatch(mission, match?.matchId)
      setEtsyToolSurface('smart-intake')
      setSmartIntake((current) => ({
        ...current,
        input: action.value,
        mission,
        selectedMatchId: match?.matchId,
        selectedImageId: imageSet?.bestImageId,
        error: undefined,
        workerStatus: 'idle',
        workerRun: undefined,
        workerError: undefined,
        workerReceipt: undefined,
        receipt: `Station Action Router V2 staged Smart Intake mission ${mission.missionId} locally. Hermes Action Bridge V3 persists the durable kernel event.`,
      }))
      return
    }

    if (action.surfaceId === 'sheet-intake') {
      setEtsyToolSurface('sheet-intake')
      setSheetIntake((current) => ({
        ...current,
        sourceType: 'pasted_text',
        pastedText: action.value,
        error: undefined,
        receipt: `Station Action Router V2 opened Sheet Intake locally. Import remains manual and local-only.`,
      }))
      return
    }

    if (action.surfaceId === 'etsy-scout') {
      setOracleSearch((current) => ({ ...current, query: action.value, error: undefined }))
      focusRoom('oracle-signals', { kind: 'station', id: 'oracle-signal-basin' })
      setStationActionReceipts((current) => ({
        ...current,
        'oracle-signal-basin': 'Product search text moved to Oracle. Send a signal packet to Etsy after search.',
      }))
      return
    }

    setStationActionReceipts((current) => ({
      ...current,
      [result.route.target.stationId ?? 'mission-router']: `Station Action Router V2 prefilled ${action.surfaceId} locally.`,
    }))
  }

  function queueStationActionMotion(action: Extract<WorkspaceStationUiAction, { type: 'queue_basic_agent_motion' }>, result: WorkspaceStationActionRouterResult, createdAt: number) {
    if (action.stationId && isEtsyMarketLabStationId(action.stationId)) {
      activateEtsyStationOperator(action.stationId, `Station Action Router V2: ${result.route.recommendation.label}`)
      return
    }

    const snapshot = getAgentSnapshot(snapshots, action.agentId)
    setAdapterState((state) => assignLivingV3Task(state, {
      agentId: action.agentId,
      kind: result.route.stationHandoff.status === 'blocked' || result.event.kind === 'request_approval' ? 'approval' : 'work',
      label: action.label,
      roomId: action.roomId,
      stationId: action.stationId,
      from: snapshot ? { roomId: snapshot.roomId, point: snapshot.roomPoint } : undefined,
      badge: result.route.stationHandoff.status === 'blocked' ? 'blocked' : 'active-task',
      packetLabel: 'station event',
    }, createdAt))
  }

  function applyStationActionResult(result: WorkspaceStationActionRouterResult, createdAt: number) {
    let focusTarget: { roomId: LivingV3RoomId; stationId?: LivingV3StationDefinition['id'] } | null = null

    for (const action of result.uiActions) {
      if (action.type === 'focus_station') {
        focusTarget = { roomId: action.roomId, stationId: action.stationId }
      } else if (action.type === 'set_tool_surface') {
        if (action.surfaceId === 'smart-intake') setEtsyToolSurface('smart-intake')
        if (action.surfaceId === 'sheet-intake') setEtsyToolSurface('sheet-intake')
        if (action.surfaceId === 'etsy-scout') setEtsyToolSurface('scout')
      } else if (action.type === 'prefill_tool') {
        applyStationActionPrefill(action, result)
      } else if (action.type === 'stage_packet') {
        setStationActionReceipts((current) => ({
          ...current,
          [result.route.target.stationId ?? 'mission-router']: `${action.packetLabel}: ${action.readback}`,
        }))
      } else if (action.type === 'request_approval_local') {
        setStationActionReceipts((current) => ({
          ...current,
          'mission-router': action.reason,
        }))
        setAdapterState((state) => createLivingV3ApprovalPacket(state, {
          agentId: result.movement.agentId,
          stationId: 'mission-router',
          label: action.reason,
        }, createdAt))
      } else if (action.type === 'record_receipt') {
        setStationActionReceipts((current) => ({
          ...current,
          [action.stationId ?? 'mission-router']: action.receipt,
        }))
      } else {
        queueStationActionMotion(action, result, createdAt)
      }
    }

    if (focusTarget?.stationId) {
      focusRoom(focusTarget.roomId, { kind: 'station', id: focusTarget.stationId })
    } else if (focusTarget) {
      focusRoom(focusTarget.roomId)
    }
  }

  async function persistHermesActionBridgeEvent(result: WorkspaceStationActionRouterResult) {
    const stationId = result.route.target.stationId ?? 'mission-router'
    try {
      const response = await fetch('/api/war-room/workspace-kernel/events', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workspaceKernelEventIngressFromStationAction(result)),
      })
      const payload = await response.json() as WorkspaceKernelApiPayload
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Hermes Action Bridge V3 failed with HTTP ${response.status}`)
      }
      applyWorkspaceKernelApiPayload(payload, true)
      setStationActionReceipts((current) => ({
        ...current,
        [stationId]: `Hermes Action Bridge V3 persisted ${result.event.kind} into Kernel Store V2. ${result.route.stationHandoff.readback}`,
        'mission-router': `Hermes Action Bridge V3 wrote a typed local event for ${result.route.stationHandoff.stationLabel}. Store V2 readback updated.`,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setWorkspaceKernelStoreStatus(`bridge-v3-error: ${message}`)
      setStationActionReceipts((current) => ({
        ...current,
        [stationId]: `Hermes Action Bridge V3 failed closed: ${message}`,
      }))
    }
  }

  function obsidianContextTargetFromSelection(): { roomId: LivingV3RoomId; stationId?: LivingV3StationId } {
    if (selectedStation && isEtsyMarketLabStationId(selectedStation.id)) {
      return { roomId: selectedStation.roomId, stationId: selectedStation.id }
    }
    return { roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt' }
  }

  async function attachObsidianContextPacketLocally() {
    const target = obsidianContextTargetFromSelection()
    setObsidianContextStatus('Attaching allowlisted Obsidian context locally...')
    try {
      const response = await fetch('/api/war-room/obsidian-context/packet', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mission: managerPrompt.trim() || 'Attach scoped Obsidian context to the local Etsy workspace.',
          mode: 'etsy-workspace',
          targetRoomId: target.roomId,
          targetStationId: target.stationId,
        }),
      })
      const payload = await response.json() as WorkspaceKernelApiPayload
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Obsidian Context Packet failed with HTTP ${response.status}`)
      }
      applyWorkspaceKernelApiPayload(payload, true)
      const packet = payload.packet
      const sourceCount = packet?.sourceNotes.length ?? latestObsidianContextPacketFromState(payload.state)?.sourceNotes.length ?? 0
      const receipt = `Hermes Intent/Event Bridge V4 persisted Obsidian Context Packet locally. Sources: ${sourceCount}. writebackAllowed:false.`
      setObsidianContextStatus(receipt)
      setStationActionReceipts((current) => ({
        ...current,
        'mission-router': receipt,
        ...(target.stationId ? { [target.stationId]: receipt } : {}),
      }))
      setMessages((current) => [
        ...current,
        {
          id: `obsidian-context-operator-${Date.now()}`,
          agentId: 'hermes',
          from: 'operator',
          text: managerPrompt.trim() || 'Attach scoped Obsidian context.',
        },
        {
          id: `obsidian-context-result-${Date.now()}`,
          agentId: 'loki',
          from: 'agent',
          text: `${receipt} localOnly=true, usageAllowed=false, workerSpawnAllowed=false.`,
        },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setObsidianContextStatus(`Obsidian Context Packet failed closed: ${message}`)
      setWorkspaceKernelStoreStatus(`obsidian-context-error: ${message}`)
      setStationActionReceipts((current) => ({
        ...current,
        'mission-router': `Obsidian Context Packet failed closed: ${message}`,
      }))
    }
  }

  function executeManagerStationAction() {
    const createdAt = Date.now()
    const result = routeWorkspaceStationActionEvent({
      eventId: `ui-station-action-${createdAt}`,
      source: 'hermes',
      kind: 'prefill_tool',
      taskText: managerPrompt,
      readback: 'Hermes station event requested a local station/tool handoff from Command Room Manager.',
      payload: {
        packetLabel: 'station-action-router-v2',
      },
    }, createdAt)
    const receipt = `Station Action Router V2 ${result.actionId}: ${result.route.stationHandoff.readback} Next: ${result.route.stationHandoff.nextUiStep}`
    setManagerStationActionResult(result)
    setManagerRoute(result.route)
    setStationActionReceipts((current) => ({
      ...current,
      'mission-router': receipt,
    }))
    setMessages((current) => [
      ...current,
      {
        id: `station-action-operator-${createdAt}`,
        agentId: 'hermes',
        from: 'operator',
        text: result.event.taskText,
      },
      {
        id: `station-action-result-${createdAt}`,
        agentId: result.movement.agentId,
        from: 'agent',
        text: `${result.route.stationHandoff.readback} Motion: ${result.movement.mode}. Safety: localOnly=true, usageAllowed=false, workerSpawnAllowed=false.`,
      },
    ])
    applyStationActionResult(result, createdAt)
    void persistHermesActionBridgeEvent(result)
  }

  function createWorkspaceKernelDemoAction(kind: WorkspaceKernelDemoKind, createdAt: number) {
    if (kind === 'etsy-intake') {
      return createWorkspaceAction({
        actionId: `kernel-demo-etsy-${createdAt}`,
        source: 'ui',
        intent: 'Smart intake for Dolaro product research',
        summary: 'Find Dolaro jewelry products from AliExpress links, Google Drive images, Google Sheet rows, local files, and a freeform prompt.',
        input: {
          text: 'Find Dolaro jewelry products from AliExpress links, Google Drive images, Google Sheet rows, local files, and a freeform prompt, then stage the best candidate for ShotLab/SEO/draft approval.',
          urls: ['https://example.com/aliexpress-local-reference', 'https://docs.google.com/spreadsheets/d/local-reference'],
          localPaths: ['/Users/mac/hermes-workspace/data/etsy-market-lab/imports/demo.csv'],
        },
      }, createdAt)
    }
    if (kind === 'cad-print') {
      return createWorkspaceAction({
        actionId: `kernel-demo-cad-${createdAt}`,
        source: 'ui',
        intent: 'CAD / 3D print design packet',
        summary: 'Create an OpenSCAD STL/STEP design packet and print prep readback for a small product fixture.',
        input: {
          text: 'OpenSCAD STL STEP CAD 3D print G-code slicer prep for a local design packet. Do not control a printer.',
        },
      }, createdAt)
    }
    return createWorkspaceAction({
      actionId: `kernel-demo-news-${createdAt}`,
      source: 'ui',
      intent: 'Daily news and content packet',
      summary: 'Create a local daily newspaper/content/video briefing packet for Workspace readback.',
      input: {
        text: 'Daily newspaper briefing content video packet for local readback. Do not send Discord.',
      },
    }, createdAt)
  }

  function stageWorkspaceKernelAction(kind: WorkspaceKernelDemoKind) {
    const createdAt = Date.now()
    const action = createWorkspaceKernelDemoAction(kind, createdAt)
    const route = routeWorkspaceActionToBlueprint(action)
    const run = createWorkspaceRun(route.action, route.blueprint, createdAt)
    const artifact = createWorkspaceArtifactForRun(run, route.blueprint, createdAt + 2)
    let state = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
    if (route.requiresApproval) {
      state = requestWorkspaceApproval(state, run.runId, createWorkspaceApprovalForRun(state.runs[0], route.blueprint, createdAt + 3))
    }
    const nextRun = state.runs[0]
    const packet = workspaceArtifactToRoomPacket(nextRun.artifacts[0])
    const nextRuns = [nextRun, ...workspaceKernelRuns.filter((item) => item.runId !== nextRun.runId)].slice(0, 12)
    setWorkspaceKernelRuns(nextRuns)
    const telemetry = recordWorkspaceKernelTelemetry(nextRun, nextRun.artifacts[0]?.kind)
    void persistWorkspaceKernelStateToStore(nextRuns, telemetry)
    setStationActionReceipts((current) => ({
      ...current,
      'mission-router': `Workspace Kernel staged ${nextRun.blueprintId}: ${packet.kind}. Live actions remain locked.`,
      ...(nextRun.ownerStationId ? { [nextRun.ownerStationId]: `Workspace Kernel staged ${packet.kind} locally. Locked actions: ${packet.lockedActions.length}.` } : {}),
    }))
    setMessages((current) => [
      ...current,
      {
        id: `kernel-action-operator-${createdAt}`,
        agentId: 'hermes',
        from: 'operator',
        text: action.summary,
      },
      {
        id: `kernel-action-result-${createdAt}`,
        agentId: 'hermes',
        from: 'agent',
        text: `${nextRun.readback} Artifact: ${packet.kind}. Approval: ${workspaceKernelApprovalStatus(nextRun)}. Safety: localOnly=true, usageAllowed=false, workerSpawnAllowed=false.`,
      },
    ])
  }

  function openWorkspaceKernelRun(runId: string) {
    const run = workspaceKernelRuns.find((item) => item.runId === runId)
    if (!run) return
    const createdAt = Date.now()
    const stationAction = workspaceRunToStationAction(run, createdAt)
    if (stationAction) {
      setManagerStationActionResult(stationAction)
      setManagerRoute(stationAction.route)
      const telemetry = recordWorkspaceKernelTelemetry(run, run.artifacts[0]?.kind, stationAction)
      void persistWorkspaceKernelStateToStore(workspaceKernelRuns, telemetry)
      applyStationActionResult(stationAction, createdAt)
      return
    }

    const task = workspaceRunToLivingV3Task(run)
    const telemetry = recordWorkspaceKernelTelemetry(run, run.artifacts[0]?.kind)
    void persistWorkspaceKernelStateToStore(workspaceKernelRuns, telemetry, false)
    setAdapterState((state) => assignLivingV3Task(state, task, createdAt))
    setStationActionReceipts((current) => ({
      ...current,
      [run.ownerStationId ?? 'mission-router']: `Workspace Kernel opened ${run.blueprintId}. ${run.nextAction}`,
    }))
    if (run.ownerStationId) {
      focusRoom(run.ownerRoomId, { kind: 'station', id: run.ownerStationId })
    } else {
      focusRoom(run.ownerRoomId)
    }
  }

  function toggleAgentConnectionControl() {
    void (async () => {
      try {
        if (agentControlIsFrozen) {
          await setWarRoomAgentsLocalOnly('Operator prepared local-only body connection; worker usage remains blocked.')
        } else {
          await freezeWarRoomAgents('Operator froze agents from Living V3 HUD.')
        }
        setAgentControlActionError(null)
        await refreshAgentControl()
      } catch (error) {
        setAgentControlActionError(error instanceof Error ? error.message : String(error))
        await refreshAgentControl()
      }
    })()
  }

  function activateOracleScoutLocalRun() {
    if (!bodyRuntimeEnabled || oracleScoutRun.status === 'running') return
    const query = (oracleSearch.query || etsyPipeline.oracleSignalPacket?.selectedKeyword || '').trim()
    if (!query) {
      const message = 'Type a product search in Oracle first.'
      setOracleScoutRun({ status: 'failed', label: message })
      setStationActionReceipts((current) => ({ ...current, 'oracle-signal-basin': message }))
      return
    }
    const startedAt = Date.now()
    setOracleScoutRun({ status: 'running', label: `Oracle Scout reading "${query}"...` })
    setStationActionReceipts((current) => ({
      ...current,
      'oracle-signal-basin': `Oracle Scout local run started: ${query}.`,
    }))
    focusRoom('oracle-signals', { kind: 'station', id: 'oracle-signal-basin' })
    void (async () => {
      try {
        const result = await runOracleScoutLocalIntent(query)
        const packet = isOracleSignalPacket(result.signalPacket) ? result.signalPacket : null
        if (packet) {
          applyOracleSignalPacketFromBridge(packet, `Oracle event bridge delivered ${packet.selectedKeyword} to Etsy Market Lab.`)
        }
        setOracleScoutRun({
          status: result.ok ? 'completed' : 'failed',
          label: result.ok
            ? `Oracle Scout sent ${packet?.selectedKeyword ?? query}`
            : result.error ?? 'Oracle Scout local run failed safely.',
          runId: result.runId,
        })
        setMessages((current) => [
          ...current,
          {
            id: `oracle-scout-run-${startedAt}`,
            agentId: 'oracle',
            from: 'agent',
            text: result.ok
              ? `Local Alura signal packet staged for Etsy Market Lab. Source mode stayed ${result.sourceMode}.`
              : (result.error ?? 'Oracle Scout failed safely.'),
          },
        ])
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setOracleScoutRun({ status: 'failed', label: message })
        setBodyActionError(message)
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      }
    })()
  }

  function activateControlledAgentRun(agentId: ControlledUiAgentId, operatorNote?: string) {
    const config = controlledAgentConfig(agentId)
    const currentRunState = controlledAgentRunStates[agentId]
    if (currentRunState.status === 'running') return
    const startedAt = Date.now()
    const label = controlledAgentLabel(agentId)
    setControlledAgentRunStates((current) => ({
      ...current,
      [agentId]: { status: 'running', label: `${label} running...` },
    }))
    focusRoom(config.roomId, { kind: 'station', id: config.stationId })
    setMessages((current) => [
      ...current,
      {
        id: `${agentId}-controlled-start-${startedAt}`,
        agentId: config.visualAgentId,
        from: 'operator',
        text: `Activate ${label} controlled one-shot.`,
      },
      {
        id: `${agentId}-controlled-local-${startedAt}`,
        agentId: config.visualAgentId,
        from: 'agent',
        text: 'Starting one controlled run. External actions stay locked.',
      },
    ])
    void (async () => {
      try {
        const result = await runControlledAgent(agentId, operatorNote ?? `Operator clicked Activate ${label} in Living V3 HUD.`)
        const output = result.result?.output
        if (result.etsyRoomState) {
          setEtsyRoomState(result.etsyRoomState)
          syncEtsyRoomKernelRuns(result.etsyRoomState, Date.now(), 'product-candidate-packet')
          syncSharedEtsyRoomState(result.etsyRoomState, `${label} applied candidates`)
          recordEtsyStationAction('etsy-loki-product-hunt', `${label} applied candidates`, result.etsyRoomState.lastReceipt)
        }
        setControlledAgentRunStates((current) => ({
          ...current,
          [agentId]: {
            status: result.ok ? 'completed' : 'failed',
            label: result.ok ? `${label} done ${output?.confidence ?? '?'}%` : (result.result?.error ?? result.error ?? `${label} failed`),
            runId: result.runId,
          },
        }))
        setMessages((current) => [
          ...current,
          {
            id: `${agentId}-controlled-result-${Date.now()}`,
            agentId: config.visualAgentId,
            from: 'agent',
            text: output
              ? `${output.summary} Next: ${output.nextSafeStep}. Usage: ${result.result?.usage?.reportedCost ?? result.result?.usage?.reportedUsageLine ?? (result.result?.usage ? `actual cost not reported by Hermes CLI; budget: ${result.result.usage.budget}` : 'one-shot budget recorded')}.`
              : (result.result?.error ?? result.error ?? `${label} run finished without a parsed output.`),
          },
        ])
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setControlledAgentRunStates((current) => ({
          ...current,
          [agentId]: { status: 'failed', label: message },
        }))
        setBodyActionError(message)
        await Promise.all([refreshBodyRuntime(), refreshAgentControl()])
      }
    })()
  }

  function transferCouncilDecisionToHermes(handoff: CouncilDecisionHandoff) {
    const createdAt = Date.now()
    const councilRun = createCouncilHandoffWorkspaceRun(handoff, createdAt)
    const nextRuns = [councilRun, ...workspaceKernelRuns.filter((run) => run.runId !== councilRun.runId)].slice(0, 18)
    const councilArtifactKind = councilRun.artifacts[0]?.kind
    const telemetry = recordWorkspaceKernelTelemetry(councilRun, councilArtifactKind)
    setWorkspaceKernelRuns(nextRuns)
    setWorkspaceKernelEvents(nextRuns.flatMap((run) => run.events))
    void persistWorkspaceKernelStateToStore(nextRuns, telemetry)
    setManagerPrompt(handoff.prompt)
    setHermesCommandRun({
      status: 'idle',
      label: `Council packet ready for Hermes Command: ${handoff.packetId}`,
    })
    setStationActionReceipts((current) => ({
      ...current,
      'council-table': `Council decision ${handoff.packetId} transferred to Hermes Command and staged in the Mission Spine.`,
      'command-table': `Council decision ${handoff.packetId} routed by Hermes to ${councilRun.ownerRoomId}${councilRun.ownerStationId ? ` / ${councilRun.ownerStationId}` : ''}.`,
      [councilRun.ownerStationId ?? 'mission-router']: `Mission Spine received ${handoff.packetId}: ${councilRun.readback}`,
    }))
    setMessages((current) => [
      ...current,
      {
        id: `council-handoff-operator-${createdAt}`,
        agentId: 'hermes' as const,
        from: 'operator' as const,
        text: handoff.prompt,
      },
      {
        id: `council-handoff-hermes-${createdAt}`,
        agentId: 'hermes' as const,
        from: 'agent' as const,
        text: `Council packet ${handoff.packetId} is loaded into Hermes Command. Press Ask Hermes when you want to discuss execution.`,
      },
    ].slice(-LIVING_V3_MESSAGES_LIMIT))
    setAdapterState((state) => assignLivingV3Task(state, {
      agentId: 'hermes',
      kind: 'talk',
      label: `Review council decision: ${handoff.verdict}`,
      roomId: 'olympus-command',
      stationId: 'command-table',
      badge: 'approval',
      packetLabel: 'council packet',
    }, createdAt))
    focusRoom('olympus-command', { kind: 'station', id: 'command-table' })
  }

  return (
    <section
      className={`living-v3 living-v3--${camera.focusedRoomId ? 'room' : 'map'} living-v3--zoom-${zoomLevel} ${etsyFocusMode ? 'living-v3--etsy-focus-mode' : ''} ${goblinFocusMode ? 'living-v3--goblin-focus-mode' : ''} ${selectedStationUsesEtsyWorkspace ? 'living-v3--etsy-primary-workspace' : ''} ${selectedStationUsesGoblinWorkspace ? 'living-v3--goblin-primary-workspace' : ''} ${selectedStationUsesAtlantisWorkspace ? 'living-v3--atlantis-primary-workspace' : ''} ${selectedStationUsesTerraWorkspace ? 'living-v3--terra-primary-workspace' : ''} ${selectedStationUsesCouncilWorkspace ? 'living-v3--council-primary-workspace' : ''} ${selectedStationUsesOracleWorkspace ? 'living-v3--oracle-primary-workspace' : ''} ${selectedStationUsesGatewayLayer ? 'living-v3--gateway-active-layer' : ''} ${commandFocusModeActive ? 'living-v3--command-focus-mode' : ''} ${councilCleanStageActive ? 'living-v3--council-clean-stage' : ''} ${navigationDebugOpen ? 'living-v3--navigation-debug' : ''}`}
      data-living-v3-root
      data-zoom-level={zoomLevel}
      data-etsy-focus-mode={etsyFocusMode ? 'true' : 'false'}
      data-goblin-focus-mode={goblinFocusMode ? 'true' : 'false'}
      data-etsy-primary-workspace-active={selectedStationUsesEtsyWorkspace ? 'true' : 'false'}
      data-goblin-primary-workspace-active={selectedStationUsesGoblinWorkspace ? 'true' : 'false'}
      data-atlantis-primary-workspace-active={selectedStationUsesAtlantisWorkspace ? 'true' : 'false'}
      data-terra-primary-workspace-active={selectedStationUsesTerraWorkspace ? 'true' : 'false'}
      data-council-primary-workspace-active={selectedStationUsesCouncilWorkspace ? 'true' : 'false'}
      data-oracle-primary-workspace-active={selectedStationUsesOracleWorkspace ? 'true' : 'false'}
      data-gateway-active-layer={selectedStationUsesGatewayLayer ? 'true' : 'false'}
      data-council-clean-stage={councilCleanStageActive ? 'true' : 'false'}
      data-command-focus-mode={commandFocusModeActive ? 'true' : 'false'}
      data-navigation-debug={navigationDebugOpen ? 'true' : 'false'}
    >
      <header className="living-v3__hud living-v3__hud--clean" aria-label="Living War Room V3 controls">
        <div className="living-v3__tabs living-v3__tabs--clean">
          <button className={!camera.focusedRoomId ? 'is-active' : ''} type="button" onClick={focusMap}>Map</button>
          <select
            className="living-v3__room-picker"
            aria-label="Go to War Room"
            value={camera.focusedRoomId ?? ''}
            onChange={(event) => {
              const roomId = event.target.value as LivingV3RoomId | ''
              if (roomId) focusRoom(roomId)
              else focusMap()
            }}
          >
            <option value="">Room picker</option>
            {LIVING_V3_WORLD_CONFIG.rooms.map((room) => (
        <option key={room.id} value={room.id}>{room.label}</option>
      ))}
          </select>
          <span className="living-v3__safety-pill" title={agentControlTitle}>
            {agentControlIsFrozen ? 'Standby' : 'Manual control'}
          </span>
        </div>
        {!councilCleanStageActive && !commandFocusModeActive && (
          <div className="living-v3__actions living-v3__actions--clean">
            <button
              className="living-v3__agent-run living-v3__command-open"
              type="button"
              onClick={() => focusRoom('olympus-command', { kind: 'station', id: 'command-table' })}
              aria-label="Open Hermes Command"
              title="Open the clean Hermes command desk"
            >
              Command
            </button>
            <button
              className="living-v3__agent-control-toggle"
              type="button"
              onClick={toggleAgentConnectionControl}
              aria-label={agentControlIsFrozen ? 'Prepare agent connection' : 'Freeze agents and stop usage'}
              title={agentControlIsFrozen ? 'Prepare connection' : 'Freeze agents / stop usage'}
            >
              {agentControlIsFrozen ? 'Prepare' : 'Freeze'}
            </button>
            <details className="living-v3__system-menu">
              <summary aria-label="Open proof and system tools">⚙︎</summary>
              <div>
                <button
                  className="living-v3__agent-run living-v3__council-open"
                  type="button"
                  onClick={() => focusRoom('council-strategists')}
                  aria-label="Open Council of Strategists room"
                  title="Open Council room first; click the table only when you want the station"
                >
                  Council
                </button>
                <button
                  className="living-v3__oracle-scout-run"
                  type="button"
                  onClick={activateOracleScoutLocalRun}
                  disabled={!bodyRuntimeEnabled || oracleScoutRun.status === 'running'}
                  aria-label="Run Oracle Scout local event bridge"
                  title={bodyRuntimeEnabled ? oracleScoutRun.label : 'Open with bodyRuntime=1 to run Oracle Scout locally'}
                >
                  {oracleScoutRun.status === 'running' ? 'Oracle...' : 'Oracle Scout'}
                </button>
                {controlledAgentButtons.map((agent) => {
                  const runState = controlledAgentRunStates[agent.agentId]
                  return (
                    <button
                      key={agent.agentId}
                      className="living-v3__agent-run"
                      type="button"
                      onClick={() => activateControlledAgentRun(agent.agentId)}
                      disabled={!bodyRuntimeEnabled || runState.status === 'running'}
                      aria-label={`Activate ${agent.label} controlled one-shot`}
                      title={bodyRuntimeEnabled ? runState.label : `Open with bodyRuntime=1 to activate ${agent.label}`}
                    >
                      {agent.label}
                    </button>
                  )
                })}
                <button
                  className="living-v3__agent-control-toggle living-v3__nav-debug-toggle"
                  type="button"
                  onClick={() => setNavigationDebugOpen((value) => !value)}
                  aria-pressed={navigationDebugOpen ? 'true' : 'false'}
                  aria-label={navigationDebugOpen ? 'Hide movement debug overlay' : 'Show movement debug overlay'}
                  title="Show dynamic doors, bridge routes, and blocked movement readback"
                >
                  {navigationDebugOpen ? 'Path on' : 'Path'}
                </button>
                <button type="button" onClick={runDemoWorkflow} aria-label="Run demo workflow" title="Run demo workflow">Demo</button>
                <button type="button" onClick={sendEveryoneToRest} aria-label="Send agents to Rest Hall" title="Send agents to Rest Hall">Rest</button>
                <button type="button" onClick={createLocalApproval} aria-label="Create approval packet" title="Create approval packet">Approval</button>
              </div>
            </details>
          </div>
        )}
      </header>

      {selectedStation && (
        <button
          className="living-v3__workspace-close-x"
          type="button"
          onClick={focusMap}
          aria-label={`Close ${selectedStation.label} tool`}
          title="Close tool"
        >
          ×
        </button>
      )}

      {!councilCleanStageActive && !commandFocusModeActive && !selectedStationSuppressesGlobalOverlays && !selectedStationUsesGoblinWorkspace && !selectedStationUsesAtlantisWorkspace && (
        <WorkspaceCoreOpsPanel
          snapshot={workspaceCoreOpsSnapshot}
          storeStatus={workspaceKernelStoreStatus}
          persistence={workspaceKernelPersistence}
          onOpenRoom={focusRoom}
          onApprovalDecision={decideWorkspaceCoreOpsApproval}
        />
      )}

      <div
        ref={stageRef}
        className="living-v3__stage"
        aria-label="Living V3 world map"
        aria-hidden={commandFocusModeActive ? true : undefined}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
      >
        <div className="living-v3__world" style={worldStyle}>
          <div className="living-v3__grid" />
          {LIVING_V3_WORLD_CONFIG.bridges.map((bridge) => {
            const frameIndex = Math.floor(nowMs / 180) % bridge.frameCount
            return (
            <div
              key={bridge.id}
              className={`living-v3__bridge living-v3__bridge--${bridge.orientation}`}
              style={{
                left: bridge.world.x,
                top: bridge.world.y,
                width: bridge.world.w,
                height: bridge.world.h,
                ...frameStyle(bridge.assetPath, frameIndex, bridge.frameCount),
              }}
              aria-label={bridge.label}
            />
            )
          })}
          {LIVING_V3_WORLD_CONFIG.rooms.map((room) => {
            const status = roomStatuses.find((candidate) => candidate.roomId === room.id)
            const badges = roomBadges(room.id, snapshots, visualAdapterState)
            const doorIsOpen = snapshots.some((snapshot) => snapshot.roomId === room.id && ['walking', 'carrying'].includes(snapshot.activity))
            return (
              <button
                key={room.id}
                className={`living-v3__room living-v3__room--${room.status} ${camera.focusedRoomId === room.id ? 'is-focused' : ''}`}
                type="button"
                style={{
                  left: room.world.x,
                  top: room.world.y,
                  width: room.world.w,
                  height: room.world.h,
                  backgroundImage: `url("${room.assetPath}")`,
                }}
                title={`${room.label}: A${status?.activeAgents ?? 0} / !${status?.alerts ?? 0} / L${status?.approvals ?? 0}`}
                onClick={() => {
                  if (consumeDragClick()) return
                  focusRoom(room.id)
                }}
              >
                <span className="living-v3__room-title">{room.label}</span>
                <span className="living-v3__room-status">
                  {status?.activeAgents ?? 0} agents · {status?.activeTasks ?? 0} tasks
                </span>
                <span
                  className={`living-v3__door ${doorIsOpen ? 'is-open' : ''}`}
                  style={{ backgroundImage: `url("${livingV3AssetPath(doorIsOpen ? 'icons/door-open.png' : 'icons/door-closed.png')}")` }}
                />
                <span className="living-v3__room-badges">
                  {badges.map((badge) => (
                    <span key={badge.id} className={`living-v3__badge living-v3__badge--${badge.badge}`} title={badge.label}>
                      {badgeLabels[badge.badge]}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}

          {navigationDebugOpen && !selectedStationSuppressesGlobalOverlays && navigationDebugSnapshots.length > 0 && (
            <svg
              className="living-v3__nav-debug-overlay"
              viewBox={`0 0 ${LIVING_V3_WORLD_CONFIG.worldSize.w} ${LIVING_V3_WORLD_CONFIG.worldSize.h}`}
              aria-hidden="true"
            >
              {navigationDebugSnapshots.map((snapshot) => {
                const agent = livingV3AgentById(snapshot.agentId)
                const points = snapshot.navigation.waypoints.map((waypoint) => `${waypoint.world.x},${waypoint.world.y}`).join(' ')
                return (
                  <g key={snapshot.agentId}>
                    <polyline points={points} style={{ stroke: agent?.accent ?? '#72e0d4' }} />
                    {snapshot.navigation.waypoints.map((waypoint) => (
                      <circle
                        key={`${snapshot.agentId}:${waypoint.id}`}
                        className={`living-v3__nav-debug-point living-v3__nav-debug-point--${waypoint.kind}`}
                        cx={waypoint.world.x}
                        cy={waypoint.world.y}
                        r={waypoint.kind === 'bridge' ? 9 : waypoint.kind === 'door' ? 7 : 5}
                      />
                    ))}
                  </g>
                )
              })}
            </svg>
          )}

          {navigationDoors.map((door) => (
            <span
              key={door.id}
              className={`living-v3__nav-door living-v3__nav-door--${door.side} ${openNavigationDoorIds.has(door.id) ? 'is-open' : ''}`}
              data-navigation-door-id={door.id}
              data-room-id={door.roomId}
              data-bridge-id={door.bridgeId}
              style={{ left: door.world.x, top: door.world.y }}
              title={door.label}
            />
          ))}

          {LIVING_V3_WORLD_CONFIG.stations.map((station) => {
            const rect = percentRectToWorld(station.roomId, station.bounds)
            const activeTask = activeStationTask(visualAdapterState, station.id)
            const alert = visualAdapterState.alerts.find((candidate) => candidate.stationId === station.id)
            const frameIndex = Math.floor(nowMs / 180) % station.frameCount
            const scaledWidth = rect.w * LIVING_V3_WORLD_CONFIG.scale.station
            const scaledHeight = rect.h * LIVING_V3_WORLD_CONFIG.scale.station
            const operatorWorld = livingV3RoomLocalToWorld(station.roomId, station.operatorSpot)
            return (
              <div key={station.id} className="living-v3__station-wrap">
                <button
                  className={`living-v3__station ${activeTask ? 'is-active' : ''} ${alert ? 'has-alert' : ''}`}
                  type="button"
                  data-room-id={station.roomId}
                  data-station-id={station.id}
                  style={{
                    left: rect.x + (rect.w - scaledWidth) / 2,
                    top: rect.y + (rect.h - scaledHeight) / 2,
                    width: scaledWidth,
                    height: scaledHeight,
                    ...frameStyle(station.assetPath, frameIndex, station.frameCount),
                  }}
                  onClick={() => {
                    if (consumeDragClick()) return
                    if (isEtsyMarketLabStationId(station.id)) activateEtsyStationOperator(station.id)
                    if (isTerraForgeStationId(station.id)) {
                      const terraStationId = station.id
                      setTerraWorkbench((current) => ({ ...current, tab: terraWorkbenchTabForStation(terraStationId), receipt: undefined }))
                    }
                    setSelection({ kind: 'station', id: station.id })
                    focusRoom(station.roomId, { kind: 'station', id: station.id })
                  }}
                  title={station.label}
                >
                  <span>{station.label}</span>
                </button>
                <span
                  className="living-v3__operator-pin"
                  style={{ left: operatorWorld.x, top: operatorWorld.y }}
                  title={`${station.label} operator spot`}
                />
                {(activeTask || alert) && (
                  <span
                    className={`living-v3__station-badge living-v3__badge--${alert?.badge ?? activeTask?.badge}`}
                    style={{ left: rect.x + rect.w - 8, top: rect.y - 10 }}
                    title={alert?.label ?? activeTask?.label ?? station.role}
                  >
                    {badgeLabels[alert?.badge ?? activeTask?.badge ?? 'active-task']}
                  </span>
                )}
              </div>
            )
          })}

          {visibleSnapshots.map((snapshot) => {
            const agent = livingV3AgentById(snapshot.agentId)
            if (!agent) return null
            return (
              <button
                key={snapshot.agentId}
                className={`living-v3__agent living-v3__agent--${snapshot.activity} living-v3__agent--${snapshot.agentId} ${selection?.kind === 'agent' && selection.id === snapshot.agentId ? 'is-selected' : ''}`}
                data-agent-id={snapshot.agentId}
                data-agent-activity={snapshot.activity}
                data-agent-direction={snapshot.direction}
                data-agent-animation-state={snapshot.animationState}
                type="button"
                style={{
                  left: snapshot.world.x,
                  top: snapshot.world.y,
                  '--agent-accent': agent.accent,
                } as CSSProperties}
                onClick={() => {
                  if (consumeDragClick()) return
                  setSelection({ kind: 'agent', id: snapshot.agentId })
                  focusRoom(snapshot.roomId, { kind: 'agent', id: snapshot.agentId })
                }}
                title={`${agent.label}: ${activityLabels[snapshot.activity]}`}
              >
                <span
                  className="living-v3__agent-sprite"
                  style={frameStyle(snapshot.clipPath, snapshot.spriteFrameIndex, snapshot.spriteFrameCount)}
                />
                <span className="living-v3__agent-tag">
                  <b>{agent.shortLabel}</b>
                  <small>{activityLabels[snapshot.activity]}</small>
                </span>
                {snapshot.packetLabel && <span className="living-v3__packet" title={snapshot.packetLabel}>{snapshot.packetLabel}</span>}
                <span className={`living-v3__agent-badge living-v3__badge--${snapshot.badge}`} title={snapshot.label}>{badgeLabels[snapshot.badge]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {focusedRoom && !councilCleanStageActive && !commandFocusModeActive && !selectedStationSuppressesGlobalOverlays && (
        <div className="living-v3__room-edge" aria-label="Focused room controls">
          <button type="button" onClick={focusMap}>Map</button>
          <div>
            <h2>{focusedRoom.label}</h2>
            <span>A{focusedRoomSnapshots.length} · !{focusedRoomStatus?.alerts ?? 0} · L{focusedRoomStatus?.approvals ?? 0}</span>
            {focusedRoom.id === 'etsy-market-lab' && <span>Local-only product lab · no live Etsy, Alura, supplier, Sheets, or ShotLab calls</span>}
            {focusedRoom.id === 'agora-opportunity' && <span>Goblin intelligence room · read-only · no Etsy writes or supplier messages</span>}
            {focusedRoom.id === 'terra-forge' && <span>3D skill room · modeling, model hunt, printer status · machine actions locked</span>}
          </div>
          {focusedRoom.id === 'etsy-market-lab' && (
            <div className="living-v3__room-pipeline-mini" aria-label="Etsy Market Lab pipeline status">
              <b>{etsyPipelineStageLabel(etsyPipeline.stage)}</b>
              <span>{etsyPipeline.searchPacket?.requestText || 'No request yet'}</span>
              <span>{activeEtsyProductCandidate(etsyPipeline)?.title || 'No product selected'}</span>
              <small>{etsyPipeline.lastReceipt || 'Local-only pipeline ready'}</small>
            </div>
          )}
          {focusedRoom.id === 'terra-forge' && (
            <div className="living-v3__room-pipeline-mini living-v3__room-pipeline-mini--terra" aria-label="Terra Forge tool status">
              <b>Terra Forge</b>
              <span>Modeling Studio · Model Hunt · Printer Control</span>
              <span>{terraModelAssets?.totalMatches ?? 0} local 3MF · printer {terraPrinterStatus?.state ?? 'checking'}</span>
              <small>Previews + live camera read-only · machine actions locked</small>
            </div>
          )}
          <div className="living-v3__room-agent-strip">
            {focusedRoomSnapshots.map((snapshot) => {
              const agent = livingV3AgentById(snapshot.agentId)
              return agent ? (
                <button key={agent.id} type="button" onClick={() => setSelection({ kind: 'agent', id: agent.id })} title={`${agent.label}: ${activityLabels[snapshot.activity]}`}>
                  <b>{agent.shortLabel}</b>
                  <span>{activityLabels[snapshot.activity]}</span>
                </button>
              ) : null
            })}
          </div>
        </div>
      )}

      {!councilCleanStageActive && !commandFocusModeActive && !selectedStationSuppressesGlobalOverlays && (visualAdapterState.alerts.length > 0 || visualAdapterState.approvals.length > 0) && (
        <details className="living-v3__alert-stack living-v3__alert-stack--debug" aria-label="Living V3 alerts" data-alert-stack-debug="collapsed-v1">
          <summary>System alerts · {visualAdapterState.alerts.length + visualAdapterState.approvals.length}</summary>
          {visualAdapterState.alerts.slice(0, 3).map((alert) => (
            <button key={alert.id} type="button" aria-label={alert.label} title={alert.label} onClick={() => {
              if (alert.stationId) focusRoom(alert.roomId, { kind: 'station', id: alert.stationId })
              else focusRoom(alert.roomId)
            }}>
              <b title={alert.label}>{badgeLabels[alert.badge]}</b>
              <span>{alert.label}</span>
            </button>
          ))}
          {visualAdapterState.approvals.slice(0, 2).map((approval) => {
            const station = livingV3StationById(approval.stationId)
            return (
              <button key={approval.id} type="button" aria-label={approval.label} title={approval.label} onClick={() => station && focusRoom(station.roomId, { kind: 'station', id: approval.stationId })}>
                <b title={approval.label}>L</b>
                <span>{approval.label}</span>
              </button>
            )
          })}
        </details>
      )}

      {navigationDebugOpen && !councilCleanStageActive && !selectedStationSuppressesGlobalOverlays && (
        <div className="living-v3__nav-debug-panel" aria-label="Movement route debug">
          <b>Movement Debug</b>
          <span>{navigationDoors.length} dynamic doors · {LIVING_V3_WORLD_CONFIG.bridges.length} bridges</span>
          {navigationDebugSnapshots.slice(0, 5).map((snapshot) => {
            const agent = livingV3AgentById(snapshot.agentId)
            return (
              <small key={snapshot.agentId} title={snapshot.navigation.roomPath.join(' → ')}>
                {agent?.shortLabel ?? snapshot.agentId}: {snapshot.navigation.status} · {snapshot.navigation.segmentLabel} · doors {snapshot.navigation.doorIds.length}
              </small>
            )
          })}
          {!navigationDebugSnapshots.length && <small>No active bridge route right now.</small>}
        </div>
      )}

      {navigationDebugOpen && workspaceKernelTelemetry && !selectedStationSuppressesGlobalOverlays && !selectedStationUsesEtsyWorkspace && !selectedStationUsesTerraWorkspace && !councilCleanStageActive && (
        <div
          className="living-v3__kernel-telemetry-strip"
          aria-label="Persistent workspace kernel telemetry"
          data-workspace-kernel-store="v2"
          data-workspace-kernel-event-count={workspaceKernelEvents.length}
          data-workspace-kernel-last-run-id={workspaceKernelTelemetry.runId}
          data-workspace-kernel-last-blueprint-id={workspaceKernelTelemetry.blueprintId}
          data-workspace-kernel-last-station-action-id={workspaceKernelTelemetry.stationActionId ?? ''}
          data-workspace-kernel-last-agent={workspaceKernelTelemetry.agentId}
          data-workspace-kernel-last-motion={workspaceKernelTelemetry.motion}
          data-workspace-kernel-last-room={workspaceKernelTelemetry.roomId}
          data-workspace-kernel-last-station={workspaceKernelTelemetry.stationId ?? ''}
          data-workspace-kernel-last-artifact={workspaceKernelTelemetry.artifactKind}
          data-workspace-kernel-last-approval={workspaceKernelTelemetry.approvalStatus}
          data-workspace-kernel-safety={workspaceKernelTelemetry.safety}
        >
          <b>Kernel</b>
          <span>{workspaceKernelTelemetry.agentId} · {workspaceKernelTelemetry.motion}</span>
          <small>{workspaceKernelTelemetry.roomId}{workspaceKernelTelemetry.stationId ? ` / ${workspaceKernelTelemetry.stationId}` : ''}</small>
          <small>{workspaceKernelTelemetry.artifactKind} · approval {workspaceKernelTelemetry.approvalStatus} · locked {workspaceKernelTelemetry.lockedActionCount}</small>
        </div>
      )}

      {navigationDebugOpen && !selectedStationSuppressesGlobalOverlays && !selectedStationUsesEtsyWorkspace && !selectedStationUsesTerraWorkspace && !councilCleanStageActive && ((bodyRuntimeEnabled && oracleBridgeReadback.length > 0) || localEtsyRoomReadback.length > 0 || managerStationActionResult) && (
        <div className="living-v3__event-readback" aria-label="Living V3 event readback">
          <b>Body Event Bridge</b>
          {oracleBridgeReadback.map((event) => (
            <span
              key={event.eventId}
              className={bidiClassNameFor(typeof event.payload?.readback === 'string' ? event.payload.readback : event.type)}
              dir={textDirectionFor(typeof event.payload?.readback === 'string' ? event.payload.readback : event.type)}
              title={event.error ?? JSON.stringify(event.payload ?? {})}
            >
              {typeof event.payload?.readback === 'string' ? event.payload.readback : event.type}
            </span>
          ))}
          {localEtsyRoomReadback.map((event) => (
            <span
              key={event.eventId}
              className={bidiClassNameFor(event.readback)}
              dir={textDirectionFor(event.readback)}
              title={event.packetId ?? event.type}
            >
              {event.readback}
            </span>
          ))}
          {managerStationActionResult && (
            <div
              className={`living-v3__event-station-action is-${managerStationActionResult.route.stationHandoff.status}`}
              data-station-action-id={managerStationActionResult.actionId}
              data-station-action-kind={managerStationActionResult.event.kind}
              data-station-action-agent={managerStationActionResult.movement.agentId}
              data-station-action-motion={managerStationActionResult.movement.mode}
            >
              <b>Station Action Router V2</b>
              <span>{managerStationActionResult.route.stationHandoff.stationLabel}</span>
              <small>{managerStationActionResult.route.stationHandoff.readback}</small>
              <small>
                {managerStationActionResult.movement.agentId} · {managerStationActionResult.movement.mode}
              </small>
            </div>
          )}
        </div>
      )}

      {selectedStationUsesEtsyWorkspace && selectedStation && (
        <EtsyMarketLabPrimaryWorkspace
          selectedStation={selectedStation}
          workspaceState={etsyWorkspaceState}
          handlers={etsyPipelineHandlers}
          operatorLabel={selectedEtsyOperator?.label ?? 'Local operator'}
          operatorStatus={activityLabels[selectedEtsyOperatorSnapshot?.activity ?? 'idle']}
          stationSurface={renderEtsyStationApp(selectedStation.id, etsyPipeline, etsyPipelineHandlers)}
          stationReceipt={stationActionReceipts[selectedStation.id]}
          onOpenOpportunityResearch={() => focusRoom('agora-opportunity', { kind: 'station', id: 'agora-intake' })}
          onResetPipeline={etsyPipelineHandlers.resetPipeline}
          onSelectStation={etsyPipelineHandlers.goToStation}
        />
      )}

      {selectedStationUsesTerraWorkspace && (
        <TerraForgePrimaryWorkspace
          selectedStation={selectedStation}
          modelAssets={terraModelAssets}
          modelAssetsLoading={terraModelAssetsLoading}
          modelAssetsError={terraModelAssetsError}
          printerStatus={terraPrinterStatus}
          printerLoading={terraPrinterLoading}
          printerError={terraPrinterError}
          printerFrameNonce={terraPrinterFrameNonce}
          capabilities={terraCapabilities}
          capabilitiesLoading={terraCapabilitiesLoading}
          capabilitiesError={terraCapabilitiesError}
          state={terraWorkbench}
          onUpdateState={updateTerraWorkbench}
          onSwitchRoom={(roomId) => focusRoom(roomId)}
          onSelectStation={(stationId) => {
            setTerraWorkbench((current) => ({ ...current, tab: terraWorkbenchTabForStation(stationId), receipt: undefined }))
            setSelection({ kind: 'station', id: stationId })
            focusRoom('terra-forge', { kind: 'station', id: stationId })
          }}
          onRefreshModelAssets={() => { void refreshTerraModelAssets() }}
          onRefreshPrinter={() => { void refreshTerraPrinterStatus() }}
          onRequestPrinterFrame={() => { setTerraPrinterFrameNonce(Date.now()); void refreshTerraPrinterStatus() }}
          onRefreshCapabilities={() => { void refreshTerraCapabilities() }}
          onRunInternetModelSearch={() => { void runTerraInternetModelSearch() }}
          onStageInternetCandidate={stageTerraInternetCandidate}
          onBuildSlicePlan={(payload) => { void buildTerraSlicePlan(payload) }}
          onRunPrintQa={(options) => { void runTerraPrintQa(options) }}
          onStageReceipt={stageTerraReceipt}
        />
      )}

      {selectedStationUsesOracleWorkspace && (
        <OracleWorkbench
          resultCount={oracleSearch.result?.keywordResults.length ?? 0}
          selectedKeyword={oracleSearch.result?.keywordResults.find((result) => result.id === oracleSearch.selectedKeywordId)?.keyword
            ?? oracleSearch.result?.keywordResults[0]?.keyword}
          sourceModeLabel={oracleAluraSourceModeLabels[oracleSearch.sourceMode]}
          receipt={stationActionReceipts[selectedStation.id]}
        >
          <OracleAluraLocalSearchApp state={oracleSearch} handlers={oracleSearchHandlers} />
        </OracleWorkbench>
      )}

      {selectedStationUsesGoblinWorkspace && (
        <GoblinAnalyticsShell
          variant="primary"
          onClose={() => focusRoom(selectedStation.roomId)}
          onMissionStaged={(result) => {
            setEtsyRoomState({
              ...etsyRoomState,
              researchMissionPacket: result.packet,
              lastReceipt: result.readback,
              run: {
                ...etsyRoomState.run,
                updatedAtMs: Date.now(),
              },
            })
          }}
        />
      )}

      {selectedStationUsesAtlantisWorkspace && (
        <AtlantisVaultSurface
          variant="primary"
          navigationSlot={(
            <WarRoomQuickSwitch
              value={selectedStation.roomId}
              label="Switch War Room from Atlantis Vault"
              onSwitch={(roomId) => focusRoom(roomId)}
            />
          )}
        />
      )}

      {selectedStationUsesCouncilWorkspace && (
        <CouncilChamberSurface
          launchRequest={councilLaunchRequest}
          onTransferToHermes={transferCouncilDecisionToHermes}
        />
      )}

      {(selectedAgent && selectedSnapshot) || (selectedStation && !selectedStationUsesEtsyWorkspace && !selectedStationUsesGoblinWorkspace && !selectedStationUsesAtlantisWorkspace && !selectedStationUsesTerraWorkspace && !selectedStationUsesCouncilWorkspace && !selectedStationUsesOracleWorkspace) ? (
        <aside
          className={`living-v3__drawer ${selectedAgent ? 'living-v3__drawer--agent-window' : ''} ${selectedStationIsEtsy ? 'living-v3__drawer--etsy-app' : selectedStationIsOracle ? 'living-v3__drawer--oracle-app' : selectedStationIsGoblin ? 'living-v3__drawer--goblin-app' : selectedStationIsAtlantis ? 'living-v3__drawer--atlantis-app' : selectedStationIsTerra ? 'living-v3__drawer--terra-app' : selectedStationIsCommandManager ? 'living-v3__drawer--manager' : selectedStationUsesGatewayLayer ? 'living-v3__drawer--gateway-app' : ''}`}
          style={selectedAgentWindowLayout ? agentWindowLayoutStyle(selectedAgentWindowLayout) : undefined}
          data-agent-window-layout={selectedAgent ? 'persistent-draggable-resizable' : undefined}
          aria-label="Living V3 detail drawer"
        >
          {selectedAgent && selectedSnapshot && selectedAgentWindowLayout && (
            <AgentWorkbenchPanel
              agent={selectedAgent}
              snapshot={selectedSnapshot}
              roomLabel={livingV3RoomById(selectedSnapshot.roomId)?.label ?? selectedSnapshot.roomId}
              windowSizeLabel={`${Math.round(selectedAgentWindowLayout.w)}×${Math.round(selectedAgentWindowLayout.h)}`}
              messages={selectedMessages}
              draft={drafts[selectedAgent.id] ?? ''}
              stations={selectedAgent.primaryStationIds.flatMap((stationId) => {
                const station = livingV3StationById(stationId)
                return station ? [{ id: station.id, label: station.label }] : []
              })}
              onDraftChange={(value) => setDrafts((current) => ({ ...current, [selectedAgent.id]: value }))}
              onSubmit={(event) => sendAgentMessage(selectedAgent.id, event)}
              onAssignStation={(stationId) => assignStation(selectedAgent.id, stationId)}
              onRest={() => {
                void (async () => {
                  const ok = await tryBodyIntent({ type: 'rest', agentId: selectedAgent.id, correlationId: `ui-agent-rest-${selectedAgent.id}-${Date.now()}` })
                  if (!ok) setAdapterState((state) => moveLivingV3AgentToRoom(state, selectedAgent.id, 'pantheon-quarters'))
                })()
              }}
              onFitWindow={() => fitAgentWindowLayout(selectedAgent.id)}
              onResetWindow={() => resetAgentWindowLayout(selectedAgent.id)}
              onClose={() => setSelection(null)}
              onBeginMove={(event) => beginAgentWindowLayoutAction(event, selectedAgent.id, 'move')}
              onBeginResize={(event) => beginAgentWindowLayoutAction(event, selectedAgent.id, 'resize')}
            />
          )}

          {selectedStation && (
            <>
              <StationWorkbenchHeader
                roomLabel={livingV3RoomById(selectedStation.roomId)?.label ?? selectedStation.roomId}
                stationLabel={selectedStation.label}
                role={selectedStation.role}
                modeLabel={selectedStationIsCommandManager
                  ? 'Command workbench'
                  : selectedStationUsesGatewayLayer
                    ? 'Gateway workbench'
                    : selectedStationIsOracle
                      ? 'Oracle signal workbench'
                      : 'Station workbench'}
                localOnly={!selectedStationUsesGatewayLayer || !bodyRuntimeEnabled}
                hasReadback={selectedStationIsEtsy
                  ? Boolean(etsyRoomState.lastReceipt ?? etsyPipeline.lastReceipt)
                  : false}
              />
              {selectedStationIsEtsy ? (
                <div
                  className="living-v3__etsy-shell"
                  data-etsy-room="market-lab"
                  data-etsy-stage={etsyRoomState.stage}
                  data-etsy-packet-id={etsyRoomState.approvalPacket?.packetId ?? etsyRoomState.draftPayload?.packetId ?? etsyRoomState.seoPacket?.packetId ?? etsyRoomState.shotLabHandoffPacket?.packetId ?? etsyRoomState.selectedProductPacket?.packetId ?? etsyRoomState.scoutPacket?.packetId ?? ''}
                  data-approval-status={etsyRoomState.approvalPacket?.approvalStatus ?? ''}
                >
                  <div className="living-v3__etsy-shell-status">
                    <span>Local-only workbench</span>
                    <p>{localOnlyCopyForStation(selectedStation)} Publishing, live upload, supplier messaging, Google Sheets sync, ShotLab runs, and paid generation remain locked.</p>
                  </div>
                  {selectedEtsyOperator && (
                    <div className="living-v3__etsy-operator-strip" aria-label={`${selectedEtsyOperator.label} active station operator`}>
                      <img src={selectedEtsyOperator.portraitPath} alt="" />
                      <div>
                        <span>Active operator</span>
                        <b>{selectedEtsyOperator.label}</b>
                        <small>
                          {selectedEtsyOperator.shortLabel} · {activityLabels[selectedEtsyOperatorSnapshot?.activity ?? 'idle']}
                          {selectedEtsyOperator.visualStatus === 'temporary-approved-sprite' ? ' · TEMP VISUAL' : ''}
                          {selectedEtsyOperator.visualStatus === 'norse-operator-runtime-final' ? ' · NORSE RUNTIME V4' : ''}
                        </small>
                      </div>
                      <p>{selectedEtsyOperatorSnapshot?.label ?? selectedEtsyOperator.role}</p>
                      <button type="button" onClick={() => activateEtsyStationOperator(selectedStation.id)}>
                        Send {selectedEtsyOperator.label}
                      </button>
                    </div>
                  )}
                  <EtsyPipelineStrip pipeline={etsyPipeline} roomState={etsyRoomState} operatorLabel={selectedEtsyOperator?.label ?? 'Local operator'} />
                  <div className="living-v3__etsy-reset-row">
                    <span>Pipeline state is stored locally on this browser only.</span>
                    <button type="button" onClick={etsyPipelineHandlers.resetPipeline}>Reset local pipeline</button>
                  </div>
                  {renderEtsyStationApp(selectedStation.id, etsyPipeline, etsyPipelineHandlers)}
                  {stationActionReceipts[selectedStation.id] && (
                    <div
                      className="living-v3__etsy-action-receipt"
                      role="status"
                      data-hermes-action-bridge={stationActionReceipts[selectedStation.id].includes('Hermes Action Bridge V3') ? 'v3' : undefined}
                    >
                      {stationActionReceipts[selectedStation.id]}
                    </div>
                  )}
                </div>
              ) : selectedStationIsOracle ? (
                <>
                  <div className="living-v3__drawer-block">
                    <label>Oracle Local Signal</label>
                    <p>Reads only local allowlisted Alura cache files by default. No live Alura, Etsy, supplier, paid, or worker action runs here.</p>
                  </div>
                  <OracleAluraLocalSearchApp state={oracleSearch} handlers={oracleSearchHandlers} />
                  {stationActionReceipts[selectedStation.id] && (
                    <div
                      className="living-v3__etsy-action-receipt"
                      role="status"
                      data-hermes-action-bridge={stationActionReceipts[selectedStation.id].includes('Hermes Action Bridge V3') ? 'v3' : undefined}
                    >
                      {stationActionReceipts[selectedStation.id]}
                    </div>
                  )}
                </>
              ) : selectedStationIsGoblin ? (
                <GoblinAnalyticsShell />
              ) : selectedStationIsTerra ? (
                <TerraForgeStationSurface
                  station={selectedStation}
                  modelAssets={terraModelAssets}
                  modelAssetsLoading={terraModelAssetsLoading}
                  modelAssetsError={terraModelAssetsError}
                  printerStatus={terraPrinterStatus}
                  printerLoading={terraPrinterLoading}
                  printerError={terraPrinterError}
                  onRefreshModelAssets={() => { void refreshTerraModelAssets() }}
                  printerFrameNonce={terraPrinterFrameNonce}
                  onRefreshPrinter={() => { void refreshTerraPrinterStatus() }}
                  onRequestPrinterFrame={() => { setTerraPrinterFrameNonce(Date.now()); void refreshTerraPrinterStatus() }}
                />
              ) : selectedStationIsCommandManager ? (
                <CommandRoomManagerSurface
                  surfaceMode={selectedStationIsMissionControl ? 'mission-control' : 'command'}
                  onOpenHermesCommand={(taskId) => {
                    const task = taskId ? workspaceKernelRuns.find((run) => run.runId === taskId) : undefined
                    if (task) setManagerPrompt(`המשך את המשימה: ${hermesCommandTaskTitle(task)}`)
                    focusRoom('olympus-command', { kind: 'station', id: 'command-table' })
                  }}
                  onOpenMissionControl={() => focusRoom('olympus-command', { kind: 'station', id: 'mission-router' })}
                  prompt={managerPrompt}
                  onPromptChange={setManagerPrompt}
                  onRoute={executeManagerRoute}
                  onStationAction={executeManagerStationAction}
                  onAskHermesCommand={askHermesCommand}
                  onAttachObsidianContext={attachObsidianContextPacketLocally}
                  onKernelStage={stageWorkspaceKernelAction}
                  onKernelOpen={openWorkspaceKernelRun}
                  route={managerRoute}
                  stationActionResult={managerStationActionResult}
                  hermesCommandRun={hermesCommandRun}
                  actionRun={hermesCommandActionRun}
                  conversation={messages
                    .filter((message) => message.agentId === 'hermes')
                    .slice(-6)
                    .map(({ id, from, text }) => ({ id, from, text }))}
                  onApproveCouncil={approveCouncilConsultation}
                  onSkipCouncil={skipCouncilConsultation}
                  contextPacket={obsidianContextPacket}
                  contextStatus={obsidianContextStatus}
                  kernelTelemetry={workspaceKernelTelemetry}
                  kernelRuns={workspaceKernelRuns}
                  kernelEvents={workspaceKernelEvents}
                  kernelDisplayStates={workspaceKernelDisplayStates}
                  missionPacketRail={missionPacketRail}
                  missionPacketRailStatus={workspacePacketMissionStatus}
                  missionPacketRailReadback={workspacePacketMissionReadback}
                  missionAgentMinds={missionAgentMinds}
                  missionRun={missionRun}
                  kernelStoreStatus={workspaceKernelStoreStatus}
                  kernelStateVersion={workspaceKernelStateVersion}
                  controlLabel={agentControlLabel}
                  controlTitle={agentControlTitle}
                  frozen={agentControlIsFrozen}
                  canAskHermes={bodyRuntimeEnabled}
                  agentRoster={commandAgentControlRoster}
                  activeAgentId={selectedAgent?.id}
                  onTalkAgent={openAgentControlChat}
                  onFocusAgent={focusAgentFromCommandControl}
                  onAssignAgentPrimaryStation={assignAgentPrimaryStationFromCommand}
                  onRestAgent={restAgentFromCommandControl}
                  onRunControlledAgent={activateControlledAgentRun}
                />
              ) : selectedStationUsesGatewayLayer ? (
                <section
                  className="living-v3__gateway-approval-gate"
                  data-gateway-approval-gate="locked-v1"
                  data-gateway-action-surface="agent-readback-v1"
                  data-live-actions-allowed="false"
                  data-generic-send-agent="removed"
                  aria-label="Gateway locked approval workbench"
                >
                  <div className="living-v3__gateway-gate-hero">
                    <div>
                      <label>Approval gate</label>
                      <h3>Choose the external action, then stage readback for DLV</h3>
                      <p>Discord, supplier messages, Etsy edits, and remote commands are visible here as agent work routes — but every external side effect stays locked until explicit approval and readback.</p>
                    </div>
                    <WorkspaceStationCta
                      actionId="gateway.stage-approval-readback"
                      label="Stage approval packet"
                      sublabel="Open Command with a locked readback plan — no live send"
                      status="needs-approval"
                      ownerAgentId="hermes"
                      ownerLabel="Hermes Gateway"
                      targetRoomId="gateway-cockpit"
                      targetStationId="gateway-console"
                      targetToolLabel="Gateway approval console"
                      motionSignal="blocked-at-gate"
                      position="standard-dock-right"
                      onPrimaryAction={() => focusRoom('olympus-command', { kind: 'station', id: 'command-table' })}
                      proofSummary="Gateway exposes action routes only. Live Discord/Etsy/supplier/printer writes remain locked."
                      proofItems={['Readback required', 'No silent live send', 'Operator approval before side effect']}
                    />
                  </div>
                  <WorkspacePipelineWorkbench
                    id="gateway-external-action-gate"
                    eyebrow="Pipeline OS · Gateway"
                    title="Request → Readback → Approval → Delivery"
                    subtitle="Every external route is shown as a teachable gate: what came in, what packet will be sent, which approval is missing, and what side effect remains locked."
                    activeArtifact={{ label: 'Active gateway artifact', title: 'Approval packet', meta: 'No live delivery without DLV readback', emptyLabel: 'GATE' }}
                    steps={[
                      { id: 'incoming', label: 'Incoming', status: 'ready', value: 'request', detail: 'Operator/chat/API request is captured as a local packet.' },
                      { id: 'route', label: 'Route', status: 'active', value: 'choose executor', detail: 'Pick Discord, Etsy, supplier, ShotLab, printer, or DB route.' },
                      { id: 'readback', label: 'Readback', status: 'waiting', value: 'stage packet', detail: 'Show target, payload, cost/account risk, and exact side effect.' },
                      { id: 'approval', label: 'Approval', status: 'locked', value: 'DLV gate', detail: 'External action waits for explicit approval.' },
                      { id: 'delivery', label: 'Delivery', status: 'locked', value: 'sender missing', detail: 'Live sender/adapter remains disconnected here.' },
                    ]}
                    inputMedia={[{ id: 'request-card', label: 'Request card', meta: 'current Workspace command / chat handoff', tone: 'ready' }]}
                    outputMedia={[{ id: 'approval-card', label: 'Approval card', meta: 'readback packet staged locally', tone: 'waiting' }, { id: 'delivery-receipt', label: 'Delivery receipt', meta: 'appears only after approved sender runs', tone: 'locked' }]}
                    filters={[
                      { id: 'discord', label: 'Discord', value: 'locked', active: false },
                      { id: 'etsy', label: 'Etsy', value: 'locked', active: false },
                      { id: 'supplier', label: 'Supplier', value: 'locked', active: false },
                      { id: 'printer', label: 'Printer', value: 'locked', active: false },
                    ]}
                    actions={[{ id: 'stage-readback', label: 'Stage readback', detail: 'open Command route', onClick: () => focusRoom('olympus-command', { kind: 'station', id: 'command-table' }) }]}
                    locks={['No Discord send', 'No Etsy publish/edit', 'No supplier message/payment', 'No printer command']}
                    readback={<span>Gateway only prepares approval/readback packets. It does not execute live sends from this workbench.</span>}
                    accent="#7dd3fc"
                  />
                  <div className="living-v3__gateway-gate-grid" aria-label="Locked external action routes">
                    {[
                      ['Discord delivery', 'Draft message / media / channel target', 'Locked: send, pin, moderate'],
                      ['Etsy shop action', 'Draft listing edit / publish packet', 'Locked: create draft, publish, renew, customer message'],
                      ['Supplier or ShotLab', 'Stage message, source evidence, cost note', 'Locked: paid generation, purchase, supplier send'],
                      ['Printer / remote command', 'Read status and prepare command', 'Locked: heat, move, start, delete job'],
                    ].map(([label, readback, lock]) => (
                      <article key={label}>
                        <span>{label}</span>
                        <b>{readback}</b>
                        <small>{lock}</small>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <>
                  <div className="living-v3__drawer-block living-v3__drawer-block--dormant" data-station-dormant="true">
                    <label>Not an active workbench yet</label>
                    <h3>{selectedStation.label}</h3>
                    <p>This station is visible on the map, but it is not one of the cleaned active Workspace surfaces yet. No fake workflow is shown here.</p>
                  </div>
                  <details className="living-v3__station-debug-actions" data-station-debug-actions="collapsed-v1">
                    <summary>Debug actions</summary>
                    <p>Use only if we need to inspect agent movement or station wiring.</p>
                    <div className="living-v3__drawer-actions">
                      {stationAssignableAgents(selectedStation).map((agent) => (
                        <button key={agent.id} type="button" onClick={() => assignStation(agent.id, selectedStation.id)}>
                          Send {agent.label}
                        </button>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </>
          )}
        </aside>
      ) : null}
    </section>
  )
}
