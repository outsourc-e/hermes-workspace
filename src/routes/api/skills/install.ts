import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  HERMES_API,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'
import { requireJsonContentType } from '../../../server/rate-limit'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function fallbackPayload(skillId: string, message?: string) {
  return {
    ok: false,
    error: message || `Install via CLI: hermes skills install ${skillId}`,
    command: `hermes skills install ${skillId}`,
  }
}

export const Route = createFileRoute('/api/skills/install')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        let body: { skillId?: string; source?: string } = {}

        try {
          body = (await request.json()) as { skillId?: string; source?: string }
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : ''
        if (!skillId) {
          return json({ ok: false, error: 'skillId is required' }, { status: 400 })
        }

        try {
          await ensureGatewayProbed()

          const response = await fetch(`${HERMES_API}/api/skills`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
            body: JSON.stringify({
              action: 'install',
              id: skillId,
              skillId,
              source: body.source,
            }),
            signal: AbortSignal.timeout(10_000),
          })

          const text = await response.text().catch(() => '')
          let payload: Record<string, unknown> = {}

          try {
            payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
          } catch {
            payload = {}
          }

          if (response.ok && payload.ok !== false) {
            return json({
              ok: true,
              ...payload,
            })
          }

          return json(fallbackPayload(skillId, typeof payload.error === 'string' ? payload.error : undefined))
        } catch {
          return json(fallbackPayload(skillId))
        }
      },
    },
  },
})
