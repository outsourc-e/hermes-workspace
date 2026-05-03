/**
 * Feature capability gate.
 *
 * Polls `/api/connection-status` for the gateway capability map and returns
 * a friendly state for any single feature flag. Use to gate UI surfaces
 * (Conductor, Operations, MCP, etc.) so they show a graceful placeholder
 * when the upstream agent build doesn't expose the required endpoints.
 *
 * Refs #262 (Conductor not available on vanilla agent), #270.
 */
import { useQuery } from '@tanstack/react-query'

export type FeatureKey =
  | 'conductor'
  | 'mcp'
  | 'mcpFallback'
  | 'sessions'
  | 'skills'
  | 'jobs'
  | 'dashboard'
  | 'enhancedChat'

export type CapabilityState = {
  /** True when the capability is available right now. */
  available: boolean
  /** True while we're still probing for the first time. */
  loading: boolean
  /** The full capability map (use sparingly). */
  capabilities: Record<string, boolean>
  /** Was the gateway reachable at all? */
  gatewayReachable: boolean
}

type ConnectionStatusResponse = {
  status?: string
  health?: boolean
  capabilities?: Record<string, boolean>
}

async function fetchStatus(): Promise<ConnectionStatusResponse> {
  const r = await fetch('/api/connection-status', { cache: 'no-store' })
  if (!r.ok) throw new Error(`status ${r.status}`)
  return (await r.json()) as ConnectionStatusResponse
}

export function useFeatureCapability(feature: FeatureKey): CapabilityState {
  const { data, isLoading } = useQuery({
    queryKey: ['connection-status', 'feature-cap'],
    queryFn: fetchStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const caps = data?.capabilities || {}
  return {
    available: Boolean(caps[feature]),
    loading: isLoading,
    capabilities: caps,
    gatewayReachable: Boolean(data?.health),
  }
}
