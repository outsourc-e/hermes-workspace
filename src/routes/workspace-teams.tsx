import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/workspace-teams')({
  beforeLoad: function redirectWorkspaceTeamsRoute() {
    throw redirect({
      to: '/workspace',
      hash: 'teams',
      replace: true,
    })
  },
  component: function WorkspaceTeamsRoute() {
    return null
  },
})
