import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { searchSwarmMemory } from '../../../server/swarm-memory'

export const Route = createFileRoute('/api/swarm-memory/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const workerId = url.searchParams.get('workerId')
        const query = url.searchParams.get('q') || url.searchParams.get('query') || ''
        const scopeParam = url.searchParams.get('scope')
        const scope = scopeParam === 'shared' || scopeParam === 'all' ? scopeParam : 'worker'
        const rawLimit = Number(url.searchParams.get('limit') || 10)
        const limit = Number.isFinite(rawLimit) ? rawLimit : 10
        try {
          return json({ results: searchSwarmMemory({ workerId, query, scope, limit }) })
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : 'Failed to search swarm memory' }, { status: 400 })
        }
      },
    },
  },
})
