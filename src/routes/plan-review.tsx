import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/plan-review')({
  validateSearch: (search: Record<string, unknown>) => ({
    plan: typeof search.plan === 'string' ? search.plan : '',
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/workspace/plan-review',
      search,
      replace: true,
    })
  },
  component: function PlanReviewRedirectRoute() {
    return null
  },
})
