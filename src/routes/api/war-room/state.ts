import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getWarRoomBodyState } from '../../../lib/war-room/body'

export const Route = createFileRoute('/api/war-room/state')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, state: getWarRoomBodyState() }, { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
