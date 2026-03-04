import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { gatewayRpc } from '@/server/gateway'

type UnknownRecord = Record<string, unknown>

const REQUEST_TIMEOUT_MS = 10_000

function toRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord
  }
  return {}
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value)
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 1_000_000_000_000 ? asNum * 1000 : asNum
    }
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId!)
  })
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return String(error)
}

/**
 * Extract a human-readable agent name from a gateway session key.
 * Session keys follow patterns like:
 *   "agent:main:main" → "main"
 *   "agent:main:subagent:abc123" → "subagent"
 *   "cron:heartbeat" → "cron"
 *   "telegram:12345" → "telegram"
 */
function extractAgentName(sessionKey: string): string {
  if (!sessionKey) return 'unknown'
  const parts = sessionKey.split(':')
  // agent:X:subagent:ID → "subagent (X)"
  if (parts[0] === 'agent' && parts.length >= 3) {
    if (parts[2] === 'subagent') return 'subagent'
    return parts[2] || parts[1] || 'agent'
  }
  // cron:X → "cron"
  if (parts[0] === 'cron') return 'cron'
  // channel:X → channel name
  return parts[0] || 'unknown'
}

type NormalizedSession = {
  sessionKey: string
  model: string
  agent: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  lastActiveAt: number | null
}

type AgentBreakdown = {
  agent: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  sessionCount: number
}

function buildAgentBreakdowns(sessions: NormalizedSession[]): AgentBreakdown[] {
  const map = new Map<string, AgentBreakdown>()
  for (const s of sessions) {
    const existing = map.get(s.agent)
    if (existing) {
      existing.inputTokens += s.inputTokens
      existing.outputTokens += s.outputTokens
      existing.totalTokens += s.totalTokens
      existing.costUsd += s.costUsd
      existing.sessionCount += 1
    } else {
      map.set(s.agent, {
        agent: s.agent,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        totalTokens: s.totalTokens,
        costUsd: s.costUsd,
        sessionCount: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd)
}

export const Route = createFileRoute('/api/usage-analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          // Fetch cost data and sessions list in parallel
          const [costPayload, sessionsPayload] = await Promise.all([
            withTimeout(
              gatewayRpc<Record<string, unknown>>('usage.cost', {}),
              REQUEST_TIMEOUT_MS,
              'Usage analytics request timed out',
            ),
            withTimeout(
              gatewayRpc<Record<string, unknown>>('sessions.list', {}),
              REQUEST_TIMEOUT_MS,
              'Sessions list request timed out',
            ).catch(() => ({ sessions: [] })),
          ])

          const costRoot = toRecord(costPayload)

          // Build per-session breakdown from sessions.list (usage.cost doesn't include this)
          const sessionsRoot = toRecord(sessionsPayload)
          const rawSessionsList = Array.isArray(sessionsRoot.sessions)
            ? sessionsRoot.sessions
            : []

          const normalizedSessions: NormalizedSession[] = rawSessionsList.map(
            (s: unknown) => {
              const row = toRecord(s)
              const sessionKey = readString(row.key ?? row.sessionKey ?? '')
              return {
                sessionKey,
                model: readString(
                  row.modelProvider
                    ? `${row.modelProvider}/${row.model}`
                    : (row.model ?? ''),
                ),
                agent: extractAgentName(sessionKey),
                inputTokens: readNumber(row.inputTokens),
                outputTokens: readNumber(row.outputTokens),
                totalTokens: readNumber(row.totalTokens),
                costUsd: readNumber(row.costUsd ?? row.totalCost ?? 0),
                lastActiveAt: toTimestampMs(row.lastActiveAt ?? row.updatedAt),
              }
            },
          )

          // Aggregate per-model breakdown from sessions (since usage.cost doesn't include models)
          const modelMap = new Map<
            string,
            { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; sessions: number }
          >()
          for (const s of normalizedSessions) {
            const model = s.model || 'unknown'
            const existing = modelMap.get(model) || {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              costUsd: 0,
              sessions: 0,
            }
            existing.inputTokens += s.inputTokens
            existing.outputTokens += s.outputTokens
            existing.totalTokens += s.totalTokens
            existing.costUsd += s.costUsd
            existing.sessions += 1
            modelMap.set(model, existing)
          }

          const modelRows = Array.from(modelMap.entries())
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
            .map(([model, data]) => ({
              model,
              ...data,
            }))

          const modelTotals = modelRows.reduce(
            (acc, r) => ({
              inputTokens: acc.inputTokens + r.inputTokens,
              outputTokens: acc.outputTokens + r.outputTokens,
              totalTokens: acc.totalTokens + r.totalTokens,
              costUsd: acc.costUsd + r.costUsd,
            }),
            { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
          )

          const agentBreakdowns = buildAgentBreakdowns(normalizedSessions)

          return json({
            ok: true,
            sessions: normalizedSessions,
            agents: agentBreakdowns,
            cost: costRoot.cost ?? costRoot,
            models: {
              rows: modelRows,
              totals: modelTotals,
            },
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: readErrorMessage(error),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
