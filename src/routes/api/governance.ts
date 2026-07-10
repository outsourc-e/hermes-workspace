import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  GOVERNED_ACTION_CATEGORIES,
  getGovernancePolicy,
} from '../../server/approval-governance'
import { isAuthenticated } from '../../server/auth-middleware'

export const Route = createFileRoute('/api/governance')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          categories: GOVERNED_ACTION_CATEGORIES,
          policy: getGovernancePolicy(),
          enforcement:
            'Approval is proven only by a server-side fabric review in status approved; browser booleans are never trusted.',
        })
      },
    },
  },
})
