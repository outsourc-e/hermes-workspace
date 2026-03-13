import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '@/server/gateway'
import { isAuthenticated } from '@/server/auth-middleware'
import { requireJsonContentType } from '@/server/rate-limit'

type AgentConfigToolEntry = {
  id: string
  enabled: boolean
  source: 'allowed' | 'denied' | 'explicit' | 'unknown'
}

type AgentConfigSkillEntry = {
  id: string
  enabled: boolean
}

type AgentConfigChannelEntry = {
  id: string
  enabled: boolean | null
  config: Record<string, unknown>
}

type NormalizedAgentConfig = {
  agentId: string
  name: string
  workspacePath: string
  primaryModel: string
  fallbackModels: Array<string>
  modelOverride: string
  tools: Array<AgentConfigToolEntry>
  skills: Array<AgentConfigSkillEntry>
  channels: Array<AgentConfigChannelEntry>
  readOnly: boolean
  supportsPatch: boolean
  sourceMethod?: string
  warning?: string
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return ''
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'enabled', 'active', 'allow', 'allowed', 'on'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'disabled', 'inactive', 'deny', 'denied', 'off'].includes(normalized)) {
      return false
    }
  }
  return null
}

function readStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (typeof entry === 'number' && Number.isFinite(entry)) return String(entry)
      return ''
    })
    .filter((entry) => entry.length > 0)
}

function dedupeStrings(values: Array<string>): Array<string> {
  const seen = new Set<string>()
  const result: Array<string> = []

  values.forEach((value) => {
    const key = value.trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(key)
  })

  return result
}

async function tryGatewayMethods<TPayload>(
  methods: Array<string>,
  paramsList: Array<Record<string, unknown>>,
): Promise<{ payload: TPayload; method: string }> {
  let lastError: unknown = null

  for (const method of methods) {
    for (const params of paramsList) {
      try {
        const payload = await gatewayRpcWithTimeout<TPayload>(method, params)
        return { payload, method }
      } catch (error) {
        lastError = error
      }
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error('Gateway RPC request failed')
}

function normalizeTools(value: unknown): Array<AgentConfigToolEntry> {
  if (Array.isArray(value)) {
    return dedupeStrings(readStringArray(value)).map((id) => ({
      id,
      enabled: true,
      source: 'explicit',
    }))
  }

  const record = asRecord(value)
  const allowed = readStringArray(record.allowed ?? record.allow)
  const denied = readStringArray(record.denied ?? record.deny)
  const explicitEntries = Object.entries(record)
    .filter(([key]) => !['allowed', 'allow', 'denied', 'deny'].includes(key))
    .flatMap(([key, entry]) => {
      const booleanValue = readBoolean(entry)
      if (booleanValue === null) return []
      return [
        {
          id: key,
          enabled: booleanValue,
          source: 'explicit' as const,
        },
      ]
    })

  const byId = new Map<string, AgentConfigToolEntry>()

  explicitEntries.forEach((entry) => {
    byId.set(entry.id, entry)
  })
  allowed.forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, enabled: true, source: 'allowed' })
  })
  denied.forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, enabled: false, source: 'denied' })
  })

  return Array.from(byId.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  )
}

