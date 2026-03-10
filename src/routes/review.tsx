import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/review')({
  beforeLoad: function redirectReviewRoute() {
    throw redirect({
      to: '/workspace',
      hash: 'review',
      replace: true,
    })
  },
  component: function ReviewRoute() {
    return null
  },
})
