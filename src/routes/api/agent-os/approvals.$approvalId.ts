import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { decideApproval } from '../../../server/agent-os/store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/agent-os/approvals/$approvalId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        try {
          const body = (await request.json()) as Record<string, unknown>
          const decision = body.decision
          if (decision !== 'approved' && decision !== 'denied') {
            return jsonResponse({ error: 'decision must be approved or denied' }, 400)
          }
          const approval = decideApproval(
            params.approvalId,
            decision,
            typeof body.decided_by === 'string' ? body.decided_by : 'user',
            typeof body.note === 'string' ? body.note : null,
          )
          if (!approval) return jsonResponse({ error: 'Approval not found' }, 404)
          return jsonResponse({ approval })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
