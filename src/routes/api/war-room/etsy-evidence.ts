import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getEtsyMarketLabEvidence } from '../../../server/etsy-market-lab-evidence'

export const Route = createFileRoute('/api/war-room/etsy-evidence')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const q = url.searchParams.get('q') ?? ''
        const limitRaw = Number(url.searchParams.get('limit') ?? 8)
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 8
        return json(getEtsyMarketLabEvidence({ q, limit }), { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
