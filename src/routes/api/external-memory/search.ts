import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { searchExternalMemoryCandidates } from '../../../server/external-memory-browser'

export const Route = createFileRoute('/api/external-memory/search')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          return json(
            searchExternalMemoryCandidates({
              provider: url.searchParams.get('provider') || undefined,
              query: url.searchParams.get('q') || '',
              limit: url.searchParams.get('limit') || undefined,
            }),
          )
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to search external memory candidates'
          // Unconfigured is a valid empty state, not a server error.
          if (/no external memory providers/i.test(message)) {
            return json({
              ok: true,
              provider: '',
              query: new URL(request.url).searchParams.get('q') || '',
              limit: 0,
              count: 0,
              candidates: [],
            })
          }
          return json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
