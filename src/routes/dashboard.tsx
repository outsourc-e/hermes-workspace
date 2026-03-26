import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { DashboardScreen } from '@/screens/dashboard/dashboard-screen'

export const Route = createFileRoute('/dashboard')({
  component: DashboardRoute,
})

function DashboardRoute() {
  usePageTitle('Dashboard')
  return <DashboardScreen />
}
