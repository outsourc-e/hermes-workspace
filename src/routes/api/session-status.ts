import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { getConfig, getSession } from '../../server/hermes-api'

export const Route = createFileRoute('/api/session-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const requestedKey = url.searchParams.get('sessionKey')?.trim() || ''
          const sessionKey = requestedKey || 'main'
          const [session, config] = await Promise.all([
            getSession(sessionKey),
            getConfig(),
          ])

          const inputTokens = session.input_tokens ?? 0
          const outputTokens = session.output_tokens ?? 0

          return json({
            ok: true,
            payload: {
              status: session.ended_at ? 'ended' : 'idle',
              sessionKey: session.id,
              sessionLabel: session.title ?? '',
              model: session.model ?? config.model ?? '',
              modelProvider: config.provider ?? '',
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              sessions: [
                {
                  key: session.id,
                  agentId: session.id,
                  label: session.title ?? session.id,
                  model: session.model ?? config.model ?? '',
                  modelProvider: config.provider ?? '',
                  updatedAt: session.last_active ?? session.started_at ?? 0,
                  usage: {
                    input: inputTokens,
                    output: outputTokens,
                  },
                },
              ],
            },
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
