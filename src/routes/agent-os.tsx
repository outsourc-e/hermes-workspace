import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentOsScreen } from '@/screens/agent-os/agent-os-screen'

export const Route = createFileRoute('/agent-os')({
  ssr: false,
  component: AgentOsRoute,
})

function AgentOsRoute() {
  usePageTitle('Agent OS')
  return <AgentOsScreen />
}
