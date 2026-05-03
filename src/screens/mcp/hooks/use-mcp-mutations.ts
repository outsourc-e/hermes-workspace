import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  McpClientInput,
  McpDiscoveredTool,
  McpServer,
  McpTestResult,
  McpToolMode,
} from '@/types/mcp'

async function postJson<T>(path: string, body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (method !== 'DELETE') init.body = JSON.stringify(body)
  const res = await fetch(path, init)
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string }
  if (!res.ok || (json as { ok?: boolean }).ok === false) {
    throw new Error(json.error || `Request failed (${res.status})`)
  }
  return json
}

export function useTestMcpServer() {
  return useMutation<McpTestResult, Error, { name: string } | McpClientInput>({
    mutationFn: (payload) => postJson<McpTestResult>('/api/mcp/test', payload),
  })
}

export function useDiscoverMcpTools() {
  return useMutation<{ ok: boolean; tools: Array<McpDiscoveredTool> }, Error, McpClientInput>({
    mutationFn: (payload) =>
      postJson<{ ok: boolean; tools: Array<McpDiscoveredTool> }>('/api/mcp/discover', payload),
  })
}

export function useUpsertMcpServer() {
  const qc = useQueryClient()
  // Inline `& { bearerToken? }` keeps the secret-bearing shape unexported —
  // no client module re-exports a type containing `bearerToken` or
  // `oauth.clientSecret`. Server-side `parseMcpServerInput` re-validates and
  // strips before persistence.
  return useMutation<
    { ok: boolean; server: McpServer },
    Error,
    McpClientInput & { bearerToken?: string }
  >({
    mutationFn: (payload) =>
      postJson<{ ok: boolean; server: McpServer }>('/api/mcp', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp', 'servers'] }),
  })
}

export interface ConfigureInput {
  name: string
  enabled?: boolean
  toolMode?: McpToolMode
  includeTools?: Array<string>
  excludeTools?: Array<string>
}

export function useConfigureMcpServer() {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean; server: McpServer }, Error, ConfigureInput>({
    mutationFn: (payload) => postJson<{ ok: boolean; server: McpServer }>('/api/mcp/configure', payload, 'PUT'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp', 'servers'] }),
  })
}

export function useDeleteMcpServer() {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, { name: string }>({
    mutationFn: ({ name }) => postJson<{ ok: boolean }>(`/api/mcp/${encodeURIComponent(name)}`, null, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp', 'servers'] }),
  })
}
