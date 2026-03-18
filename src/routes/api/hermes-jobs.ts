/**
 * Jobs API proxy — forwards to Hermes FastAPI /api/jobs
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getCapabilities,
  HERMES_API,
  HERMES_UPGRADE_INSTRUCTIONS,
} from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/hermes-jobs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }
        await ensureGatewayProbed()
        if (!getCapabilities().jobs) {
          return new Response(
            JSON.stringify({
              items: [],
              source: 'unavailable',
              message: `Gateway does not support /api/jobs. ${HERMES_UPGRADE_INSTRUCTIONS}`,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
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
        await ensureGatewayProbed()
        if (!getCapabilities().jobs) {
          return new Response(
            JSON.stringify({
              error: `Gateway does not support /api/jobs. ${HERMES_UPGRADE_INSTRUCTIONS}`,
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          )
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
