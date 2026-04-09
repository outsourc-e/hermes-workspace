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
          let maxTokens = 200000 // default context window
          let model = ''

          // Known context window sizes for common models
          const MODEL_CONTEXT: Record<string, number> = {
            'claude-opus-4-6': 200000,
            'claude-sonnet-4-6': 200000,
            'claude-sonnet-4': 200000,
            'claude-opus-4': 200000,
            'claude-3-5-sonnet': 200000,
            'claude-3-opus': 200000,
            'gpt-5.4': 128000,
            'gpt-4o': 128000,
            'gpt-4-turbo': 128000,
          }

          if (sessionId) {
            const res = await fetch(`${HERMES_API}/api/sessions/${sessionId}`, {
              signal: AbortSignal.timeout(3000),
            })
            if (res.ok) {
              const data = (await res.json()) as { session?: {
                input_tokens?: number
                output_tokens?: number
                cache_read_tokens?: number
                cache_write_tokens?: number
                model?: string
              } }
              const session = data.session
              if (session) {
                // Total context = all tokens in the window (cached + uncached)
                usedTokens = (session.input_tokens || 0)
                  + (session.output_tokens || 0)
                  + (session.cache_read_tokens || 0)
                  + (session.cache_write_tokens || 0)
                model = session.model || ''

                // Set max based on model
                const modelKey = Object.keys(MODEL_CONTEXT).find(
                  (k) => model.toLowerCase().includes(k.toLowerCase()),
                )
                if (modelKey) maxTokens = MODEL_CONTEXT[modelKey]
              }
            }
          }

          // Fallback: try /v1/models for context_length
          if (maxTokens === 200000 && !model) {
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
          }

          const contextPercent = maxTokens > 0 ? Math.round((usedTokens / maxTokens) * 100) : 0

          return json({
            ok: true,
            contextPercent,
            maxTokens,
            usedTokens,
            model,
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
