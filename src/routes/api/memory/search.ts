import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { searchMemoryFiles } from '../../../server/memory-browser'

export const Route = createFileRoute('/api/memory/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        // Memory is local-fs only. No remote gateway check needed.
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        try {
          return json({ results: searchMemoryFiles(query) })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search memory files',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
