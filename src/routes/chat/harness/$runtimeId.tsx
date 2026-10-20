import { createFileRoute } from '@tanstack/react-router'
import { AgentCommandCenter } from '@/screens/chat/agent-command-center'

export const Route = createFileRoute('/chat/harness/$runtimeId')({
  ssr: false,
  component: HarnessCommandCenterRoute,
})

function HarnessCommandCenterRoute() {
  const { runtimeId } = Route.useParams()
  return <AgentCommandCenter selectedRuntimeId={runtimeId} />
}
