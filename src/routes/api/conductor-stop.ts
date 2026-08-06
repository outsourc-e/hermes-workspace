import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { deleteSession } from '../../server/claude-api'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import { cancelSwarmMission } from '../../server/swarm-missions'
import { resetSwarmWorkerRuntime } from '../../server/swarm-runtime-reset'

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
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const sessionKeys = Array.isArray(body.sessionKeys)
            ? Array.from(
                new Set(
                  body.sessionKeys
                    .filter(
                      (value): value is string =>
                        typeof value === 'string' && value.trim().length > 0,
                    )
                    .map((value) => value.trim()),
                ),
              )
            : []
          const missionIds = Array.isArray(body.missionIds)
            ? Array.from(
                new Set(
                  body.missionIds
                    .filter(
                      (value): value is string =>
                        typeof value === 'string' && value.trim().length > 0,
                    )
                    .map((value) => value.trim()),
                ),
              )
            : []

          let deleted = 0
          let stoppedMissions = 0
          let cancelledNativeMissions = 0
          const failures: Array<{
            operation: 'delete-session' | 'stop-mission'
            id: string
            error: string
          }> = []
          const capabilities = await ensureGatewayProbed()
          for (const missionId of missionIds) {
            let nativeError: string | null = null
            try {
              const cancelled = cancelSwarmMission({
                missionId,
                actor: 'conductor-stop',
                reason: 'Conductor mission stopped by user',
              })
              if (cancelled) {
                cancelledNativeMissions += 1
                for (const workerId of Array.from(
                  new Set(
                    cancelled.mission.assignments.map(
                      (assignment) => assignment.workerId,
                    ),
                  ),
                )) {
                  try {
                    resetSwarmWorkerRuntime(workerId, {
                      actor: 'conductor-stop',
                      reason: `Cancelled native Conductor mission ${missionId}`,
                    })
                  } catch {
                    // Runtime reset is best-effort; cancellation state is still durable.
                  }
                }
                continue
              }
            } catch (error) {
              nativeError =
                error instanceof Error ? error.message : String(error)
              // Fall through to dashboard cleanup.
            }

            if (capabilities.dashboard.available && capabilities.conductor) {
              try {
                const res = await dashboardFetch(
                  `/api/conductor/missions/${encodeURIComponent(missionId)}`,
                  { method: 'DELETE' },
                )
                if (res.ok) {
                  stoppedMissions += 1
                } else {
                  const detail = await res.text().catch(() => '')
                  failures.push({
                    operation: 'stop-mission',
                    id: missionId,
                    error: detail || `HTTP ${res.status}`,
                  })
                }
              } catch (error) {
                failures.push({
                  operation: 'stop-mission',
                  id: missionId,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            } else {
              failures.push({
                operation: 'stop-mission',
                id: missionId,
                error:
                  nativeError ||
                  'Conductor mission stop capability unavailable',
              })
            }
          }

          for (const sessionKey of sessionKeys) {
            try {
              await deleteSession(sessionKey)
              deleted += 1
            } catch (error) {
              failures.push({
                operation: 'delete-session',
                id: sessionKey,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }

          return json(
            {
              ok: failures.length === 0,
              deleted,
              stoppedMissions,
              cancelledNativeMissions,
              failures,
            },
            { status: failures.length === 0 ? 200 : 502 },
          )
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
