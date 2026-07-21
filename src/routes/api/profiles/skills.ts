/**
 * Proxy for the dashboard's per-profile skills endpoint.
 *
 *   GET /api/profiles/skills?name=<profile>
 *     → dashboard GET /api/profiles/<profile>/skills
 *
 * Pairs with NousResearch/hermes-agent#25116, which lets one dashboard
 * daemon edit `skills.disabled` across every installed profile. Without
 * this proxy the workspace can only manage the dashboard's currently
 * bound profile (whichever HERMES_HOME the daemon launched against),
 * matching the old single-profile constraint.
 *
 * The dashboard returns a lighter payload than `/api/skills` — just
 * `{name, description, category, path, enabled}` per entry, scoped to
 * the profile's own `skills/` directory. The frontend normalizes these
 * entries into the workspace's richer `SkillSummary` shape with safe
 * defaults for fields the dashboard doesn't supply at the profile scope.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export const Route = createFileRoute('/api/profiles/skills')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.skills || !capabilities.dashboard.available) {
          return json(
            {
              ...createCapabilityUnavailablePayload('skills'),
              items: [],
            },
            { status: 503 },
          )
        }

        try {
          const url = new URL(request.url)
          const profile = (url.searchParams.get('name') || '').trim()
          if (!profile || !PROFILE_NAME_RE.test(profile)) {
            return json(
              { error: 'A valid profile name is required' },
              { status: 400 },
            )
          }

          const response = await dashboardFetch(
            `/api/profiles/${encodeURIComponent(profile)}/skills`,
            { signal: AbortSignal.timeout(30_000) },
          )
          const body = await response.text()
          if (!response.ok) {
            // 404 from dashboard means the profile doesn't exist or doesn't
            // expose the endpoint (older dashboard without PR #25116).
            return json(
              {
                error:
                  body ||
                  `Dashboard profile skills request failed (${response.status})`,
              },
              { status: response.status },
            )
          }

          let parsed: unknown
          try {
            parsed = JSON.parse(body)
          } catch {
            return json(
              { error: 'Dashboard returned malformed JSON for profile skills' },
              { status: 502 },
            )
          }
          const items = Array.isArray(parsed) ? parsed : []
          return json({ profile, items })
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },
    },
  },
})
