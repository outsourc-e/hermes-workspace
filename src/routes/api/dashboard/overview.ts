/**
 * GET /api/dashboard/overview
 *
 * Aggregates the data the Workspace dashboard renders:
 *   - gateway status (running, active_agents, restart_requested)
 *   - connected platforms (api_server, telegram, discord, etc.)
 *   - cron summary (total / paused / running / next_run_at)
 *   - achievements (recent unlocks + total unlocked count)
 *   - current model info (provider, model, context length, capabilities)
 *   - analytics rollup (last N days, top models, optional cost)
 *
 * Each section is independent: a single missing endpoint or auth
 * failure leaves that section at `null` and the dashboard hides the
 * card. The aggregation runs server-side so the client makes one
 * request instead of six, and we get a single auth surface.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  dashboardFetch,
  gatewayFetch,
} from '../../../server/gateway-capabilities'
import {
  buildDashboardOverview,
  type DashboardFetcher,
} from '../../../server/dashboard-aggregator'

const overviewFetcher: DashboardFetcher = (path) => dashboardFetch(path)
// Gateway fetcher hits the gateway URL (8645/8642), which is where
// `/health/detailed` lives. The Hermes Agent confirmed `active_agents`
// from this endpoint is the canonical “currently running” count.
const overviewGatewayFetcher: DashboardFetcher = (path) => gatewayFetch(path)

export const Route = createFileRoute('/api/dashboard/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const days = Number(url.searchParams.get('days') ?? '30')
          const limit = Number(url.searchParams.get('achievements') ?? '3')
          const logsLimit = Number(url.searchParams.get('logs') ?? '24')
          const overview = await buildDashboardOverview({
            fetcher: overviewFetcher,
            gatewayFetcher: overviewGatewayFetcher,
            analyticsWindowDays: Number.isFinite(days) && days > 0 ? days : 30,
            achievementsLimit:
              Number.isFinite(limit) && limit > 0 ? Math.min(limit, 12) : 3,
            logsLimit:
              Number.isFinite(logsLimit) && logsLimit > 0
                ? Math.min(logsLimit, 100)
                : 24,
          })
          return json(overview, {
            headers: {
              // The aggregate is cheap to recompute (parallel fans-out
              // upstream), but cache for a few seconds so a noisy client
              // doesn't hammer the dashboard. Stale-while-revalidate keeps
              // the UI snappy while fresh data lands.
              'Cache-Control':
                'private, max-age=5, stale-while-revalidate=20',
            },
          })
        } catch (err) {
          return json(
            {
              error:
                err instanceof Error ? err.message : 'overview build failed',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
