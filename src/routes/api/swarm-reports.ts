import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { listSwarmReports } from '../../server/swarm-missions'

export const Route = createFileRoute('/api/swarm-reports')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim() || null
        const workerId = url.searchParams.get('workerId')?.trim() || null
        const limitRaw = Number(url.searchParams.get('limit') ?? 100)
        const limit = Number.isFinite(limitRaw) ? limitRaw : 100
        return json({
          ok: true,
          fetchedAt: Date.now(),
          missionId,
          workerId,
          reports: listSwarmReports({ missionId, workerId, limit }),
        })
      },
    },
  },
})
