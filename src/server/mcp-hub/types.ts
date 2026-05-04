/**
 * Shared types for the MCP Hub federated catalog (Phase 3).
 */
import type { McpClientInput } from '../../types/mcp'

export type HubTrust = 'official' | 'community' | 'unverified'
/** Built-in source identifiers. User sources use the form `'user:<sourceId>'`. */
export type HubSource = 'mcp-get' | 'local' | 'user' | `user:${string}`

export interface HubMcpEntry {
  /** Unique key within its source: `<source>:<name>` */
  id: string
  name: string
  description: string
  source: HubSource
  homepage: string | null
  tags: Array<string>
  trust: HubTrust
  template: McpClientInput
  /** Optional one-liner install command (e.g. `npx -y @scope/pkg`) */
  installCommand?: string
  /** True when an entry with this name is found in the installed config */
  installed: boolean
}
