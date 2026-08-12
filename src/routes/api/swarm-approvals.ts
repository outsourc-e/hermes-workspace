import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createMissionApproval,
  decideMissionApproval,
  listMissionApprovals,
} from '../../server/swarm-missions'

const CreateApprovalSchema = z.object({
  missionId: z.string().trim().min(1).max(200),
  actionId: z.string().trim().min(1).max(200),
  risk: z.string().trim().min(1).max(80),
  target: z.string().trim().min(1).max(1000),
  parameters: z.record(z.unknown()).optional().default({}),
  requestedBy: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .default('workspace'),
  expiresAt: z.number().int().positive(),
})

const DecideApprovalSchema = z.object({
  approvalId: z.string().trim().min(1).max(200),
  status: z.enum(['approved', 'rejected']),
  decidedBy: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(2000).nullable().optional(),
})

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/swarm-approvals')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const missionId =
          new URL(request.url).searchParams.get('missionId')?.trim() ||
          undefined
        return json({ ok: true, approvals: listMissionApprovals(missionId) })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const parsed = CreateApprovalSchema.safeParse(await readJson(request))
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
        try {
          return json({
            ok: true,
            approval: createMissionApproval(parsed.data),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 400 },
          )
        }
      },
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const parsed = DecideApprovalSchema.safeParse(await readJson(request))
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
        const approval = decideMissionApproval(parsed.data)
        if (!approval)
          return json(
            { ok: false, error: 'Approval not found' },
            { status: 404 },
          )
        return json({ ok: true, approval })
      },
    },
  },
})
