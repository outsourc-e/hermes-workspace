import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { appendSwarmMissionOrchestratorEvent } from '../../../server/swarm-missions'

type MissionEventBody = {
  missionId?: unknown
  message?: unknown
  data?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const Route = createFileRoute('/api/swarm-langgraph/mission-event')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: MissionEventBody
        try {
          body = (await request.json()) as MissionEventBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        const missionId = cleanString(body.missionId)
        const message = cleanString(body.message)
        if (!missionId || !message) {
          return json({ ok: false, error: 'missionId and message required' }, { status: 400 })
        }
        const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
          ? body.data as Record<string, unknown>
          : {}

        const mission = appendSwarmMissionOrchestratorEvent({ missionId, message, data })
        if (!mission) {
          return json({ ok: false, error: 'Mission not found' }, { status: 404 })
        }
        return json({ ok: true, missionId, mission })
      },
    },
  },
})
