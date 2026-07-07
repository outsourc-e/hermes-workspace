/**
 * Swarm task queue.
 *
 * GET    /api/swarm-queue                 — list items (open first)
 * POST   /api/swarm-queue {task, worker?, priority?, note?}      — enqueue
 * POST   /api/swarm-queue {action:'drain', max?}                 — dispatch
 *        queued items to idle workers (called by the lifecycle sweep)
 * POST   /api/swarm-queue {action:'cancel', id}                  — cancel item
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  enqueueTask,
  listQueue,
  planQueueDrain,
  updateQueueItem,
} from '../../server/swarm-queue'
import { dispatchSwarmAssignments } from './swarm-dispatch'

export const Route = createFileRoute('/api/swarm-queue')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, items: listQueue() })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }

        if (body.action === 'cancel') {
          const id = typeof body.id === 'string' ? body.id : ''
          const item = updateQueueItem(id, { status: 'cancelled' })
          if (!item) {
            return json({ ok: false, error: 'Unknown id' }, { status: 404 })
          }
          return json({ ok: true, item })
        }

        if (body.action === 'drain') {
          const maxRaw = Number(body.max ?? 2)
          const max = Number.isFinite(maxRaw)
            ? Math.max(1, Math.min(4, maxRaw))
            : 2
          const plans = planQueueDrain(max)
          const results: Array<{
            id: string
            workerId: string
            ok: boolean
            error?: string
          }> = []
          for (const plan of plans) {
            try {
              await dispatchSwarmAssignments({
                assignments: [
                  {
                    workerId: plan.workerId,
                    task: plan.item.task,
                    rationale: `Queued task ${plan.item.id} (priority ${plan.item.priority}).`,
                  },
                ],
                waitForCheckpoint: false,
                allowAsync: true,
              })
              updateQueueItem(plan.item.id, {
                status: 'dispatched',
                worker: plan.workerId,
              })
              results.push({ id: plan.item.id, workerId: plan.workerId, ok: true })
            } catch (error) {
              results.push({
                id: plan.item.id,
                workerId: plan.workerId,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
          return json({
            ok: true,
            dispatched: results.filter((r) => r.ok).length,
            results,
            remaining: listQueue().filter((i) => i.status === 'queued').length,
          })
        }

        const task = typeof body.task === 'string' ? body.task : ''
        try {
          const item = enqueueTask({
            task,
            worker: typeof body.worker === 'string' ? body.worker : null,
            priority: typeof body.priority === 'number' ? body.priority : 2,
            note: typeof body.note === 'string' ? body.note : null,
          })
          return json({ ok: true, item })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
