/**
 * MCP server WRITE shapes — server-only.
 *
 * Lint rule (eslint `no-restricted-paths`) blocks any client-side file from
 * importing this module. Secrets must never reach the browser bundle.
 */
import type { McpAuth, McpToolMode, McpTransport } from './mcp'

export interface McpServerInput {
  name: string
  enabled?: boolean
  transportType: McpTransport
  url?: string
  command?: string
  args?: Array<string>
  env?: Record<string, string>
  headers?: Record<string, string>
  authType?: McpAuth
  bearerToken?: string
  oauth?: {
    clientId: string
    clientSecret: string
    authorizationUrl?: string
    tokenUrl?: string
    scopes?: Array<string>
  }
  toolMode?: McpToolMode
  includeTools?: Array<string>
  excludeTools?: Array<string>
}

export interface McpConfigureInput {
  name: string
  enabled?: boolean
  toolMode?: McpToolMode
  includeTools?: Array<string>
  excludeTools?: Array<string>
}
