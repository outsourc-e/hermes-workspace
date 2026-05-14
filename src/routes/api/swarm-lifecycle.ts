import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  autoSweepLifecycle,
  getSwarmLifecycleStatus,
  notifyHandoffWritten,
  renewWorker,
  requestWorkerHandoff,
} from '../../server/swarm-lifecycle'
import { listSwarmWorkerIds } from '../../server/swarm-foundation'
import { isSwarmWorkerId } from '../../server/swarm-roster'

type LifecyclePost = {
  action?: unknown
  workerId?: unknown
}

function validWorkerId(value: unknown): string | null {
  return isSwarmWorkerId(value) ? value.trim() : null
}

export const Route = createFileRoute('/api/swarm-lifecycle')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const requested = validWorkerId(url.searchParams.get('workerId'))
        const ids = requested ? [requested] : listSwarmWorkerIds()
        return json({ ok: true, checkedAt: Date.now(), workers: ids.map((id) => getSwarmLifecycleStatus(id)) })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        let body: LifecyclePost
        try { body = await request.json() as LifecyclePost } catch { return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }) }
        const action = typeof body.action === 'string' ? body.action : ''
        const workerIdMaybe = validWorkerId(body.workerId)
        if (action === 'auto-sweep') {
          const targets = workerIdMaybe ? [workerIdMaybe] : listSwarmWorkerIds()
          const sweep = await autoSweepLifecycle(targets)
          return json({ ok: true, action, sweep })
        }
        if (!workerIdMaybe) return json({ ok: false, error: 'workerId required' }, { status: 400 })
        const workerId = workerIdMaybe
        if (action === 'request-handoff') {
          const result = await requestWorkerHandoff(workerId)
          return json({ ok: result.ok, workerId, action, ...result })
        }
        if (action === 'renew') {
          const result = await renewWorker(workerId)
          return json({ ok: result.ok, workerId, action, ...result })
        }
        if (action === 'notify-handoff-written') {
          notifyHandoffWritten(workerId)
          return json({ ok: true, workerId, action })
        }
        return json({ ok: false, error: 'Unsupported action' }, { status: 400 })
      },
    },
  },
})
