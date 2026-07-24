import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { listWorkspacePlugins } from '../../server/plugins-browser'

export const Route = createFileRoute('/api/plugins')({
  server: {
    handlers: {
      GET: ({ request }) => Promise.resolve((() => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, plugins: listWorkspacePlugins() })
      })()),
    },
  },
})
