import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { PlanReviewScreen } from '@/screens/plan-review/plan-review-screen'

export const Route = createFileRoute('/workspace/plan-review')({
  validateSearch: (search: Record<string, unknown>) => ({
    plan: typeof search.plan === 'string' ? search.plan : '',
  }),
  component: function WorkspacePlanReviewRoute() {
    usePageTitle('Workspace Plan Review')
    return <PlanReviewScreen plan={Route.useSearch().plan} />
  },
})
