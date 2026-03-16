import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { getMessages, listSessions, toGatewayMessage } from '../../server/hermes-api'
import { resolveSessionKey } from '../../server/session-utils'

export const Route = createFileRoute('/api/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const limit = Number(url.searchParams.get('limit') || '200')
          const rawSessionKey = url.searchParams.get('sessionKey')?.trim()
          const friendlyId = url.searchParams.get('friendlyId')?.trim()
          let { sessionKey } = await resolveSessionKey({
            rawSessionKey,
            friendlyId,
            defaultKey: 'main',
          })
          // "main" doesn't exist in Hermes — resolve to latest session
          if (sessionKey === 'main' || sessionKey === 'new') {
            try {
              const sessions = await listSessions(1, 0)
              if (sessions.length > 0) {
                sessionKey = sessions[0].id
              } else {
                return json({ sessionKey: 'new', sessionId: 'new', messages: [] })
              }
            } catch {
              return json({ sessionKey: 'new', sessionId: 'new', messages: [] })
            }
          }
          const messages = await getMessages(sessionKey)
          const boundedMessages = limit > 0 ? messages.slice(-limit) : messages

          return json({
            sessionKey,
            sessionId: sessionKey,
            messages: boundedMessages.map(toGatewayMessage),
          })
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
