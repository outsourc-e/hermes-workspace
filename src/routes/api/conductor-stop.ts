import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { deleteSession } from '../../server/claude-api'
import { dashboardFetch, ensureGatewayProbed } from '../../server/gateway-capabilities'
import { cancelSwarmMission } from '../../server/swarm-missions'
import { getProfilesDir } from '../../server/claude-paths'

function resetNativeWorkerRuntime(workerId: string, missionId: string): boolean {
  const runtimePath = join(getProfilesDir(), workerId, 'runtime.json')
  let current: Record<string, unknown> = {}
  if (existsSync(runtimePath)) {
    try {
      current = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
    } catch {
      current = {}
    }
  }
  const now = new Date().toISOString()
  writeFileSync(runtimePath, JSON.stringify({
    ...current,
    workerId,
    state: 'idle',
    phase: 'cancelled',
    currentTask: null,
    currentMissionId: null,
    currentAssignmentId: null,
    checkpointStatus: 'none',
    needsHuman: false,
    blockedReason: null,
    lastCheckIn: now,
    lastSummary: `Cancelled native Conductor mission ${missionId}`,
    nextAction: 'Idle; ready for next Conductor or Swarm dispatch.',
  }, null, 2) + '\n')
  return true
}

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
          let cancelledNativeMissions = 0
          const capabilities = await ensureGatewayProbed()
          for (const missionId of missionIds) {
            try {
              const cancelled = cancelSwarmMission({
                missionId,
                actor: 'conductor-stop',
                reason: 'Conductor mission stopped by user',
              })
              if (cancelled) {
                cancelledNativeMissions += 1
                for (const workerId of Array.from(new Set(cancelled.mission.assignments.map((assignment) => assignment.workerId)))) {
                  try {
                    resetNativeWorkerRuntime(workerId, missionId)
                  } catch {
                    // Runtime reset is best-effort; cancellation state is still durable.
                  }
                }
                continue
              }
            } catch {
              // Fall through to dashboard cleanup.
            }

            if (capabilities.dashboard.available && capabilities.conductor) {
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

          return json({ ok: true, deleted, stoppedMissions, cancelledNativeMissions })
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
