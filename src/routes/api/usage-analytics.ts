import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { gatewayRpc } from '@/server/gateway'

type UnknownRecord = Record<string, unknown>

const REQUEST_TIMEOUT_MS = 10_000

/**
 * Model pricing per 1M tokens (input / output / cache_read / cache_write).
 * Prices in USD. Cache read = 10% of input, cache write = 125% of input.
 * Updated March 2026.
 */
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Anthropic
  'claude-opus-4-6':       { input: 5,    output: 25,   cacheRead: 0.50,  cacheWrite: 6.25 },
  'claude-opus-4-5':       { input: 5,    output: 25,   cacheRead: 0.50,  cacheWrite: 6.25 },
  'claude-sonnet-4-6':     { input: 3,    output: 15,   cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-sonnet-4-5':     { input: 3,    output: 15,   cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-sonnet-4':       { input: 3,    output: 15,   cacheRead: 0.30,  cacheWrite: 3.75 },
  'claude-haiku-3-5':      { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.3125 },
  // OpenAI
  'gpt-4o':                { input: 2.5,  output: 10,   cacheRead: 1.25,  cacheWrite: 2.5 },
  'gpt-4o-mini':           { input: 0.15, output: 0.6,  cacheRead: 0.075, cacheWrite: 0.15 },
  'gpt-5.3-codex':         { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 }, // free via OAuth
  'o3':                    { input: 2,    output: 8,    cacheRead: 1,     cacheWrite: 2 },
  'o3-mini':               { input: 1.1,  output: 4.4,  cacheRead: 0.55,  cacheWrite: 1.1 },
  // MiniMax
  'MiniMax-M2.5':          { input: 0.5,  output: 1.1,  cacheRead: 0.25,  cacheWrite: 0.5 },
  'MiniMax-M2.5-Lightning':{ input: 0.2,  output: 0.5,  cacheRead: 0.1,   cacheWrite: 0.2 },
  // Google
  'gemini-2.5-flash':      { input: 0.15, output: 0.6,  cacheRead: 0.075, cacheWrite: 0.15 },
  'gemini-2.5-pro':        { input: 1.25, output: 5,    cacheRead: 0.315, cacheWrite: 1.25 },
  // Local (free)
  'local':                 { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
}

/** Estimate cost for a given model and token counts */
function estimateCost(modelString: string, inputTokens: number, outputTokens: number): number {
  // Try exact match first, then fuzzy match on model name
  const modelLower = modelString.toLowerCase()
  let pricing = MODEL_PRICING[modelString]
  if (!pricing) {
    // Strip provider prefix (e.g. "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
    const stripped = modelString.includes('/') ? modelString.split('/').pop() || '' : modelString
    pricing = MODEL_PRICING[stripped]
  }
  if (!pricing) {
    // Fuzzy: check if model name contains a known key
    for (const [key, p] of Object.entries(MODEL_PRICING)) {
      if (modelLower.includes(key.toLowerCase())) {
        pricing = p
        break
      }
    }
  }
  if (!pricing) {
    // Check for local/ollama models (free)
    if (modelLower.includes('ollama') || modelLower.includes('lmstudio') || modelLower.includes('local')) {
      return 0
    }
    // Default conservative estimate: $3/$15 (sonnet-level)
    pricing = { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 }
  }
  // Price per token = price per 1M tokens / 1,000,000
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

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
  label: string
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

/**
 * Batch-fetch session.status for a list of session keys.
 * Returns a map of sessionKey → { costUsd, models[], inputTokens, outputTokens, cacheRead, cacheWrite }.
 * Failed fetches are silently skipped (session just won't have cost data).
 */
async function batchFetchSessionCosts(
  sessionKeys: string[],
): Promise<Map<string, { costUsd: number; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; models: Array<{ model: string; provider: string; costUsd: number; inputTokens: number; outputTokens: number; count: number }> }>> {
  const results = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; models: Array<{ model: string; provider: string; costUsd: number; inputTokens: number; outputTokens: number; count: number }> }>()

  // Fetch in parallel, max 10 at a time to avoid overwhelming the gateway
  const BATCH_SIZE = 10
  for (let i = 0; i < sessionKeys.length; i += BATCH_SIZE) {
    const batch = sessionKeys.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (key) => {
      try {
        const status = await withTimeout(
          gatewayRpc<Record<string, unknown>>('session.status', { sessionKey: key }),
          5000,
          `session.status timeout for ${key}`,
        )
        const s = toRecord(status)
        const usage = toRecord(s.usage)
        const modelUsage = Array.isArray(usage.modelUsage) ? usage.modelUsage : []

        const models = modelUsage.map((m: unknown) => {
          const mr = toRecord(m)
          const totals = toRecord(mr.totals)
          return {
            model: readString(mr.model),
            provider: readString(mr.provider),
            costUsd: readNumber(totals.totalCost ?? totals.costUsd),
            inputTokens: readNumber(totals.input ?? totals.inputTokens),
            outputTokens: readNumber(totals.output ?? totals.outputTokens),
            count: readNumber(mr.count),
          }
        })

        results.set(key, {
          costUsd: readNumber(usage.totalCost ?? s.costUsd),
          inputTokens: readNumber(usage.input ?? s.inputTokens),
          outputTokens: readNumber(usage.output ?? s.outputTokens),
          cacheRead: readNumber(usage.cacheRead),
          cacheWrite: readNumber(usage.cacheWrite),
          models,
        })
      } catch {
        // Skip failed fetches — session will use estimated cost
      }
    })
    await Promise.all(promises)
  }

  return results
}

