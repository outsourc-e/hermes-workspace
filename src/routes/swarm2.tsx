import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/swarm2')({
  ssr: false,
  beforeLoad: function redirectToCanonicalAgentsRoute() {
    throw redirect({
      to: '/swarm' as string,
      replace: true,
    })
  },
})
