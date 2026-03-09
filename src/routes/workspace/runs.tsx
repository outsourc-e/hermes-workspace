import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { RunsConsoleScreen } from '@/screens/runs/runs-console-screen'

export const Route = createFileRoute('/workspace/runs')({
  component: function WorkspaceRunsRoute() {
    usePageTitle('Workspace Runs')
    return <RunsConsoleScreen />
  },
})
