import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type {
  WorkspaceApproval,
  WorkspaceKernelPersistedState,
  WorkspaceKernelTelemetrySnapshot,
  WorkspaceRun,
} from '../lib/workspace-kernel'
import { workspaceExecutorPlanForRun, workspaceExecutorReadbackForRun } from '../lib/workspace-kernel/action-registry'
import {
  createEmptyWorkspaceKernelPersistedState,
  mergeWorkspaceKernelRuns,
  prepareWorkspaceKernelPersistedState,
} from '../lib/workspace-kernel/store'

export type WorkspaceCorePersistenceProvider = 'supabase' | 'local-file'

export type WorkspaceCorePersistenceSnapshot = {
  provider: WorkspaceCorePersistenceProvider
  enabled: boolean
  liveSource: boolean
  writebackAllowed: boolean
  status: 'connected' | 'fallback' | 'error'
  readback: string
  runCount: number
  approvalCount: number
  lastSyncedAtMs?: number
  error?: string
}

export type SupabaseConfig = {
  url: string
  apiKey: string
}

type WorkspaceCoreRefs = {
  workspaceId?: string
  roomIdsBySlug: Record<string, string>
}

type WorkspaceCoreActionRunRow = {
  id: string
  workspace_id?: string | null
  room_id?: string | null
  run_type: string
  source: string
  status: string
  requested_by?: string | null
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at?: string
  updated_at?: string
}

type WorkspaceCoreApprovalRow = {
  id: string
  workspace_id?: string | null
  room_id?: string | null
  entity_schema: string
  entity_table: string
  entity_id: string
  approval_type: string
  status: string
  title: string
  summary?: string | null
  requested_by?: string | null
  decided_by?: string | null
  decision_reason?: string | null
  payload: Record<string, unknown>
  created_at?: string
  decided_at?: string | null
  updated_at?: string
}

type SupabaseWorkspaceRow = { id: string; slug: string }
type SupabaseRoomRow = { id: string; slug: string }

const LOCAL_FALLBACK_PERSISTENCE: WorkspaceCorePersistenceSnapshot = {
  provider: 'local-file',
  enabled: false,
  liveSource: false,
  writebackAllowed: false,
  status: 'fallback',
  readback: 'Workspace Kernel is using the local file store only.',
  runCount: 0,
  approvalCount: 0,
}

let localDotEnvCache: Record<string, string> | null = null

export function resetWorkspaceCoreDbEnvCacheForTests() {
  localDotEnvCache = null
}

function isVitestWithoutSupabaseOptIn() {
  return Boolean(process.env.VITEST) && process.env.WORKSPACE_KERNEL_SUPABASE_TEST !== '1'
}

