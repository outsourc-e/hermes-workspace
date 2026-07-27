import { createFileRoute, redirect } from '@tanstack/react-router'
import { readLastSessionCard } from './-last-session-card'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  beforeLoad: () => {
    // Restore only the Card-specific key. The destination route validates it
    // against the authoritative list before rendering any conversation.
    throw redirect({
      to: '/chat/$sessionKey',
      params: { sessionKey: readLastSessionCard() },
      replace: true,
    })
  },
  component: function ChatIndexRoute() {
    return null
  },
})
