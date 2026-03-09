import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProjectsScreen } from '@/screens/projects/projects-screen'

export const Route = createFileRoute('/workspace/projects')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    project?: string
    projectId?: string
    phaseId?: string
    phaseName?: string
    goal?: string
  } => ({
    project: typeof search.project === 'string' ? search.project : undefined,
    projectId: typeof search.projectId === 'string' ? search.projectId : undefined,
    phaseId: typeof search.phaseId === 'string' ? search.phaseId : undefined,
    phaseName: typeof search.phaseName === 'string' ? search.phaseName : undefined,
    goal: typeof search.goal === 'string' ? search.goal : undefined,
  }),
  component: function WorkspaceProjectsRoute() {
    usePageTitle('Workspace Projects')
    return <ProjectsScreen replanSearch={Route.useSearch()} />
  },
})
