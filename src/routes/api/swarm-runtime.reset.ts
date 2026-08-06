import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'
import {
  listResettableSwarmWorkerIds,
  resetSwarmWorkerRuntime,
} from '../../server/swarm-runtime-reset'
import type { SessionCardOperationBinding } from '../../server/session-card-operation-binding'

type ResetBody = {
  workerIds?: unknown
  cardBindings?: unknown
  reason?: unknown
  actor?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseWorkerBindings(
  value: unknown,
): Array<{ workerId: string; binding: SessionCardOperationBinding }> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const available = new Set(listResettableSwarmWorkerIds())
  const parsed: Array<{
    workerId: string
    binding: SessionCardOperationBinding
  }> = []
  for (const candidate of value) {
    const binding = parseSessionCardOperationBinding(candidate, {
      source: 'local',
      transport: 'tmux',
    })
    if (!binding || !binding.canonicalSegmentKey.startsWith('local:'))
      return null
    const workerId = binding.canonicalSegmentKey.slice('local:'.length)
    if (
      !available.has(workerId) ||
      parsed.some((entry) => entry.workerId === workerId)
    ) {
      return null
    }
    parsed.push({ workerId, binding })
  }
  return parsed
}

export const Route = createFileRoute('/api/swarm-runtime/reset')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        let body: ResetBody
        try {
          body = (await request.json()) as ResetBody
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }

        if (Object.prototype.hasOwnProperty.call(body, 'workerIds')) {
          return json(
            { ok: false, error: 'Raw workerIds reset is unsupported' },
            { status: 400 },
          )
        }
        const targets = parseWorkerBindings(body.cardBindings)
        if (!targets) {
          return json(
            { ok: false, error: 'Exact Session Card reset bindings required' },
            { status: 400 },
          )
        }

        const actor = cleanString(body.actor) ?? 'swarm-runtime-reset'
        const reason =
          cleanString(body.reason) ?? 'Swarm runtime reset from Workspace API'
        const results = []
        for (const target of targets) {
          // Resolve each worker independently at its final runtime-file edge.
          if (
            !(await resolveExactSessionCardOperationBinding(target.binding))
          ) {
            results.push({
              workerId: target.workerId,
              ok: false,
              error: 'Session Card reset binding is unavailable',
            })
            continue
          }
          results.push(
            resetSwarmWorkerRuntime(target.workerId, { actor, reason }),
          )
        }
        const resetCount = results.filter((result) => result.ok).length
        const failureCount = results.length - resetCount
        const status = failureCount > 0 ? 207 : 200

        return json(
          {
            ok: failureCount === 0,
            actor,
            reason,
            workerIds: targets.map((target) => target.workerId),
            results,
            resetCount,
            failureCount,
            resetAt: Date.now(),
          },
          { status },
        )
      },
    },
  },
})
