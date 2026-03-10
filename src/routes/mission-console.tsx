import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/mission-console')({
  validateSearch: (search: Record<string, unknown>) => ({
    missionId: typeof search.missionId === 'string' ? search.missionId : '',
    projectId: typeof search.projectId === 'string' ? search.projectId : '',
  }),
  beforeLoad: function redirectMissionConsoleRoute({ search }) {
    throw redirect({
      to: '/workspace',
      search: {
        missionId: search.missionId,
        projectId: search.projectId,
        project: search.projectId,
      },
      hash: 'projects',
      replace: true,
    })
  },
  component: function MissionConsoleRoute() {
    return null
  },
})
