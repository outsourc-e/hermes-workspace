import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  createExternalConversation,
  listExternalConversations,
} from '@/server/aioncore-conversations'

export const Route = createFileRoute('/api/external-conversations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          return json({
            ok: true,
            conversations: await listExternalConversations(),
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'External conversations are unavailable',
            },
            { status: 502 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const body = (await request.json().catch(() => ({}))) as {
          runtimeId?: unknown
          name?: unknown
        }
        if (typeof body.runtimeId !== 'string') {
          return json(
            { ok: false, error: 'runtimeId is required' },
            { status: 400 },
          )
        }
        try {
          return json(
            {
              ok: true,
              conversation: await createExternalConversation({
                runtimeId: body.runtimeId,
                name: typeof body.name === 'string' ? body.name : undefined,
              }),
            },
            { status: 201 },
          )
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not create external conversation',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
