import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getProject, updateProject, type UpdateProjectInput } from '../../../server/project-cockpit'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/projects/update')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as {
            id?: unknown
            patch?: unknown
          }
          const id = typeof body.id === 'string' ? body.id.trim() : ''
          if (!id) return json({ ok: false, error: 'id is required' }, { status: 400 })
          if (!getProject(id)) return json({ ok: false, error: 'Project not found' }, { status: 404 })
          if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
            return json({ ok: false, error: 'patch object is required' }, { status: 400 })
          }
          const project = updateProject(id, body.patch as UpdateProjectInput)
          return json({ ok: true, project })
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to update project' },
            { status: 400 },
          )
        }
      },
    },
  },
})
