/**
 * ControlSuite-compatible session-send adapter.
 *
 * Operations sends { sessionKey, message } and expects { ok: true } quickly.
 * We forward to the local /api/send-stream endpoint and discard the body
 * (the Operations chat panel polls /api/history at 5s intervals to pick up
 * the reply, so we don't need to hold the stream open here).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

export const Route = createFileRoute('/api/session-send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        try {
          const body = (await request.json()) as {
            sessionKey?: string
            message?: string
          }
          const sessionKey = (body.sessionKey || '').trim()
          const message = (body.message || '').trim()
          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey is required' },
              { status: 400 },
            )
          }
          if (!message) {
            return json(
              { ok: false, error: 'message is required' },
              { status: 400 },
            )
          }
          // Fire-and-forget: kick off the stream, then return. Operations
          // chat panel polls /api/session-history for new assistant turns.
          //
          // Use loopback rather than `request.url` so the internal hop never
          // leaves the host. Going back through a public hostname + reverse
          // proxy can drop the session cookie (SameSite / forbidden-header
          // handling differs across Node fetch implementations), which causes
          // the downstream /api/send-stream call to 401 silently and the user
          // never sees their assistant reply. See #XXX.
          const internalPort = process.env.PORT || '3000'
          const url = new URL('/api/send-stream', `http://127.0.0.1:${internalPort}`)
          const cookie = request.headers.get('cookie') || ''
          fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify({
              sessionKey,
              message,
            }),
          }).catch(() => {
            // swallow; UI discovers failures via next /api/session-history poll
          })
          return json({ ok: true, sessionKey, queued: true })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to queue message',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
