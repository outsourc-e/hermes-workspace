import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  HERMES_API,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

export const Route = createFileRoute('/api/skills/install')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json()) as {
            skillId?: string
            identifier?: string
            category?: string
            force?: boolean
          }
          const identifier =
            (body.identifier || body.skillId || '').trim()
          if (!identifier) {
            return json(
              { ok: false, error: 'identifier or skillId required' },
              { status: 400 },
            )
          }

          const capabilities = await ensureGatewayProbed()
          if (capabilities.dashboard.available) {
            return json(
              {
                ok: false,
                error:
                  'Skill install is only available on the legacy enhanced fork right now.',
              },
              { status: 501 },
            )
          }

          const response = await fetch(`${HERMES_API}/api/skills/install`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
            body: JSON.stringify({
              identifier,
              category: body.category || '',
              force: Boolean(body.force),
            }),
            signal: AbortSignal.timeout(120_000),
          })

          const result = await response.json()
          return json(result, { status: response.status })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to install skill',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
