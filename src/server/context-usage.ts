import {
  BEARER_TOKEN,
  CLAUDE_API,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
} from '@/server/gateway-capabilities'
import { listSessions } from '@/server/claude-api'
import { getLocalMessages, getLocalSession } from './local-session-store'
import { getActiveRunForSession } from './run-store'
import {
  resolveMainChatSessionId,
  shouldBindMainToPortableSession,
} from '@/server/session-utils'

export type ContextUsageSnapshot = {
  ok: true
  contextPercent: number
  maxTokens: number
  usedTokens: number
  model: string
  staticTokens: number
  conversationTokens: number
}

type ResolvedModelContext = {
  model: string
  maxTokens: number
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
  'kimi-k2.6': 256_000,
}

const CHARS_PER_TOKEN = 3.5

type MessageLike = {
  content?: unknown
  text?: unknown
  reasoning?: unknown
  tool_calls?: unknown
}

function estimateTokensFromChars(totalChars: number): number {
  return Math.ceil(Math.max(0, totalChars) / CHARS_PER_TOKEN)
}

function stringifyStructuredContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const record = part as Record<string, unknown>
        if (typeof record.text === 'string') return record.text
        try {
          return JSON.stringify(record)
        } catch {
          return ''
        }
      })
      .join(' ')
  }
  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content)
    } catch {
      return ''
    }
  }
  return ''
}

export function estimateContextTokensFromMessages(
  messages: Array<MessageLike>,
): number {
  let totalChars = 0
  for (const msg of messages) {
    const structured = stringifyStructuredContent(msg.content)
    const topLevelText = typeof msg.text === 'string' ? msg.text : ''
    if (structured) {
      totalChars += structured.length
      if (topLevelText && topLevelText !== structured) totalChars += topLevelText.length
    } else if (typeof msg.content === 'string') {
      totalChars += msg.content.length
      if (topLevelText && topLevelText !== msg.content) totalChars += topLevelText.length
    } else if (topLevelText) {
      totalChars += topLevelText.length
    }
    if (typeof msg.reasoning === 'string') totalChars += msg.reasoning.length
    if (msg.tool_calls) {
      try {
        totalChars += JSON.stringify(msg.tool_calls).length
      } catch {
        /* ignore */
      }
    }
  }
  return estimateTokensFromChars(totalChars)
}

export function estimateContextTokensFromCacheRead(
  cacheReadTokens: number,
  messageCount: number,
): number {
  const assistantTurns = Math.max(1, Math.ceil((Number(messageCount) || 0) / 2))
  return Math.ceil((Math.max(0, Number(cacheReadTokens) || 0) / assistantTurns) * 1.2)
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

function configuredEmptySnapshot(
  configuredModelContext: ResolvedModelContext | null,
): ContextUsageSnapshot {
  return {
    ok: true,
    contextPercent: 0,
    maxTokens: configuredModelContext?.maxTokens || 0,
    usedTokens: 0,
    model: configuredModelContext?.model || '',
    staticTokens: 0,
    conversationTokens: 0,
  }
}

function readConfiguredContextLength(payload: Record<string, unknown>): number {
  const direct = [
    payload.effective_context_length,
    payload.config_context_length,
    payload.auto_context_length,
    payload.context_length,
  ]
    .map((value) => Number(value) || 0)
    .find((value) => value > 0)
  if (direct && direct > 0) return direct

  const capabilities = payload.capabilities
  if (capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)) {
    const contextWindow = Number(
      (capabilities as Record<string, unknown>).context_window,
    )
    if (contextWindow > 0) return contextWindow
  }

  return 0
}

