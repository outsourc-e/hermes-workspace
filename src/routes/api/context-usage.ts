import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
} from '@/server/gateway-capabilities'

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-opus': 200_000,
  'claude-haiku-3.5': 200_000,
  'gpt-5.4': 1_000_000,
  'gpt-5.2-codex': 1_000_000,
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 1_000_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  o1: 200_000,
  'o3-mini': 200_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
}

function getContextWindow(model: string): number {
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model]
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (
      model.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(model.toLowerCase())
    )
      return value
  }
  return 200_000
}

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

const CHARS_PER_TOKEN = 3.5

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
          // Step 1: Get session data from Claude
          let sessionData: Record<string, unknown> | null = null

          const capabilities = await ensureGatewayProbed()

          if (sessionId) {
            try {
              const res = capabilities.dashboard.available
                ? await dashboardFetch(
                    `/api/sessions/${encodeURIComponent(sessionId)}`,
                    {
                      signal: AbortSignal.timeout(3000),
                    },
                  )
                : await fetch(
                    `${CLAUDE_API}/api/sessions/${encodeURIComponent(sessionId)}`,
                    {
                      headers: authHeaders(),
                      signal: AbortSignal.timeout(3000),
                    },
                  )
              if (res.ok) {
                const data = (await res.json()) as {
                  session?: Record<string, unknown>
                } & Record<string, unknown>
                sessionData = capabilities.dashboard.available
                  ? data
                  : (data.session ?? null)
              }
            } catch {
              /* ignore */
            }
          }

          // Fallback: most recent active session
          if (!sessionData) {
            try {
              const listRes = capabilities.dashboard.available
                ? await dashboardFetch('/api/sessions?limit=1', {
                    signal: AbortSignal.timeout(3000),
                  })
                : await fetch(`${CLAUDE_API}/api/sessions?limit=1`, {
                    headers: authHeaders(),
                    signal: AbortSignal.timeout(3000),
                  })
              if (listRes.ok) {
                const listData = (await listRes.json()) as {
                  items?: Array<Record<string, unknown>>
                  sessions?: Array<Record<string, unknown>>
                }
                const sessions = capabilities.dashboard.available
                  ? (listData.sessions ?? [])
                  : (listData.items ?? [])
                if (sessions.length > 0) {
                  sessionData = sessions[0]
                }
              }
            } catch {
              /* ignore */
            }
          }

          if (!sessionData) {
            return json({
              ok: true,
              contextPercent: 0,
              maxTokens: 0,
              usedTokens: 0,
              model: '',
              staticTokens: 0,
              conversationTokens: 0,
            })
          }

          const model = String(sessionData.model || '')
          const maxTokens = getContextWindow(model)
          const inputTokens = Number(sessionData.input_tokens) || 0
          const outputTokens = Number(sessionData.output_tokens) || 0
          const cacheReadTokens = Number(sessionData.cache_read_tokens) || 0
          const messageCount = Number(sessionData.message_count) || 0
          const toolCallCount = Number(sessionData.tool_call_count) || 0

          // Step 2: Estimate actual context window usage
          // The key insight: input_tokens and output_tokens from the session are
          // CUMULATIVE totals across all turns. We need the current context size.
          //
          // Strategy (matching ControlSuite's approach):
          // 1. If cache_read_tokens > 0, use it to estimate context size.
          //    cache_read ≈ tokens that were re-read from cache on each turn,
          //    which approximates the conversation context.
          //    Divide by assistant turn count and multiply by 1.2 for overhead.
          // 2. Otherwise, fall back to estimating from message content size.

          let usedTokens = 0

          // Count assistant turns (each assistant message = one API call)
          const assistantTurns = Math.max(1, Math.ceil(messageCount / 2))

          if (cacheReadTokens > 0 && assistantTurns > 0) {
            // Cache-based estimation (most accurate when available)
            // cache_read per turn ≈ the context that was served from cache
            // Multiply by 1.2 to account for non-cached parts (new messages, tool results)
            usedTokens = Math.ceil((cacheReadTokens / assistantTurns) * 1.2)
          } else if (messageCount > 0) {
            // Fallback: fetch messages and estimate from content length
            try {
              const targetSessionId = sessionId || String(sessionData.id || '')
              if (targetSessionId) {
                const msgRes = capabilities.dashboard.available
                  ? await dashboardFetch(
                      `/api/sessions/${encodeURIComponent(targetSessionId)}/messages`,
                      {
                        signal: AbortSignal.timeout(5000),
                      },
                    )
                  : await fetch(
                      `${CLAUDE_API}/api/sessions/${encodeURIComponent(targetSessionId)}/messages`,
                      {
                        headers: authHeaders(),
                        signal: AbortSignal.timeout(5000),
                      },
                    )
                if (msgRes.ok) {
                  const msgData = (await msgRes.json()) as {
                    items?: Array<{
                      content?: string
                      tool_calls?: unknown
                      reasoning?: string
                    }>
                    messages?: Array<{
                      content?: string
                      tool_calls?: unknown
                      reasoning?: string
                    }>
                  }
                  const messages = capabilities.dashboard.available
                    ? (msgData.messages ?? [])
                    : (msgData.items ?? [])
                  let totalChars = 0
                  for (const msg of messages) {
                    totalChars += (msg.content || '').length
                    if (msg.reasoning) totalChars += msg.reasoning.length
                    if (msg.tool_calls)
                      totalChars += JSON.stringify(msg.tool_calls).length
                  }
                  usedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN)
                }
              }
            } catch {
              /* ignore - use zero */
            }
          }

          // Clamp to maxTokens
          usedTokens = Math.min(usedTokens, maxTokens)
          const contextPercent =
            maxTokens > 0 ? Math.round((usedTokens / maxTokens) * 1000) / 10 : 0

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
            maxTokens: 128_000,
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
