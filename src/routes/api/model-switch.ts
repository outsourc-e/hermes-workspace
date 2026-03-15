import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

export const Route = createFileRoute('/api/model-switch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const model = typeof body.model === 'string' ? body.model.trim() : ''
        return json({
          ok: true,
          resolved: {
            modelProvider: model.includes('/') ? model.split('/')[0] : 'hermes-agent',
            model: model.includes('/') ? model.split('/').slice(1).join('/') : model,
          },
        })
      },
    },
  },
})
