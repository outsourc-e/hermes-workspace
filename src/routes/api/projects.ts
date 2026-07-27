import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { readProjectsState, writeProjectsState } from '../../server/projects-store'

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const state = await readProjectsState()
        return json({ ok: true, ...state })
      },

      PUT: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = await request.json()
          const state = await writeProjectsState(body)
          return json({ ok: true, ...state, initialized: true })
        } catch {
          return json({ ok: false, error: 'Invalid projects payload' }, { status: 400 })
        }
      },
    },
  },
})
