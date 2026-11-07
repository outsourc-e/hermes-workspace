import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/chat/new')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return Response.json({
          sessionId: crypto.randomUUID(),
          messages: [],
          sessions: true,
        })
      },
    },
  },
})
