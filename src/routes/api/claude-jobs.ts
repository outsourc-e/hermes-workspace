/**
 * Jobs API proxy — forwards to Hermes Agent FastAPI /api/jobs
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
import {
  createProfileCronJob,
  listProfileCronJobs,
} from '../../server/hermes-cron-profiles'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

/**
 * Normalise the jobs response so callers always receive `{ jobs: [...] }`.
 *
 * Some Hermes gateway versions return a bare array instead of the expected
 * `{ jobs: [] }` envelope. This helper wraps bare arrays so the workspace UI
 * never has to special-case both shapes.
 */
async function jobsResponse(res: Response): Promise<Response> {
  const text = await res.text()
  if (!res.ok) {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const data = JSON.parse(text) as unknown
    const normalized = Array.isArray(data) ? { jobs: data } : data
    return new Response(JSON.stringify(normalized), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const Route = createFileRoute('/api/claude-jobs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        const url = new URL(request.url)
        const aggregateProfiles = url.searchParams.get('profiles') !== 'active'
        if (aggregateProfiles) {
          return new Response(JSON.stringify({ jobs: listProfileCronJobs() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) {
          return new Response(
            JSON.stringify({
              ...createCapabilityUnavailablePayload('jobs'),
              items: [],
              jobs: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const params = url.searchParams.toString()
        const res = capabilities.dashboard.available
          ? await dashboardFetch(`/api/cron/jobs${params ? `?${params}` : ''}`)
          : await fetch(`${CLAUDE_API}/api/jobs${params ? `?${params}` : ''}`, {
              headers: authHeaders(),
            })
        return jobsResponse(res)
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        const body = await request.text()
        let parsedBody: Record<string, unknown> = {}
        try {
          parsedBody = body ? (JSON.parse(body) as Record<string, unknown>) : {}
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const profile =
          typeof parsedBody.profile === 'string' && parsedBody.profile.trim()
            ? parsedBody.profile.trim()
            : null
        if (profile) {
          try {
            const result = createProfileCronJob(profile, parsedBody)
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (error) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) {
          return new Response(
            JSON.stringify({
              ...createCapabilityUnavailablePayload('jobs', {
                error: `Gateway does not support /api/jobs. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
              }),
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const res = capabilities.dashboard.available
          ? await dashboardFetch('/api/cron/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
          : await fetch(`${CLAUDE_API}/api/jobs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body,
            })
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
