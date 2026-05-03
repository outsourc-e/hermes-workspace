/**
 * GET /api/mcp/hub-search
 *
 * Federated MCP catalog search — Phase 3.0 MVP.
 *
 * Query params:
 *   q       Free-text search query (default '')
 *   source  'all' | 'mcp-get' | 'local' (default 'all')
 *   limit   Max results 1..100 (default 20)
 *
 * Auth-gated via isAuthenticated.
 * Rate-limited: 60 req/min per IP.
 * Returns {ok, results, source, total, warnings?}
 * Never 5xx — always 200 even on full failure (returns local fallback).
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { rateLimit, getClientIp, rateLimitResponse, safeErrorMessage } from '../../../server/rate-limit'
import { unifiedSearch } from '../../../server/mcp-hub/index'
import type { SearchSource } from '../../../server/mcp-hub/index'

const VALID_SOURCES = new Set(['all', 'mcp-get', 'local'])

export const Route = createFileRoute('/api/mcp/hub-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`mcp-hub-search:${ip}`, 60, 60_000)) {
          return rateLimitResponse()
        }

        const url = new URL(request.url)
        const q = url.searchParams.get('q') ?? ''
        const rawSource = url.searchParams.get('source') ?? 'all'
        const rawLimit = url.searchParams.get('limit') ?? '20'

        const source: SearchSource = VALID_SOURCES.has(rawSource)
          ? (rawSource as SearchSource)
          : 'all'

        const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20))

        try {
          const result = await unifiedSearch(q, source, limit)
          return Response.json({
            ok: true,
            results: result.results,
            source: result.source,
            total: result.total,
            ...(result.warnings && result.warnings.length > 0
              ? { warnings: result.warnings }
              : {}),
          })
        } catch (err) {
          // Last-resort catch — fall back to empty local results rather than 5xx
          return Response.json({
            ok: false,
            results: [],
            source: 'error',
            total: 0,
            warnings: [safeErrorMessage(err)],
          })
        }
      },
    },
  },
})
