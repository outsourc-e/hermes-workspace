import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { startHermesAgent } from '../../server/hermes-agent'
import { startLocalAI } from '../../server/local-ai-launcher'

export const Route = createFileRoute('/api/start-all')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAuthenticated(request)) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }

          const gateway = await startHermesAgent()
          // Fire-and-forget: local AI startup is best-effort and can block
          // for 15+ seconds per configured provider. Don't delay the gateway
          // status response while waiting for Ollama/Atomic Chat to come up.
          void startLocalAI()

          const ok = gateway.ok
          return json(
            {
              ok,
              gateway,
            },
            { status: ok ? 200 : 500 },
          )
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
