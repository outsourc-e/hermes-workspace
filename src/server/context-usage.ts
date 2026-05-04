import {
  BEARER_TOKEN,
  CLAUDE_API,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
} from '@/server/gateway-capabilities'

export type ContextUsageSnapshot = {
  ok: true
  contextPercent: number
  maxTokens: number
  usedTokens: number
  model: string
  staticTokens: number
  conversationTokens: number
}

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

const CHARS_PER_TOKEN = 3.5

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

function emptySnapshot(): ContextUsageSnapshot {
  return {
    ok: true,
    contextPercent: 0,
    maxTokens: 0,
    usedTokens: 0,
    model: '',
    staticTokens: 0,
    conversationTokens: 0,
  }
}

export async function readContextUsage(
  sessionId = '',
): Promise<ContextUsageSnapshot> {
  try {
    let sessionData: Record<string, unknown> | null = null
    const capabilities = await ensureGatewayProbed()

    if (sessionId) {
      try {
        const res = capabilities.dashboard.available
          ? await dashboardFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
              signal: AbortSignal.timeout(3000),
            })
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
          sessionData = capabilities.dashboard.available ? data : (data.session ?? null)
        }
      } catch {
        /* ignore */
      }
    }

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

    if (!sessionData) return emptySnapshot()

    const model = String(sessionData.model || '')
    const maxTokens = getContextWindow(model)
    const cacheReadTokens = Number(sessionData.cache_read_tokens) || 0
    const messageCount = Number(sessionData.message_count) || 0

    let usedTokens = 0
    const assistantTurns = Math.max(1, Math.ceil(messageCount / 2))

    if (cacheReadTokens > 0 && assistantTurns > 0) {
      usedTokens = Math.ceil((cacheReadTokens / assistantTurns) * 1.2)
    } else if (messageCount > 0) {
      try {
        const targetSessionId = sessionId || String(sessionData.id || '')
        if (targetSessionId) {
          const capabilitiesNow = getCapabilities()
          const msgRes = capabilitiesNow.dashboard.available
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
            const messages = capabilitiesNow.dashboard.available
              ? (msgData.messages ?? [])
              : (msgData.items ?? [])
            let totalChars = 0
            for (const msg of messages) {
              totalChars += (msg.content || '').length
              if (msg.reasoning) totalChars += msg.reasoning.length
              if (msg.tool_calls) totalChars += JSON.stringify(msg.tool_calls).length
            }
            usedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN)
          }
        }
      } catch {
        /* ignore */
      }
    }

    usedTokens = Math.min(usedTokens, maxTokens)
    const contextPercent =
      maxTokens > 0 ? Math.round((usedTokens / maxTokens) * 1000) / 10 : 0

    return {
      ok: true,
      contextPercent,
      maxTokens,
      usedTokens,
      model,
      staticTokens: 0,
      conversationTokens: usedTokens,
    }
  } catch {
    return {
      ok: true,
      contextPercent: 0,
      maxTokens: 128_000,
      usedTokens: 0,
      model: '',
      staticTokens: 0,
      conversationTokens: 0,
    }
  }
}
