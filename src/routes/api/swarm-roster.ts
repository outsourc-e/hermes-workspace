import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  SWARM_ROSTER_PATH,
  readSwarmRoster,
  updateSwarmRosterWorkerModel,
  upsertSwarmRosterWorker,
} from '../../server/swarm-roster'
import { listSwarmWorkerIds } from '../../server/swarm-foundation'
import { loadSubscriptionCatalog } from '../../server/subscription-model-catalog'

export const Route = createFileRoute('/api/swarm-roster')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const ids = listSwarmWorkerIds()
        return json({
          ok: true,
          path: SWARM_ROSTER_PATH,
          roster: readSwarmRoster(ids),
          fetchedAt: Date.now(),
        })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }
        try {
          const ids = listSwarmWorkerIds()
          const roster = upsertSwarmRosterWorker(body as never, ids)
          return json({
            ok: true,
            path: SWARM_ROSTER_PATH,
            roster,
            savedAt: Date.now(),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to save swarm roster entry',
            },
            { status: 400 },
          )
        }
      },
      PATCH: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { id?: unknown; modelRef?: unknown }
        try {
          body = (await request.json()) as { id?: unknown; modelRef?: unknown }
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        const modelRef =
          typeof body.modelRef === 'string' ? body.modelRef.trim() : ''
        if (!id || !modelRef) {
          return json(
            { ok: false, error: 'id and modelRef are required' },
            { status: 400 },
          )
        }
        try {
          const catalog = await loadSubscriptionCatalog()
          const route = catalog.models.find((model) => model.id === modelRef)
          if (!route || !route.selectable) {
            return json(
              {
                ok: false,
                error: 'Model route is not an assignable OAuth subscription',
              },
              { status: 400 },
            )
          }
          const roster = updateSwarmRosterWorkerModel(
            id,
            modelRef,
            listSwarmWorkerIds(),
          )
          return json({
            ok: true,
            path: SWARM_ROSTER_PATH,
            roster,
            savedAt: Date.now(),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to update swarm model assignment',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
