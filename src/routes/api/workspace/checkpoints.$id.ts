import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  safeErrorMessage,
} from '../../../server/rate-limit'
import { forwardWorkspaceRequest } from '../../../server/workspace-proxy'

export const Route = createFileRoute('/api/workspace/checkpoints/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`workspace-checkpoint-detail:${ip}`, 120, 60_000)) {
          return rateLimitResponse()
        }

        try {
          return await forwardWorkspaceRequest({
            request,
            path: `/checkpoints/${params.id}`,
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
