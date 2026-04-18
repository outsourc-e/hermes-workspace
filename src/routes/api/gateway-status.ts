import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  HERMES_API,
  HERMES_DASHBOARD_URL,
  ensureGatewayProbed,
  getCapabilities,
  getGatewayMode,
} from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/gateway-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const capabilities = await ensureGatewayProbed()
        return json({
          capabilities,
          mode: getGatewayMode(),
          hermesUrl: HERMES_API,
          dashboardUrl: HERMES_DASHBOARD_URL,
          gateway: {
            available: capabilities.health || capabilities.chatCompletions,
            url: HERMES_API,
          },
          dashboard: capabilities.dashboard,
        })
      },
    },
  },
})
