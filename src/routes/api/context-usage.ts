import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { HERMES_API } from '@/server/gateway-capabilities'

export const Route = createFileRoute('/api/context-usage')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        try {
          // Try to get session token usage from Hermes
          let usedTokens = 0
          let maxTokens = 128000 // default context window

          if (sessionId) {
            const res = await fetch(`${HERMES_API}/api/sessions/${sessionId}`, {
              signal: AbortSignal.timeout(3000),
            })
            if (res.ok) {
              const data = (await res.json()) as { session?: { input_tokens?: number; output_tokens?: number } }
              const session = data.session
              if (session) {
                usedTokens = (session.input_tokens || 0) + (session.output_tokens || 0)
              }
            }
          }

          // Try to get model context window from /v1/models
          try {
            const modelsRes = await fetch(`${HERMES_API}/v1/models`, {
              signal: AbortSignal.timeout(3000),
            })
            if (modelsRes.ok) {
              const modelsData = (await modelsRes.json()) as { data?: Array<{ context_length?: number }> }
              const firstModel = modelsData.data?.[0]
              if (firstModel?.context_length) {
                maxTokens = firstModel.context_length
              }
            }
          } catch { /* use default */ }

          const contextPercent = maxTokens > 0 ? Math.round((usedTokens / maxTokens) * 100) : 0

          return json({
            ok: true,
            contextPercent,
            maxTokens,
            usedTokens,
            model: '',
            staticTokens: 0,
            conversationTokens: usedTokens,
          })
        } catch {
          return json({
            ok: true,
            contextPercent: 0,
            maxTokens: 128000,
            usedTokens: 0,
            model: '',
            staticTokens: 0,
            conversationTokens: 0,
          })
        }
      },
    },
  },
})
