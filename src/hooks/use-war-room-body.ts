import { useCallback, useEffect, useState } from 'react'
import type { EtsySheetIntakeRunManifest } from '../lib/war-room/living-v3/etsy-sheet-intake'
import type { EtsyLiveResearchRequest, EtsyLiveResearchRun } from '../lib/war-room/living-v3/etsy-live-research'
import type { EtsyProductWorkspaceCommand, EtsyProductWorkspaceStateV2 } from '../lib/war-room/living-v3/etsy-product-model'
import type { EtsyRoomLocalIntent, EtsyRoomState } from '../lib/war-room/living-v3/etsy-room-contracts'
import type { KernelAgentDisplayState, WorkspaceArtifact, WorkspaceKernelPersistedState, WorkspaceKernelTelemetrySnapshot, WorkspaceRun } from '../lib/workspace-kernel'
import type { SmartIntakeMission } from '../lib/war-room/living-v3/smart-intake-v2'
import type { AgentConnectionState, AgentIntent, ApprovalRequest, ControlledAgentOutput, LiveAgentActionSystemRun, WarRoomBodyState, WarRoomEvent } from '../lib/war-room/body'
import type { LivingV3AgentId } from '../lib/war-room/living-v3/living-v3-contract'
import type { TerraInternetModelSearchResult } from '../lib/war-room/terra/terra-model-search'

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  const body = await response.json() as T & { ok?: boolean; error?: string }
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? `Request failed: ${response.status}`)
  }
  return body
}

export async function sendWarRoomIntent(intent: AgentIntent) {
  return readJson<{ ok: true; state: WarRoomBodyState }>('/api/war-room/intents', {
    method: 'POST',
    body: JSON.stringify(intent),
  })
}

export type OracleScoutLocalIntentResult = {
  ok: boolean
  runId: string
  correlationId: string
  query: string
  sourceMode: 'alura_only'
  signalPacket?: unknown
  search?: unknown
  events?: Array<WarRoomEvent>
  control?: AgentConnectionState
  state?: WarRoomBodyState
  error?: string
}

export async function runOracleScoutLocalIntent(query?: string) {
  return readJson<OracleScoutLocalIntentResult>('/api/war-room/intents', {
    method: 'POST',
    body: JSON.stringify({ type: 'run_oracle_scout_local', query }),
  })
}

export type EtsyRoomLocalIntentResult = {
  ok: boolean
  runId: string
  correlationId: string
  workspaceState?: EtsyProductWorkspaceStateV2
  etsyRoomState?: EtsyRoomState
  commandStatus?: 'applied' | 'replayed' | 'conflict'
  events?: Array<WarRoomEvent>
  control?: AgentConnectionState
  state?: WarRoomBodyState
  error?: string
}

export async function sendEtsyRoomLocalIntent(intent: EtsyRoomLocalIntent) {
  return readJson<EtsyRoomLocalIntentResult>('/api/war-room/intents', {
    method: 'POST',
    body: JSON.stringify(intent),
  })
}

export type EtsySheetIntakeClientRequest =
  | { sourceType: 'pasted_text'; pastedText: string }
  | { sourceType: 'local_file'; localPath: string }
  | { sourceType: 'public_csv_url'; publicCsvUrl: string }

export type EtsySheetIntakeClientResult = {
  ok: boolean
  run?: EtsySheetIntakeRunManifest
  error?: string
  googleAuthRequired?: boolean
}

