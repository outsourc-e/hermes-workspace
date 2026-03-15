import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { checkHealth } from '../../server/hermes-api'

export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          await checkHealth()
          return json({ ok: true })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
