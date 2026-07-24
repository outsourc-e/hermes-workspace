import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getOracleLocalAluraSearch } from '../../../server/oracle-alura-local-search'
import type { OracleAluraSourceMode } from '../../../lib/war-room/living-v3/oracle-alura'

const sourceModes = new Set<OracleAluraSourceMode>([
  'alura_only',
  'alura_plus_product_research',
  'seo_graph_optional',
])

function parseSourceMode(value: string | null): OracleAluraSourceMode {
  return value && sourceModes.has(value as OracleAluraSourceMode) ? value as OracleAluraSourceMode : 'alura_only'
}

export const Route = createFileRoute('/api/war-room/oracle-alura-search')({
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
        const sourceMode = parseSourceMode(url.searchParams.get('sourceMode'))

        return json(getOracleLocalAluraSearch({ q, limit, sourceMode }), {
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
