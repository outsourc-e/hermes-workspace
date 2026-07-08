import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  runDstnyAgentAction,
  type DstnyAgentActionInput,
} from '../../../server/dstny-agent-actions'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/projects/agent-action')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as DstnyAgentActionInput
          const result = runDstnyAgentAction(body)
          return json(result)
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to run agent action' },
            { status: 400 },
          )
        }
      },
    },
  },
})
