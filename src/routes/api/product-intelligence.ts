import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProductIntelligence } from '../../server/product-intelligence-data'

export const Route = createFileRoute('/api/product-intelligence')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const limitRaw = Number(url.searchParams.get('limit') ?? 40)
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 40
        const q = url.searchParams.get('q') ?? ''
        const room = url.searchParams.get('room') ?? ''
        const status = url.searchParams.get('status') ?? ''
        const minScoreRaw = Number(url.searchParams.get('min_score') ?? 0)
        const minScore = Number.isFinite(minScoreRaw) ? Math.max(0, Math.min(100, minScoreRaw)) : 0
        return json(getProductIntelligence({ q, limit, room, status, minScore }), {
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
