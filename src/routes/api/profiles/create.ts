import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { createProfile } from '../../../server/profiles-browser'

export const Route = createFileRoute('/api/profiles/create')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json()) as { name?: string }
          return json({ ok: true, profile: createProfile(body.name || '') })
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : 'Failed to create profile' }, { status: 500 })
        }
      },
    },
  },
})
