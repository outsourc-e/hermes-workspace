import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'

export const Route = createFileRoute('/api/context-usage')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          contextPercent: 0,
          model: '',
          maxTokens: 0,
          usedTokens: 0,
          staticTokens: 0,
          conversationTokens: 0,
        })
      },
    },
  },
})
