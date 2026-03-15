import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'

export const Route = createFileRoute('/api/gateway/logs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json(
          {
            ok: false,
            unavailable: true,
            error: 'Gateway logs are not available in Hermes Workspace.',
          },
          { status: 501 },
        )
      },
    },
  },
})
