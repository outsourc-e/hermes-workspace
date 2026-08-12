import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  claimReadyNodes,
  completeNode,
  createMission,
  deleteCoordinatorMission,
  getMissionMetrics,
  getMissionSnapshot,
  listMissions,
  preflightMission,
  retryMissionNode,
} from '../../server/mission-coordinator/coordinator'
import { buildMissionFromTemplate } from '../../server/mission-coordinator/templates'
import { listLeases } from '../../server/mission-coordinator/coordination-db'
import {
  provisionHermesTasks,
  reconcileHermesTasks,
  updateHermesTaskStatus,
} from '../../server/mission-coordinator/hermes-linkage'
import { dispatchNextClaimedNode } from '../../server/mission-coordinator/execution-bridge'
import { reconcileMissionFromKanban } from '../../server/mission-coordinator/lifecycle-reconciler'
import { cancelCoordinatorMission } from '../../server/mission-coordinator/cancel'
import { reconcileOnce } from '../../server/mission-coordinator/reconciliation-loop'
import { migrateLegacyMissions } from '../../server/mission-coordinator/migration'

const ActionSchema = z.object({
  action: z.enum([
    'metrics',
    'retry',
    'create',
    'template',
    'provision',
    'reconcile',
    'lifecycle',
    'reconcile-all',
    'migrate',
    'status',
    'claim',
    'dispatch',
    'cancel',
    'preflight',
    'complete',
    'snapshot',
    'leases',
    'delete',
  ]),
  mission: z.unknown().optional(),
  objective: z.string().trim().min(1).max(8000).optional(),
  template: z
    .enum(['coding', 'research', 'qa', 'release', 'maintenance'])
    .optional(),
  maxParallelism: z.number().int().min(1).max(20).optional(),
  missionId: z.string().trim().min(1).max(160).optional(),
  nodeId: z.string().trim().min(1).max(160).optional(),
  owner: z.string().trim().min(1).max(160).optional(),
  status: z.enum(['ready', 'running', 'review', 'blocked', 'done']).optional(),
  source: z.string().trim().min(1).max(1000).optional(),
  dryRun: z.boolean().optional().default(true),
  ttlMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60 * 1000)
    .optional(),
})

export const Route = createFileRoute('/api/mission-coordinator')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const missionId = new URL(request.url).searchParams
          .get('missionId')
          ?.trim()
        if (!missionId) return json({ ok: true, missions: listMissions() })
        return json({ ok: true, ...getMissionSnapshot(missionId) })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const parsed = ActionSchema.safeParse(
          await request.json().catch(() => null),
        )
        if (!parsed.success)
          return json(
            {
              ok: false,
              error: parsed.error.issues
                .map((issue) => issue.message)
                .join('; '),
            },
            { status: 400 },
          )
        const input = parsed.data
        if (input.action === 'create') {
          const result = createMission(input.mission)
          return result.ok
            ? json(result, { status: 201 })
            : json(result, { status: 400 })
        }
        if (input.action === 'template') {
          if (!input.missionId || !input.objective)
            return json(
              { ok: false, error: 'missionId and objective required' },
              { status: 400 },
            )
          const result = createMission(
            buildMissionFromTemplate({
              id: input.missionId,
              objective: input.objective,
              template: input.template,
              maxParallelism: input.maxParallelism,
            }),
          )
          return result.ok
            ? json(result, { status: 201 })
            : json(result, { status: 400 })
        }
        if (input.action === 'metrics')
          return json({ ok: true, metrics: getMissionMetrics() })
        if (input.action === 'leases')
          return json({ ok: true, leases: listLeases() })
        if (input.action === 'reconcile-all') return json(await reconcileOnce())
        if (input.action === 'migrate') {
          if (!input.source)
            return json(
              { ok: false, error: 'source required' },
              { status: 400 },
            )
          return json({
            ok: true,
            report: migrateLegacyMissions(input.source, input.dryRun),
          })
        }
        if (!input.missionId)
          return json(
            { ok: false, error: 'missionId required' },
            { status: 400 },
          )
        if (input.action === 'provision')
          return json(await provisionHermesTasks(input.missionId))
        if (input.action === 'reconcile')
          return json(await reconcileHermesTasks(input.missionId))
        if (input.action === 'lifecycle')
          return json(await reconcileMissionFromKanban(input.missionId))
        if (input.action === 'status') {
          if (!input.nodeId || !input.status)
            return json(
              { ok: false, error: 'nodeId and status required' },
              { status: 400 },
            )
          return json(
            await updateHermesTaskStatus(
              input.missionId,
              input.nodeId,
              input.status,
            ),
          )
        }
        if (input.action === 'dispatch') {
          if (!input.owner)
            return json({ ok: false, error: 'owner required' }, { status: 400 })
          return json(
            await dispatchNextClaimedNode(input.missionId, input.owner),
          )
        }
        if (input.action === 'cancel')
          return json(
            await cancelCoordinatorMission(input.missionId, input.owner),
          )
        if (input.action === 'preflight')
          return json({
            ok: true,
            preflight: preflightMission(input.missionId),
          })
        if (input.action === 'delete')
          return json(deleteCoordinatorMission(input.missionId))
        if (input.action === 'claim') {
          const result = claimReadyNodes(
            input.missionId,
            input.owner,
            input.ttlMs,
          )
          return json(result, { status: result.ok ? 200 : 409 })
        }
        if (input.action === 'complete') {
          if (!input.nodeId || !input.owner)
            return json(
              { ok: false, error: 'nodeId and owner required' },
              { status: 400 },
            )
          const result = completeNode(
            input.missionId,
            input.nodeId,
            input.owner,
          )
          return json(result, { status: result.ok ? 200 : 409 })
        }
        if (input.action === 'retry') {
          if (!input.nodeId)
            return json(
              { ok: false, error: 'nodeId required' },
              { status: 400 },
            )
          const result = retryMissionNode(
            input.missionId,
            input.nodeId,
            input.owner,
          )
          return json(result, { status: result.ok ? 200 : 409 })
        }
        return json({ ok: true, ...getMissionSnapshot(input.missionId) })
      },
    },
  },
})
