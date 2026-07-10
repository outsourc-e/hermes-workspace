import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { gatherGoogleWorkspaceReport } from '../../server/google-workspace-connector'

export const Route = createFileRoute('/api/google-workspace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const report = await gatherGoogleWorkspaceReport()
        return json(report)
      },
    },
  },
})
