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
import { getConfig, saveConfig } from '../../../server/claude-dashboard-api'
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

export const Route = createFileRoute('/api/mcp/$name')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        // DELETE has no body, so requireJsonContentType allows it through.
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
        const name = (params as { name?: string }).name?.trim() || ''
        if (!name) {
          return json({ ok: false, error: 'Missing server name' }, { status: 400 })
        }
        try {
          if (capabilities.mcp) {
            const response = await mcpFetch(`/api/mcp/${encodeURIComponent(name)}`, {
              method: 'DELETE',
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
            if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
              return json(
                { ok: false, error: (body.error as string) || `MCP delete failed (${response.status})` },
                { status: response.status || 502 },
              )
            }
            return json({ ok: true })
          }
          // Phase 1.5 fallback — read map, drop entry, persist whole map.
          // We cannot use saveConfig({ mcp_servers: { [name]: null } }) because
          // deepMerge treats `null` only at the top scalar level; nested object
          // keys go through `bothObjects` and won't trigger removal here.
          // Re-write the full map instead.
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
          if (!(name in servers)) {
            return json({ ok: false, error: `MCP server not found: ${name}` }, { status: 404 })
          }
          delete servers[name]
          // Mark the deleted key as null so deepMerge in saveConfig removes it.
          const patch: Record<string, unknown> = { mcp_servers: { ...servers, [name]: null } }
          await saveConfig(patch)
          return json({ ok: true })
        } catch (err) {
          return json({ ok: false, error: safeErrorMessage(err) }, { status: 500 })
        }
      },
    },
  },
})
