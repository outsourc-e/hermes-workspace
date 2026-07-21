import { createHash } from 'node:crypto'

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

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
  workspaceExecutorPlanForRun,
  workspaceExecutorReadbackForRun,
  workspaceKernelTelemetryFromRun,
} from '../../../../lib/workspace-kernel'
import {
  loadWorkspaceKernelState,
  prepareWorkspaceKernelPersistedState,
  saveWorkspaceKernelState,
} from '../../../../lib/workspace-kernel/store'
import { WorkspacePacketStoreConflictError } from '../../../../lib/workspace-kernel/packets/packet-store'
import { createWorkspaceRunWithExecutionPlan } from '../../../../lib/workspace-kernel/packets/run-bridge'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  mergeWorkspaceKernelStateWithSupabase,
  persistWorkspaceKernelRunsToSupabase,
} from '../../../../server/workspace-core-db'
import type { WorkspaceAction, WorkspaceRun } from '../../../../lib/workspace-kernel'
import type { WorkspaceCorePersistenceSnapshot } from '../../../../server/workspace-core-db'

const noStoreHeaders = { 'cache-control': 'no-store' }
const routeActionApprovalScope = 'workspace-kernel-route-action'
const authenticatedWorkspacePrincipal = 'authenticated-workspace-owner'
const routeActionMaxApprovalAgeMs = 15 * 60 * 1_000
const routeActionMaxApprovalFutureSkewMs = 60 * 1_000
// Workspace authentication currently supports a single server instance. This queue
// serializes writes within that supported boundary; multi-worker deployments must
// move both sessions and idempotency claims to a shared atomic database constraint.
const routeActionWriteQueues = new Map<string, Promise<void>>()

type RouteActionApprovalContext = {
  approvalId: string
  claimedApprovedBy?: string
  approvedAtMs: number
  decision: 'approved'
  scope: typeof routeActionApprovalScope
}

type RouteActionPostEnvelope = {
  idempotencyKey: string
  approvalContext: RouteActionApprovalContext
  action: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, min: number, max: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length >= min && normalized.length <= max ? normalized : null
}

function routeActionPostEnvelopeFromBody(body: unknown, nowMs = Date.now()): RouteActionPostEnvelope | null {
  if (!isRecord(body) || !isRecord(body.approvalContext) || !isRecord(body.action)) return null
  const idempotencyKey = boundedString(body.idempotencyKey, 8, 200)
  const approvalId = boundedString(body.approvalContext.approvalId, 1, 180)
  const claimedApprovedBy = body.approvalContext.approvedBy === undefined
    ? undefined
    : boundedString(body.approvalContext.approvedBy, 1, 180)
  const approvedAtMs = body.approvalContext.approvedAtMs
  if (
    !idempotencyKey
    || !approvalId
    || claimedApprovedBy === null
    || typeof approvedAtMs !== 'number'
    || !Number.isFinite(approvedAtMs)
    || approvedAtMs < nowMs - routeActionMaxApprovalAgeMs
    || approvedAtMs > nowMs + routeActionMaxApprovalFutureSkewMs
    || body.approvalContext.decision !== 'approved'
    || body.approvalContext.scope !== routeActionApprovalScope
  ) return null
  return {
    idempotencyKey,
    approvalContext: {
      approvalId,
      claimedApprovedBy,
      approvedAtMs,
      decision: 'approved',
      scope: routeActionApprovalScope,
    },
    action: body.action,
  }
}

export function workspaceKernelPayloadFromBody(body: unknown, nowMs = Date.now()): WorkspaceAction {
  return normalizeWorkspaceActionInput(body, nowMs)
}

function routeActionIdempotencyHash(envelope: RouteActionPostEnvelope, authenticatedPrincipal: string) {
  return createHash('sha256')
    .update(`${authenticatedPrincipal}\0${envelope.idempotencyKey}`)
    .digest('hex')
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  )
}

function routeActionSemanticFingerprint(action: WorkspaceAction) {
  const semanticAction = {
    source: action.source,
    intent: action.intent,
    summary: action.summary,
    input: action.input,
    preferredBlueprintId: action.preferredBlueprintId,
    preferredRoomId: action.preferredRoomId,
    preferredStationId: action.preferredStationId,
    requestedWorkerProfileId: action.requestedWorkerProfileId,
  }
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeJson(semanticAction)))
    .digest('hex')
}

