import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getCapabilities,
} from '../../../server/gateway-capabilities'
import { listMemoryFiles } from '../../../server/memory-browser'

export const Route = createFileRoute('/api/memory/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        if (!getCapabilities().memory) {
          return json({
            ...createCapabilityUnavailablePayload('memory'),
            files: [],
          })
        }

        try {
          return json({ files: listMemoryFiles() })
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Failed to list memory files' },
            { status: 500 },
          )
        }
      },
    },
  },
})
