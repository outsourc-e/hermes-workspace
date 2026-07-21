import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getGoblinAnalyticsSnapshotForApi } from '../../../server/goblin-analytics-data'
import { isAuthenticated } from '../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/goblin-analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        return json(await getGoblinAnalyticsSnapshotForApi(), { headers: noStoreHeaders })
      },
    },
  },
})
