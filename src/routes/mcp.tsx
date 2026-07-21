import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { useFeatureAvailability } from '@/hooks/use-feature-available'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { McpScreen } from '@/screens/mcp/mcp-screen'

export const Route = createFileRoute('/mcp')({
  ssr: false,
  component: McpRoute,
})

function McpRoute() {
  usePageTitle('MCP Servers')
  const native = useFeatureAvailability('mcp')
  const fallback = useFeatureAvailability('mcpFallback')
  const available = native.available || fallback.available
  const loading = native.state === 'loading' || fallback.state === 'loading'
  const readbackError = native.state === 'error' || fallback.state === 'error'

  if (!available && loading) {
    return (
      <div
        role="status"
        className="flex h-full min-h-[320px] items-center justify-center p-6 text-sm text-primary-500"
      >
        Checking MCP capabilities…
      </div>
    )
  }

  if (!available) {
    return (
      <BackendUnavailableState
        feature="MCP Servers"
        state={readbackError ? 'error' : 'unavailable'}
        description={
          readbackError
            ? native.error?.message ?? fallback.error?.message ?? 'Capability readback failed.'
            : getUnavailableReason('mcp')
        }
        onRetry={() => Promise.all([native.retry(), fallback.retry()])}
      />
    )
  }

  return <McpScreen />
}
