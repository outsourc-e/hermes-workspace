import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { PlanReviewScreen } from '@/screens/plan-review/plan-review-screen'

export const Route = createFileRoute('/plan-review')({
  validateSearch: (search: Record<string, unknown>) => ({
    plan: typeof search.plan === 'string' ? search.plan : undefined,
    missionId:
      typeof search.missionId === 'string' ? search.missionId : undefined,
    projectId:
      typeof search.projectId === 'string' ? search.projectId : undefined,
  }),
  component: function PlanReviewRoute() {
    usePageTitle('Plan Review')
    const search = Route.useSearch()

    return (
      <PlanReviewScreen
        plan={search.plan ?? ''}
        missionId={search.missionId}
        projectId={search.projectId}
      />
    )
  },
})
