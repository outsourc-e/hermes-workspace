import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getSwarmEnvironment } from '../../server/swarm-environment'

export const Route = createFileRoute('/api/swarm-environment')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          generatedAt: Date.now(),
          ...getSwarmEnvironment(),
        })
      },
    },
  },
})
