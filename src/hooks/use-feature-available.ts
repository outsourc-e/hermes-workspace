import { useQuery } from '@tanstack/react-query'
import type { EnhancedFeature } from '@/lib/feature-gates'

interface GatewayStatusPayload {
  capabilities?: Record<string, boolean>
}

export function useFeatureAvailable(feature: EnhancedFeature): boolean {
  const { data } = useQuery({
    queryKey: ['gateway-status'],
    queryFn: async () => {
      const res = await fetch('/api/gateway-status')
      if (!res.ok) return null
      return (await res.json()) as GatewayStatusPayload
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return data?.capabilities?.[feature] === true
}
