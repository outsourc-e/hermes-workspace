import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listAllActiveRuns } from '../../../server/run-store'

export const Route = createFileRoute('/api/runs/active')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const runs = await listAllActiveRuns()
          const now = Date.now()
          return json({
            ok: true,
            runs: runs.map((run) => ({
              runId: run.runId,
              sessionKey: run.sessionKey,
              friendlyId: run.friendlyId,
              status: run.status,
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
              stalenessMs: Math.max(0, now - run.updatedAt),
              lastAssistantText: run.assistantText.slice(-160),
              lastToolName:
                run.toolCalls[run.toolCalls.length - 1]?.name ?? null,
              lifecycleEventCount: run.lifecycleEvents.length,
              lastLifecycleEvent:
                run.lifecycleEvents[run.lifecycleEvents.length - 1]?.text ??
                null,
              errorMessage: run.errorMessage ?? null,
            })),
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
