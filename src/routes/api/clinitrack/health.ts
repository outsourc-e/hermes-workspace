/**
 * GET /api/clinitrack/health
 *
 * Returns CliniTrack app health check via Tailscale internal IP.
 * The CliniTrack app runs on the home PC and exposes a health endpoint.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const CLINITRACK_HOST = 'http://100.92.120.31:8080'

export const Route = createFileRoute('/api/clinitrack/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)

          const res = await fetch(`${CLINITRACK_HOST}/health`, {
            signal: controller.signal,
          })

          clearTimeout(timeout)

          if (!res.ok) {
            return json({ ok: false, status: res.status }, { status: 502 })
          }

          const data = await res.json()
          return json({ ok: true, data })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown error'
          return json({ ok: false, error: msg }, { status: 503 })
        }
      },
    },
  },
})
