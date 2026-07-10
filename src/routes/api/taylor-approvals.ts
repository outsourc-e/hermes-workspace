import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  NOVA_FABRIC_REVIEW_STATUSES,
  updateNovaFabricReviewStatus,
} from '../../server/nova-fabric-store'
import { getTaylorApprovalQueue } from '../../server/taylor-approval-queue'

const PatchSchema = z.object({
  reviewId: z.string().min(1),
  status: z.enum(NOVA_FABRIC_REVIEW_STATUSES),
})

function errorResponse(message: string, status = 400): Response {
  return json({ ok: false, error: message }, { status })
}

export const Route = createFileRoute('/api/taylor-approvals')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse('Unauthorized', 401)
        return json({ ok: true, queue: getTaylorApprovalQueue() })
      },
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse('Unauthorized', 401)
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return errorResponse('Invalid JSON')
        }
        const parsed = PatchSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse(
            parsed.error.issues.map((issue) => issue.message).join('; '),
          )
        }
        const updated = updateNovaFabricReviewStatus(
          parsed.data.reviewId,
          parsed.data.status,
        )
        if (!updated) return errorResponse('Review not found', 404)
        return json({ ok: true, review: updated, queue: getTaylorApprovalQueue() })
      },
    },
  },
})
