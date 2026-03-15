import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { requireJsonContentType } from '@/server/rate-limit'

export const Route = createFileRoute('/api/gateway/agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, data: { agents: [], categories: [], presets: [] } })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        return json(
          { ok: false, error: 'Gateway agents are not available in Hermes Workspace.' },
          { status: 501 },
        )
      },
    },
  },
})
