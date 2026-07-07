/**
 * GET /api/swarm-scoreboard — per-worker success rates derived from the
 * outcome memory (.runtime/swarm-outcomes.jsonl). Powers the dashboard
 * scoreboard card and lets the operator see which workers/tiers are
 * earning their keep.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { getSwarmScoreboard } from '../../server/swarm-outcomes'

export const Route = createFileRoute('/api/swarm-scoreboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, ...getSwarmScoreboard() })
      },
    },
  },
})
