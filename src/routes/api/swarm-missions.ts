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

        const workerIds = new Set<string>()
        if ('assignment' in result) workerIds.add(result.assignment.workerId)
        if ('cancelledAssignmentIds' in result) {
          const cancelledIds = new Set(result.cancelledAssignmentIds)
          for (const assignment of result.mission.assignments) {
            if (cancelledIds.has(assignment.id))
              workerIds.add(assignment.workerId)
          }
        }
        const runtimeResets = []
        if (body.resetWorkers !== false && workerIds.size > 0) {
          const workerBindings = parseWorkerCardBindings(
            body.workerCardBindings,
          )
          if (!workerBindings) {
            return json(
              {
                ok: false,
                error: 'Exact worker Card reset bindings required',
                result,
              },
              { status: 409 },
            )
          }
          for (const id of workerIds) {
            const binding = workerBindings.get(id)
            if (
              !binding ||
              !(await resolveExactSessionCardOperationBinding(binding))
            ) {
              runtimeResets.push({
                workerId: id,
                ok: false,
                error: 'Session Card reset binding is unavailable',
              })
              continue
            }
            runtimeResets.push(resetSwarmWorkerRuntime(id, { actor, reason }))
          }
        }

        return json({
          ok: true,
          action,
          result,
          runtimeResets,
          cancelledAt: Date.now(),
        })
      },
    },
  },
})
