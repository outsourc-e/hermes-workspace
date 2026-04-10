import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { HERMES_API, ensureGatewayProbed, getCapabilities } from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/hermes-tasks/$taskId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        await ensureGatewayProbed()
        const res = await fetch(`${HERMES_API}/api/tasks/${params.taskId}`)
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const body = await request.text()
        const res = await fetch(`${HERMES_API}/api/tasks/${params.taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const res = await fetch(`${HERMES_API}/api/tasks/${params.taskId}`, { method: 'DELETE' })
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const url = new URL(request.url)
        const action = url.searchParams.get('action') || 'move'
        const body = await request.text()
        const res = await fetch(`${HERMES_API}/api/tasks/${params.taskId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  },
})
