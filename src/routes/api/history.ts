import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  ensureGatewayProbed,
  getGatewayCapabilities,
  getMessages,
  listSessions,
  toChatMessage,
} from '../../server/hermes-api'
import { resolveSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '@/server/auth-middleware'
import { getLocalSession, getLocalMessages } from '../../server/local-session-store'

export const Route = createFileRoute('/api/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ sessions: true, ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        if (!getGatewayCapabilities().sessions) {
          return json({ sessions: true,
            sessionKey: 'new',
            sessionId: 'new',
            messages: [],
            source: 'unavailable',
            message: SESSIONS_API_UNAVAILABLE_MESSAGE,
          })
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
          // Keep /chat/new empty until the first message creates a real session.
          if (sessionKey === 'new') {
            return json({
              sessionKey: 'new',
              sessionId: 'new',
              messages: [],
              // Include capabilities so the UI recognizes the backend
              sessions: true,
            })
          }
          // "main" doesn't exist in Hermes — resolve it to the user's real
          // active chat session. Prefer the most recently active non-internal
          // session with messages, and only fall back to a titled session when
          // there is no better active candidate.
          if (sessionKey === 'main') {
            try {
              const sessions = await listSessions(30, 0)
              const isInternalKey = (id: string) =>
                id.startsWith('cron_') ||
                id.startsWith('cron:') ||
                id.startsWith('agent:main:ops-')
              const hasRealTitle = (s: { id: string; title?: string | null }) => {
                const t = (s.title ?? '').trim()
                return t.length > 0 && t !== s.id
              }
              const active = sessions.find(
                (s) =>
                  !isInternalKey(s.id) &&
                  typeof s.message_count === 'number' &&
                  s.message_count > 0,
              )
              const titled = active
                ? null
                : sessions.find(
                    (s) => !isInternalKey(s.id) && hasRealTitle(s),
                  )
              const candidate = active ?? titled
              if (candidate) {
                sessionKey = candidate.id
              } else {
                return json({ sessions: true,
                  sessionKey: 'new',
                  sessionId: 'new',
                  messages: [],
                })
              }
            } catch {
              return json({ sessions: true, sessionKey: 'new', sessionId: 'new', messages: [] })
            }
          }
          let messages: Awaited<ReturnType<typeof getMessages>> = []
          try {
            messages = await getMessages(sessionKey)
          } catch {
            messages = []
          }

          // Fallback to local session store for portable/local model sessions
          if (messages.length === 0) {
            const localSession = getLocalSession(sessionKey)
            if (localSession) {
              const localMessages = getLocalMessages(sessionKey)
              return json({ sessions: true,
                sessionKey,
                sessionId: sessionKey,
                messages: localMessages.map((m, index) => ({
                  id: m.id,
                  role: m.role,
                  content: [{ type: 'text', text: m.content }],
                  timestamp: m.timestamp,
                  historyIndex: index,
                })),
              })
            }
          }

          const boundedMessages = limit > 0 ? messages.slice(-limit) : messages

          return json({ sessions: true,
            sessionKey,
            sessionId: sessionKey,
            messages: boundedMessages.map((message, index) =>
              toChatMessage(message, { historyIndex: index }),
            ),
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
