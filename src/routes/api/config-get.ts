import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

export const Route = createFileRoute('/api/config-get')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const response = await fetch(`${HERMES_API_URL}/api/config`)
          if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(body || `Hermes config request failed (${response.status})`)
          }
          const result = (await response.json()) as { defaultModel?: string }
          return json({ ok: true, payload: result })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
