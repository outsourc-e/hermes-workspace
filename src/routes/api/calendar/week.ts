/**
 * GET /api/calendar/week
 *
 * Returns all calendar events for the next 7 days from all enabled feeds.
 * Includes feed health summary.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isLocalRequest,
} from '../../../server/auth-middleware'
import { getWeekEvents } from '../../../server/calendar-feeds'

export const Route = createFileRoute('/api/calendar/week')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request) && !isLocalRequest(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const data = await getWeekEvents()
          return json(data, {
            headers: { 'Cache-Control': 'public, max-age=60' },
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
