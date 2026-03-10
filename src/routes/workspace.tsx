import { createFileRoute } from '@tanstack/react-router'
import {
  WorkspaceLayout,
  type WorkspaceSearch,
} from '@/screens/workspace/workspace-layout'

export const Route = createFileRoute('/workspace')({
  validateSearch: (
    search: Record<string, unknown>,
  ): WorkspaceSearch => ({
    project: typeof search.project === 'string' ? search.project : undefined,
    projectId: typeof search.projectId === 'string' ? search.projectId : undefined,
    checkpointId:
      typeof search.checkpointId === 'string' ? search.checkpointId : undefined,
    returnTo:
      search.returnTo === 'review' ||
      search.returnTo === 'projects' ||
      search.returnTo === 'mission'
        ? search.returnTo
        : undefined,
    phaseId: typeof search.phaseId === 'string' ? search.phaseId : undefined,
    phaseName: typeof search.phaseName === 'string' ? search.phaseName : undefined,
    goal: typeof search.goal === 'string' ? search.goal : undefined,
    missionId: typeof search.missionId === 'string' ? search.missionId : undefined,
    showWizard:
      search.showWizard === true || search.showWizard === 'true' ? true : undefined,
  }),
  component: function WorkspaceRoute() {
    return <WorkspaceLayout search={Route.useSearch()} />
  },
})
