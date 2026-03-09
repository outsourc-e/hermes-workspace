import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { MissionConsoleScreen } from '@/screens/missions/mission-console-screen'

export const Route = createFileRoute('/mission-console')({
  validateSearch: (search: Record<string, unknown>) => ({
    missionId: typeof search.missionId === 'string' ? search.missionId : '',
    projectId: typeof search.projectId === 'string' ? search.projectId : '',
  }),
  component: function MissionConsoleRoute() {
    usePageTitle('Mission Console')
    const search = Route.useSearch()

    return (
      <MissionConsoleScreen
        missionId={search.missionId}
        projectId={search.projectId}
      />
    )
  },
})
