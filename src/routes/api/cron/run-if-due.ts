import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayCronRpc } from '@/server/cron'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/cron/run-if-due')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAuthenticated(request)) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }
          const csrfCheck = requireJsonContentType(request)
          if (csrfCheck) return csrfCheck

          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : ''
          if (!jobId) {
            return json({ error: 'jobId is required' }, { status: 400 })
          }

          const payload = await gatewayCronRpc(
            [
              'cron.runIfDue',
              'cron.run_if_due',
              'scheduler.runIfDue',
              'scheduler.jobs.runIfDue',
            ],
            { jobId },
          )

          return json({ ok: true, payload })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
