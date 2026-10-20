import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  listExternalConversationMessages,
  sendExternalConversationMessage,
} from '@/server/aioncore-conversations'

export const Route = createFileRoute(
  '/api/external-conversations/$conversationId/messages',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          return json({
            ok: true,
            messages: await listExternalConversationMessages(
              params.conversationId,
            ),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'External messages are unavailable',
            },
            { status: 502 },
          )
        }
      },
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const body = (await request.json().catch(() => ({}))) as {
          content?: unknown
        }
        if (typeof body.content !== 'string') {
          return json(
            { ok: false, error: 'content is required' },
            { status: 400 },
          )
        }
        try {
          return json(
            {
              ok: true,
              receipt: await sendExternalConversationMessage(
                params.conversationId,
                body.content,
              ),
            },
            { status: 202 },
          )
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not send external message',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
