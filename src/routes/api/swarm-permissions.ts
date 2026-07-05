import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SWARM_PERMISSION_MODES,
  getAllPermissionModes,
  getWorkerPermissionMode,
  isSwarmPermissionMode,
  setWorkerPermissionMode,
} from '../../server/swarm-permissions'
import { rosterByWorkerId } from '../../server/swarm-roster'

export const Route = createFileRoute('/api/swarm-permissions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, modes: getAllPermissionModes() })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { workerId?: unknown; mode?: unknown; all?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        if (!isSwarmPermissionMode(body.mode)) {
          return json(
            {
              ok: false,
              error: `mode must be one of: ${SWARM_PERMISSION_MODES.join(', ')}`,
            },
            { status: 400 },
          )
        }
        const roster = rosterByWorkerId()

        if (body.all === true) {
          const results: Record<string, { ok: boolean; error?: string }> = {}
          for (const workerId of roster.keys()) {
            const result = setWorkerPermissionMode(workerId, body.mode)
            results[workerId] = result.ok
              ? { ok: true }
              : { ok: false, error: result.error }
          }
          return json({ ok: true, mode: body.mode, results })
        }

        // Roster membership check doubles as path-traversal protection: the
        // workerId is only ever used if it exactly matches a roster entry.
        if (typeof body.workerId !== 'string' || !roster.has(body.workerId)) {
          return json(
            { ok: false, error: 'unknown workerId' },
            { status: 400 },
          )
        }
        const result = setWorkerPermissionMode(body.workerId, body.mode)
        if (!result.ok) {
          return json({ ok: false, error: result.error }, { status: 500 })
        }
        const current = getWorkerPermissionMode(body.workerId)
        return json({
          ok: true,
          workerId: body.workerId,
          mode: current.ok ? current.mode : body.mode,
          changed: result.changed,
        })
      },
    },
  },
})
