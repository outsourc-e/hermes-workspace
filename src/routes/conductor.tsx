import { createFileRoute } from '@tanstack/react-router'
import { CoordinatorConductorSurface } from '@/screens/gateway/coordinator-conductor'

function ConductorRoute() {
  return <CoordinatorConductorSurface />
}

export const Route = createFileRoute('/conductor')({
  component: ConductorRoute,
})
