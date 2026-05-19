import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { resetSwarmWorkerRuntimes, resolveResetTargetWorkerIds } from '../../server/swarm-runtime-reset'

type ResetBody = {
  workerIds?: unknown
  reason?: unknown
  actor?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        if (body.workerIds !== undefined && !Array.isArray(body.workerIds)) {
          return json({ ok: false, error: 'workerIds must be an array of worker ids when provided' }, { status: 400 })
        }

        const actor = cleanString(body.actor) ?? 'swarm-runtime-reset'
        const reason = cleanString(body.reason) ?? 'Swarm runtime reset from Workspace API'
        const requestedWorkerIds = Array.isArray(body.workerIds)
          ? body.workerIds.filter((value): value is string => typeof value === 'string')
          : undefined

        const targets = resolveResetTargetWorkerIds(requestedWorkerIds)
        if (!targets.ok || !targets.workerIds) {
          return json({ ok: false, error: targets.error ?? 'Unable to resolve worker ids' }, { status: 400 })
        }

        const results = resetSwarmWorkerRuntimes(targets.workerIds, { actor, reason })
        const resetCount = results.filter((result) => result.ok).length
        const failureCount = results.length - resetCount
        const status = failureCount > 0 ? 207 : 200

        return json({
          ok: failureCount === 0,
          actor,
          reason,
          workerIds: targets.workerIds,
          results,
          resetCount,
          failureCount,
          resetAt: Date.now(),
        }, { status })
      },
    },
  },
})
