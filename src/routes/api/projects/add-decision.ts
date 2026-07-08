import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { addProjectDecision, type CreateProjectDecisionInput } from '../../../server/project-cockpit'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/projects/add-decision')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as CreateProjectDecisionInput
          const decision = addProjectDecision(body)
          return json({ ok: true, decision })
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to add decision' },
            { status: 400 },
          )
        }
      },
    },
  },
})
