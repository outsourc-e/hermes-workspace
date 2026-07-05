import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import { submitHermesRunApproval } from '../../../../server/hermes-runs-api'

export const Route = createFileRoute('/api/approvals/$approvalId/deny')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const approvalId = params.approvalId?.trim()
        if (!approvalId) {
          return json({ ok: false, error: 'approvalId required' }, { status: 400 })
        }
        try {
          await submitHermesRunApproval(approvalId, 'deny')
          return json({ ok: true })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 502 },
          )
        }
      },
    },
  },
})
