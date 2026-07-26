import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { sessionCardService } from '../../server/session-card-service'
import {
  internalFailure,
  invalidRequest,
  isSessionCardNotFound,
  normalizedCardId,
  notFoundResponse,
  readJsonObject,
  requireSessionCardJsonContentType,
} from './-session-card-http'

export const Route = createFileRoute('/api/session-cards/$cardId/archive')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireSessionCardJsonContentType(request)
        if (contentTypeError) return contentTypeError

        const cardId = normalizedCardId(params.cardId)
        if (!cardId) return invalidRequest('Valid cardId required')
        const body = await readJsonObject(request)
        if (!body || Object.keys(body).length !== 0) {
          return invalidRequest('Archive request body must be an empty object')
        }

        try {
          const current = await sessionCardService.resolveCard(cardId, {
            includeArchived: true,
          })
          await sessionCardService.archiveCard(current.card.cardId)
          return json({
            ok: true,
            cardId: current.card.cardId,
            archived: true,
          })
        } catch (error) {
          if (isSessionCardNotFound(error)) return notFoundResponse()
          return internalFailure('Unable to archive Session Card')
        }
      },
    },
  },
})
