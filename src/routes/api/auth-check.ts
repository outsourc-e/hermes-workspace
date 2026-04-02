import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isPasswordProtectionEnabled,
} from '../../server/auth-middleware'

export const Route = createFileRoute('/api/auth-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const apiUrl = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'
          const healthResponse = await fetch(`${apiUrl}/health`, {
            signal: AbortSignal.timeout(4_000),
          })

          if (!healthResponse.ok) {
            return json(
              {
                authenticated: false,
                authRequired: false,
                error: `hermes_agent_http_${healthResponse.status}`,
              },
              { status: 503 },
            )
          }
        } catch (error) {
          return json(
            {
              authenticated: false,
              authRequired: false,
              error:
                error instanceof DOMException && error.name === 'AbortError'
                  ? 'hermes_agent_timeout'
                  : 'hermes_agent_unreachable',
            },
            { status: 503 },
          )
        }

        const authRequired = isPasswordProtectionEnabled()
        const authenticated = isAuthenticated(request)

        return json({
          authenticated,
          authRequired,
        })
      },
    },
  },
})
