import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { gatherNovaSessionBridge } from '../../server/nova-session-bridge'

export const Route = createFileRoute('/api/nova-session-bridge')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const bridge = await gatherNovaSessionBridge()
        return json(bridge)
      },
    },
  },
})
