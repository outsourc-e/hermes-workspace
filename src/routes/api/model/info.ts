import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
  getGatewayMode,
} from '../../../server/gateway-capabilities'
import {
  deriveFallbackModelInfoFromGateway,
  normalizeModelInfoResponse,
} from '@/lib/model-info'

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

        const capabilities = getCapabilities()
        const normalized = normalizeModelInfoResponse(rawPayload)
        const shouldUseFallback =
          normalized.supportsRuntimeSwitching === null &&
          normalized.vanillaAgent === null
        const resolved = shouldUseFallback
          ? deriveFallbackModelInfoFromGateway(gatewayMode, capabilities)
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
        // Per-request model switching (#D1): when the gateway itself
        // advertises runtime_model_switch, it validates the requested model
        // server-side — so the picker must be unblocked even if a (stale)
        // dashboard payload reported switching as unsupported.
        const supportsRuntimeSwitching = capabilities.runtimeModelSwitch
          ? true
          : resolved.supportsRuntimeSwitching

        return json({
          ...passthrough,
          ...resolved,
          supportsRuntimeSwitching,
          gatewayMode,
        })
      },
    },
  },
})
