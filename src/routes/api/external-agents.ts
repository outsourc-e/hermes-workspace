import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  getAionCoreCompanionSnapshot,
  healthCheckExternalAgentRuntime,
} from '@/server/aioncore-companion'
import { getRemoteHarnessRuntimes } from '@/server/remote-harnesses'

export const Route = createFileRoute('/api/external-agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const [snapshot, remoteRuntimes] = await Promise.all([
          getAionCoreCompanionSnapshot(),
          getRemoteHarnessRuntimes(),
        ])
        return json({
          ok: true,
          companion: {
            ...snapshot,
            online:
              snapshot.online ||
              remoteRuntimes.some((runtime) => runtime.status === 'online'),
            runtimes: [...remoteRuntimes, ...snapshot.runtimes],
            // A missing AionCore companion should not surface an error when
            // remote harnesses are active (Hermes-only deployments).
            error:
              remoteRuntimes.length === 0
                ? (snapshot.error ?? undefined)
                : undefined,
          },
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = (await request.json().catch(() => ({}))) as {
          runtimeId?: unknown
        }
        if (typeof body.runtimeId !== 'string' || !body.runtimeId.trim()) {
          return json(
            { ok: false, error: 'runtimeId is required' },
            { status: 400 },
          )
        }

        try {
          const remoteRuntime = (await getRemoteHarnessRuntimes()).find(
            (runtime) => runtime.id === body.runtimeId,
          )
          if (remoteRuntime) {
            return json({ ok: true, runtime: remoteRuntime })
          }
          const runtime = await healthCheckExternalAgentRuntime(body.runtimeId)
          return json({ ok: true, runtime })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Agent health check failed',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
