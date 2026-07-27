import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { MissionControlScreen } from '@/screens/mission-control/mission-control-screen'

export const Route = createFileRoute('/mission-control')({
  ssr: false,
  component: MissionControlRoute,
})

function MissionControlRoute() {
  usePageTitle('Mission Control')
  return <MissionControlScreen />
}
