import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { dashboardFetch } from '../../server/gateway-capabilities'

const BodySchema = z.object({
  provider: z.string().min(1),
  deviceCode: z.string().min(1),
})

type DashboardOAuthPollResponse = {
  status?: unknown
  error_message?: unknown
  message?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Dashboard OAuth poll statuses we forward as still-in-flight. `slow_down` and
// `authorization_pending` are RFC 8628 device-flow intermediate states; the
// dashboard relays them through, and treating them as errors halts polling
// prematurely.
const PENDING_STATUSES = new Set(['pending', 'authorization_pending', 'slow_down'])

export function mapDashboardOAuthPoll(data: DashboardOAuthPollResponse) {
  const status = readString(data.status)
  if (status === 'approved') return { status: 'success' }
  if (PENDING_STATUSES.has(status)) return { status: 'pending' }

  return {
    status: 'error',
    message:
      readString(data.error_message) ||
      readString(data.message) ||
      (status ? `OAuth ${status}` : 'OAuth authorization failed'),
  }
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

export const Route = createFileRoute('/api/oauth/poll-token')({
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
          return json(
            { error: 'Missing provider or deviceCode' },
            { status: 400 },
          )
        }

        const provider = parsed.data.provider.trim()
        const sessionId = parsed.data.deviceCode.trim()

        try {
          const res = await dashboardFetch(
            `/api/providers/oauth/${encodeURIComponent(provider)}/poll/${encodeURIComponent(sessionId)}`,
          )
          const data = await res.json().catch(() => ({}))

          if (!res.ok) {
            return json({
              status: 'error',
              message: readError(data, 'OAuth polling failed'),
            })
          }

          return json(mapDashboardOAuthPoll(data as DashboardOAuthPollResponse))
        } catch (err) {
          return json({
            status: 'error',
            message: err instanceof Error ? err.message : 'Network error',
          })
        }
      },
    },
  },
})
