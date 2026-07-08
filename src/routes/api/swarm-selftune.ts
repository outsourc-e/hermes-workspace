/**
 * Self-tuning API. POST {action:'anomaly-check'} — run the daily anomaly
 * detector (called by the lifecycle sweep; pushes to the phone at most once
 * per day when something regresses).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { runAnomalyCheck } from '../../server/swarm-selftune'

export const Route = createFileRoute('/api/swarm-selftune')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { action?: string }
        try {
          body = (await request.json()) as { action?: string }
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        if (body.action === 'anomaly-check') {
          return json({ ok: true, report: runAnomalyCheck() })
        }
        return json({ ok: false, error: 'Unknown action' }, { status: 400 })
      },
    },
  },
})
