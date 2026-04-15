import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureDiscovery,
  forceDiscovery,
  getDiscoveryStatus,
  getDiscoveredModels,
  isProviderConfigured,
} from '../../server/local-provider-discovery'

export const Route = createFileRoute('/api/local-providers')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const refresh = url.searchParams.get('refresh') === 'true'

        if (refresh) {
          await forceDiscovery()
        } else {
          await ensureDiscovery()
        }

        const status = getDiscoveryStatus()
        const models = getDiscoveredModels()

        return json({
          ok: true,
          providers: status.map((p) => ({
            ...p,
            configured: isProviderConfigured(p.id),
            needsRestart: isProviderConfigured(p.id) ? false : p.online,
          })),
          models,
          totalLocalModels: models.length,
        })
      },
    },
  },
})
