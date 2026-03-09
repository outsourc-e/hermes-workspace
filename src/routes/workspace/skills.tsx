import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { SkillsScreen } from '@/screens/skills/skills-screen'

export const Route = createFileRoute('/workspace/skills')({
  component: function WorkspaceSkillsRoute() {
    usePageTitle('Workspace Skills & Memory')
    return <SkillsScreen />
  },
})
