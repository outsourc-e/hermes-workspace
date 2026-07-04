import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  WORKSPACE_KERNEL_SAFETY,

  attachWorkspaceArtifact,
  buildKernelAgentDisplayStates,
  createWorkspaceApprovalForRun,
  createWorkspaceArtifactForRun,
  createWorkspaceRun,
  normalizeWorkspaceActionInput,
  requestWorkspaceApproval,
  routeWorkspaceActionToBlueprint,
  workspaceKernelTelemetryFromRun
} from '../../../../lib/workspace-kernel'
import {
  loadWorkspaceKernelState,
  prepareWorkspaceKernelPersistedState,
  saveWorkspaceKernelState,
} from '../../../../lib/workspace-kernel/store'
import type {WorkspaceAction} from '../../../../lib/workspace-kernel';

const noStoreHeaders = { 'cache-control': 'no-store' }

export function workspaceKernelPayloadFromBody(body: unknown, nowMs = Date.now()): WorkspaceAction {
  return normalizeWorkspaceActionInput(body, nowMs)
}

function buildWorkspaceKernelRouteResult(action: WorkspaceAction, nowMs = Date.now()) {
  const route = routeWorkspaceActionToBlueprint(action)
  const run = createWorkspaceRun(route.action, route.blueprint, nowMs)
  const artifact = createWorkspaceArtifactForRun(run, route.blueprint, nowMs + 2)
  let state = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
  if (route.requiresApproval) {
    state = requestWorkspaceApproval(state, run.runId, createWorkspaceApprovalForRun(state.runs[0], route.blueprint, nowMs + 3))
  }
  return {
    route,
    run: state.runs[0],
  }
}

async function persistWorkspaceKernelRouteResult(result: ReturnType<typeof buildWorkspaceKernelRouteResult>, nowMs = Date.now()) {
  const previous = await loadWorkspaceKernelState()
  const telemetry = workspaceKernelTelemetryFromRun(result.run, {
    artifactKind: result.run.artifacts[0]?.kind,
  })
  const nextState = prepareWorkspaceKernelPersistedState({
    previous,
    runs: [result.run],
    telemetry,
  }, nowMs)
  const saved = await saveWorkspaceKernelState(nextState, { nowMs })
  return {
    ok: true,
    stateVersion: saved.stateVersion,
    result,
    state: saved,
    displayStates: buildKernelAgentDisplayStates(saved),
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    externalRequestsAllowed: false,
    liveActionsAllowed: false,
    lockedActions: result.run.lockedActions,
    safety: WORKSPACE_KERNEL_SAFETY,
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/route-action')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const url = new URL(request.url)
        const q = url.searchParams.get('q') ?? ''
        const nowMs = Date.now()
        const action = normalizeWorkspaceActionInput({
          actionId: `api-workspace-kernel-${nowMs}`,
          createdAtMs: nowMs,
          source: 'hermes',
          intent: q,
          summary: q,
          input: { text: q },
        }, nowMs)
        const result = buildWorkspaceKernelRouteResult(action, nowMs)
        return json(await persistWorkspaceKernelRouteResult(result, nowMs + 10), { headers: noStoreHeaders })
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
        const nowMs = Date.now()
        const action = workspaceKernelPayloadFromBody(body, nowMs)
        const result = buildWorkspaceKernelRouteResult(action, nowMs)
        return json(await persistWorkspaceKernelRouteResult(result, nowMs + 10), { headers: noStoreHeaders })
      },
    },
  },
})
