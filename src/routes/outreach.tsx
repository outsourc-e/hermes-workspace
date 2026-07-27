import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { OutreachScreen } from '@/screens/outreach/outreach-screen'

export const Route = createFileRoute('/outreach')({
  ssr: false,
  component: OutreachRoute,
})

function OutreachRoute() {
  usePageTitle('Outreach Pipeline')
  return <OutreachScreen />
}
