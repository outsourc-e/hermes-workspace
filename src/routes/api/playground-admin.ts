import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'

function workerBaseUrl() {
  const explicit = (process.env.PLAYGROUND_ADMIN_BASE_URL || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const statsUrl = (process.env.VITE_PLAYGROUND_STATS_URL || '').trim()
  if (statsUrl) return statsUrl.replace(/\/stats$/, '').replace(/\/+$/, '')
  return 'https://hermes-playground-ws.myaurora-agi.workers.dev'
}

export const Route = createFileRoute('/api/playground-admin')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const token = (process.env.PLAYGROUND_ADMIN_TOKEN || '').trim()
        if (!token) {
          return json(
            { ok: false, error: 'PLAYGROUND_ADMIN_TOKEN is not configured.' },
            { status: 503 },
          )
        }

        try {
          const res = await fetch(`${workerBaseUrl()}/admin/stats`, {
            headers: {
              authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
          })
          const text = await res.text()
          if (!res.ok) {
            return json(
              {
                ok: false,
                error: `Worker admin request failed (${res.status}): ${text.slice(0, 300)}`,
              },
              { status: res.status },
            )
          }
          return new Response(text, {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            },
          })
        } catch (error: any) {
          return json(
            { ok: false, error: error?.message || 'Unknown error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
