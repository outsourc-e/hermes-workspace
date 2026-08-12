import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { parseJsonFromStdout, runLanggraphSync } from '../../../server/langgraph-orchestrator'
import { getSwarmMission } from '../../../server/swarm-missions'

export const Route = createFileRoute('/api/swarm-langgraph/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim()
          ?? url.searchParams.get('threadId')?.trim()
        if (!missionId) {
          return json({ ok: false, error: 'missionId required' }, { status: 400 })
        }

        const result = runLanggraphSync(['--get-state', '--mission-id', missionId])
        if (!result.ok) {
          return json(
            { ok: false, error: result.error, stderr: result.stderr?.slice(0, 2000) ?? null },
            { status: 500 },
          )
        }

        try {
          const orchestratorState = parseJsonFromStdout(result.stdout)
          if (orchestratorState === null) {
            return json({ ok: false, error: 'Mission state not found' }, { status: 404 })
          }
          const mission = getSwarmMission(missionId)
          return json({
            ok: true,
            missionId,
            threadId: missionId,
            orchestratorState,
            mission,
            fetchedAt: Date.now(),
          })
        } catch (e) {
          return json(
            {
              ok: false,
              error: 'Invalid JSON from orchestrator',
              details: e instanceof Error ? e.message : String(e),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
