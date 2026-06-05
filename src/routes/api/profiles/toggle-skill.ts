/**
 * Proxy for the dashboard's per-profile skills toggle endpoint.
 *
 *   PUT /api/profiles/toggle-skill
 *     body: { profile: string, name: string, enabled: boolean }
 *     → dashboard PUT /api/profiles/<profile>/skills/toggle
 *
 * Writes `skills.disabled` in the *target profile's* config.yaml, not the
 * active profile's. Pairs with the per-profile skills GET proxy and
 * NousResearch/hermes-agent#25116.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'
import { requireJsonContentType } from '../../../server/rate-limit'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export const Route = createFileRoute('/api/profiles/toggle-skill')({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.skills || !capabilities.dashboard.available) {
          return json(
            {
              ok: false,
              ...createCapabilityUnavailablePayload('skills'),
            },
            { status: 503 },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json()) as {
            profile?: string
            name?: string
            enabled?: boolean
          }
          const profile = (body.profile || '').trim()
          const name = (body.name || '').trim()
          const enabled = Boolean(body.enabled)
          if (!profile || !PROFILE_NAME_RE.test(profile)) {
            return json(
              { ok: false, error: 'A valid profile name is required' },
              { status: 400 },
            )
          }
          if (!name) {
            return json(
              { ok: false, error: 'A skill name is required' },
              { status: 400 },
            )
          }

          const response = await dashboardFetch(
            `/api/profiles/${encodeURIComponent(profile)}/skills/toggle`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, enabled }),
              signal: AbortSignal.timeout(30_000),
            },
          )
          const text = await response.text()
          let payload: unknown = null
          try {
            payload = text ? JSON.parse(text) : null
          } catch {
            payload = { ok: false, error: text }
          }
          return json(payload, { status: response.status })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
