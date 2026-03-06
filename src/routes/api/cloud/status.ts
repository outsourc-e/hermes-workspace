import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getCloudInstanceByEmail } from '@/lib/cloud-store'
import { isAuthenticated } from '@/server/auth-middleware'

export const Route = createFileRoute('/api/cloud/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const email = url.searchParams.get('email')?.trim()

        if (!email) {
          return json({ ok: false, error: 'Missing email query parameter' }, { status: 400 })
        }

        const instance = getCloudInstanceByEmail(email)
        if (!instance) {
          return json({ ok: false, error: 'Cloud instance not found' }, { status: 404 })
        }

        return json({
          id: instance.id,
          email: instance.email,
          plan: instance.plan,
          status: instance.status,
          gatewayUrl: instance.gatewayUrl,
          createdAt: instance.createdAt,
          expiresAt: instance.expiresAt,
          polarSubscriptionId: instance.polarSubscriptionId,
        })
      },
    },
  },
})
