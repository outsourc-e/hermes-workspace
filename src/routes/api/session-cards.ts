import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { sessionCardService } from '../../server/session-card-service'
import {
  internalFailure,
  invalidRequest,
  sanitizeSourceDiagnostics,
} from './-session-card-http'

function includeArchivedInput(request: Request): boolean | null {
  const search = new URL(request.url).searchParams
  if ([...search.keys()].some((key) => key !== 'includeArchived')) {
    return null
  }
  const values = search.getAll('includeArchived')
  if (values.length === 0) return false
  if (values.length !== 1) return null
  if (values[0] === 'true') return true
  if (values[0] === 'false') return false
  return null
}

export const Route = createFileRoute('/api/session-cards')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const includeArchived = includeArchivedInput(request)
        if (includeArchived === null) {
          return invalidRequest('includeArchived must be true or false')
        }

        try {
          const result = await sessionCardService.listCards({ includeArchived })
          return json(sanitizeSourceDiagnostics(result))
        } catch {
          return internalFailure('Unable to list Session Cards')
        }
      },
    },
  },
})
