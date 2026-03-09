import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
  safeErrorMessage,
} from '../../../server/rate-limit'
import { forwardWorkspaceRequest } from '../../../server/workspace-proxy'

export const Route = createFileRoute(
  '/api/workspace/checkpoints/$id/approve-and-pr',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const ip = getClientIp(request)
        if (!rateLimit(`workspace-checkpoint-approve-pr:${ip}`, 30, 60_000)) {
          return rateLimitResponse()
        }

        try {
          return await forwardWorkspaceRequest({
            request,
            path: `/checkpoints/${params.id}/approve-and-pr`,
          })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 502 },
          )
        }
      },
    },
  },
})
