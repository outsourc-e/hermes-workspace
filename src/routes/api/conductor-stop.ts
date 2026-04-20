import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

export const Route = createFileRoute('/api/conductor-stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const sessionKeys = Array.isArray(body.sessionKeys)
            ? body.sessionKeys.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : []

          let deleted = 0
          for (const sessionKey of sessionKeys) {
            try {
              await gatewayRpc('sessions.delete', { key: sessionKey })
              deleted += 1
            } catch {
              // Ignore per-session delete errors so one bad key doesn't block the rest.
            }
          }

          return json({ ok: true, deleted })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
