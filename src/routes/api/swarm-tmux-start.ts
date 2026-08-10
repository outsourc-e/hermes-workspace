import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { requireLocalOrAuth } from '../../server/auth-middleware'
import { getProfilesDir } from '../../server/claude-paths'
import { getWorkerProcessHost } from '../../server/worker-process-host'
import { startWorkerProcess } from '../../server/swarm-lifecycle'
import { resolveSwarmModelLabel } from '../../server/swarm-model-resolver'
import { ensureSwarmProfileConfig, syncSwarmProfileModel } from '../../server/swarm-profile-config'
import { rosterByWorkerId } from '../../server/swarm-roster'

type StartRequest = { workerId?: unknown }
function validWorkerId(value: string): boolean { return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) }

/** Compatibility endpoint; all process ownership is delegated to WorkerProcessHost. */
export const Route = createFileRoute('/api/swarm-tmux-start')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) return json({ error: 'Unauthorized' }, { status: 401 })
        let body: StartRequest
        try { body = await request.json() as StartRequest } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }) }
        const workerId = typeof body.workerId === 'string' ? body.workerId.trim() : ''
        if (!validWorkerId(workerId)) return json({ error: 'workerId required (alnum, _, -; ≤64 chars)' }, { status: 400 })

        const profilePath = join(getProfilesDir(), workerId)
        const bootstrap = ensureSwarmProfileConfig(profilePath)
        if (!bootstrap.ok) return json({ error: bootstrap.error ?? 'Worker profile bootstrap failed' }, { status: 500 })
        const resolved = resolveSwarmModelLabel(rosterByWorkerId([workerId]).get(workerId)?.model ?? null)
        if (resolved) {
          const synced = syncSwarmProfileModel(profilePath, resolved)
          if (!synced.ok) return json({ error: synced.error ?? 'Worker model synchronization failed' }, { status: 500 })
        }

        const before = await getWorkerProcessHost().status(workerId)
        if (before.status === 'running') return json({ workerId, sessionName: before.sessionName, hostKind: before.hostKind, alreadyRunning: true, started: false })
        const started = await startWorkerProcess(workerId)
        if (!started.ok) return json({ error: started.error ?? 'Durable worker host failed to start' }, { status: 500 })
        const status = await getWorkerProcessHost().status(workerId)
        return json({ workerId, sessionName: status.sessionName, hostKind: status.hostKind, alreadyRunning: false, started: true })
      },
    },
  },
})