function normalizeSkills(value: unknown): Array<AgentConfigSkillEntry> {
  if (Array.isArray(value)) {
    return dedupeStrings(readStringArray(value))
      .map((id) => ({ id, enabled: true }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  return Object.entries(asRecord(value))
    .flatMap(([key, entry]) => {
      const booleanValue = readBoolean(entry)
      if (booleanValue === null) return []
      return [{ id: key, enabled: booleanValue }]
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeChannels(value: unknown): Array<AgentConfigChannelEntry> {
  if (Array.isArray(value)) {
    return dedupeStrings(readStringArray(value))
      .map((id) => ({ id, enabled: true, config: {} }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  return Object.entries(asRecord(value))
    .map(([id, entry]) => {
      const record = asRecord(entry)
      return {
        id,
        enabled: readBoolean(record.enabled ?? record.active ?? entry),
        config: record,
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeAgentConfig(
  payload: unknown,
  agentId: string,
  options: { readOnly: boolean; supportsPatch: boolean; sourceMethod?: string; warning?: string },
): NormalizedAgentConfig {
  const root = asRecord(payload)
  const nestedConfig = asRecord(root.config ?? root.agent ?? root.profile ?? root.entry ?? root.data)
  const modelRecord = asRecord(root.model ?? nestedConfig.model)

  return {
    agentId,
    name: readString(
      root.name,
      nestedConfig.name,
      root.displayName,
      nestedConfig.displayName,
      agentId,
    ),
    workspacePath: readString(
      root.workspacePath,
      root.path,
      nestedConfig.workspacePath,
      nestedConfig.path,
      asRecord(root.workspace).path,
      asRecord(nestedConfig.workspace).path,
    ),
    primaryModel: readString(
      root.primaryModel,
      nestedConfig.primaryModel,
      root.model,
      nestedConfig.model,
      modelRecord.primary,
      modelRecord.id,
      modelRecord.name,
    ),
    fallbackModels: dedupeStrings([
      ...readStringArray(root.fallbackModels),
      ...readStringArray(root.fallbacks),
      ...readStringArray(nestedConfig.fallbackModels),
      ...readStringArray(nestedConfig.fallbacks),
      ...readStringArray(modelRecord.fallbacks),
    ]),
    modelOverride: readString(
      root.modelOverride,
      nestedConfig.modelOverride,
      asRecord(root.runtime).modelOverride,
      asRecord(nestedConfig.runtime).modelOverride,
    ),
    tools: normalizeTools(
      root.tools ??
        nestedConfig.tools ??
        root.allowedTools ??
        nestedConfig.allowedTools,
    ),
    skills: normalizeSkills(
      root.skills ?? nestedConfig.skills ?? root.activeSkills ?? nestedConfig.activeSkills,
    ),
    channels: normalizeChannels(
      root.channels ?? nestedConfig.channels ?? root.respondsOn ?? nestedConfig.respondsOn,
    ),
    readOnly: options.readOnly,
    supportsPatch: options.supportsPatch,
    sourceMethod: options.sourceMethod,
    warning: options.warning,
  }
}

export const Route = createFileRoute('/api/gateway/agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const agentId = url.searchParams.get('agentId')?.trim()

        if (agentId) {
          try {
            const result = await tryGatewayMethods<Record<string, unknown>>(
              ['agents.get', 'agent.get', 'agents.config.get'],
              [
                { agentId },
                { id: agentId },
                { key: agentId },
                { name: agentId },
              ],
            )

            return json({
              ok: true,
              data: normalizeAgentConfig(result.payload, agentId, {
                readOnly: false,
                supportsPatch: true,
                sourceMethod: result.method,
              }),
            })
          } catch (err) {
            return json({
              ok: true,
              data: normalizeAgentConfig({}, agentId, {
                readOnly: true,
                supportsPatch: false,
                warning:
                  err instanceof Error
                    ? `Agent config RPC unavailable: ${err.message}`
                    : 'Agent config RPC unavailable',
              }),
            })
          }
        }

        try {
          const result = await gatewayRpcWithTimeout<Record<string, unknown>>(
            'agents.list',
            {},
          )
          return json({ ok: true, data: result })
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
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const agentId =
            typeof body.agentId === 'string' ? body.agentId.trim() : ''
          const config = asRecord(body.config)

          if (!agentId) {
            return json(
              { ok: false, error: 'agentId is required' },
              { status: 400 },
            )
          }

          const result = await tryGatewayMethods<Record<string, unknown>>(
            ['agents.patch', 'agent.patch', 'agents.config.patch'],
            [
              { agentId, config },
              { id: agentId, config },
              { agentId, patch: config },
              { id: agentId, patch: config },
            ],
          )

          return json({
            ok: true,
            data: {
              method: result.method,
              payload: result.payload,
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
