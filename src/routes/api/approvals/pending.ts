import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { isAuthenticated } from '../../../server/auth-middleware'
import { listPendingSessionApprovals } from '../../../server/session-approval-store'

export const Route = createFileRoute('/api/approvals/pending')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const sessionKeys = url.searchParams.getAll('sessionKey')
        const pending = await listPendingSessionApprovals({ sessionKeys })
        return json({ ok: true, pending })
      },
    },
  },
})
