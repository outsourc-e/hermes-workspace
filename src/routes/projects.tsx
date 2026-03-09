import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProjectsScreen } from '@/screens/projects/projects-screen'

export const Route = createFileRoute('/projects')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    project?: string
    projectId?: string
    checkpointId?: string
    phaseId?: string
    phaseName?: string
    goal?: string
  } => ({
    project: typeof search.project === 'string' ? search.project : undefined,
    projectId: typeof search.projectId === 'string' ? search.projectId : undefined,
    checkpointId:
      typeof search.checkpointId === 'string' ? search.checkpointId : undefined,
    phaseId: typeof search.phaseId === 'string' ? search.phaseId : undefined,
    phaseName: typeof search.phaseName === 'string' ? search.phaseName : undefined,
    goal: typeof search.goal === 'string' ? search.goal : undefined,
  }),
  component: function ProjectsRoute() {
    usePageTitle('Projects')
    return <ProjectsScreen replanSearch={Route.useSearch()} />
  },
  errorComponent: function ProjectsError({ error }) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-primary-50 p-6 text-center">
        <h2 className="mb-3 text-xl font-semibold text-primary-900">
          Failed to Load Projects
        </h2>
        <p className="mb-4 max-w-md text-sm text-primary-600">
          {error instanceof Error
            ? error.message
            : 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent-500 px-4 py-2 text-white transition-colors hover:bg-accent-600"
        >
          Reload Page
        </button>
      </div>
    )
  },
  pendingComponent: function ProjectsPending() {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-500">Loading projects...</p>
        </div>
      </div>
    )
  },
})
