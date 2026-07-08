import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { addProjectArtifact, type CreateProjectArtifactInput } from '../../../server/project-cockpit'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/projects/add-artifact')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as CreateProjectArtifactInput
          const artifact = addProjectArtifact(body)
          return json({ ok: true, artifact })
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to add artifact' },
            { status: 400 },
          )
        }
      },
    },
  },
})
