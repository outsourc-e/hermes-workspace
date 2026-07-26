import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SessionCardHistoryCursorError,
  sessionCardHistoryService,
} from '../../server/session-card-history'
import {
  internalFailure,
  invalidRequest,
  isSessionCardNotFound,
  normalizedCardId,
  notFoundResponse,
  sanitizeHistoryDiagnostics,
} from './-session-card-http'

const MAX_HISTORY_LIMIT = 500
const MAX_CURSOR_LENGTH = 4096

function parseHistoryQuery(
  request: Request,
): { cursor?: string; limit?: number } | null {
  const search = new URL(request.url).searchParams
  if ([...search.keys()].some((key) => key !== 'cursor' && key !== 'limit')) {
    return null
  }
  const cursorValues = search.getAll('cursor')
  const limitValues = search.getAll('limit')
  if (cursorValues.length > 1 || limitValues.length > 1) return null

  const cursor = cursorValues[0]
  if (cursor !== undefined && (!cursor || cursor.length > MAX_CURSOR_LENGTH)) {
    return null
  }

  const rawLimit = limitValues[0]
  let limit: number | undefined
  if (rawLimit !== undefined) {
    if (!/^[1-9]\d*$/u.test(rawLimit)) return null
    limit = Number(rawLimit)
    if (!Number.isSafeInteger(limit) || limit > MAX_HISTORY_LIMIT) return null
  }
  return {
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
  }
}

export const Route = createFileRoute('/api/session-cards/$cardId/history')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const cardId = normalizedCardId(params.cardId)
        if (!cardId) return invalidRequest('Valid cardId required')
        const query = parseHistoryQuery(request)
        if (!query) {
          return invalidRequest('Invalid Session Card history cursor or limit')
        }

        try {
          const result = await sessionCardHistoryService.fetch({
            cardId,
            ...query,
          })
          return json(sanitizeHistoryDiagnostics(result))
        } catch (error) {
          if (isSessionCardNotFound(error)) return notFoundResponse()
          if (
            error instanceof SessionCardHistoryCursorError ||
            error instanceof RangeError
          ) {
            return invalidRequest(
              'Session Card history cursor or limit is invalid',
            )
          }
          return internalFailure('Unable to load Session Card history')
        }
      },
    },
  },
})
