import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

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
        const host = (request.headers.get('host') || '').toLowerCase()
        const localOk = host.startsWith('127.0.0.1:') || host.startsWith('localhost:') || host.endsWith('.local:3002')
        if (!localOk) {
          return json({ ok: false, error: 'Admin stats are only available from a local workspace session.' }, { status: 403 })
        }

        const token = (process.env.PLAYGROUND_ADMIN_TOKEN || '').trim()
        if (!token) {
          return json({ ok: false, error: 'PLAYGROUND_ADMIN_TOKEN is not configured.' }, { status: 503 })
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
              { ok: false, error: `Worker admin request failed (${res.status}): ${text.slice(0, 300)}` },
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
          return json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 })
        }
      },
    },
  },
})
