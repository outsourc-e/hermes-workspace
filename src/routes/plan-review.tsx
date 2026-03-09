import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { PlanReviewScreen } from '@/screens/plan-review/plan-review-screen'

export const Route = createFileRoute('/plan-review')({
  validateSearch: (search: Record<string, unknown>) => ({
    plan: typeof search.plan === 'string' ? search.plan : '',
  }),
  component: function PlanReviewRoute() {
    usePageTitle('Plan Review')
    return <PlanReviewScreen plan={Route.useSearch().plan} />
  },
})
