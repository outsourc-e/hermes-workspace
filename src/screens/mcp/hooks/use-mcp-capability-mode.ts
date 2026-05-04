import { useQuery } from '@tanstack/react-query'

export type McpCapabilityMode = 'native' | 'fallback' | 'off'

interface GatewayStatusResponse {
  capabilities?: {
    mcp?: boolean
    mcpFallback?: boolean
  }
}

/**
 * Phase 1.5 — read `/api/gateway-status` and reduce to one of:
 *   - `native`   : `capabilities.mcp` is true (full runtime CRUD).
 *   - `fallback` : `capabilities.mcpFallback` true (config.yaml-only CRUD;
 *                  Test/Discover/Logs disabled).
 *   - `off`      : neither — UI surfaces the upgrade banner instead.
 */
export function useMcpCapabilityMode(): {
  mode: McpCapabilityMode
  isLoading: boolean
} {
  const query = useQuery({
    queryKey: ['gateway-status', 'mcp-mode'],
    queryFn: async (): Promise<McpCapabilityMode> => {
      const res = await fetch('/api/gateway-status')
      if (!res.ok) return 'off'
      const body = (await res.json()) as GatewayStatusResponse
      const caps = body.capabilities ?? {}
      if (caps.mcp) return 'native'
      if (caps.mcpFallback) return 'fallback'
      return 'off'
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return {
    mode: query.data ?? 'off',
    isLoading: query.isLoading,
  }
}
