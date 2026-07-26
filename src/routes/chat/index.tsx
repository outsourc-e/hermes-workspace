import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  beforeLoad: () => {
    // Restore only the Card-specific key. The destination route validates it
    // against the authoritative list before rendering any conversation.
    let lastSessionCard = 'new'
    try {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem('hermes-last-session-card')
          : null
      if (stored) lastSessionCard = stored
    } catch {}
    throw redirect({
      to: '/chat/$sessionKey',
      params: { sessionKey: lastSessionCard },
      replace: true,
    })
  },
  component: function ChatIndexRoute() {
    return null
  },
})
