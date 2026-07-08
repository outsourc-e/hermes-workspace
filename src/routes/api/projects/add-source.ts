import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { addProjectSource, type CreateProjectSourceInput } from '../../../server/project-cockpit'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/projects/add-source')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as CreateProjectSourceInput
          const source = addProjectSource(body)
          return json({ ok: true, source })
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to add source' },
            { status: 400 },
          )
        }
      },
    },
  },
})
