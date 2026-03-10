import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/runs')({
  beforeLoad: function redirectRunsRoute() {
    throw redirect({
      to: '/workspace',
      hash: 'runs',
      replace: true,
    })
  },
  component: function RunsRoute() {
    return null
  },
})
