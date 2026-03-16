import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { HealthScreen } from '@/screens/health/health-screen'

export const Route = createFileRoute('/health')({
  component: function HealthRoute() {
    usePageTitle('Health')
    return <HealthScreen />
  },
})
