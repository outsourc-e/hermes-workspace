/**
 * Live local Mission Control system snapshot.
 * GET /api/mission-control/system
 *
 * This is read-only. It reports integration health, Apple bridge counts,
 * Obsidian recent notes, Hermes model/provider warnings, and infrastructure
 * state without exposing secrets or making external writes.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import { buildMissionControlSystemSnapshot } from '../../../server/mission-control-system'

export const Route = createFileRoute('/api/mission-control/system')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const snapshot = await buildMissionControlSystemSnapshot()
          return json({ ok: true, ...snapshot })
        } catch (err) {
          const message = err instanceof Error ? err.message.slice(0, 180) : 'Unknown Mission Control system error'
          return json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})
