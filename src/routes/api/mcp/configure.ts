import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  CLAUDE_UPGRADE_INSTRUCTIONS,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
} from '../../../server/gateway-capabilities'
import { requireJsonContentType, safeErrorMessage } from '../../../server/rate-limit'
import {
  maskSecretsInPlace,
  normalizeMcpServer,
  normalizeMcpServerFromConfig,
} from '../../../server/mcp-normalize'
import { getConfig, saveConfig } from '../../../server/claude-dashboard-api'
import type { McpConfigureInput } from '../../../types/mcp-input'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

const REQUEST_TIMEOUT_MS = 30_000

async function mcpFetch(path: string, init: RequestInit): Promise<Response> {
  const capabilities = getCapabilities()
  if (capabilities.dashboard.available) {
    return dashboardFetch(path, init)
  }
  const headers = new Headers(init.headers)
  if (BEARER_TOKEN && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${BEARER_TOKEN}`)
  }
  return fetch(`${CLAUDE_API}${path}`, { ...init, headers })
}

function readConfigure(raw: unknown): McpConfigureInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) return null
  const out: McpConfigureInput = { name }
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled
  if (r.toolMode === 'all' || r.toolMode === 'include' || r.toolMode === 'exclude') {
    out.toolMode = r.toolMode
  }
  if (Array.isArray(r.includeTools)) {
    out.includeTools = (r.includeTools as Array<unknown>).map((t) => String(t))
  }
  if (Array.isArray(r.excludeTools)) {
    out.excludeTools = (r.excludeTools as Array<unknown>).map((t) => String(t))
  }
  return out
}

export const Route = createFileRoute('/api/mcp/configure')({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.mcp && !capabilities.mcpFallback) {
          return json(
            createCapabilityUnavailablePayload('mcp', {
              error: `Gateway does not support /api/mcp. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
            }),
            { status: 503 },
          )
        }
        try {
          const raw = (await request.json()) as unknown
          const input = readConfigure(raw)
          if (!input) {
            return json({ ok: false, error: 'Invalid configure payload' }, { status: 400 })
          }
          if (capabilities.mcp) {
            const response = await mcpFetch('/api/mcp/configure', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(input),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
            const body = (await response.json().catch(() => ({}))) as unknown
            const server = normalizeMcpServer(
              (body as Record<string, unknown>).server ?? body,
            )
            if (!response.ok || !server) {
              const errMsg =
                ((body as Record<string, unknown>).error as string | undefined) ||
                `MCP configure failed (${response.status})`
              return json({ ok: false, error: errMsg }, { status: response.status || 502 })
            }
            return json({ ok: true, server: maskSecretsInPlace(server) })
          }
          // Phase 1.5 fallback — patch the matching `config.mcp_servers[name]`
          // entry in place. We only update the toggleable keys exposed by
          // McpConfigureInput; transport/secrets stay untouched.
          const cfg = await getConfig()
          const root: Record<string, unknown> =
            'config' in cfg && cfg.config && typeof cfg.config === 'object'
              ? (cfg.config as Record<string, unknown>)
              : cfg
          const rawServers = root.mcp_servers
          const servers =
            rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)
              ? { ...(rawServers as Record<string, unknown>) }
              : {}
          const existing = servers[input.name]
          if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            return json({ ok: false, error: `MCP server not found: ${input.name}` }, { status: 404 })
          }
          const next: Record<string, unknown> = { ...(existing as Record<string, unknown>) }
          if (typeof input.enabled === 'boolean') next.enabled = input.enabled
          if (input.toolMode) next.tool_mode = input.toolMode
          if (Array.isArray(input.includeTools)) next.include_tools = input.includeTools
          if (Array.isArray(input.excludeTools)) next.exclude_tools = input.excludeTools
          servers[input.name] = next
          await saveConfig({ mcp_servers: servers })
          const written = normalizeMcpServerFromConfig(input.name, next)
          if (!written) {
            return json({ ok: false, error: 'MCP configure failed (config write)' }, { status: 500 })
          }
          return json({ ok: true, server: maskSecretsInPlace(written) })
        } catch (err) {
          return json({ ok: false, error: safeErrorMessage(err) }, { status: 500 })
        }
      },
    },
  },
})
