import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AgentsScreen } from '@/screens/agents/agents-screen'

export const Route = createFileRoute('/workspace/agents')({
  component: function WorkspaceAgentsRoute() {
    usePageTitle('Workspace Agents')
    return <AgentsScreen />
  },
})
