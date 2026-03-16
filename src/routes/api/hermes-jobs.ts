/**
 * Jobs API proxy — forwards to Hermes FastAPI /api/jobs
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'

const HERMES_API = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

export const Route = createFileRoute('/api/hermes-jobs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const url = new URL(request.url)
        const params = url.searchParams.toString()
        const target = `${HERMES_API}/api/jobs${params ? `?${params}` : ''}`
        const res = await fetch(target)
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        const body = await request.text()
        const res = await fetch(`${HERMES_API}/api/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  },
})
