import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { WorkspaceSkillsScreen } from '@/screens/skills/workspace-skills-screen'

export const Route = createFileRoute('/workspace-skills')({
  component: WorkspaceSkillsRoute,
})

function WorkspaceSkillsRoute() {
  usePageTitle('Skills & Memory')
  return <WorkspaceSkillsScreen />
}
