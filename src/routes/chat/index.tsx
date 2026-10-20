import { createFileRoute } from '@tanstack/react-router'
import { AgentCommandCenter } from '@/screens/chat/agent-command-center'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  component: ChatCommandCenterRoute,
})

function ChatCommandCenterRoute() {
  return <AgentCommandCenter />
}