async function withRouteActionWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = routeActionWriteQueues.get(key) ?? Promise.resolve()
  let release = () => {}
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.catch(() => undefined).then(() => current)
  routeActionWriteQueues.set(key, queued)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (routeActionWriteQueues.get(key) === queued) routeActionWriteQueues.delete(key)
  }
}

function workspaceKernelPayloadFromEnvelope(
  envelope: RouteActionPostEnvelope,
  idempotencyHash: string,
  nowMs = Date.now(),
) {
  const nestedInput = isRecord(envelope.action.input) ? envelope.action.input : {}
  const rawPayload = isRecord(nestedInput.payload)
    ? nestedInput.payload
    : isRecord(envelope.action.payload) ? envelope.action.payload : {}
  const userPayload = Object.fromEntries(
    Object.entries(rawPayload).filter(([key]) => !key.startsWith('kernel')),
  )
  const normalizedAction = workspaceKernelPayloadFromBody({
    ...envelope.action,
    actionId: `workspace-action-idem-${idempotencyHash.slice(0, 32)}`,
    input: {
      ...nestedInput,
      payload: userPayload,
    },
  }, nowMs)
  const semanticFingerprint = routeActionSemanticFingerprint(normalizedAction)
  return workspaceKernelPayloadFromBody({
    ...normalizedAction,
    input: {
      ...normalizedAction.input,
      payload: {
        kernelIdempotencyHash: idempotencyHash,
        kernelRequestFingerprint: semanticFingerprint,
        kernelWriteApprovalId: envelope.approvalContext.approvalId,
        kernelWriteApprovedBy: authenticatedWorkspacePrincipal,
        kernelWriteClaimedApprovedBy: envelope.approvalContext.claimedApprovedBy,
        kernelWriteApprovedAtMs: envelope.approvalContext.approvedAtMs,
        kernelWriteApprovalScope: envelope.approvalContext.scope,
        ...userPayload,
      },
    },
  }, nowMs)
}

function buildWorkspaceKernelRouteResult(
  action: WorkspaceAction,
  nowMs = Date.now(),
  packetAwareRun?: WorkspaceRun,
) {
  const route = routeWorkspaceActionToBlueprint(action)
  const run = packetAwareRun ?? createWorkspaceRun(route.action, route.blueprint, nowMs)
  const artifact = createWorkspaceArtifactForRun(run, route.blueprint, nowMs + 2)
  let state = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
  if (route.requiresApproval) {
    state = requestWorkspaceApproval(
      state,
      run.runId,
      createWorkspaceApprovalForRun(state.runs[0], route.blueprint, nowMs + 3),
    )
  }
  return {
    route,
    run: state.runs[0],
  }
}

type WorkspaceKernelRouteResult = ReturnType<typeof buildWorkspaceKernelRouteResult>
type WorkspaceKernelPersistedState = Awaited<ReturnType<typeof loadWorkspaceKernelState>>

function previewWorkspaceKernelRouteResult(result: WorkspaceKernelRouteResult) {
  return {
    ok: true,
    mode: 'preview',
    preview: true,
    persisted: false,
    requiresCommitApproval: true,
    result,
    executorPlan: workspaceExecutorPlanForRun(result.run),
    executorReadback: workspaceExecutorReadbackForRun(result.run),
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    externalRequestsAllowed: false,
    liveActionsAllowed: false,
    lockedActions: result.run.lockedActions,
    safety: WORKSPACE_KERNEL_SAFETY,
  }
}

function persistedWorkspaceKernelRoutePayload(
  result: WorkspaceKernelRouteResult,
  state: WorkspaceKernelPersistedState,
  persistence: WorkspaceCorePersistenceSnapshot,
  idempotentReplay: boolean,
) {
  return {
    ok: true,
    mode: 'committed',
    preview: false,
    persisted: true,
    idempotentReplay,
    replayed: idempotentReplay,
    stateVersion: state.stateVersion,
    result,
    executorPlan: workspaceExecutorPlanForRun(result.run),
    executorReadback: workspaceExecutorReadbackForRun(result.run),
    state,
    displayStates: buildKernelAgentDisplayStates(state),
    localOnly: persistence.provider !== 'supabase',
    usageAllowed: false,
    workerSpawnAllowed: false,
    externalRequestsAllowed: false,
    liveActionsAllowed: false,
    lockedActions: result.run.lockedActions,
    safety: WORKSPACE_KERNEL_SAFETY,
    persistence,
  }
}

