import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'

import { provisionCloudInstance } from '@/lib/cloud-store'
import type { CloudProvisionRequest } from '@/lib/cloud-types'
import { isAuthenticated } from '@/server/auth-middleware'
import { requireJsonContentType } from '@/server/rate-limit'

const ProvisionSchema = z.object({
  email: z.string().email(),
  plan: z.enum(['free', 'pro', 'team']),
  polarSubscriptionId: z.string().min(1).optional(),
}) satisfies z.ZodType<CloudProvisionRequest>

export const Route = createFileRoute('/api/cloud/provision')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const raw = await request.json().catch(() => ({}))
        const parsed = ProvisionSchema.safeParse(raw)

        if (!parsed.success) {
          return json({ ok: false, error: 'Invalid provision request' }, { status: 400 })
        }

        const instance = provisionCloudInstance(parsed.data)

        return json({
          gatewayUrl: instance.gatewayUrl,
          token: instance.token,
          plan: instance.plan,
          expiresAt: instance.expiresAt,
        })
      },
    },
  },
})
