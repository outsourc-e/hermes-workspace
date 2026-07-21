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
import {
  createProfileCronJob,
  parseProfileJobId,
  readProfileCronOutputs,
  runProfileCronAction,
  updateProfileCronJob,
} from '../../server/hermes-cron-profiles'

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
        const url = new URL(request.url)
        const action = url.searchParams.get('action') || ''
        const parsed = parseProfileJobId(params.jobId)
        if (parsed.profile && (action === 'output' || action === 'runs')) {
          const limit = Number(url.searchParams.get('limit') ?? '10')
          const outputs = readProfileCronOutputs(
            parsed.profile,
            parsed.jobId,
            Number.isFinite(limit) ? limit : 10,
          )
          return new Response(
            JSON.stringify(action === 'runs' ? { runs: [] } : { outputs }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) return notSupported()

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
        const url = new URL(request.url)
        const action = url.searchParams.get('action') || ''
        const body = await request.text()
        const parsed = parseProfileJobId(params.jobId)
        if (parsed.profile && action) {
          const profileAction =
            action === 'run' || action === 'run-if-due'
              ? 'run'
              : action === 'delete'
                ? 'remove'
                : action
          if (!['pause', 'resume', 'run', 'remove'].includes(profileAction)) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: `Unsupported cron action: ${action}`,
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          try {
            const result = runProfileCronAction(
              parsed.profile,
              parsed.jobId,
              profileAction as 'pause' | 'resume' | 'run' | 'remove',
            )
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
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
        }

        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) return notSupported()

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
        const body = await request.text()
        const parsed = parseProfileJobId(params.jobId)
        if (parsed.profile) {
          try {
            const updates = body
              ? (JSON.parse(body) as Record<string, unknown>)
              : {}
            const targetProfile =
              typeof updates.profile === 'string' && updates.profile.trim()
                ? updates.profile.trim()
                : parsed.profile
            let result: Record<string, unknown>
            if (targetProfile === parsed.profile) {
              result = updateProfileCronJob(
                parsed.profile,
                parsed.jobId,
                updates,
              )
            } else {
              const created = createProfileCronJob(targetProfile, updates)
              const createdJobId =
                typeof created.jobId === 'string'
                  ? parseProfileJobId(created.jobId)
                  : null
              try {
                const removePrevious = runProfileCronAction(
                  parsed.profile,
                  parsed.jobId,
                  'remove',
                )
                result = {
                  ...created,
                  movedFrom: `${parsed.profile}:${parsed.jobId}`,
                  removePrevious,
                }
              } catch (removeError) {
                if (createdJobId?.profile) {
                  try {
                    runProfileCronAction(
                      createdJobId.profile,
                      createdJobId.jobId,
                      'remove',
                    )
                  } catch {
                    // Best-effort rollback; surface the original remove error below.
                  }
                }
                throw removeError
              }
            }
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
        if (!capabilities.jobs) return notSupported()

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
        const parsed = parseProfileJobId(params.jobId)
        if (parsed.profile) {
          try {
            const result = runProfileCronAction(
              parsed.profile,
              parsed.jobId,
              'remove',
            )
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
