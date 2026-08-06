import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { listSwarmWorkerIds } from '../../server/swarm-foundation'
import { parseSessionCardOperationBinding } from '../../server/session-card-operation-binding'
import {
  autoSweepLifecycle,
  getSwarmLifecycleStatus,
  notifyHandoffWritten,
  renewWorker,
  requestWorkerHandoff,
} from '../../server/swarm-lifecycle'
import { isSwarmWorkerId } from '../../server/swarm-roster'

type LifecyclePost = {
  action?: unknown
  workerId?: unknown
  cardBinding?: unknown
  targets?: unknown
}

function validWorkerId(value: unknown): string | null {
  return isSwarmWorkerId(value) ? value.trim() : null
}

function parseLifecycleBinding(workerId: string, value: unknown) {
  return parseSessionCardOperationBinding(value, {
    source: 'local',
    transport: 'tmux',
    canonicalSegmentKey: `local:${workerId}`,
  })
}

export const Route = createFileRoute('/api/swarm-lifecycle')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const requested = validWorkerId(url.searchParams.get('workerId'))
        const ids = requested ? [requested] : listSwarmWorkerIds()
        return json({
          ok: true,
          checkedAt: Date.now(),
          workers: ids.map((id) => getSwarmLifecycleStatus(id)),
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        let body: LifecyclePost
        try {
          body = (await request.json()) as LifecyclePost
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }
        const action = typeof body.action === 'string' ? body.action : ''
        const workerIdMaybe = validWorkerId(body.workerId)
        if (action === 'auto-sweep') {
          if (!Array.isArray(body.targets) || body.targets.length === 0) {
            return json(
              {
                ok: false,
                error: 'targets[] with exact Session Card bindings required',
              },
              { status: 400 },
            )
          }
          const targets = body.targets.flatMap((value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              return []
            }
            const target = value as {
              workerId?: unknown
              cardBinding?: unknown
            }
            const workerId = validWorkerId(target.workerId)
            if (!workerId) return []
            const cardBinding = parseLifecycleBinding(
              workerId,
              target.cardBinding,
            )
            return cardBinding ? [{ workerId, cardBinding }] : []
          })
          if (targets.length !== body.targets.length) {
            return json(
              { ok: false, error: 'Invalid Session Card lifecycle binding' },
              { status: 400 },
            )
          }
          const sweep = await autoSweepLifecycle(targets)
          return json({ ok: true, action, sweep })
        }
        if (!workerIdMaybe)
          return json(
            { ok: false, error: 'workerId required' },
            { status: 400 },
          )
        const workerId = workerIdMaybe
        const cardBinding = parseLifecycleBinding(workerId, body.cardBinding)
        if (!cardBinding) {
          return json(
            { ok: false, error: 'Invalid Session Card lifecycle binding' },
            { status: 400 },
          )
        }
        if (action === 'request-handoff') {
          const result = await requestWorkerHandoff(workerId, cardBinding)
          return json({ workerId, action, ...result })
        }
        if (action === 'renew') {
          const result = await renewWorker(workerId, cardBinding)
          return json({ workerId, action, ...result })
        }
        if (action === 'notify-handoff-written') {
          if (!(await notifyHandoffWritten(workerId, cardBinding))) {
            return json(
              {
                ok: false,
                error: 'Session Card lifecycle binding is unavailable',
              },
              { status: 409 },
            )
          }
          return json({ ok: true, workerId, action })
        }
        return json({ ok: false, error: 'Unsupported action' }, { status: 400 })
      },
    },
  },
})
