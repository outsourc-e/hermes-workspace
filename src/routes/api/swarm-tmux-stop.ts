import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { requireLocalOrAuth } from '../../server/auth-middleware'
import { getSwarmProfilePath, patchSwarmRuntimeFile } from '../../server/swarm-foundation'
import { getWorkerProcessHost } from '../../server/worker-process-host'

type StopRequest = { workerId?: unknown }
function validWorkerId(value: string): boolean { return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) }

/** Compatibility endpoint; all process termination is delegated to WorkerProcessHost. */
export const Route = createFileRoute('/api/swarm-tmux-stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) return json({ error: 'Unauthorized' }, { status: 401 })
        let body: StopRequest
        try { body = await request.json() as StopRequest } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }) }
        const workerId = typeof body.workerId === 'string' ? body.workerId.trim() : ''
        if (!validWorkerId(workerId)) return json({ error: 'workerId required' }, { status: 400 })

        const before = await getWorkerProcessHost().status(workerId)
        if (before.status === 'stopped' || before.status === 'unknown' && !before.pid && !before.sessionName) {
          return json({ workerId, sessionName: before.sessionName, wasRunning: false, killed: false })
        }
        const result = await getWorkerProcessHost().stop(workerId)
        if (!result.ok) return json({ error: result.error ?? 'worker process stop failed' }, { status: 500 })

        const patchResult = patchSwarmRuntimeFile(getSwarmProfilePath(workerId), workerId, {
          state: 'idle', phase: 'stopped', currentTask: null, activeTool: null,
          needsHuman: false, blockedReason: null, checkpointStatus: 'none',
          lastDispatchResult: 'Stopped via UI', lastOutputAt: Date.now(),
        })
        return json({
          workerId,
          sessionName: result.record?.sessionName ?? null,
          wasRunning: true,
          killed: true,
          runtimePatched: patchResult.ok,
          runtimePatchError: patchResult.ok ? undefined : patchResult.error,
        })
      },
    },
  },
})