function readLocalDotEnv(): Record<string, string> {
  if (localDotEnvCache) return localDotEnvCache
  localDotEnvCache = {}
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return localDotEnvCache

  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [rawKey, ...rawValueParts] = line.split('=')
    const key = rawKey.trim()
    const rawValue = rawValueParts.join('=').trim()
    localDotEnvCache[key] = rawValue.replace(/^["']|["']$/g, '')
  }
  return localDotEnvCache
}

export function readWorkspaceDbEnv(key: string): string | undefined {
  const value = process.env[key]
  if (value && value.trim()) return value.trim()
  return readLocalDotEnv()[key]
}

export function redactWorkspaceDbSecrets(value: string): string {
  return value
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[SUPABASE_KEY_REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
}

export function getWorkspaceSupabaseConfig(): SupabaseConfig | null {
  if (isVitestWithoutSupabaseOptIn()) return null

  const dbMode = readWorkspaceDbEnv('WORKSPACE_DB_MODE') ?? readWorkspaceDbEnv('GOBLIN_DB_MODE')
  if (dbMode !== 'supabase') return null

  const url = readWorkspaceDbEnv('WORKSPACE_SUPABASE_URL')
    ?? readWorkspaceDbEnv('GOBLIN_SUPABASE_URL')
    ?? readWorkspaceDbEnv('SUPABASE_URL')
  const apiKey = readWorkspaceDbEnv('WORKSPACE_SUPABASE_SECRET_KEY')
    ?? readWorkspaceDbEnv('WORKSPACE_SUPABASE_SERVICE_ROLE_KEY')
    ?? readWorkspaceDbEnv('GOBLIN_SUPABASE_SECRET_KEY')
    ?? readWorkspaceDbEnv('GOBLIN_SUPABASE_SERVICE_ROLE_KEY')
    ?? readWorkspaceDbEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !apiKey) return null
  return { url: url.replace(/\/$/, ''), apiKey }
}

function supabaseDisabledSnapshot(): WorkspaceCorePersistenceSnapshot {
  return { ...LOCAL_FALLBACK_PERSISTENCE }
}

function errorSnapshot(error: unknown, runCount = 0, approvalCount = 0): WorkspaceCorePersistenceSnapshot {
  const message = error instanceof Error ? error.message : String(error)
  return {
    provider: 'local-file',
    enabled: false,
    liveSource: false,
    writebackAllowed: false,
    status: 'error',
    readback: `Supabase mirror unavailable; local fallback is active. ${redactWorkspaceDbSecrets(message).slice(0, 220)}`,
    runCount,
    approvalCount,
    error: redactWorkspaceDbSecrets(message).slice(0, 500),
  }
}

function connectedSnapshot(input: {
  readback: string
  runCount: number
  approvalCount: number
  lastSyncedAtMs?: number
}): WorkspaceCorePersistenceSnapshot {
  return {
    provider: 'supabase',
    enabled: true,
    liveSource: true,
    writebackAllowed: true,
    status: 'connected',
    readback: input.readback,
    runCount: input.runCount,
    approvalCount: input.approvalCount,
    lastSyncedAtMs: input.lastSyncedAtMs,
  }
}

export async function workspaceSupabaseJson<Row>(
  config: SupabaseConfig,
  schema: 'workspace_core',
  pathAndQuery: string,
  init: RequestInit & { body?: BodyInit | null } = {},
): Promise<Array<Row>> {
  const headers = new Headers(init.headers)
  headers.set('apikey', config.apiKey)
  headers.set('authorization', `Bearer ${config.apiKey}`)
  headers.set('accept', 'application/json')
  headers.set('accept-profile', schema)
  headers.set('content-profile', schema)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  const response = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase workspace_core ${init.method ?? 'GET'} failed (${response.status}): ${redactWorkspaceDbSecrets(text).slice(0, 360)}`)
  }

  if (response.status === 204) return []
  const text = await response.text()
  if (!text.trim()) return []
  const payload = JSON.parse(text) as unknown
  return Array.isArray(payload) ? payload as Array<Row> : [payload as Row]
}

export function stableWorkspaceCoreUuid(namespace: string, value: string): string {
  const bytes = Buffer.from(createHash('sha256').update(`${namespace}:${value}`).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isoFromMs(value: number | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return new Date(value).toISOString()
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function moduleKeyForRoom(roomSlug: string) {
  if (roomSlug.includes('etsy')) return 'etsy_ops'
  if (roomSlug.includes('agora') || roomSlug.includes('goblin')) return 'goblin_analytics'
  if (roomSlug.includes('terra')) return 'cad_3d_print'
  if (roomSlug.includes('atlantis')) return 'data_vault'
  if (roomSlug.includes('council')) return 'council'
  if (roomSlug.includes('gateway')) return 'gateway_discord'
  if (roomSlug.includes('merchant')) return 'supplier_verification'
  return 'workspace_core'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function loadWorkspaceCoreRefs(config: SupabaseConfig, runs: Array<WorkspaceRun>): Promise<WorkspaceCoreRefs> {
  const workspaces = await workspaceSupabaseJson<SupabaseWorkspaceRow>(
    config,
    'workspace_core',
    'workspaces?select=id,slug&slug=eq.hermes-workspace&limit=1',
  )
  const workspaceId = workspaces[0]?.id
  if (!workspaceId) return { roomIdsBySlug: {} }

  const uniqueRoomSlugs = [...new Set(runs.map((run) => run.ownerRoomId).filter(Boolean))]
  if (uniqueRoomSlugs.length === 0) return { workspaceId, roomIdsBySlug: {} }

  const roomRows = uniqueRoomSlugs.map((roomSlug) => ({
    workspace_id: workspaceId,
    slug: roomSlug,
    display_name: humanizeSlug(roomSlug),
    module_key: moduleKeyForRoom(roomSlug),
    status: 'active',
    read_model_version: 'workspace-kernel-v2',
    metadata: {
      source: 'workspace-kernel-action-runs',
      livingV3RoomId: roomSlug,
    },
  }))

  const upsertedRooms = await workspaceSupabaseJson<SupabaseRoomRow>(
    config,
    'workspace_core',
    'rooms?on_conflict=workspace_id,slug&select=id,slug',
    {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(roomRows),
    },
  )

  return {
    workspaceId,
    roomIdsBySlug: Object.fromEntries(upsertedRooms.map((row) => [row.slug, row.id])),
  }
}

function latestEventPayload(run: WorkspaceRun): Record<string, unknown> | undefined {
  const event = run.events.at(-1)
  return isObject(event?.payload) ? event.payload : undefined
}

function rowForRun(run: WorkspaceRun, refs: WorkspaceCoreRefs, telemetry?: WorkspaceKernelTelemetrySnapshot): WorkspaceCoreActionRunRow {
  const id = stableWorkspaceCoreUuid('workspace_core.action_runs', run.runId)
  const latestPayload = latestEventPayload(run)
  const completedAt = ['completed', 'cancelled', 'failed'].includes(run.status) ? isoFromMs(run.updatedAtMs) : undefined
  const executorPlan = workspaceExecutorPlanForRun(run)
  return {
    id,
    workspace_id: refs.workspaceId ?? null,
    room_id: refs.roomIdsBySlug[run.ownerRoomId] ?? null,
    run_type: run.blueprintId,
    source: 'workspace-kernel',
    status: run.status,
    requested_by: run.assignedWorkerProfileId ?? 'workspace-ui',
    input: {
      workspaceRunId: run.runId,
      actionId: run.actionId,
      actionSummary: run.actionSummary,
      actionInput: run.actionInput,
      ownerRoomId: run.ownerRoomId,
      ownerStationId: run.ownerStationId,
      assignedWorkerProfileId: run.assignedWorkerProfileId,
      blueprintId: run.blueprintId,
      safety: run.safety,
    },
    output: {
      workspaceRun: run,
      telemetry: telemetry?.runId === run.runId ? telemetry : undefined,
      latestEvent: run.events.at(-1),
      latestEventPayload: latestPayload,
      readback: run.readback,
      executorPlan,
      executorReadback: workspaceExecutorReadbackForRun(run),
      nextAction: run.nextAction,
      lockedActions: run.lockedActions,
      liveActionsAllowed: false,
    },
    error: run.status === 'failed' ? run.readback : null,
    started_at: isoFromMs(run.createdAtMs),
    completed_at: completedAt ?? null,
    created_at: isoFromMs(run.createdAtMs),
    updated_at: isoFromMs(run.updatedAtMs),
  }
}

function approvalDecisionFields(run: WorkspaceRun, approval: WorkspaceApproval) {
  const decided = ['approved', 'rejected', 'needs_edit'].includes(approval.status)
  const latestDecisionEvent = [...run.events].reverse().find((event) =>
    event.payload
    && isObject(event.payload)
    && event.payload.approvalId === approval.approvalId,
  )
  return {
    decided,
    decidedBy: decided ? 'workspace-operator' : null,
    decisionReason: decided ? latestDecisionEvent?.message ?? run.readback : null,
    decidedAt: decided ? isoFromMs(latestDecisionEvent?.createdAtMs ?? run.updatedAtMs) : null,
  }
}

function rowForApproval(run: WorkspaceRun, approval: WorkspaceApproval, refs: WorkspaceCoreRefs): WorkspaceCoreApprovalRow {
  const decision = approvalDecisionFields(run, approval)
  return {
    id: stableWorkspaceCoreUuid('workspace_core.approvals', approval.approvalId),
    workspace_id: refs.workspaceId ?? null,
    room_id: refs.roomIdsBySlug[run.ownerRoomId] ?? null,
    entity_schema: 'workspace_core',
    entity_table: 'action_runs',
    entity_id: stableWorkspaceCoreUuid('workspace_core.action_runs', run.runId),
    approval_type: approval.targetSystem,
    status: approval.status,
    title: approval.requestedAction,
    summary: approval.preview,
    requested_by: run.assignedWorkerProfileId ?? 'workspace-ui',
    decided_by: decision.decidedBy,
    decision_reason: decision.decisionReason,
    payload: {
      workspaceApprovalId: approval.approvalId,
      workspaceRunId: run.runId,
      executorPlan: workspaceExecutorPlanForRun(run),
      executorReadback: workspaceExecutorReadbackForRun(run),
      ownerRoomId: run.ownerRoomId,
      ownerStationId: run.ownerStationId,
      riskClass: approval.riskClass,
      targetSystem: approval.targetSystem,
      allowedNow: approval.allowedNow,
      lockedActions: approval.lockedActions,
      evidenceIds: approval.evidenceIds,
      latestRunReadback: run.readback,
      liveActionsAllowed: false,
    },
    created_at: isoFromMs(approval.createdAtMs),
    decided_at: decision.decidedAt,
    updated_at: isoFromMs(run.updatedAtMs),
  }
}

function runFromActionRunRow(row: WorkspaceCoreActionRunRow): WorkspaceRun | null {
  const run = isObject(row.output) ? row.output.workspaceRun : undefined
  if (!isObject(run)) return null
  if (typeof run.runId !== 'string' || !Array.isArray(run.events)) return null
  return {
    ...(run as WorkspaceRun),
    status: row.status as WorkspaceRun['status'],
  }
}

export async function loadWorkspaceKernelStateFromSupabase(): Promise<{
  state: WorkspaceKernelPersistedState
  persistence: WorkspaceCorePersistenceSnapshot
}> {
  const config = getWorkspaceSupabaseConfig()
  if (!config) {
    return {
      state: createEmptyWorkspaceKernelPersistedState(),
      persistence: supabaseDisabledSnapshot(),
    }
  }

  try {
    const rows = await workspaceSupabaseJson<WorkspaceCoreActionRunRow>(
      config,
      'workspace_core',
      'action_runs?select=*&source=eq.workspace-kernel&order=updated_at.desc&limit=80',
    )
    const runs = rows.map(runFromActionRunRow).filter((run): run is WorkspaceRun => Boolean(run))
    const latestTelemetry = rows
      .map((row) => isObject(row.output) ? row.output.telemetry : undefined)
      .find((telemetry): telemetry is WorkspaceKernelTelemetrySnapshot => isObject(telemetry) && typeof telemetry.runId === 'string')
    const state = prepareWorkspaceKernelPersistedState({
      runs,
      telemetry: latestTelemetry,
    })
    return {
      state,
      persistence: connectedSnapshot({
        readback: `Supabase Workspace Core readback loaded ${runs.length} Action Run${runs.length === 1 ? '' : 's'}.`,
        runCount: runs.length,
        approvalCount: runs.reduce((count, run) => count + run.approvals.length, 0),
        lastSyncedAtMs: state.updatedAtMs,
      }),
    }
  } catch (error) {
    return {
      state: createEmptyWorkspaceKernelPersistedState(),
      persistence: errorSnapshot(error),
    }
  }
}

export async function mergeWorkspaceKernelStateWithSupabase(
  localState: WorkspaceKernelPersistedState,
): Promise<{ state: WorkspaceKernelPersistedState; persistence: WorkspaceCorePersistenceSnapshot }> {
  const mirror = await loadWorkspaceKernelStateFromSupabase()
  if (mirror.persistence.provider !== 'supabase' || mirror.persistence.status !== 'connected') {
    return { state: localState, persistence: mirror.persistence }
  }
  const mergedRuns = mergeWorkspaceKernelRuns(localState.runs, mirror.state.runs)
  const state = prepareWorkspaceKernelPersistedState({
    previous: localState,
    runs: mergedRuns,
    telemetry: mirror.state.telemetry ?? localState.telemetry,
  })
  return {
    state,
    persistence: {
      ...mirror.persistence,
      runCount: state.runs.length,
      approvalCount: state.runs.reduce((count, run) => count + run.approvals.length, 0),
      readback: `Supabase Workspace Core mirror active: ${state.runs.length} Action Run${state.runs.length === 1 ? '' : 's'} available.`,
      lastSyncedAtMs: state.updatedAtMs,
    },
  }
}

export async function persistWorkspaceKernelRunsToSupabase(
  runs: Array<WorkspaceRun>,
  telemetry?: WorkspaceKernelTelemetrySnapshot,
): Promise<WorkspaceCorePersistenceSnapshot> {
  const config = getWorkspaceSupabaseConfig()
  if (!config) return supabaseDisabledSnapshot()

  const approvalCount = runs.reduce((count, run) => count + run.approvals.length, 0)
  try {
    const refs = await loadWorkspaceCoreRefs(config, runs)
    const runRows = runs.map((run) => rowForRun(run, refs, telemetry))
    if (runRows.length > 0) {
      await workspaceSupabaseJson<WorkspaceCoreActionRunRow>(
        config,
        'workspace_core',
        'action_runs?on_conflict=id&select=id,status,updated_at',
        {
          method: 'POST',
          headers: { prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(runRows),
        },
      )
    }

    const approvalRows = runs.flatMap((run) => run.approvals.map((approval) => rowForApproval(run, approval, refs)))
    if (approvalRows.length > 0) {
      await workspaceSupabaseJson<WorkspaceCoreApprovalRow>(
        config,
        'workspace_core',
        'approvals?on_conflict=id&select=id,status,updated_at',
        {
          method: 'POST',
          headers: { prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(approvalRows),
        },
      )
    }

    return connectedSnapshot({
      readback: `Supabase Workspace Core writeback saved ${runRows.length} Action Run${runRows.length === 1 ? '' : 's'} and ${approvalRows.length} approval${approvalRows.length === 1 ? '' : 's'}.`,
      runCount: runRows.length,
      approvalCount,
      lastSyncedAtMs: Date.now(),
    })
  } catch (error) {
    return errorSnapshot(error, runs.length, approvalCount)
  }
}
