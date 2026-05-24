import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listProfilesWithFallback } from '../../../server/profiles-browser'

export const Route = createFileRoute('/api/profiles/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const { profiles, activeProfile } =
            await listProfilesWithFallback()
          return json({ profiles, activeProfile })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to list profiles',
              profiles: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
