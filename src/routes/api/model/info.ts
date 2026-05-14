import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  deriveFallbackModelInfoFromGateway,
  normalizeModelInfoResponse,
} from '@/lib/model-info'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
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
        const shouldUseFallback =
          normalized.supportsRuntimeSwitching === null &&
          normalized.vanillaAgent === null
        const resolved = shouldUseFallback
          ? deriveFallbackModelInfoFromGateway(gatewayMode, getCapabilities())
          : normalized

        if (shouldUseFallback) {
          console.log(
            `[model-info] falling back to gateway capabilities (source=gateway-capabilities mode=${gatewayMode})`,
          )
        }

        const passthrough =
          rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
            ? (rawPayload as Record<string, unknown>)
            : {}

        return json({
          ...passthrough,
          ...resolved,
          gatewayMode,
        })
      },
    },
  },
})
