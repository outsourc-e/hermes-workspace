import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { readUpdateStatus } from '../../../server/update-system'

export const Route = createFileRoute('/api/update/status')({
  server: {
    handlers: {
      GET: ({ request }) => Promise.resolve((() => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json(readUpdateStatus())
      })()),
    },
  },
})
