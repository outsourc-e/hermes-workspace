import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  applyHarpPatch,
  createStarterHarpConfig,
  getHarpConfigView,
} from '../../server/harp-config-store'
import type { HarpPatch } from '../../server/harp-config-store'

export const Route = createFileRoute('/api/harp-config')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, ...getHarpConfigView() })
      },

      PATCH: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        // Special action: create a starter config from scratch
        if (body.action === 'create-starter') {
          const result = createStarterHarpConfig()
          if (!result.ok) return json({ ok: false, error: result.error }, { status: 400 })
          return json({ ok: true, ...getHarpConfigView() })
        }
        const result = applyHarpPatch(body as HarpPatch)
        if (!result.ok) {
          return json({ ok: false, error: result.error }, { status: 400 })
        }
        return json({ ok: true, ...getHarpConfigView() })
      },
    },
  },
})
