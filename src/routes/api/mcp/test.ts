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
import { normalizeTestResult } from '../../../server/mcp-normalize'
import { runHermesMcpTest } from '../../../server/mcp-cli-bridge'
import { setProbe } from '../../../server/mcp-tools-cache'
import { parseMcpServerInput } from '../../../server/mcp-input-validate'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

const TEST_TIMEOUT_MS = 30_000

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

export const Route = createFileRoute('/api/mcp/test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const capabilities = await ensureGatewayProbed()
        if (capabilities.mcpFallback && !capabilities.mcp) {
          // Phase 1.5 fallback: shell out to `hermes mcp test <name>` and
          // parse stdout. Reuses the CLI's _probe_single_server logic
          // without duplicating MCP protocol handling on the workspace
          // side. Only the by-name form is supported (config-only mode);
          // ad-hoc client-input tests still need the runtime endpoint.
          try {
            const raw = (await request.json()) as Record<string, unknown>
            const name = typeof raw.name === 'string' ? raw.name : null
            if (!name) {
              return json({
                ok: false,
                status: 'unknown',
                discoveredTools: [],
                error:
                  'Local fallback only supports testing existing servers by name.',
              })
            }
            const result = await runHermesMcpTest(name, { timeoutMs: TEST_TIMEOUT_MS })
            setProbe(name, {
              status: result.status,
              toolCount: result.discoveredTools.length,
              toolNames: result.discoveredTools.map((t) => t.name),
              latencyMs: result.latencyMs,
              error: result.error,
            })
            return json(result)
          } catch (err) {
            return json(
              {
                ok: false,
                status: 'failed',
                discoveredTools: [],
                error: safeErrorMessage(err),
              },
              { status: 500 },
            )
          }
        }
        if (!capabilities.mcp) {
          return json(
            createCapabilityUnavailablePayload('mcp', {
              error: `Gateway does not support /api/mcp. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
            }),
            { status: 503 },
          )
        }
        try {
          const raw = (await request.json()) as Record<string, unknown>
          let body: Record<string, unknown>
          if (typeof raw.name === 'string' && Object.keys(raw).length === 1) {
            body = { name: raw.name }
          } else {
            const parsed = parseMcpServerInput(raw)
            if (!parsed.ok) {
              return json(
                { ok: false, error: 'Invalid MCP test payload', errors: parsed.errors },
                { status: 400 },
              )
            }
            body = parsed.value as unknown as Record<string, unknown>
          }
          const response = await mcpFetch('/api/mcp/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
          })
          const payload = (await response.json().catch(() => ({}))) as unknown
          const result = normalizeTestResult(payload)
          return json(result, { status: response.ok ? 200 : response.status || 502 })
        } catch (err) {
          return json({ ok: false, status: 'failed', discoveredTools: [], error: safeErrorMessage(err) }, { status: 500 })
        }
      },
    },
  },
})
