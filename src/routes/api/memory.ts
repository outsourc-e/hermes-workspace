import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  CLAUDE_API,
  ensureGatewayProbed,
  getCapabilities,
} from '../../server/gateway-capabilities'
import { getMemory } from '../../server/claude-api'

export const Route = createFileRoute('/api/memory')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        await ensureGatewayProbed()
        if (!getCapabilities().memory) {
          return json(
            {
              ok: false,
              error: `Gateway does not support /api/memory on ${CLAUDE_API}`,
            },
            { status: 503 },
          )
        }

        try {
          return json(await getMemory())
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },
    },
  },
})
