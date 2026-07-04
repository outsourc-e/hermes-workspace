import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { scanTerraModelAssets } from '../../../lib/war-room/terra/terra-local-assets'
import { isAuthenticated } from '../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/terra-assets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const url = new URL(request.url)
        const limitRaw = Number(url.searchParams.get('limit') ?? 120)
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, Math.floor(limitRaw))) : 120
        const q = url.searchParams.get('q') ?? ''
        return json(await scanTerraModelAssets({ query: q, limit }), { headers: noStoreHeaders })
      },
    },
  },
})