async function readConfiguredModelContext(): Promise<ResolvedModelContext | null> {
  try {
    const capabilities = getCapabilities()
    if (!capabilities.dashboard.available) return null

    const response = await dashboardFetch('/api/model/info', {
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok) return null

    const payload = (await response.json()) as Record<string, unknown>
    const model = typeof payload.model === 'string' ? payload.model.trim() : ''
    const maxTokens = readConfiguredContextLength(payload)

    if (!model && maxTokens <= 0) return null

    return {
      model,
      maxTokens,
    }
  } catch {
    return null
  }
}

async function readGatewayRuntimeSnapshot(
  sessionId: string,
): Promise<ContextUsageSnapshot | null> {
  const sid = sessionId.trim()
  if (!sid) return null
  try {
    const res = await fetch(
      `${CLAUDE_API}/api/sessions/${encodeURIComponent(sid)}/runtime`,
      {
        headers: authHeaders(),
        signal: AbortSignal.timeout(2500),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      model?: unknown
      context_tokens?: unknown
      context_length?: unknown
      context_percent?: unknown
      total_tokens?: unknown
      prompt_tokens?: unknown
      input_tokens?: unknown
    }
    const model = typeof data.model === 'string' ? data.model : ''
    const maxTokens = Number(data.context_length) || 0
    const usedTokens =
      Number(data.context_tokens) ||
      Number(data.prompt_tokens) ||
      Number(data.input_tokens) ||
      Number(data.total_tokens) ||
      0
    const contextPercent =
      Number.isFinite(Number(data.context_percent)) && Number(data.context_percent) > 0
        ? Number(data.context_percent)
        : maxTokens > 0 && usedTokens > 0
          ? Math.round((usedTokens / maxTokens) * 1000) / 10
          : 0
    if (!model && maxTokens <= 0 && usedTokens <= 0 && contextPercent <= 0) {
      return null
    }
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
    return null
  }
}

async function resolveRuntimeSessionId(sessionId: string): Promise<string> {
  const trimmed = sessionId.trim()
  if (trimmed !== 'main') return trimmed

  const capabilities = getCapabilities()
  if (
    shouldBindMainToPortableSession({
      sessionKey: trimmed,
      dashboardAvailable: capabilities.dashboard.available,
      enhancedChat: capabilities.enhancedChat,
    })
  ) {
    return trimmed
  }

  try {
    const sessions = await listSessions(30, 0)
    return resolveMainChatSessionId(sessions) ?? trimmed
  } catch {
    return trimmed
  }
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function extractComparableLocalTurns(
  messages: Array<{ role?: string; content?: string }>,
): Array<{ role: 'user' | 'assistant'; text: string }> {
  return messages
    .filter(
      (message): message is { role: 'user' | 'assistant'; content?: string } =>
        message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({
      role: message.role,
      text: normalizeComparableText(message.content ?? ''),
    }))
    .filter((message) => message.text.length > 0)
}

async function resolveMirroredRuntimeSessionId(
  sessionId: string,
): Promise<string | null> {
  const localSession = getLocalSession(sessionId)
  if (!localSession) return null

  const localTurns = extractComparableLocalTurns(getLocalMessages(sessionId))
  if (localTurns.length < 2) return null

  const localCreatedAt = localSession.createdAt / 1000
  const localUpdatedAt = localSession.updatedAt / 1000

  try {
    const sessions = await listSessions(20, 0)
    const candidate = sessions
      .filter((session) => {
        if (!session?.id || session.id === sessionId) return false
        if (session.source === 'local') return false

        const startedAt = Number(session.started_at) || 0
        const updatedAt = Number(session.last_active) || startedAt
        if (startedAt <= 0 || updatedAt <= 0) return false

        return (
          startedAt >= localCreatedAt - 5 &&
          startedAt <= localUpdatedAt + 300 &&
          updatedAt <= localUpdatedAt + 300
        )
      })
      .sort((a, b) => {
        const aStarted = Number(a.started_at) || 0
        const bStarted = Number(b.started_at) || 0
        const aUpdated = Number(a.last_active) || Number(a.started_at) || 0
        const bUpdated = Number(b.last_active) || Number(b.started_at) || 0
        const aStartDistance = Math.abs(aStarted - localUpdatedAt)
        const bStartDistance = Math.abs(bStarted - localUpdatedAt)
        if (aStartDistance !== bStartDistance) {
          return aStartDistance - bStartDistance
        }
        return bUpdated - aUpdated
      })[0]

    return candidate?.id ?? null
  } catch {
    return null
  }
}

export async function readContextUsage(
  sessionId = '',
): Promise<ContextUsageSnapshot> {
  try {
    let sessionData: Record<string, unknown> | null = null
    const explicitSessionId = sessionId.trim()
    const capabilities = await ensureGatewayProbed()
    const configuredModelContext = await readConfiguredModelContext()
    const resolvedSessionId = explicitSessionId
      ? await resolveRuntimeSessionId(explicitSessionId)
      : ''

    if (explicitSessionId) {
      const liveRuntime = await readGatewayRuntimeSnapshot(resolvedSessionId)
      if (liveRuntime) return liveRuntime

      const localSession = getLocalSession(explicitSessionId)
      const localMessages = getLocalMessages(explicitSessionId)
      const activeRun = await getActiveRunForSession(explicitSessionId)
      if (localSession) {
        const mirroredRuntimeSessionId = await resolveMirroredRuntimeSessionId(
          explicitSessionId,
        )
        if (mirroredRuntimeSessionId) {
          const mirroredRuntime = await readGatewayRuntimeSnapshot(
            mirroredRuntimeSessionId,
          )
          if (mirroredRuntime) return mirroredRuntime
        }

        const pendingMessages = activeRun?.assistantText
          ? [
              ...localMessages,
              {
                role: 'assistant',
                content: activeRun.assistantText,
                text: activeRun.assistantText,
              },
            ]
          : localMessages
        const usedTokens = estimateContextTokensFromMessages(pendingMessages)
        const model =
          localSession.model || configuredModelContext?.model || 'gpt-5.4'
        const maxTokens =
          configuredModelContext?.maxTokens || getContextWindow(model)
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
      }

      if (localMessages.length > 0 || activeRun?.assistantText) {
        const pendingMessages = activeRun?.assistantText
          ? [
              ...localMessages,
              {
                role: 'assistant',
                content: activeRun.assistantText,
                text: activeRun.assistantText,
              },
            ]
          : localMessages
        const usedTokens = estimateContextTokensFromMessages(pendingMessages)
        const model = configuredModelContext?.model || 'gpt-5.4'
        const maxTokens = configuredModelContext?.maxTokens || getContextWindow(model)
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
      }
    }

    if (explicitSessionId) {
      try {
        const res = capabilities.dashboard.available
          ? await dashboardFetch(`/api/sessions/${encodeURIComponent(resolvedSessionId)}`, {
              signal: AbortSignal.timeout(3000),
            })
          : await fetch(
              `${CLAUDE_API}/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
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

    // If the caller asked for a specific session and neither the local store nor
    // the gateway has it, return the configured context window without inheriting
    // unrelated conversation usage from another session.
    if (explicitSessionId && !sessionData) {
      return configuredEmptySnapshot(configuredModelContext)
    }

    if (!explicitSessionId) return configuredEmptySnapshot(configuredModelContext)

    if (!sessionData) return configuredEmptySnapshot(configuredModelContext)

    const model = String(sessionData.model || '')
    const maxTokens = configuredModelContext?.maxTokens || getContextWindow(model)
    const cacheReadTokens = Number(sessionData.cache_read_tokens) || 0
    const messageCount = Number(sessionData.message_count) || 0

    let usedTokens = 0
    const assistantTurns = Math.max(1, Math.ceil(messageCount / 2))

    if (cacheReadTokens > 0 && assistantTurns > 0) {
      usedTokens = estimateContextTokensFromCacheRead(cacheReadTokens, messageCount)
    } else if (messageCount > 0) {
      try {
        const targetSessionId = resolvedSessionId || String(sessionData.id || '')
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
            usedTokens = estimateContextTokensFromMessages(messages)
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
