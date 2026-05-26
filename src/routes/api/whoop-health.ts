/**
 * GET /api/whoop-health
 *
 * Surfaces the most recent Whoop snapshot the personal-projects pipeline
 * writes to `~/.hermes/repos/nw-personal-projects/whoop/latest.json`.
 * Returns 200 with `null` when the file is missing so the UI can hide
 * the card without flashing an error state.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { readWhoopSnapshot } from '../../server/whoop-source'

export const Route = createFileRoute('/api/whoop-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const snapshot = await readWhoopSnapshot()
        return json(
          { snapshot },
          {
            headers: {
              'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
            },
          },
        )
      },
    },
  },
})
