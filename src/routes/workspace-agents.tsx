import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/workspace-agents')({
  beforeLoad: function redirectWorkspaceAgentsRoute() {
    throw redirect({
      to: '/workspace',
      hash: 'agents',
      replace: true,
    })
  },
  component: function WorkspaceAgentsRoute() {
    return null
  },
})
