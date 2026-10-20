import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  deleteExternalConversation,
  getExternalConversation,
} from '@/server/aioncore-conversations'

export const Route = createFileRoute(
  '/api/external-conversations/$conversationId',
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
            conversation: await getExternalConversation(params.conversationId),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'External conversation was not found',
            },
            { status: 502 },
          )
        }
      },
      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          await deleteExternalConversation(params.conversationId)
          return json({ ok: true })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not delete external conversation',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
