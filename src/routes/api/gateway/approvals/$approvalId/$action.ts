import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { gatewayRpc } from '@/server/gateway'
import { requireJsonContentType } from '@/server/rate-limit'

export const Route = createFileRoute('/api/gateway/approvals/$approvalId/$action')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const { approvalId, action } = params

        if (action !== 'approve' && action !== 'deny') {
          return json(
            { ok: false, error: `Invalid action: "${action}". Must be "approve" or "deny".` },
            { status: 400 },
          )
        }

        // Map Hermes Workspace action names to gateway ExecApprovalDecision values.
        const decision = action === 'approve' ? 'allow-once' : 'deny'

        try {
          await gatewayRpc('exec.approval.resolve', { id: approvalId, decision })
          return json({ ok: true })
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
