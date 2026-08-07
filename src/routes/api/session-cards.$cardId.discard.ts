import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { deleteEmptyGatewaySession } from '../../server/claude-api'
import { claimNewSessionCardDiscardCapability } from '../../server/new-session-card-discard'
import {
  SessionCardProjectionIncompleteError,
  sessionCardService,
} from '../../server/session-card-service'
import {
  internalFailure,
  invalidRequest,
  isSessionCardNotFound,
  normalizedCardId,
  readJsonObject,
  requireSessionCardJsonContentType,
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

function discardToken(body: Record<string, unknown>): string | null {
  const token = body.discardToken
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token)
    ? token
    : null
}

function isDiscardableNewSessionCard(
  card: Awaited<ReturnType<typeof sessionCardService.resolveCard>>['card'],
  upstreamKey: string | undefined,
): boolean {
  return (
    card.canonicalSource === 'remote' &&
    card.cardId === card.canonicalSegmentKey &&
    card.relationshipKind === 'root' &&
    card.parentCardId === undefined &&
    card.titleSource === 'default' &&
    !card.archived &&
    !card.pinned &&
    card.activity === undefined &&
    card.childNodes.length === 0 &&
    card.continuationCount === 1 &&
    card.continuationSegmentKeys.length === 1 &&
    card.continuationSegmentKeys[0] === card.cardId &&
    typeof upstreamKey === 'string' &&
    upstreamKey.length > 0
  )
}

export const Route = createFileRoute('/api/session-cards/$cardId/discard')({
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
        if (!body || Object.keys(body).length !== 1) {
          return invalidRequest('Discard request requires only discardToken')
        }
        const token = discardToken(body)
        if (!token) return invalidRequest('Valid discardToken required')
        const claim = claimNewSessionCardDiscardCapability(cardId, token)
        if (!claim) {
          return json({ ok: true, discarded: false })
        }

        try {
          const current = await sessionCardService.resolveCard(cardId)
          if (
            current.collection.completeness !== 'complete' ||
            current.collection.retryable
          ) {
            claim.release()
            return projectionUnavailable()
          }
          const upstreamKey = current.upstreamKeyBySegmentKey.get(
            current.card.cardId,
          )
          if (
            !upstreamKey ||
            !isDiscardableNewSessionCard(current.card, upstreamKey)
          ) {
            claim.complete()
            return json({ ok: true, discarded: false })
          }

          const discarded = await deleteEmptyGatewaySession(upstreamKey)
          claim.complete()
          if (discarded) sessionCardService.invalidateTopology()
          return json({ ok: true, discarded })
        } catch (error) {
          if (isSessionCardNotFound(error)) {
            claim.complete()
            return json({ ok: true, discarded: false })
          }
          if (error instanceof SessionCardProjectionIncompleteError) {
            claim.release()
            return projectionUnavailable()
          }
          claim.release()
          return internalFailure('Unable to discard unused Session Card')
        }
      },
    },
  },
})
