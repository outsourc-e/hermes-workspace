import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { SkillsScreen } from '@/screens/skills/skills-screen'

export const Route = createFileRoute('/skills')({
  component: SkillsRoute,
})

function SkillsRoute() {
  usePageTitle('Skills')
  return <SkillsScreen />
}
