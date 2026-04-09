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
            'claude-opus-4-6': 1000000,
            'claude-sonnet-4-6': 1000000,
            'claude-opus-4-5': 1000000,
            'claude-sonnet-4-5': 1000000,
            'claude-sonnet-4': 200000,
            'claude-opus-4': 200000,
            'claude-3-5-sonnet': 200000,
            'claude-3-opus': 200000,
            'gpt-5.4': 1000000,
            'gpt-4o': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4.1': 1000000,
          }

          // Try to find session data — first by exact ID, then by listing
          let sessionData: Record<string, unknown> | null = null

          if (sessionId) {
            const res = await fetch(`${HERMES_API}/api/sessions/${sessionId}`, {
              signal: AbortSignal.timeout(3000),
            })
            if (res.ok) {
              const data = (await res.json()) as { session?: Record<string, unknown> }
              if (data.session) sessionData = data.session
            }
          }

          // Fallback: if no session found by ID, try the most recent active session
          if (!sessionData) {
            try {
              const listRes = await fetch(`${HERMES_API}/api/sessions?limit=1`, {
                signal: AbortSignal.timeout(3000),
              })
              if (listRes.ok) {
                const listData = (await listRes.json()) as { items?: Array<Record<string, unknown>> }
                if (listData.items && listData.items.length > 0) {
                  sessionData = listData.items[0]
                }
              }
            } catch { /* ignore */ }
          }

          if (sessionData) {
            // Active context = input + output tokens (what's in the conversation window)
            // Cache tokens are NOT additional context — they represent tokens served
            // from cache instead of being reprocessed, so they don't add to window usage
            usedTokens = (Number(sessionData.input_tokens) || 0)
              + (Number(sessionData.output_tokens) || 0)
            model = String(sessionData.model || '')

            // Set max based on model
            const modelKey = Object.keys(MODEL_CONTEXT).find(
              (k) => model.toLowerCase().includes(k.toLowerCase()),
            )
            if (modelKey) maxTokens = MODEL_CONTEXT[modelKey]
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
