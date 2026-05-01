/**
 * ControlSuite-compatible session-history adapter.
 * Forwards to the existing /api/history handler with param translation:
 *   key= -> sessionKey=
 *   limit, includeTools pass through.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  ensureGatewayProbed,
  getGatewayCapabilities,
  getMessages,
  toChatMessage,
} from '../../server/claude-api'
import { resolveSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  getLocalMessages,
  getLocalSession,
} from '../../server/local-session-store'

export const Route = createFileRoute('/api/session-history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        const url = new URL(request.url)
        const key =
          url.searchParams.get('key')?.trim() ||
          url.searchParams.get('sessionKey')?.trim() ||
          ''
        const limit = Number(url.searchParams.get('limit') || '200')
        const includeTools = url.searchParams.get('includeTools') === 'true'
        if (!key) {
          return json({ ok: false, messages: [], error: 'key is required' })
        }
        // Try local store first (in-memory sessions)
        const local = getLocalSession(key)
        if (local) {
          const messages = getLocalMessages(key).slice(-limit)
          return json({ ok: true, messages, sessionKey: key, source: 'local' })
        }
        if (!getGatewayCapabilities().sessions) {
          return json({
            ok: false,
            messages: [],
            sessionKey: key,
            error: SESSIONS_API_UNAVAILABLE_MESSAGE,
          })
        }
        try {
          const resolved = await resolveSessionKey({
            rawSessionKey: key,
            defaultKey: 'main',
          })
          void includeTools
          const rows = await getMessages(resolved.sessionKey)
          const trimmed = rows.slice(-limit)
          return json({
            ok: true,
            messages: trimmed.map((row) => toChatMessage(row)),
            sessionKey: resolved.sessionKey,
            source: 'gateway',
          })
        } catch (error) {
          return json(
            {
              ok: false,
              messages: [],
              sessionKey: key,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to load history',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
