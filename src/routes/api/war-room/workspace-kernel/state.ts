import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { WORKSPACE_KERNEL_SAFETY, buildKernelAgentDisplayStates } from '../../../../lib/workspace-kernel'
import {
  loadWorkspaceKernelState,
  prepareWorkspaceKernelPersistedState,
  saveWorkspaceKernelState,
} from '../../../../lib/workspace-kernel/store'
import {

  mergeWorkspaceKernelStateWithSupabase,
  persistWorkspaceKernelRunsToSupabase
} from '../../../../server/workspace-core-db'
import { isAuthenticated } from '../../../../server/auth-middleware'
import type {WorkspaceCorePersistenceSnapshot} from '../../../../server/workspace-core-db';
import type { WorkspaceKernelTelemetrySnapshot, WorkspaceRun } from '../../../../lib/workspace-kernel'

const noStoreHeaders = { 'cache-control': 'no-store' }

function runsFromBody(body: unknown): Array<WorkspaceRun> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return []
  const candidate = body as { runs?: unknown }
  if (!Array.isArray(candidate.runs)) return []
  return candidate.runs.filter((run): run is WorkspaceRun =>
    Boolean(run)
    && typeof run === 'object'
    && typeof (run as { runId?: unknown }).runId === 'string'
    && Array.isArray((run as { events?: unknown }).events),
  ).slice(0, 80)
}

function telemetryFromBody(body: unknown): WorkspaceKernelTelemetrySnapshot | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const telemetry = (body as { telemetry?: unknown }).telemetry
  if (!telemetry || typeof telemetry !== 'object' || Array.isArray(telemetry)) return undefined
  return typeof (telemetry as { runId?: unknown }).runId === 'string'
    ? telemetry as WorkspaceKernelTelemetrySnapshot
    : undefined
}

function responsePayload(
  state: Awaited<ReturnType<typeof loadWorkspaceKernelState>>,
  persistence?: WorkspaceCorePersistenceSnapshot,
) {
  return {
    ok: true,
    stateVersion: state.stateVersion,
    result: state,
    state,
    displayStates: buildKernelAgentDisplayStates(state),
    localOnly: persistence?.provider !== 'supabase',
    usageAllowed: false,
    workerSpawnAllowed: false,
    externalRequestsAllowed: false,
    liveActionsAllowed: false,
    lockedActions: state.telemetry ? [`last telemetry: ${state.telemetry.artifactKind}`] : [],
    safety: WORKSPACE_KERNEL_SAFETY,
    persistence,
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/state')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const localState = await loadWorkspaceKernelState()
        const merged = await mergeWorkspaceKernelStateWithSupabase(localState)
        return json(responsePayload(merged.state, merged.persistence), { headers: noStoreHeaders })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: noStoreHeaders })
        }
        const previousLocal = await loadWorkspaceKernelState()
        const previousMirror = await mergeWorkspaceKernelStateWithSupabase(previousLocal)
        const previous = previousMirror.state
        const nextState = prepareWorkspaceKernelPersistedState({
          previous,
          runs: runsFromBody(body),
          telemetry: telemetryFromBody(body),
        })
        const saved = await saveWorkspaceKernelState(nextState)
        const persistence = await persistWorkspaceKernelRunsToSupabase(runsFromBody(body), telemetryFromBody(body))
        return json(responsePayload(saved, persistence), { headers: noStoreHeaders })
      },
    },
  },
})
