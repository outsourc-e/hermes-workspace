import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getLatestDescendant } from '../../../server/claude-api'

export const Route = createFileRoute(
  '/api/sessions/$sessionKey/latest-descendant',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const sessionKey = params.sessionKey.trim()
        if (!sessionKey) {
          return json(
            { ok: false, error: 'sessionKey required' },
            { status: 400 },
          )
        }

        try {
          const resolution = await getLatestDescendant(sessionKey)
          return json({
            ok: true,
            requestedSessionKey: sessionKey,
            sessionKey: resolution.sessionId,
            path: resolution.path,
            changed: resolution.changed,
            supported: resolution.supported,
          })
        } catch {
          // This read-only route must never block normal history navigation.
          return json({
            ok: true,
            requestedSessionKey: sessionKey,
            sessionKey,
            path: [sessionKey],
            changed: false,
            supported: false,
          })
        }
      },
    },
  },
})
