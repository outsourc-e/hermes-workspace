import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createImprovementProposal,
  decideImprovementPromotion,
  listImprovementProposals,
  recordImprovementEvaluation,
} from '../../server/self-improvement'

const ProposalSchema = z.object({
  id: z.string().trim().min(1).max(200),
  targetKind: z.string().trim().min(1).max(100),
  target: z.string().trim().min(1).max(500),
  hypothesis: z.string().trim().min(1).max(4000),
  proposedChange: z.string().trim().min(1).max(8000),
  risk: z.string().trim().min(1).max(80),
  createdBy: z.string().trim().min(1).max(200).default('workspace'),
})
const EvaluationSchema = z.object({
  proposalId: z.string().trim().min(1),
  benchmark: z.string().trim().min(1),
  baseline: z.number().nullable(),
  candidate: z.number().nullable(),
  minDelta: z.number(),
  status: z.enum(['passed', 'failed']),
  evidence: z.string().optional(),
})
const PromotionSchema = z.object({
  proposalId: z.string().trim().min(1),
  criticApproved: z.boolean(),
  canaryPassed: z.boolean(),
  decidedBy: z.string().trim().min(1),
})

async function body(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}

export const Route = createFileRoute('/api/self-improvement')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        return json({ ok: true, proposals: listImprovementProposals() })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const parsed = ProposalSchema.safeParse(await body(request))
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
        return json({
          ok: true,
          proposal: createImprovementProposal(parsed.data),
        })
      },
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const payload = await body(request)
        const evaluation = EvaluationSchema.safeParse(payload)
        if (evaluation.success) {
          recordImprovementEvaluation(evaluation.data)
          return json({ ok: true, stage: 'evaluation-recorded' })
        }
        const promotion = PromotionSchema.safeParse(payload)
        if (promotion.success)
          return json({
            ok: true,
            ...decideImprovementPromotion(promotion.data),
          })
        return json(
          { ok: false, error: 'Expected evaluation or promotion payload' },
          { status: 400 },
        )
      },
    },
  },
})
