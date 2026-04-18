import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { normalizeModelInfoResponse } from '@/lib/model-info'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  dashboardFetch,
  ensureGatewayProbed,
  getGatewayMode,
} from '../../../server/gateway-capabilities'

export const Route = createFileRoute('/api/model/info')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        await ensureGatewayProbed()
        const gatewayMode = getGatewayMode()

        let rawPayload: unknown = null
        try {
          const response = await dashboardFetch('/api/model/info')
          if (response.ok) {
            rawPayload = await response.json()
          }
        } catch {
          rawPayload = null
        }

        const normalized = normalizeModelInfoResponse(rawPayload)
        return json({
          ...normalized,
          gatewayMode,
        })
      },
    },
  },
})
