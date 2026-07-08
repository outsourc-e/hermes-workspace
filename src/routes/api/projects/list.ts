import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  PROJECT_ARTIFACT_TYPES,
  PROJECT_ENVIRONMENTS,
  PROJECT_SOURCE_TYPES,
  PROJECT_STATUSES,
  listProjects,
} from '../../../server/project-cockpit'

export const Route = createFileRoute('/api/projects/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const projects = listProjects({
          q: url.searchParams.get('q'),
          status: url.searchParams.get('status'),
          environment: url.searchParams.get('environment'),
          includeArchived: url.searchParams.get('includeArchived') === 'true',
        })

        return json({
          ok: true,
          projects,
          options: {
            statuses: PROJECT_STATUSES,
            environments: PROJECT_ENVIRONMENTS,
            sourceTypes: PROJECT_SOURCE_TYPES,
            artifactTypes: PROJECT_ARTIFACT_TYPES,
          },
        })
      },
    },
  },
})
