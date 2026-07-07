import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getSwarmUsage } from '../../server/swarm-usage'
import { evaluateSpendCap } from './swarm-dispatch'

export const Route = createFileRoute('/api/swarm-usage')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const usage = await getSwarmUsage()
          const spendCap = await evaluateSpendCap()
          return json({ ...usage, spendCap })
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          )
        }
      },
    },
  },
})
