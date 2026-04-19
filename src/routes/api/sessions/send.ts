import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  ensureGatewayProbed,
  getGatewayCapabilities,
  sendChat,
} from '../../../server/hermes-api'
import { resolveSessionKey } from '../../../server/session-utils'

export const Route = createFileRoute('/api/sessions/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.enhancedChat) {
          return json(
            {
              ok: false,
              error: capabilities.dashboard.available
                ? 'Legacy session send is not supported in zero-fork mode. Use /api/send-stream.'
                : SESSIONS_API_UNAVAILABLE_MESSAGE,
            },
            { status: 503 },
          )
        }

        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const friendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const message = String(body.message ?? '').trim()

          if (!message) {
            return json(
              { ok: false, error: 'message required' },
              { status: 400 },
            )
          }

          const { sessionKey } = await resolveSessionKey({
            rawSessionKey,
            friendlyId,
            defaultKey: 'main',
          })

          const idempotencyKey =
            typeof body.idempotencyKey === 'string' &&
            body.idempotencyKey.trim().length > 0
              ? body.idempotencyKey.trim()
              : randomUUID()

          const result = await sendChat(sessionKey, {
            message,
          })

          return json({
            ok: true,
            sessionKey,
            runId: result.run_id ?? idempotencyKey,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
