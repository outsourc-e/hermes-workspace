import { createFileRoute } from '@tanstack/react-router'
import { ExternalHarnessChatScreen } from '@/screens/chat/external-harness-chat-screen'

export const Route = createFileRoute('/chat/external/$conversationId')({
  ssr: false,
  component: ExternalConversationRoute,
})

function ExternalConversationRoute() {
  const { conversationId } = Route.useParams()
  return <ExternalHarnessChatScreen conversationId={conversationId} />
}
