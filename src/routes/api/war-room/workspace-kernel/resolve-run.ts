import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  WORKSPACE_KERNEL_SAFETY,
  buildKernelAgentDisplayStates,
  cancelWorkspaceKernelRun,
  resolveWorkspaceKernelApproval,
  workspaceExecutorPlanForRun,
  workspaceExecutorReadbackForRun,
  workspaceKernelTelemetryFromRun,
} from '../../../../lib/workspace-kernel'
import type { WorkspaceKernelApprovalDecision, WorkspaceRun } from '../../../../lib/workspace-kernel'
import { loadWorkspaceKernelState, prepareWorkspaceKernelPersistedState, saveWorkspaceKernelState } from '../../../../lib/workspace-kernel/store'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  type WorkspaceCorePersistenceSnapshot,
  mergeWorkspaceKernelStateWithSupabase,
  persistWorkspaceKernelRunsToSupabase,
} from '../../../../server/workspace-core-db'

const noStoreHeaders = { 'cache-control': 'no-store' }
const approvalDecisions: Array<WorkspaceKernelApprovalDecision> = ['approved', 'rejected', 'needs_edit']

type ResolveRunAction = WorkspaceKernelApprovalDecision | 'cancel'

type ResolveRunPayload = {
  action: ResolveRunAction
  approvalId?: string
  runId?: string
  reason?: string
}

function safeString(value: unknown, max = 1_200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function payloadFromBody(body: unknown): ResolveRunPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const candidate = body as Record<string, unknown>
  const action = safeString(candidate.action, 80) as ResolveRunAction
  if (action !== 'cancel' && !approvalDecisions.includes(action)) return null
  const approvalId = safeString(candidate.approvalId, 180)
  const runId = safeString(candidate.runId, 180)
  if (action === 'cancel' && !runId) return null
  if (action !== 'cancel' && !approvalId) return null
  return {
    action,
    approvalId: approvalId || undefined,
    runId: runId || undefined,
    reason: safeString(candidate.reason, 1_200) || undefined,
  }
}

function findTouchedRun(runs: Array<WorkspaceRun>, payload: ResolveRunPayload) {
  if (payload.runId) return runs.find((run) => run.runId === payload.runId)
  if (payload.approvalId) return runs.find((run) => run.approvals.some((approval) => approval.approvalId === payload.approvalId))
  return undefined
}

function responsePayload(
  state: Awaited<ReturnType<typeof loadWorkspaceKernelState>>,
  run?: WorkspaceRun,
  persistence?: WorkspaceCorePersistenceSnapshot,
) {
  return {
    ok: true,
    stateVersion: state.stateVersion,
    result: state,
    state,
    run,
    executorPlan: run ? workspaceExecutorPlanForRun(run) : undefined,
    executorReadback: run ? workspaceExecutorReadbackForRun(run) : undefined,
    telemetry: state.telemetry,
    displayStates: buildKernelAgentDisplayStates(state),
    localOnly: persistence?.provider !== 'supabase',
    usageAllowed: false,
    workerSpawnAllowed: false,
    externalRequestsAllowed: false,
    liveActionsAllowed: false,
    lockedActions: run?.lockedActions ?? [],
    safety: WORKSPACE_KERNEL_SAFETY,
    readback: run?.readback ?? 'Workspace kernel run updated locally.',
    persistence,
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/resolve-run')({
  server: {
    handlers: {
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
        const payload = payloadFromBody(body)
        if (!payload) {
          return json({ ok: false, error: 'Invalid resolve-run payload' }, { status: 400, headers: noStoreHeaders })
        }
        const nowMs = Date.now()
        const previousLocal = await loadWorkspaceKernelState()
        const previousMirror = await mergeWorkspaceKernelStateWithSupabase(previousLocal)
        const previous = previousMirror.state
        const nextState = payload.action === 'cancel'
          ? cancelWorkspaceKernelRun(previous, payload.runId!, payload.reason, nowMs)
          : resolveWorkspaceKernelApproval(previous, payload.approvalId!, payload.action, { reason: payload.reason, nowMs })
        const touchedRun = findTouchedRun(nextState.runs, payload)
        if (!touchedRun || nextState === previous) {
          return json({ ok: false, error: 'Workspace run or approval not found', state: previous }, { status: 404, headers: noStoreHeaders })
        }
        const eventId = touchedRun.events[touchedRun.events.length - 1]?.eventId
        const telemetry = workspaceKernelTelemetryFromRun(touchedRun, {
          artifactKind: touchedRun.artifacts[0]?.kind,
          eventId,
        })
        const saved = await saveWorkspaceKernelState(prepareWorkspaceKernelPersistedState({
          previous,
          runs: nextState.runs,
          telemetry,
        }, nowMs), { nowMs })
        const savedRun = findTouchedRun(saved.runs, payload) ?? touchedRun
        const persistence = await persistWorkspaceKernelRunsToSupabase([savedRun], telemetry)
        return json(responsePayload(saved, savedRun, persistence), { headers: noStoreHeaders })
      },
    },
  },
})
