import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getEtsyLiveScoutState } from '../../../../lib/war-room/body/etsy-live-backend'
import { isAuthenticated } from '../../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/etsy-live/state')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        return json(await getEtsyLiveScoutState(), {
          headers: noStoreHeaders,
        })
      },
    },
  },
})
