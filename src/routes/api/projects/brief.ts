import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { buildProjectBrief, getProjectBundle } from '../../../server/project-cockpit'

export const Route = createFileRoute('/api/projects/brief')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim() || ''
        if (!id) return json({ ok: false, error: 'id is required' }, { status: 400 })
        const project = getProjectBundle(id)
        if (!project) return json({ ok: false, error: 'Project not found' }, { status: 404 })

        return json({ ok: true, project, brief: buildProjectBrief(project) })
      },
    },
  },
})
