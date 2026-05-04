import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { McpScreen } from '@/screens/mcp/mcp-screen'

export const Route = createFileRoute('/mcp')({
  ssr: false,
  component: McpRoute,
})

function McpRoute() {
  usePageTitle('MCP Servers')
  const native = useFeatureAvailable('mcp')
  const fallback = useFeatureAvailable('mcpFallback')
  if (!native && !fallback) {
    return (
      <BackendUnavailableState
        feature="MCP Servers"
        description={getUnavailableReason('mcp')}
      />
    )
  }
  return <McpScreen />
}
