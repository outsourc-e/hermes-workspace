import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '@/server/gateway'
import { isAuthenticated } from '@/server/auth-middleware'

type GatewaySession = Record<string, unknown>
type GatewaySessionsListResponse = {
  sessions?: GatewaySession[]
}

type GatewaySessionsUsageResponse = {
  sessions?: GatewaySession[]
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 1_000_000,
  'claude-opus-4-5': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-sonnet-4-5': 1_000_000,
  'claude-sonnet-4': 1_000_000,
  'claude-haiku-3.5': 1_000_000,
  'gpt-5.4': 1_000_000,
  'gpt-5.3-codex': 192_000,
  'gpt-5.2-codex': 192_000,
  'gpt-5.1-codex': 128_000,
  'gpt-5-codex': 128_000,
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 1_000_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  o1: 200_000,
  'o3-mini': 200_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
}

function gatewayRpcWithTimeout<TPayload>(
  method: string,
  params?: unknown,
  timeoutMs = 10_000,
): Promise<TPayload> {
  return Promise.race([
    gatewayRpc<TPayload>(method, params),
    new Promise<TPayload>((_, reject) => {
      setTimeout(() => reject(new Error('Gateway RPC timed out')), timeoutMs)
    }),
  ])
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function getContextWindow(model: string): number {
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model]
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.includes(key) || key.includes(model)) return value
  }
  return 1_000_000
}

function readThinking(session: GatewaySession): string | undefined {
  const nested = [
    readRecord(session.config),
    readRecord(session.overrides),
    readRecord(session.entry),
    readRecord(session.resolved),
  ]
  const directCandidates = [
    session.thinking,
    session.thinkingLevel,
    session.reasoningEffort,
  ]
  for (const candidate of directCandidates) {
    const value = readString(candidate)
    if (value) return value
  }
  for (const record of nested) {
    if (!record) continue
    const value =
      readString(record.thinking) ||
      readString(record.thinkingLevel) ||
      readString(record.reasoningEffort)
    if (value) return value
  }
  return undefined
}

function readOverrideBoolean(
  session: GatewaySession,
  field: 'fast' | 'verbose' | 'reasoning',
): boolean | undefined {
  const nested = [
    readRecord(session.config),
    readRecord(session.overrides),
    readRecord(session.entry),
    readRecord(session.resolved),
  ]
  const candidateKeys =
    field === 'fast' ? ['fast', 'fastMode'] : [field, `${field}Mode`]
  for (const key of candidateKeys) {
    const value = readBoolean(session[key])
    if (value !== undefined) return value
  }
  for (const record of nested) {
    if (!record) continue
    for (const key of candidateKeys) {
      const value = readBoolean(record[key])
      if (value !== undefined) return value
    }
  }
  return undefined
}

function mergeSessionData(
  sessionsPayload: GatewaySessionsListResponse,
  usagePayload: GatewaySessionsUsageResponse | null,
) {
  const sessions = Array.isArray(sessionsPayload.sessions)
    ? sessionsPayload.sessions
    : []
  const usageSessions = Array.isArray(usagePayload?.sessions)
    ? usagePayload.sessions
    : []
  const usageByKey = new Map<string, GatewaySession>()

  for (const session of usageSessions) {
    const key = readString(session.key)
    if (key) usageByKey.set(key, session)
  }

  return sessions.map((session) => {
    const key = readString(session.key) || ''
    const usageSession = usageByKey.get(key)
    const usageRecord = readRecord(usageSession?.usage)
    const model =
      readString(session.model) ||
      readString(usageSession?.model) ||
      readString(usageSession?.modelOverride) ||
      ''
    const totalTokens =
      readNumber(session.totalTokens) ||
      readNumber(session.tokenCount) ||
      readNumber(usageRecord?.totalTokens) ||
      (() => {
        const input = readNumber(usageRecord?.input) || 0
        const output = readNumber(usageRecord?.output) || 0
        const total = input + output
        return total > 0 ? total : undefined
      })() ||
      0
    const tokenLimit =
      readNumber(session.contextTokens) ||
      readNumber(session.tokenLimit) ||
      readNumber(usageSession?.contextTokens) ||
      (model ? getContextWindow(model) : undefined)

    return {
      ...session,
      usage: usageRecord || session.usage,
      totalTokens,
      tokenLimit,
      tokenUsagePercent:
        tokenLimit && tokenLimit > 0
          ? Math.min(100, Math.round((totalTokens / tokenLimit) * 100))
          : undefined,
      thinking: readThinking(session),
      fast: readOverrideBoolean(session, 'fast'),
      verbose: readOverrideBoolean(session, 'verbose'),
      reasoning: readOverrideBoolean(session, 'reasoning'),
      model: model || session.model,
      modelProvider:
        readString(session.modelProvider) || readString(usageSession?.modelProvider),
    }
  })
}

export const Route = createFileRoute('/api/gateway/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const [sessionsResult, usageResult] = await Promise.allSettled([
            gatewayRpcWithTimeout<GatewaySessionsListResponse>('sessions.list', {
              limit: 100,
            }),
            gatewayRpcWithTimeout<GatewaySessionsUsageResponse>(
              'sessions.usage',
              {
                limit: 100,
                includeContextWeight: true,
              },
              5_000,
            ),
          ])

          if (sessionsResult.status !== 'fulfilled') {
            throw sessionsResult.reason
          }

          const sessions = mergeSessionData(
            sessionsResult.value,
            usageResult.status === 'fulfilled' ? usageResult.value : null,
          )

          return json({
            ok: true,
            data: {
              ...sessionsResult.value,
              sessions,
            },
          })
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
