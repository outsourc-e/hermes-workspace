import { createFileRoute } from '@tanstack/react-router'
import { Conductor } from '@/screens/gateway/conductor'

function ConductorRoute() {
  return <Conductor />
}

export const Route = createFileRoute('/conductor')({
  component: ConductorRoute,
})
