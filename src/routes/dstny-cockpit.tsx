import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DstnyCockpitScreen } from '@/screens/dstny-cockpit/dstny-cockpit-screen'

export const Route = createFileRoute('/dstny-cockpit')({
  ssr: false,
  component: DstnyCockpitRoute,
})

function DstnyCockpitRoute() {
  usePageTitle('Cockpit Dstny')
  return <DstnyCockpitScreen />
}
