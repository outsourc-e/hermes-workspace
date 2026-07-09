import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatherAgentLaneRegistry } from '../../server/agent-lane-registry'
import { isAuthenticated } from '../../server/auth-middleware'

export const Route = createFileRoute('/api/agent-lanes')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const registry = await gatherAgentLaneRegistry()
        return json(registry)
      },
    },
  },
})