export async function runEtsySheetIntakeClient(payload: EtsySheetIntakeClientRequest) {
  return readJson<EtsySheetIntakeClientResult>('/api/war-room/etsy-sheet-intake', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type EtsyLiveScoutClientResult = {
  ok: boolean
  liveRun: EtsyLiveResearchRun
  state: WorkspaceKernelPersistedState
  run: WorkspaceRun
  artifact: WorkspaceArtifact
  telemetry: WorkspaceKernelTelemetrySnapshot
  displayStates: Array<KernelAgentDisplayState>
  sharedRoomState?: EtsyRoomState
  sharedRoomError?: string
  localOnly: true
  usageAllowed: false
  workerSpawnAllowed: false
  externalRequestsAllowed: false
  liveActionsAllowed: false
  error?: string
}

export type SharedEtsyRoomClientResult = {
  ok: boolean
  schemaVersion: 'war-room-etsy-product-workspace-v2'
  updatedAtMs: number
  stateVersion: string
  source: 'empty' | 'ui' | 'scout-api' | 'test' | 'unknown'
  lastReason?: string
  empty: boolean
  retention: {
    rawTtlMs: number
    hardWorkspaceLimit: false
    filterMode: 'filter-first-soft-safety'
    candidateSoftSafetyLimit: number
    eventSoftSafetyLimit: number
    sourceDetailSoftSafetyLimit: number
    linkSoftSafetyLimit: number
    tagSoftSafetyLimit: number
    storesFiles: false
    note: string
  }
  workspaceState: EtsyProductWorkspaceStateV2
  roomState: EtsyRoomState
  saved?: boolean
  skippedReason?: string
  commandStatus?: 'applied' | 'replayed' | 'conflict'
  expectedRevision?: number
  error?: string
}

export async function runEtsyLiveScoutClient(payload: EtsyLiveResearchRequest) {
  return readJson<EtsyLiveScoutClientResult>('/api/war-room/etsy-live/scout', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function readSharedEtsyRoomState() {
  return readJson<SharedEtsyRoomClientResult>('/api/war-room/etsy-live/shared-room')
}

export async function saveSharedEtsyRoomState(roomState: EtsyRoomState, reason?: string) {
  return readJson<SharedEtsyRoomClientResult>('/api/war-room/etsy-live/shared-room', {
    method: 'POST',
    body: JSON.stringify({ roomState, reason }),
  })
}

export async function applySharedEtsyProductWorkspaceCommandClient(command: EtsyProductWorkspaceCommand) {
  const response = await fetch('/api/war-room/etsy-live/shared-room', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  const body = await response.json() as SharedEtsyRoomClientResult
  if (!response.ok && response.status !== 409) {
    throw new Error(body.error ?? `Request failed: ${response.status}`)
  }
  return { ...body, httpStatus: response.status }
}

export async function resetSharedEtsyRoomState(reason?: string) {
  return readJson<SharedEtsyRoomClientResult>('/api/war-room/etsy-live/shared-room', {
    method: 'POST',
    body: JSON.stringify({ reset: true, reason }),
  })
}

export async function createWarRoomTask(payload: {
  taskId?: string
  label: string
  roomId: string
  stationId?: string
  assignedAgentId?: string
}) {
  return readJson<{ ok: true; task: unknown; state: WarRoomBodyState }>('/api/war-room/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWarRoomApproval(payload: {
  agentId: string
  taskId?: string
  reason: string
  roomId?: string
  stationId?: string
  evidence?: ApprovalRequest['evidence']
  riskLevel?: ApprovalRequest['riskLevel']
  requestedAction?: string
  allowedAction?: string
  lockedAction?: string
  operatorNote?: string
  runId?: string
  correlationId?: string
  source?: 'ui' | 'hermes' | 'dispatcher' | 'test'
}) {
  return readJson<{ ok: true; state: WarRoomBodyState }>('/api/war-room/approvals', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

const CLIENT_FROZEN_AGENT_CONNECTION_STATE: AgentConnectionState = {
  mode: 'frozen',
  frozen: true,
  usageAllowed: false,
  workerSpawnAllowed: false,
  reason: 'Agent connection unavailable; frozen fail-closed.',
  updatedAtMs: 0,
  updatedBy: 'system',
  activeRunIds: [],
  safetyLocks: {
    liveExternalMutation: false,
    autonomousLiveActionAllowed: false,
    paidGenerationEnabled: false,
    liveEtsyEnabled: false,
    supplierMessagingEnabled: false,
    purchasesEnabled: false,
  },
}

export async function readWarRoomAgentControl() {
  return readJson<{ ok: true; state: AgentConnectionState; store?: unknown }>('/api/war-room/agent-control')
}

export async function freezeWarRoomAgents(reason?: string) {
  return readJson<{ ok: true; state: AgentConnectionState }>('/api/war-room/agent-control/freeze', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function setWarRoomAgentsLocalOnly(reason?: string) {
  return readJson<{ ok: true; state: AgentConnectionState }>('/api/war-room/agent-control/local-only', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function armWarRoomAgents(reason?: string) {
  return readJson<{ ok: true; state: AgentConnectionState }>('/api/war-room/agent-control/arm', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function disconnectWarRoomAgents(reason?: string) {
  return readJson<{ ok: true; state: AgentConnectionState }>('/api/war-room/agent-control/disconnect', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export type ControlledUiAgentId = 'athena' | 'hermes' | 'hermes-command' | 'hephaestus' | 'scout' | 'smart-intake'

export type SmartIntakeWorkerClientPayload = {
  smartIntakeInput?: string
  smartIntakeMission?: SmartIntakeMission
}

export type ControlledAgentUiResult = {
  ok: boolean
  runId: string
  agentId?: ControlledUiAgentId
  result?: {
    ok: boolean
    sessionId?: string
    durationMs?: number
    usage?: {
      mode: 'real_hermes_one_shot' | 'dry_run'
      budget: string
      timeoutMs: number
      toolsets: string
      commandPreview: string
      reportedCost: string | null
      reportedUsageLine: string | null
      note: string
    }
    output?: ControlledAgentOutput
    error?: string
  }
  control?: AgentConnectionState
  state?: WarRoomBodyState
  etsyRoomState?: EtsyRoomState
  error?: string
}

export type LiveAgentChatUiResult = {
  ok: boolean
  runId: string
  agentId?: LivingV3AgentId
  result?: {
    ok: boolean
    sessionId?: string
    durationMs?: number
    usage?: {
      mode: 'real_hermes_one_shot' | 'dry_run'
      budget: string
      timeoutMs: number
      toolsets: string
      commandPreview: string
      reportedCost: string | null
      reportedUsageLine: string | null
      note: string
    }
    output?: {
      agentId: LivingV3AgentId
      status: 'completed_local_only' | 'completed_read_only_web' | 'blocked' | 'failed'
      answer: string
      summary: string
      nextSafeStep: string
      blockedActions: Array<string>
      confidence: number
    }
    error?: string
  }
  control?: AgentConnectionState
  state?: WarRoomBodyState
  terraModelSearch?: TerraInternetModelSearchResult
  actionSystemRun?: LiveAgentActionSystemRun
  error?: string
}

export async function runLiveAgentChat(agentId: LivingV3AgentId, operatorNote: string) {
  const response = await fetch('/api/war-room/agent-control/live-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId, operatorNote }),
  })
  const body = await response.json() as LiveAgentChatUiResult
  // A missing-capability Action Run is a successful safe UI outcome: HTTP 200,
  // ok:false, actionSystemRun.status=blocked_missing_capability, and 0 model calls.
  // Do not throw it away as "Request failed: 200"; the command surface must render it.
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`)
  return body
}

export async function runControlledAgent(agentId: ControlledUiAgentId, operatorNote?: string, payload?: SmartIntakeWorkerClientPayload) {
  return readJson<ControlledAgentUiResult>('/api/war-room/agent-control/run-agent', {
    method: 'POST',
    body: JSON.stringify({ agentId, operatorNote, ...payload }),
  })
}

export async function runControlledAthena(operatorNote?: string) {
  return readJson<ControlledAgentUiResult>('/api/war-room/agent-control/run-athena', {
    method: 'POST',
    body: JSON.stringify({ operatorNote }),
  })
}

export function useWarRoomState(pollMs = 1200) {
  const [state, setState] = useState<WarRoomBodyState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await readJson<{ ok: true; state: WarRoomBodyState }>('/api/war-room/state')
      setState(result.state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (pollMs <= 0) return undefined
    void refresh()
    const interval = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(interval)
  }, [pollMs, refresh])

  return { state, error, refresh }
}

export function useWarRoomEvents(pollMs = 1200) {
  const [events, setEvents] = useState<Array<WarRoomEvent>>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await readJson<{ ok: true; events: Array<WarRoomEvent> }>('/api/war-room/events')
      setEvents(result.events)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (pollMs <= 0) return undefined
    void refresh()
    const interval = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(interval)
  }, [pollMs, refresh])

  return { events, error, refresh }
}

export function useWarRoomAgentControl(pollMs = 1200) {
  const [state, setState] = useState<AgentConnectionState>(CLIENT_FROZEN_AGENT_CONNECTION_STATE)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await readWarRoomAgentControl()
      setState(result.state)
      setError(null)
    } catch (err) {
      setState({
        ...CLIENT_FROZEN_AGENT_CONNECTION_STATE,
        warning: err instanceof Error ? err.message : String(err),
      })
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (pollMs <= 0) return undefined
    void refresh()
    const interval = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(interval)
  }, [pollMs, refresh])

  return { state, error, refresh }
}
