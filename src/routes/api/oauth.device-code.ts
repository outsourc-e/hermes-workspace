import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { dashboardFetch } from '../../server/gateway-capabilities'

const BodySchema = z.object({
  provider: z.string().min(1),
})

type DashboardStartResponse = {
  session_id?: unknown
  user_code?: unknown
  verification_url?: unknown
  expires_in?: unknown
  poll_interval?: unknown
  detail?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return fallback
}

export const Route = createFileRoute('/api/oauth/device-code')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          return json({ error: 'Missing provider' }, { status: 400 })
        }

        const provider = parsed.data.provider.trim()

        try {
          // The dashboard owns the device-code session: it mints the code with the
          // correct provider client_id, starts the poller that persists the
          // credentials, and tracks the session the UI polls afterwards. Minting a
          // code here instead would leave the dashboard with no session, so every
          // later poll would fail with "Session not found or expired".
          const res = await dashboardFetch(
            `/api/providers/oauth/${encodeURIComponent(provider)}/start`,
            { method: 'POST' },
          )
          const data = (await res.json().catch(() => ({}))) as DashboardStartResponse

          if (!res.ok) {
            return json(
              { error: readError(data, `Device code request failed (${res.status})`) },
              { status: res.status },
            )
          }

          const sessionId = readString(data.session_id)
          if (!sessionId) {
            return json(
              { error: 'Dashboard did not return a session id' },
              { status: 502 },
            )
          }

          // Map the dashboard's field names onto the shape the UI and the
          // poll-token route already expect.
          const verificationUrl = readString(data.verification_url)
          return json({
            device_code: sessionId,
            user_code: readString(data.user_code),
            verification_uri: verificationUrl,
            verification_uri_complete: verificationUrl,
            expires_in: readNumber(data.expires_in, 900),
            interval: readNumber(data.poll_interval, 5),
          })
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : 'Network error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
