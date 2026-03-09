import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/agents')({
  beforeLoad: () => {
    throw redirect({
      to: '/workspace/agents',
      replace: true,
    })
  },
  component: function AgentsRedirectRoute() {
    return null
  },
})
