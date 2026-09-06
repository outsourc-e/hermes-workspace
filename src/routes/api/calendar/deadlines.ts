/**
 * GET /api/calendar/deadlines
 *
 * Returns university deadlines parsed from pre-computed JSON
 * (generated from Obsidian markdown unit profiles).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isLocalRequest,
} from '../../../server/auth-middleware'
import { getDeadlines } from '../../../server/calendar-feeds'

export const Route = createFileRoute('/api/calendar/deadlines')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request) && !isLocalRequest(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const data = await getDeadlines()
          return json(data, {
            headers: { 'Cache-Control': 'public, max-age=300' },
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
