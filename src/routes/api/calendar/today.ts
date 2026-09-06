/**
 * GET /api/calendar/today
 *
 * Returns today's calendar events from all enabled feeds.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isLocalRequest,
} from '../../../server/auth-middleware'
import { getTodayEvents } from '../../../server/calendar-feeds'

export const Route = createFileRoute('/api/calendar/today')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request) && !isLocalRequest(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const data = await getTodayEvents()
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