function existingRunMatchesRoute(existingRun: WorkspaceRun, result: WorkspaceKernelRouteResult) {
  const existingPayload = isRecord(existingRun.actionInput.payload)
    ? existingRun.actionInput.payload
    : {}
  const incomingPayload = isRecord(result.route.action.input.payload)
    ? result.route.action.input.payload
    : {}
  const existingFingerprint = existingPayload.kernelRequestFingerprint
  const incomingFingerprint = incomingPayload.kernelRequestFingerprint
  return existingRun.blueprintId === result.route.blueprint.blueprintId
    && typeof existingFingerprint === 'string'
    && existingFingerprint === incomingFingerprint
}

async function persistWorkspaceKernelRouteResult(result: WorkspaceKernelRouteResult, nowMs = Date.now()) {
  const previousLocal = await loadWorkspaceKernelState()
  const previousMirror = await mergeWorkspaceKernelStateWithSupabase(previousLocal)
  const previous = previousMirror.state
  const existingRun = previous.runs.find((run) => run.actionId === result.route.action.actionId)
  if (existingRun) {
    if (!existingRunMatchesRoute(existingRun, result)) {
      return {
        ok: false as const,
        status: 409,
        payload: {
          ok: false,
          error: 'Idempotency key already used for a different action',
        },
      }
    }
    return {
      ok: true as const,
      status: 200,
      payload: persistedWorkspaceKernelRoutePayload(
        {
          route: {
            ...result.route,
            action: {
              ...result.route.action,
              actionId: existingRun.actionId,
              summary: existingRun.actionSummary,
              input: existingRun.actionInput,
            },
          },
          run: existingRun,
        },
        previous,
        previousMirror.persistence,
        true,
      ),
    }
  }

  const packetAware = await createWorkspaceRunWithExecutionPlan(
    result.route.action,
    result.route.blueprint,
    nowMs,
  )
  const committedResult = buildWorkspaceKernelRouteResult(
    result.route.action,
    nowMs,
    packetAware.run,
  )
  const telemetry = workspaceKernelTelemetryFromRun(committedResult.run, {
    artifactKind: committedResult.run.artifacts[0]?.kind,
  })
  const nextState = prepareWorkspaceKernelPersistedState({
    previous,
    runs: [committedResult.run],
    telemetry,
  }, nowMs)
  const saved = await saveWorkspaceKernelState(nextState, { nowMs })
  const persistence = await persistWorkspaceKernelRunsToSupabase([committedResult.run], telemetry)
  return {
    ok: true as const,
    status: 200,
    payload: persistedWorkspaceKernelRoutePayload(committedResult, saved, persistence, false),
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/route-action')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const url = new URL(request.url)
        const q = url.searchParams.get('q') ?? ''
        const nowMs = Date.now()
        const action = normalizeWorkspaceActionInput({
          actionId: `api-workspace-kernel-preview-${nowMs}`,
          createdAtMs: nowMs,
          source: 'hermes',
          intent: q,
          summary: q,
          input: { text: q },
        }, nowMs)
        const result = buildWorkspaceKernelRouteResult(action, nowMs)
        return json(previewWorkspaceKernelRouteResult(result), { headers: noStoreHeaders })
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
        const requestNowMs = Date.now()
        const envelope = routeActionPostEnvelopeFromBody(body, requestNowMs)
        if (!envelope) {
          return json(
            { ok: false, error: 'Explicit approval and idempotency context required' },
            { status: 400, headers: noStoreHeaders },
          )
        }
        const idempotencyHash = routeActionIdempotencyHash(
          envelope,
          authenticatedWorkspacePrincipal,
        )
        let persisted
        try {
          persisted = await withRouteActionWriteLock(idempotencyHash, async () => {
            const nowMs = Date.now()
            const action = workspaceKernelPayloadFromEnvelope(envelope, idempotencyHash, nowMs)
            const result = buildWorkspaceKernelRouteResult(action, nowMs)
            return persistWorkspaceKernelRouteResult(result, nowMs + 10)
          })
        } catch (error) {
          if (error instanceof WorkspacePacketStoreConflictError) {
            return json({ ok: false, error: error.message }, { status: 409, headers: noStoreHeaders })
          }
          throw error
        }
        return json(persisted.payload, { status: persisted.status, headers: noStoreHeaders })
      },
    },
  },
})
