import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { BEARER_TOKEN, HERMES_API } from '../../server/gateway-capabilities'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

export const Route = createFileRoute('/api/hermes-tasks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const url = new URL(request.url)
        const params = url.searchParams.toString()
        const target = `${HERMES_API}/api/tasks${params ? `?${params}` : ''}`
        const res = await fetch(target, { headers: authHeaders() })
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const body = await request.text()
        const res = await fetch(`${HERMES_API}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body,
        })
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  },
})
