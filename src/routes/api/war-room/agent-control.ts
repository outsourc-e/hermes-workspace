import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getAgentConnectionState, getAgentConnectionStoreInfo } from '../../../lib/war-room/body'

export const Route = createFileRoute('/api/war-room/agent-control')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
        }
        return json({
          ok: true,
          state: getAgentConnectionState(),
          store: getAgentConnectionStoreInfo(),
        }, { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
