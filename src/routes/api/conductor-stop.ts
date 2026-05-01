import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { deleteSession } from '../../server/claude-api'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/conductor-stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const sessionKeys = Array.isArray(body.sessionKeys)
            ? body.sessionKeys.filter(
                (value): value is string =>
                  typeof value === 'string' && value.trim().length > 0,
              )
            : []
          const missionIds = Array.isArray(body.missionIds)
            ? body.missionIds.filter(
                (value): value is string =>
                  typeof value === 'string' && value.trim().length > 0,
              )
            : []

          let deleted = 0
          let stoppedMissions = 0
          const capabilities = await ensureGatewayProbed()
          if (capabilities.dashboard.available) {
            for (const missionId of missionIds) {
              try {
                const res = await dashboardFetch(
                  `/api/conductor/missions/${encodeURIComponent(missionId)}`,
                  { method: 'DELETE' },
                )
                if (res.ok) stoppedMissions += 1
              } catch {
                // Ignore per-mission stop errors so session cleanup still runs.
              }
            }
          }

          for (const sessionKey of sessionKeys) {
            try {
              await deleteSession(sessionKey)
              deleted += 1
            } catch {
              // Ignore per-session delete errors so one bad key doesn't block the rest.
            }
          }

          return json({ ok: true, deleted, stoppedMissions })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
