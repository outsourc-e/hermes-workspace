import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SWARM_MISSIONS_PATH,
  cancelSwarmAssignment,
  cancelSwarmMission,
  getSwarmMission,
  listSwarmMissions,
  listSwarmReports,
  swarmMissionHasExactCardAuthority,
} from '../../server/swarm-missions'
import { resetSwarmWorkerRuntime } from '../../server/swarm-runtime-reset'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'
import type { SessionCardOperationBinding } from '../../server/session-card-operation-binding'

type CancelPostBody = {
  action?: unknown
  missionId?: unknown
  assignmentId?: unknown
  workerId?: unknown
  reason?: unknown
  actor?: unknown
  resetWorkers?: unknown
  cardBinding?: unknown
  workerCardBindings?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseWorkerCardBindings(
  value: unknown,
): ReadonlyMap<string, SessionCardOperationBinding> | null {
  if (!Array.isArray(value)) return null
  const bindings = new Map<string, SessionCardOperationBinding>()
  for (const candidate of value) {
    const binding = parseSessionCardOperationBinding(candidate, {
      source: 'local',
      transport: 'tmux',
    })
    if (!binding || !binding.canonicalSegmentKey.startsWith('local:'))
      return null
    const workerId = binding.canonicalSegmentKey.slice('local:'.length)
    if (!workerId || bindings.has(workerId)) return null
    bindings.set(workerId, binding)
  }
  return bindings
}

export const Route = createFileRoute('/api/swarm-missions')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim()
        const limitRaw = Number(url.searchParams.get('limit') ?? 20)
        const limit = Number.isFinite(limitRaw) ? limitRaw : 20
        return json({
          ok: true,
          path: SWARM_MISSIONS_PATH,
          mission: id ? getSwarmMission(id) : null,
          missions: id ? [] : listSwarmMissions(limit),
          reports: id ? listSwarmReports({ missionId: id, limit }) : [],
          fetchedAt: Date.now(),
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: CancelPostBody
        try {
          body = (await request.json()) as CancelPostBody
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }
        const action = cleanString(body.action)
        if (action !== 'cancel')
          return json(
            { ok: false, error: 'Unsupported action' },
            { status: 400 },
          )
        const missionId = cleanString(body.missionId)
        if (!missionId)
          return json(
            { ok: false, error: 'missionId required' },
            { status: 400 },
          )
        const rawBinding =
          body.cardBinding &&
          typeof body.cardBinding === 'object' &&
          !Array.isArray(body.cardBinding)
            ? (body.cardBinding as { canonicalSource?: unknown })
            : null
        const source =
          rawBinding?.canonicalSource === 'local'
            ? 'local'
            : rawBinding?.canonicalSource === 'remote'
              ? 'remote'
              : null
        const cardBinding = source
          ? parseSessionCardOperationBinding(body.cardBinding, {
              source,
              transport: source === 'local' ? 'tmux' : 'gateway',
            })
          : null
        if (!cardBinding)
          return json(
            { ok: false, error: 'Invalid mission Card binding' },
            { status: 400 },
          )
        if (!swarmMissionHasExactCardAuthority(missionId, cardBinding)) {
          return json(
            {
              ok: false,
              error: 'Session Card is not authorized for this mission',
            },
            { status: 409 },
          )
        }
        if (!(await resolveExactSessionCardOperationBinding(cardBinding))) {
          return json(
            {
              ok: false,
              error: 'Session Card ownership changed before cancellation',
            },
            { status: 409 },
          )
        }
        const actor = cleanString(body.actor) ?? 'workspace-cancel'
        const reason =
          cleanString(body.reason) ?? 'Cancelled from Workspace Swarm'
        const assignmentId = cleanString(body.assignmentId)
        if (Object.prototype.hasOwnProperty.call(body, 'workerId')) {
          return json(
            { ok: false, error: 'Raw workerId cancellation is unsupported' },
            { status: 400 },
          )
        }

        const missionBeforeCancellation = getSwarmMission(missionId)
        if (!missionBeforeCancellation)
          return json(
            { ok: false, error: 'Mission not found' },
            { status: 404 },
          )
        const assignmentBeforeCancellation = assignmentId
          ? missionBeforeCancellation.assignments.find(
              (assignment) => assignment.id === assignmentId,
            )
          : null
        if (assignmentId && !assignmentBeforeCancellation) {
          return json(
            { ok: false, error: 'Mission assignment not found' },
            { status: 404 },
          )
        }

        // Include already-cancelled assignments so a retry after partial cleanup
        // retains the workers affected by the first durable cancellation.
        const workerIds = new Set(
          assignmentBeforeCancellation
            ? [assignmentBeforeCancellation.workerId]
            : missionBeforeCancellation.assignments
                .filter(
                  (assignment) =>
                    assignment.state !== 'checkpointed' &&
                    assignment.state !== 'done',
                )
                .map((assignment) => assignment.workerId),
        )
        const shouldResetWorkers =
          body.resetWorkers !== false && workerIds.size > 0
        const workerBindings = shouldResetWorkers
          ? parseWorkerCardBindings(body.workerCardBindings)
          : new Map<string, SessionCardOperationBinding>()
        if (!workerBindings) {
          return json(
            {
              ok: false,
              retryable: true,
              error: 'Exact worker Card reset bindings required',
              unresolvedWorkerIds: [...workerIds],
            },
            { status: 409 },
          )
        }

        // Preflight every destructive cleanup authority before making the
        // durable cancellation visible. A missing binding must not strand a
        // newly-cancelled mission with no recoverable worker target list.
        if (shouldResetWorkers) {
          const unavailableWorkerIds: Array<string> = []
          for (const id of workerIds) {
            const binding = workerBindings.get(id)
            if (
              !binding ||
              !swarmMissionHasExactCardAuthority(missionId, binding) ||
              !(await resolveExactSessionCardOperationBinding(binding))
            ) {
              unavailableWorkerIds.push(id)
            }
          }
          if (unavailableWorkerIds.length > 0) {
            return json(
              {
                ok: false,
                retryable: true,
                error: 'Worker cleanup authority is unavailable',
                unresolvedWorkerIds: unavailableWorkerIds,
              },
              { status: 409 },
            )
          }
        }

        // Revalidate the mission owner at the mutation edge after worker
        // preflight awaits; ownership may have rolled while those resolved.
        if (
          !swarmMissionHasExactCardAuthority(missionId, cardBinding) ||
          !(await resolveExactSessionCardOperationBinding(cardBinding))
        ) {
          return json(
            {
              ok: false,
              retryable: true,
              error: 'Session Card ownership changed before cancellation',
              unresolvedWorkerIds: [...workerIds],
            },
            { status: 409 },
          )
        }

        const result = assignmentId
          ? cancelSwarmAssignment({
              missionId,
              assignmentId,
              workerId: null,
              actor,
              reason,
            })
          : cancelSwarmMission({ missionId, actor, reason })
        if (!result)
          return json(
            { ok: false, error: 'Mission or assignment not found' },
            { status: 404 },
          )

        const runtimeResets = []
        if (shouldResetWorkers) {
          for (const id of workerIds) {
            const binding = workerBindings.get(id)!
            if (
              !swarmMissionHasExactCardAuthority(missionId, binding) ||
              !(await resolveExactSessionCardOperationBinding(binding))
            ) {
              runtimeResets.push({
                workerId: id,
                ok: false,
                error: 'Session Card reset binding is unavailable',
              })
              continue
            }
            try {
              runtimeResets.push(resetSwarmWorkerRuntime(id, { actor, reason }))
            } catch (error) {
              runtimeResets.push({
                workerId: id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
        }

        const unresolvedWorkerIds = runtimeResets
          .filter((reset) => !reset.ok)
          .map((reset) => reset.workerId)
        const response = {
          ok: unresolvedWorkerIds.length === 0,
          action,
          result,
          runtimeResets,
          unresolvedWorkerIds,
          retryable: unresolvedWorkerIds.length > 0,
          ...(unresolvedWorkerIds.length > 0
            ? {
                error:
                  'Cancellation persisted but worker cleanup is incomplete',
              }
            : {}),
          cancelledAt: Date.now(),
        }
        return json(response, {
          status: unresolvedWorkerIds.length > 0 ? 503 : 200,
        })
      },
    },
  },
})
