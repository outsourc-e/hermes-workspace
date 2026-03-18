import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
  SESSIONS_API_UNAVAILABLE_MESSAGE,
} from '../../server/hermes-api'
import { requireJsonContentType } from '../../server/rate-limit'

export const Route = createFileRoute('/api/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        await ensureGatewayProbed()
        if (!getGatewayCapabilities().sessions) {
          return json(
            { ok: false, error: SESSIONS_API_UNAVAILABLE_MESSAGE },
            { status: 503 },
          )
        }
        return json(
          { ok: false, error: 'Legacy send is not available in Hermes Workspace.' },
          { status: 501 },
        )
      },
    },
  },
})
