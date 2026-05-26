import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { MassageScreen } from '@/screens/massage/massage-screen'

export const Route = createFileRoute('/massage')({
  ssr: false,
  component: MassageRoute,
})

function MassageRoute() {
  usePageTitle('Massage')
  return <MassageScreen />
}
