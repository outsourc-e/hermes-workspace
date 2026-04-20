import { createFileRoute } from '@tanstack/react-router'
import { AgentsScreen } from '@/screens/gateway/agents-screen'

export const Route = createFileRoute('/operations')({
  component: AgentsScreen,
})
