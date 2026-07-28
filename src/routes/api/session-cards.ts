import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { sessionCardService } from '../../server/session-card-service'
import {
  internalFailure,
  invalidRequest,
  sanitizeSourceDiagnostics,
} from './-session-card-http'

function listCardsInput(
  request: Request,
): { includeArchived: boolean; limit?: number } | null {
  const search = new URL(request.url).searchParams
  if (
    [...search.keys()].some(
      (key) => key !== 'includeArchived' && key !== 'limit',
    )
  ) {
    return null
  }
  const archivedValues = search.getAll('includeArchived')
  const limitValues = search.getAll('limit')
  if (archivedValues.length > 1 || limitValues.length > 1) return null
  const includeArchived =
    archivedValues.length === 0
      ? false
      : archivedValues[0] === 'true'
        ? true
        : archivedValues[0] === 'false'
          ? false
          : null
  if (includeArchived === null) return null
  if (limitValues.length === 0) return { includeArchived }
  const rawLimit = limitValues[0]
  if (!rawLimit || !/^[1-9][0-9]*$/.test(rawLimit)) return null
  const limit = Number(rawLimit)
  if (!Number.isSafeInteger(limit) || limit > 100) return null
  return { includeArchived, limit }
}

export const Route = createFileRoute('/api/session-cards')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const input = listCardsInput(request)
        if (input === null) {
          return invalidRequest(
            'includeArchived must be true or false and limit must be an integer from 1 to 100',
          )
        }

        try {
          const result = await sessionCardService.listCards(input)
          return json(sanitizeSourceDiagnostics(result))
        } catch {
          return internalFailure('Unable to list Session Cards')
        }
      },
    },
  },
})
