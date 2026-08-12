import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { getTerminalSession } from '../../server/terminal-sessions'
import { requireJsonContentType } from '../../server/rate-limit'

export const Route = createFileRoute('/api/terminal-resize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const sessionId =
          typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        const colsRaw = typeof body.cols === 'number' ? body.cols : 80
        const rowsRaw = typeof body.rows === 'number' ? body.rows : 24
        const cols = Math.max(20, Math.min(500, Math.floor(colsRaw)))
        const rows = Math.max(5, Math.min(300, Math.floor(rowsRaw)))
        if (!sessionId) {
          return new Response(
            JSON.stringify({ ok: false, error: 'sessionId required' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        const session = getTerminalSession(sessionId)
        if (!session) {
          // Stale sessionId after dev restart — avoid browser 404 noise.
          return new Response(JSON.stringify({ ok: false, reason: 'session_not_found' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        session.resize(cols, rows)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
