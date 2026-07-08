/**
 * Session replay API.
 *
 * GET /api/swarm-replay           — list recent dispatch headers
 * GET /api/swarm-replay?id=rp-…   — full transcript for one dispatch
 * GET /api/swarm-replay?daily=1   — per-day activity/cost aggregates
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { readSwarmOutcomes } from '../../server/swarm-outcomes'
import { getReplay, listReplays } from '../../server/swarm-replay'

export type DailyStat = {
  day: string
  dispatches: number
  ok: number
  failed: number
  minutes: number
}

export function dailyStats(days = 14): Array<DailyStat> {
  const byDay = new Map<string, DailyStat>()
  const cutoff = Date.now() - days * 86_400_000
  for (const r of readSwarmOutcomes()) {
    if (r.at < cutoff) continue
    const day = new Date(r.at).toISOString().slice(0, 10)
    const stat = byDay.get(day) ?? {
      day,
      dispatches: 0,
      ok: 0,
      failed: 0,
      minutes: 0,
    }
    stat.dispatches += 1
    if (r.ok) stat.ok += 1
    else stat.failed += 1
    stat.minutes += Math.round(r.durationMs / 60_000)
    byDay.set(day, stat)
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}

export const Route = createFileRoute('/api/swarm-replay')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const id = url.searchParams.get('id')
        if (id) {
          const replay = getReplay(id)
          if (!replay) {
            return json({ ok: false, error: 'Not found' }, { status: 404 })
          }
          return json({ ok: true, replay })
        }
        if (url.searchParams.get('daily')) {
          return json({ ok: true, daily: dailyStats() })
        }
        return json({ ok: true, replays: listReplays() })
      },
    },
  },
})
