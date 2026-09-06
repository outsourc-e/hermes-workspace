/**
 * GET /api/calendar/feed-status
 *
 * Returns health status for every configured calendar feed.
 * Used by the Jarvis dashboard and the main dashboard OpsStrip.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isLocalRequest,
} from '../../../server/auth-middleware'
import { getFeedStatus } from '../../../server/calendar-feeds'

export const Route = createFileRoute('/api/calendar/feed-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request) && !isLocalRequest(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const data = await getFeedStatus()
          return json(data, {
            headers: { 'Cache-Control': 'public, max-age=30' },
          })
        } catch (err: unknown) {
          return json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
