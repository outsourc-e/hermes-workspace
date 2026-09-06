/**
 * GET /api/digest-summary
 *
 * Returns the parsed Summary section of the most recent daily digest
 * under `~/.hermes/repos/nw-personal-projects/digests/`. The reader
 * extracts a few structured metrics (email unread, calendar events,
 * Slack mentions) and preserves the raw bullet lines as fallbacks.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { readLatestDigest } from '../../server/digest-source'

export const Route = createFileRoute('/api/digest-summary')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const digest = await readLatestDigest()
        return json(
          { digest },
          {
            headers: {
              // Digests refresh once daily; aggressive cache is fine.
              'Cache-Control':
                'private, max-age=300, stale-while-revalidate=600',
            },
          },
        )
      },
    },
  },
})
