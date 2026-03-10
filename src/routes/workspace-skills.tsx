import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/workspace-skills')({
  beforeLoad: function redirectWorkspaceSkillsRoute() {
    throw redirect({
      to: '/workspace',
      hash: 'skills',
      replace: true,
    })
  },
  component: function WorkspaceSkillsRoute() {
    return null
  },
})
