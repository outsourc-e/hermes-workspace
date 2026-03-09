import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/runs')({
  beforeLoad: () => {
    throw redirect({
      to: '/workspace/runs',
      replace: true,
    })
  },
  component: function RunsRedirectRoute() {
    return null
  },
})
