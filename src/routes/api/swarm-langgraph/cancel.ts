import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { spawnLanggraphDetached } from '../../../server/langgraph-orchestrator'
import { cancelSwarmMission } from '../../../server/swarm-missions'

type CancelBody = {
  missionId?: unknown
  reason?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const Route = createFileRoute('/api/swarm-langgraph/cancel')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: CancelBody
        try {
          body = (await request.json()) as CancelBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        const missionId = cleanString(body.missionId)
        if (!missionId) {
          return json({ ok: false, error: 'missionId required' }, { status: 400 })
        }
        const reason = cleanString(body.reason) ?? 'Cancelled from Swarm LangGraph UI'
        const useMock = new URL(request.url).searchParams.get('mock') === '1'

        const cancelled = cancelSwarmMission({
          missionId,
          actor: 'langgraph-cancel',
          reason,
        })

        const { pid } = spawnLanggraphDetached([
          '--execute',
          ...(useMock ? ['--mock-services'] : []),
          '--resume',
          'abort',
          '--mission-id',
          missionId,
        ])

        return json({
          ok: true,
          accepted: true,
          missionId,
          cancelled: Boolean(cancelled?.changed),
          pid,
          mock: useMock,
        })
      },
    },
  },
})
