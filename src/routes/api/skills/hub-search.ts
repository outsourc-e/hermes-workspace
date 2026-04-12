import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  HERMES_API,
} from '../../../server/gateway-capabilities'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

export const Route = createFileRoute('/api/skills/hub-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const query = (url.searchParams.get('q') || '').trim()
          const limit = Math.min(
            50,
            Math.max(1, Number(url.searchParams.get('limit') || '20')),
          )
          const source = (
            url.searchParams.get('source') || 'all'
          ).trim()

          if (!query) {
            return json({ results: [], source: 'idle' })
          }

          const params = new URLSearchParams({
            q: query,
            limit: String(limit),
            source,
          })

          const response = await fetch(
            `${HERMES_API}/api/skills/hub/search?${params}`,
            {
              headers: authHeaders(),
              signal: AbortSignal.timeout(30_000),
            },
          )

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '')
            return json(
              {
                results: [],
                source: 'error',
                error:
                  errorBody ||
                  `Gateway returned ${response.status}`,
              },
              { status: response.status },
            )
          }

          const result = await response.json()
          return json(result)
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search skills hub',
              results: [],
              source: 'error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
