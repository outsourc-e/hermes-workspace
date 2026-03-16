import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

export const Route = createFileRoute('/api/openclaw-update')({
  server: {
    handlers: {
      GET: async () =>
        json({
          ok: true,
          currentVersion: '',
          latestVersion: '',
          updateAvailable: false,
          installType: 'unknown',
          deprecated: true,
          message: 'Legacy compatibility endpoint. Hermes Workspace updates are managed separately.',
        }),
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        return json(
          { ok: false, error: 'Legacy compatibility endpoint. Hermes Workspace updates are managed separately.' },
          { status: 501 },
        )
      },
    },
  },
})
