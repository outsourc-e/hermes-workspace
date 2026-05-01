/**
 * Jobs API proxy — forwards individual job operations to Hermes Agent FastAPI
 * or the upstream dashboard cron API.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  CLAUDE_UPGRADE_INSTRUCTIONS,
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function notSupported(): Response {
  return new Response(
    JSON.stringify({
      error: `Gateway does not support /api/jobs. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
    }),
    { status: 404, headers: { 'Content-Type': 'application/json' } },
  )
}

export const Route = createFileRoute('/api/claude-jobs/$jobId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) return notSupported()

        const url = new URL(request.url)
        const action = url.searchParams.get('action') || ''

        if (capabilities.dashboard.available) {
          const dashboardPath = action
            ? `/api/cron/jobs/${params.jobId}/${action === 'run' ? 'trigger' : action}`
            : `/api/cron/jobs/${params.jobId}`
          const res = await dashboardFetch(dashboardPath)
          return new Response(await res.text(), {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const target = action
          ? `${CLAUDE_API}/api/jobs/${params.jobId}/${action}${url.search}`
          : `${CLAUDE_API}/api/jobs/${params.jobId}`
        const res = await fetch(target, { headers: authHeaders() })
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) return notSupported()

        const url = new URL(request.url)
        const action = url.searchParams.get('action') || ''
        const body = await request.text()

        if (capabilities.dashboard.available) {
          const dashboardAction = action === 'run' ? 'trigger' : action
          const dashboardPath = dashboardAction
            ? `/api/cron/jobs/${params.jobId}/${dashboardAction}`
            : `/api/cron/jobs/${params.jobId}`
          const method = dashboardAction ? 'POST' : 'PUT'
          const res = await dashboardFetch(dashboardPath, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body || undefined,
          })
          return new Response(await res.text(), {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const target = action
          ? `${CLAUDE_API}/api/jobs/${params.jobId}/${action}`
          : `${CLAUDE_API}/api/jobs/${params.jobId}`
        const res = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: body || undefined,
        })
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) return notSupported()

        const body = await request.text()
        const res = capabilities.dashboard.available
          ? await dashboardFetch(`/api/cron/jobs/${params.jobId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: body ? JSON.parse(body) : {} }),
            })
          : await fetch(`${CLAUDE_API}/api/jobs/${params.jobId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body,
            })
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) return notSupported()

        const res = capabilities.dashboard.available
          ? await dashboardFetch(`/api/cron/jobs/${params.jobId}`, {
              method: 'DELETE',
            })
          : await fetch(`${CLAUDE_API}/api/jobs/${params.jobId}`, {
              method: 'DELETE',
              headers: authHeaders(),
            })
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
