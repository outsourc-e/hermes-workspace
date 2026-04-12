import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { CrewScreen } from '@/screens/crew/crew-screen'

export const Route = createFileRoute('/crew')({
  ssr: false,
  component: CrewRoute,
})

function CrewRoute() {
  usePageTitle('Crew')
  return <CrewScreen />
}
