import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  ensureGatewayProbed,
  getCapabilities,
} from '../../../server/gateway-capabilities'
import { getConfig } from '../../../server/claude-dashboard-api'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

type AuthResult = Response | true

type McpServerRecord = {
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: Array<string>
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout?: number
  connectTimeout?: number
  auth?: unknown
}

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined && entry !== null)
    .map(([key, entry]) => [key, String(entry)] as const)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function readServers(payload: unknown): Array<McpServerRecord> {
  const root =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {}

  const config =
    root.config && typeof root.config === 'object'
      ? (root.config as Record<string, unknown>)
      : root

  const rawServers = config.mcp_servers
  if (
    !rawServers ||
    typeof rawServers !== 'object' ||
    Array.isArray(rawServers)
  ) {
    return []
  }

  return Object.entries(rawServers as Record<string, unknown>).flatMap(
    ([name, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const record = value as Record<string, unknown>
      const command =
        typeof record.command === 'string' ? record.command : undefined
      const url = typeof record.url === 'string' ? record.url : undefined
      const transport = url ? 'http' : 'stdio'

      return [
        {
          name,
          transport,
          command,
          args: Array.isArray(record.args)
            ? record.args.map((entry) => String(entry))
            : undefined,
          env: toStringRecord(record.env),
          url,
          headers: toStringRecord(record.headers),
          timeout:
            typeof record.timeout === 'number' ? record.timeout : undefined,
          connectTimeout:
            typeof record.connect_timeout === 'number'
              ? record.connect_timeout
              : undefined,
          auth: record.auth,
        } satisfies McpServerRecord,
      ]
    },
  )
}

export const Route = createFileRoute('/api/mcp/servers')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authResult = isAuthenticated(request) as AuthResult
        if (authResult !== true) return authResult

        await ensureGatewayProbed()
        if (!getCapabilities().config) {
          return Response.json({
            ...createCapabilityUnavailablePayload('config', {
              message:
                'Gateway config API unavailable. You can still draft MCP config snippets locally.',
            }),
            servers: [],
          })
        }

        try {
          const capabilities = getCapabilities()
          let payload: unknown

          if (capabilities.dashboard.available) {
            payload = await getConfig()
          } else {
            const response = await fetch(`${CLAUDE_API}/api/config`, {
              headers: authHeaders(),
            })

            if (!response.ok) {
              return Response.json({
                servers: [],
                ok: false,
                message: `Failed to load MCP servers from gateway config (${response.status}).`,
              })
            }

            payload = (await response.json().catch(() => ({}))) as unknown
          }

          return Response.json({ ok: true, servers: readServers(payload) })
        } catch {
          return Response.json({
            servers: [],
            ok: false,
            message: 'Could not reach Claude config endpoint.',
          })
        }
      },
    },
  },
})
