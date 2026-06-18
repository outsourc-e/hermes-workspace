import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { dashboardFetch } from '../../server/gateway-capabilities'
import {
  type DashboardOAuthStartResponse,
  mapDashboardOAuthStart,
  readOAuthError,
} from './-oauth-device-code-utils'

async function startDashboardOAuth(provider: string) {
  const res = await dashboardFetch(
    `/api/providers/oauth/${encodeURIComponent(provider)}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  )
  const data = (await res.json().catch(() => ({}))) as DashboardOAuthStartResponse

  if (!res.ok) {
    return json(
      { error: readOAuthError(data, 'Device code request failed') },
      { status: res.status },
    )
  }

  const mapped = mapDashboardOAuthStart(data)
  if (!mapped.device_code) {
    return json(
      { error: readOAuthError(data, 'Device code response missing session id') },
      { status: 502 },
    )
  }
  return json(mapped)
}


const BodySchema = z.object({
  provider: z.string().trim().min(1),
})

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

        const { provider } = parsed.data

        if (provider === 'nous') {
          try {
            const res = await fetch(
              'https://portal.nousresearch.com/api/oauth/device/code',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'client_id=claude-cli',
              },
            )
            const data = await res.json()
            if (!res.ok) {
              return json(
                { error: data.error || 'Device code request failed' },
                { status: res.status },
              )
            }
            return json(data)
          } catch (err) {
            return json(
              { error: err instanceof Error ? err.message : 'Network error' },
              { status: 500 },
            )
          }
        }

        return startDashboardOAuth(provider)
      },
    },
  },
})
