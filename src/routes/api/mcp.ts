import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  CLAUDE_UPGRADE_INSTRUCTIONS,
  dashboardFetch,
  ensureGatewayProbed,
  getCapabilities,
} from '../../server/gateway-capabilities'
import { requireJsonContentType, safeErrorMessage } from '../../server/rate-limit'
import {
  maskSecretsInPlace,
  normalizeMcpList,
  normalizeMcpListFromConfig,
  normalizeMcpServer,
  normalizeMcpServerFromConfig,
} from '../../server/mcp-normalize'
import { getConfig, saveConfig } from '../../server/claude-dashboard-api'
import type { McpServerInput } from '../../types/mcp-input'
import { parseMcpServerInput } from '../../server/mcp-input-validate'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'
import { getProbe } from '../../server/mcp-tools-cache'

const KNOWN_CATEGORIES = ['All', 'Connected', 'Failed', 'Disabled'] as const
const REQUEST_TIMEOUT_MS = 30_000

async function mcpFetch(path: string, init: RequestInit = {}): Promise<Response> {
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

function unavailableListPayload() {
  return {
    ...createCapabilityUnavailablePayload('mcp'),
    servers: [],
    total: 0,
    categories: [...KNOWN_CATEGORIES],
  }
}

/**
 * Phase 1.5 fallback: convert the runtime `McpServerInput` write shape into
 * the dashboard config-yaml entry shape stored under `config.mcp_servers[name]`.
 * Only stable, top-level keys are emitted; secret bodies (`bearerToken`,
 * `oauth.clientSecret`) are persisted under `auth.token` / `auth.oauth.*`
 * for the agent to pick up later. Empty fields are omitted to keep the YAML
 * minimal.
 */
function toConfigEntry(input: McpServerInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    transport: input.transportType,
  }
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled
  if (input.url) out.url = input.url
  if (input.command) out.command = input.command
  if (input.args && input.args.length > 0) out.args = input.args
  if (input.env && Object.keys(input.env).length > 0) out.env = input.env
  if (input.headers && Object.keys(input.headers).length > 0) out.headers = input.headers
  if (input.toolMode && input.toolMode !== 'all') out.tool_mode = input.toolMode
  if (input.includeTools && input.includeTools.length > 0) out.include_tools = input.includeTools
  if (input.excludeTools && input.excludeTools.length > 0) out.exclude_tools = input.excludeTools
  if (input.authType && input.authType !== 'none') {
    const auth: Record<string, unknown> = { type: input.authType }
    if (input.bearerToken) auth.token = input.bearerToken
    if (input.oauth) auth.oauth = { ...input.oauth }
    out.auth = auth
  } else if (input.bearerToken || input.oauth) {
    const auth: Record<string, unknown> = {}
    if (input.bearerToken) auth.token = input.bearerToken
    if (input.oauth) auth.oauth = { ...input.oauth }
    out.auth = auth
  }
  return out
}

/**
 * Read the current `config.mcp_servers` map from the dashboard config payload.
 * Always returns a fresh object (never the live reference). Empty when missing.
 */
async function readConfigServersMap(): Promise<{
  config: Record<string, unknown>
  servers: Record<string, unknown>
}> {
  const cfg = await getConfig()
  const root: Record<string, unknown> =
    'config' in cfg && cfg.config && typeof cfg.config === 'object'
      ? (cfg.config as Record<string, unknown>)
      : cfg
  const raw = root.mcp_servers
  const servers =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {}
  return { config: root, servers }
}

export { parseMcpServerInput, unavailableListPayload, toConfigEntry }

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.mcp && !capabilities.mcpFallback) {
          return json(unavailableListPayload())
        }
        try {
          const url = new URL(request.url)
          const search = (url.searchParams.get('search') || '').trim().toLowerCase()
          const category = (url.searchParams.get('category') || 'All').trim()

          let servers: ReturnType<typeof normalizeMcpList>
          if (capabilities.mcp) {
            const response = await mcpFetch('/api/mcp', {
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
            if (!response.ok) {
              return json(
                {
                  ...unavailableListPayload(),
                  error: `MCP list failed (${response.status})`,
                },
                { status: 502 },
              )
            }
            const body = (await response.json().catch(() => null)) as unknown
            servers = normalizeMcpList(body).map((s) => maskSecretsInPlace(s))
          } else {
            // Phase 1.5 fallback — read config.mcp_servers, then hydrate
            // status + discoveredToolsCount from the in-memory probe cache
            // (populated by /api/mcp/test which shells out to the hermes
            // CLI). Cards then show the last-known tool count + status
            // without forcing a fresh probe on every list refresh.
            const cfg = (await getConfig()) as unknown
            servers = normalizeMcpListFromConfig(cfg)
              .map((s) => maskSecretsInPlace(s))
              .map((s) => {
                const probe = getProbe(s.name)
                if (!probe) return s
                return {
                  ...s,
                  status: probe.status,
                  discoveredToolsCount: probe.toolCount,
                  lastError: probe.error || s.lastError,
                }
              })
          }

          const filtered = servers.filter((s) => {
            if (search) {
              const hay = [s.name, s.url || '', s.command || '', ...s.args]
                .join('\n')
                .toLowerCase()
              if (!hay.includes(search)) return false
            }
            if (category === 'Connected' && s.status !== 'connected') return false
            if (category === 'Failed' && s.status !== 'failed') return false
            if (category === 'Disabled' && s.enabled) return false
            return true
          })

          return json({
            servers: filtered,
            total: filtered.length,
            categories: [...KNOWN_CATEGORIES],
          })
        } catch (err) {
          return json(
            { ok: false, error: safeErrorMessage(err), servers: [], total: 0, categories: [...KNOWN_CATEGORIES] },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
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
          const parsed = parseMcpServerInput(raw)
          if (!parsed.ok) {
            return json(
              { ok: false, error: 'Invalid MCP server payload', errors: parsed.errors },
              { status: 400 },
            )
          }
          const input = parsed.value
          if (capabilities.mcp) {
            const response = await mcpFetch('/api/mcp', {
              method: 'POST',
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
                `MCP create failed (${response.status})`
              return json({ ok: false, error: errMsg }, { status: response.status || 502 })
            }
            return json({ ok: true, server: maskSecretsInPlace(server) })
          }
          // Phase 1.5 fallback — write into config.mcp_servers and re-read.
          const { servers } = await readConfigServersMap()
          servers[input.name] = toConfigEntry(input)
          await saveConfig({ mcp_servers: servers })
          const written = normalizeMcpServerFromConfig(input.name, servers[input.name])
          if (!written) {
            return json({ ok: false, error: 'MCP create failed (config write)' }, { status: 500 })
          }
          return json({ ok: true, server: maskSecretsInPlace(written) })
        } catch (err) {
          return json({ ok: false, error: safeErrorMessage(err) }, { status: 500 })
        }
      },
    },
  },
})
