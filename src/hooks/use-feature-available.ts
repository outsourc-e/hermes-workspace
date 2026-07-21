import { useQuery } from '@tanstack/react-query'
import type { EnhancedFeature } from '@/lib/feature-gates'

interface GatewayStatus {
  capabilities: Record<string, boolean>
  claudeUrl: string
}

export type FeatureAvailabilityState =
  | 'loading'
  | 'available'
  | 'unavailable'
  | 'error'

export function useFeatureAvailability(feature: EnhancedFeature) {
  const query = useQuery({
    queryKey: ['gateway-status'],
    queryFn: async () => {
      const response = await fetch('/api/gateway-status')
      if (!response.ok) {
        throw new Error(`Gateway capability readback failed (${response.status})`)
      }
      const payload = (await response.json()) as Partial<GatewayStatus>
      if (!payload.capabilities || typeof payload.capabilities !== 'object') {
        throw new Error('Gateway capability readback returned an invalid payload')
      }
      return payload as GatewayStatus
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const data = query.data
  const available = data ? data.capabilities[feature] === true : false
  const state: FeatureAvailabilityState = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : available
        ? 'available'
        : 'unavailable'

  return {
    state,
    available,
    error: query.error instanceof Error ? query.error : null,
    retry: query.refetch,
    isRefreshing: query.isFetching && !query.isPending,
  }
}

export function useFeatureAvailable(feature: EnhancedFeature): boolean {
  return useFeatureAvailability(feature).available
}
