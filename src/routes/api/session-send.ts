/** Card-authoritative direct delivery adapter used by Operations Run now. */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'

export const Route = createFileRoute('/api/session-send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        let body: { message?: unknown; cardBinding?: unknown }
        try {
          body = (await request.json()) as {
            message?: unknown
            cardBinding?: unknown
          }
        } catch {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }

        const message =
          typeof body.message === 'string' ? body.message.trim() : ''
        if (!message) {
          return json(
            { ok: false, error: 'message is required' },
            { status: 400 },
          )
        }

        // Operations aliases are gateway-owned. The raw agent/session alias is
        // deliberately not accepted: the exact source-qualified Card mapping is
        // the only delivery capability at this boundary.
        const cardBinding = parseSessionCardOperationBinding(body.cardBinding, {
          source: 'remote',
          transport: 'gateway',
        })
        if (!cardBinding) {
          return json(
            { ok: false, error: 'Invalid Session Card delivery binding' },
            { status: 400 },
          )
        }

        const cardOwner =
          await resolveExactSessionCardOperationBinding(cardBinding)
        if (!cardOwner) {
          return json(
            {
              ok: false,
              error: 'Session Card delivery binding is unavailable',
            },
            { status: 409 },
          )
        }

        try {
          const internalPort = process.env.PORT || '3000'
          const url = new URL(
            '/api/send-stream',
            `http://127.0.0.1:${internalPort}`,
          )
          const cookie = request.headers.get('cookie') || ''
          const downstream = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify({
              cardId: cardBinding.cardId,
              sessionKey: cardBinding.canonicalSegmentKey,
              friendlyId: cardBinding.cardId,
              message,
            }),
          })
          if (!downstream.ok) {
            return json(
              {
                ok: false,
                error: 'Unable to deliver the Operations command',
              },
              { status: 502 },
            )
          }
          return json({ ok: true, cardOwner, queued: true })
        } catch {
          return json(
            {
              ok: false,
              error: 'Unable to deliver the Operations command',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
