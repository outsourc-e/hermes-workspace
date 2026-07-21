import { useFeatureAvailability } from '@/hooks/use-feature-available'

export type McpCapabilityMode = 'native' | 'fallback' | 'off'

export function useMcpCapabilityMode(): {
  mode: McpCapabilityMode
  isLoading: boolean
  isError: boolean
} {
  const native = useFeatureAvailability('mcp')
  const fallback = useFeatureAvailability('mcpFallback')

  return {
    mode: native.available
      ? 'native'
      : fallback.available
        ? 'fallback'
        : 'off',
    isLoading:
      !native.available &&
      !fallback.available &&
      (native.state === 'loading' || fallback.state === 'loading'),
    isError:
      !native.available &&
      !fallback.available &&
      (native.state === 'error' || fallback.state === 'error'),
  }
}
