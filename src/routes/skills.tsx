import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason, isFeatureAvailable } from '@/lib/feature-gates'
import { SkillsScreen } from '@/screens/skills/skills-screen'

export const Route = createFileRoute('/skills')({
  component: SkillsRoute,
})

function SkillsRoute() {
  usePageTitle('Skills')
  if (!isFeatureAvailable('skills')) {
    return (
      <BackendUnavailableState
        feature="Skills"
        description={getUnavailableReason('Skills')}
      />
    )
  }
  return <SkillsScreen />
}
