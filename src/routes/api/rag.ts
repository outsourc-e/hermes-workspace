/**
 * GET  /api/rag?q=...&k=5   — semantic search over vault/playbook/outcomes/handoffs
 * GET  /api/rag             — index stats
 * POST /api/rag {action:'reindex'} — force full refresh
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  ragIndexStats,
  ragSearch,
  refreshRagIndex,
} from '../../server/rag-index'

export const Route = createFileRoute('/api/rag')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.trim()
        if (!q) return json({ ok: true, stats: ragIndexStats() })
        const kRaw = Number(url.searchParams.get('k') ?? 5)
        const k = Number.isFinite(kRaw) ? Math.max(1, Math.min(20, kRaw)) : 5
        const hits = await ragSearch(q, k)
        return json({ ok: true, query: q, hits })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const body = (await request.json().catch(() => ({}))) as {
          action?: string
        }
        if (body.action !== 'reindex') {
          return json({ ok: false, error: 'Unknown action' }, { status: 400 })
        }
        const index = await refreshRagIndex(true)
        return json({
          ok: true,
          chunks: index.chunks.length,
          embedded: index.chunks.filter((c) => c.vec).length,
        })
      },
    },
  },
})
