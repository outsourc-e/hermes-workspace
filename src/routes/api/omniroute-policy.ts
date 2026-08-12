import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getOmniRoutePolicySnapshot } from '../../server/omniroute-policy'

export const Route = createFileRoute('/api/omniroute-policy')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        return json({ ok: true, policy: await getOmniRoutePolicySnapshot() })
      },
    },
  },
})
