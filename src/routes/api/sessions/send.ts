import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'

const SAFE_HEADERS = { 'Cache-Control': 'no-store' }

export const Route = createFileRoute('/api/sessions/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json(
            { ok: false, error: 'Unauthorized' },
            { status: 401, headers: SAFE_HEADERS },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json().catch(() => null)) as Record<
          string,
          unknown
        > | null
        if (!body) {
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400, headers: SAFE_HEADERS },
          )
        }
        if (Object.prototype.hasOwnProperty.call(body, 'attachments')) {
          return json(
            {
              ok: false,
              error:
                'Attachments are not supported by the retired session endpoint',
            },
            { status: 400, headers: SAFE_HEADERS },
          )
        }

        return json(
          {
            ok: false,
            error:
              'Legacy session send is retired; use a Session Card operation',
          },
          { status: 410, headers: SAFE_HEADERS },
        )
      },
    },
  },
})
