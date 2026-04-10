import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { HERMES_API } from '../../server/gateway-capabilities'

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
        const res = await fetch(target)
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const body = await request.text()
        const res = await fetch(`${HERMES_API}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  },
})
