import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { detectHonchoIntegration } from '../../server/integration-detection'

export const Route = createFileRoute('/api/integrations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        return json({
          ok: true,
          checkedAt: Date.now(),
          integrations: {
            honcho: detectHonchoIntegration(),
          },
        })
      },
    },
  },
})
