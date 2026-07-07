/**
 * GET /api/swarm-timeline — unified event feed (missions, outcomes,
 * scheduled runs, sweep/branch-guard) sorted newest-first.
 * Query: ?limit=200&worker=<id>&source=<mission|outcome|scheduled|sweep>
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { getSwarmTimeline } from '../../server/swarm-timeline'

export const Route = createFileRoute('/api/swarm-timeline')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const limitRaw = Number(url.searchParams.get('limit') ?? 200)
        const limit = Number.isFinite(limitRaw)
          ? Math.max(1, Math.min(500, limitRaw))
          : 200
        const worker = url.searchParams.get('worker')?.trim() || null
        const source = url.searchParams.get('source')?.trim() || null

        let { entries, generatedAt } = getSwarmTimeline(500)
        if (worker) entries = entries.filter((e) => e.workerId === worker)
        if (source) entries = entries.filter((e) => e.source === source)
        return json({ ok: true, entries: entries.slice(0, limit), generatedAt })
      },
    },
  },
})
