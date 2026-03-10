import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { TeamsScreen } from '@/screens/teams/teams-screen'

export const Route = createFileRoute('/workspace-teams')({
  component: WorkspaceTeamsRoute,
})

function WorkspaceTeamsRoute() {
  usePageTitle('Teams & Roles')
  return <TeamsScreen />
}
