import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'

const BodySchema = z.object({
  provider: z.string().min(1),
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
          // Read client credentials from env. Do NOT commit secrets.
          const configuredClientId = process.env.NOUS_CLIENT_ID
          const clientId = configuredClientId || 'claude-cli' // fallback kept for compatibility
          const clientSecret = process.env.NOUS_CLIENT_SECRET

          if (!configuredClientId) {
            // Warn so operators notice they are using the fallback; do NOT log secrets.
            // This helps debugging if someone forgot to configure NOUS_CLIENT_ID.
            console.warn(
              '[oauth] NOUS_CLIENT_ID is not set — falling back to "claude-cli". ' +
                'Set NOUS_CLIENT_ID to the registered Nous client id.',
            )
          }

          const params = new URLSearchParams({ client_id: clientId })
          if (clientSecret) {
            params.set('client_secret', clientSecret)
          }

          try {
            const res = await fetch(
              'https://portal.nousresearch.com/api/oauth/device/code',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
              },
            )

            // Safely parse response JSON where possible
            let data: unknown = null
            try {
              data = await res.json()
            } catch {
              // Non-JSON response — capture text for debugging
              try {
                const text = await res.text()
                data = { text }
              } catch {
                data = null
              }
            }

            if (!res.ok) {
              // Prefer structured portal error fields, fall back to text or generic message.
              const errMsg =
                (data && typeof data === 'object' && (data as any).error) ||
                (data && typeof data === 'object' && (data as any).message) ||
                (data && typeof data === 'object' && (data as any).text) ||
                'Device code request failed'

              return json({ error: errMsg }, { status: res.status })
            }

            return json(data)
          } catch (err) {
            return json(
              { error: err instanceof Error ? err.message : 'Network error' },
              { status: 500 },
            )
          }
        }

        return json(
          {
            error: `OAuth device flow not supported for provider: ${provider}`,
          },
          { status: 400 },
        )
      },
    },
  },
})
