import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { SWARM_ROSTER_PATH, readSwarmRoster, upsertSwarmRosterWorker } from '../../server/swarm-roster'
import { listSwarmWorkerIds } from '../../server/swarm-foundation'

export const Route = createFileRoute('/api/swarm-roster')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
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
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        try {
          const ids = listSwarmWorkerIds()
          const roster = upsertSwarmRosterWorker(body as never, ids)
          return json({ ok: true, path: SWARM_ROSTER_PATH, roster, savedAt: Date.now() })
        } catch (error) {
          return json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to save swarm roster entry',
          }, { status: 400 })
        }
      },
    },
  },
})
