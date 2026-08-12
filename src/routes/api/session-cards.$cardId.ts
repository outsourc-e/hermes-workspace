import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SessionCardProjectionIncompleteError,
  sessionCardService,
} from '../../server/session-card-service'
import {
  internalFailure,
  invalidRequest,
  isSessionCardNotFound,
  isSessionCardPinNotEligible,
  normalizedCardId,
  notFoundResponse,
  parseMetadataUpdate,
  readJsonObject,
  requireSessionCardJsonContentType,
  sanitizeSourceDiagnostics,
} from './-session-card-http'

function projectionUnavailable(): Response {
  return json(
    {
      ok: false,
      error: 'Session Card inventory is temporarily unavailable',
      retryable: true,
    },
    { status: 503 },
  )
}

export const Route = createFileRoute('/api/session-cards/$cardId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const cardId = normalizedCardId(params.cardId)
        if (!cardId) return invalidRequest('Valid cardId required')

        try {
          const result = await sessionCardService.lookupCard(cardId)
          if (result.status === 'missing') {
            if (result.completeness !== 'complete' || result.retryable) {
              return json(
                sanitizeSourceDiagnostics({
                  ok: false,
                  error: 'Session Card inventory is temporarily unavailable',
                  retryable: true,
                  sources: result.sources,
                }),
                { status: 503 },
              )
            }
            return json(
              { ok: false, error: 'Session Card not found', retryable: false },
              { status: 404 },
            )
          }
          return json(
            sanitizeSourceDiagnostics({
              card: result.card,
              resolution: result.resolution,
              completeness: result.completeness,
              retryable: result.retryable,
              sources: result.sources,
            }),
          )
        } catch {
          return internalFailure('Unable to load Session Card')
        }
      },
      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireSessionCardJsonContentType(request)
        if (contentTypeError) return contentTypeError

        const cardId = normalizedCardId(params.cardId)
        if (!cardId) return invalidRequest('Valid cardId required')
        const body = await readJsonObject(request)
        if (!body) return invalidRequest('Request body must be a JSON object')
        const patch = parseMetadataUpdate(body)
        if (!patch) {
          return invalidRequest(
            'Provide only manualTitle or autoTitle as a valid string or null, and pinned as a boolean',
          )
        }

        try {
          const current = await sessionCardService.resolveCard(cardId)
          if (current.collection.completeness !== 'complete') {
            return projectionUnavailable()
          }
          if (current.card.relationshipKind !== 'root') {
            return invalidRequest('Only root Session Cards can be updated')
          }
          await sessionCardService.updateCardMetadata(
            current.card.cardId,
            patch,
          )
          const fresh = await sessionCardService.resolveCard(
            current.card.cardId,
          )
          return json({ card: fresh.card })
        } catch (error) {
          if (isSessionCardNotFound(error)) return notFoundResponse()
          if (error instanceof SessionCardProjectionIncompleteError) {
            return projectionUnavailable()
          }
          if (isSessionCardPinNotEligible(error)) {
            return invalidRequest('Only root Session Cards can be pinned')
          }
          return internalFailure('Unable to update Session Card metadata')
        }
      },
    },
  },
})
