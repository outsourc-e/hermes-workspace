import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  getSwarmMission,
  recordMissionExternalEvent,
} from '../../server/swarm-missions'
import {
  RETENTION_POLICIES,
  cleanupSwarmWorktrees,
} from '../../server/swarm-worktrees'
import type {
  RetentionClass,
  WorktreeMissionInfo,
} from '../../server/swarm-worktrees'

function missionLookup(
  missionId: string,
  assignmentId: string,
): WorktreeMissionInfo {
  const mission = getSwarmMission(missionId)
  if (!mission) {
    return { missionId, assignmentId, exists: false }
  }
  const assignment = mission.assignments.find(
    (item) => item.id === assignmentId,
  )
  return {
    missionId,
    assignmentId,
    exists: Boolean(assignment),
    missionState: mission.state,
    assignmentState: assignment?.state,
  }
}

export const Route = createFileRoute('/api/swarm-worktrees')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >

        const maxAgeHours =
          typeof body.maxAgeHours === 'number' &&
          Number.isFinite(body.maxAgeHours)
            ? Math.max(1, Math.min(24 * 365, body.maxAgeHours))
            : null
        const maxAgeMs = maxAgeHours ? maxAgeHours * 60 * 60 * 1000 : undefined

        const activePaths = Array.isArray(body.activePaths)
          ? body.activePaths.filter(
              (value): value is string => typeof value === 'string',
            )
          : []

        // Retention class overrides
        const retentionOverrides: Partial<
          Record<RetentionClass, (typeof RETENTION_POLICIES)[RetentionClass]>
        > = {}
        if (
          body.retentionOverrides &&
          typeof body.retentionOverrides === 'object'
        ) {
          for (const [key, value] of Object.entries(body.retentionOverrides)) {
            if (
              key in RETENTION_POLICIES &&
              value &&
              typeof value === 'object'
            ) {
              const v = value as Record<string, unknown>
              retentionOverrides[key as RetentionClass] = {
                neverRemove:
                  typeof v.neverRemove === 'boolean' ? v.neverRemove : false,
                maxAgeMs:
                  typeof v.maxAgeMs === 'number' && Number.isFinite(v.maxAgeMs)
                    ? v.maxAgeMs
                    : null,
              }
            }
          }
        }

        const leaseExpiryHours =
          typeof body.leaseExpiryHours === 'number' &&
          Number.isFinite(body.leaseExpiryHours)
            ? Math.max(1, Math.min(24 * 365, body.leaseExpiryHours))
            : null
        const leaseExpiryMs = leaseExpiryHours
          ? leaseExpiryHours * 60 * 60 * 1000
          : null

        const result = cleanupSwarmWorktrees({
          maxAgeMs,
          activePaths,
          remove: body.remove === true,
          retentionOverrides,
          missionLookup,
          leaseExpiryMs,
          onCleanupEvent: (info) => {
            if (info.missionId) {
              recordMissionExternalEvent({
                missionId: info.missionId,
                eventType: 'worktree-cleanup',
                payload: {
                  ...info,
                  at: Date.now(),
                },
              })
            }
          },
        })

        return json({ ok: true, ...result, dryRun: body.remove !== true })
      },
      GET: ({ request }) => {
        if (!requireLocalOrAuth(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const dryRun = url.searchParams.get('dryRun') !== 'false'
        const maxAgeHours = Number(url.searchParams.get('maxAgeHours') ?? '168') // 7 days default
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000
        const leaseExpiryHours = Number(
          url.searchParams.get('leaseExpiryHours') ?? '0',
        )
        const leaseExpiryMs =
          leaseExpiryHours > 0 ? leaseExpiryHours * 60 * 60 * 1000 : null

        const result = cleanupSwarmWorktrees({
          maxAgeMs,
          activePaths: [],
          remove: false,
          missionLookup,
          leaseExpiryMs,
        })

        return json({ ok: true, ...result, dryRun: true })
      },
    },
  },
})
