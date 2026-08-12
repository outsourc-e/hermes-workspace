import { createFileRoute } from '@tanstack/react-router'
import { CoordinatorConductorSurface } from '@/screens/gateway/coordinator-conductor'

export const Route = createFileRoute('/mission-graph')({
  component: CoordinatorConductorSurface,
})