export const Route = createFileRoute('/api/usage-analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          // Step 1: Fetch cost data and sessions list in parallel
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

          // Build per-session list from sessions.list
          const sessionsRoot = toRecord(sessionsPayload)
          const rawSessionsList = Array.isArray(sessionsRoot.sessions)
            ? sessionsRoot.sessions
            : []

          // Step 2: Batch-fetch session.status for sessions with tokens (real cost data)
          const activeSessionKeys: string[] = []
          for (const s of rawSessionsList) {
            const row = toRecord(s)
            const key = readString(row.key ?? row.sessionKey ?? '')
            const totalTokens = readNumber(row.totalTokens) || readNumber(row.inputTokens) + readNumber(row.outputTokens)
            if (key && totalTokens > 0) {
              activeSessionKeys.push(key)
            }
          }

          const sessionCosts = await batchFetchSessionCosts(activeSessionKeys)

          // Step 3: Build normalized sessions with real costs
          const normalizedSessions: NormalizedSession[] = rawSessionsList.map(
            (s: unknown) => {
              const row = toRecord(s)
              const sessionKey = readString(row.key ?? row.sessionKey ?? '')
              const model = readString(
                row.modelProvider
                  ? `${row.modelProvider}/${row.model}`
                  : (row.model ?? ''),
              )
              const sessionCost = sessionCosts.get(sessionKey)
              const inputTokens = sessionCost?.inputTokens ?? readNumber(row.inputTokens)
              const outputTokens = sessionCost?.outputTokens ?? readNumber(row.outputTokens)
              const costUsd = sessionCost?.costUsd ?? estimateCost(model, inputTokens, outputTokens)

              // Build a human-friendly label from available metadata
              const rawLabel = readString(row.label ?? row.displayName ?? row.friendlyId ?? '')
              const label = rawLabel || extractAgentName(sessionKey)

              return {
                sessionKey,
                label,
                model,
                agent: extractAgentName(sessionKey),
                inputTokens,
                outputTokens,
                totalTokens: readNumber(row.totalTokens) || inputTokens + outputTokens,
                costUsd,
                lastActiveAt: toTimestampMs(row.lastActiveAt ?? row.updatedAt),
              }
            },
          )

          // Step 4: Build per-model breakdown from session.status model usage (most accurate)
          const modelMap = new Map<
            string,
            { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; sessions: number }
          >()

          // First pass: use detailed model usage from session.status
          for (const [, sessionCost] of sessionCosts) {
            for (const m of sessionCost.models) {
              const modelKey = m.provider ? `${m.provider}/${m.model}` : m.model
              if (!modelKey) continue
              const existing = modelMap.get(modelKey) || {
                inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, sessions: 0,
              }
              existing.inputTokens += m.inputTokens
              existing.outputTokens += m.outputTokens
              existing.totalTokens += m.inputTokens + m.outputTokens
              existing.costUsd += m.costUsd
              existing.sessions += 1
              modelMap.set(modelKey, existing)
            }
          }

          // Fallback for sessions that didn't have session.status data
          for (const s of normalizedSessions) {
            if (sessionCosts.has(s.sessionKey)) continue // already counted above
            const model = s.model || 'unknown'
            const existing = modelMap.get(model) || {
              inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, sessions: 0,
            }
            existing.inputTokens += s.inputTokens
            existing.outputTokens += s.outputTokens
            existing.totalTokens += s.totalTokens
            existing.costUsd += s.costUsd
            existing.sessions += 1
            modelMap.set(model, existing)
          }

          const modelRows = Array.from(modelMap.entries())
            .sort((a, b) => b[1].costUsd - a[1].costUsd || b[1].totalTokens - a[1].totalTokens)
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
