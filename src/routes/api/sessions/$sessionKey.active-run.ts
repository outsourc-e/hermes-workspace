import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getActiveRunForCard,
  getActiveRunForSession,
} from '../../../server/run-store'
import { sessionCardService } from '../../../server/session-card-service'
import { normalizedCardId } from '../-session-card-http'

export const Route = createFileRoute('/api/sessions/$sessionKey/active-run')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const routeSessionKey = params.sessionKey
        const sessionKey = routeSessionKey.trim()
        if (!sessionKey) {
          return json(
            { ok: false, error: 'sessionKey required' },
            { status: 400 },
          )
        }

        const cardIdValues = new URL(request.url).searchParams.getAll('cardId')
        const rawCardId = cardIdValues[0]
        const requestedCardId =
          rawCardId === undefined ? undefined : normalizedCardId(rawCardId)
        if (
          cardIdValues.length > 1 ||
          (rawCardId !== undefined &&
            (!requestedCardId || requestedCardId !== rawCardId))
        ) {
          return json({ ok: false, error: 'invalid cardId' }, { status: 400 })
        }

        try {
          if (!requestedCardId) {
            const run = await getActiveRunForSession(sessionKey)
            return json({ ok: true, run })
          }

          const resolved = await sessionCardService
            .resolveCard(requestedCardId)
            .catch(() => null)
          if (!resolved) return json({ ok: true, run: null })

          const canonicalSegmentKey =
            typeof resolved.card.canonicalSegmentKey === 'string'
              ? resolved.card.canonicalSegmentKey
              : ''
          const canonicalSource = resolved.sourceBySegmentKey
            .get(canonicalSegmentKey)
            ?.trim()
          const canonicalUpstreamKey = resolved.upstreamKeyBySegmentKey
            .get(canonicalSegmentKey)
            ?.trim()
          const isCurrentCanonicalRoute =
            Boolean(canonicalSegmentKey) &&
            canonicalSegmentKey.trim() === canonicalSegmentKey &&
            canonicalSegmentKey === routeSessionKey &&
            Array.isArray(resolved.card.continuationSegmentKeys) &&
            resolved.card.continuationSegmentKeys.includes(canonicalSegmentKey)
          const isCompleteStableCard =
            resolved.card.cardId === requestedCardId &&
            resolved.collection.completeness === 'complete' &&
            (resolved.card.canonicalSource === 'local' ||
              resolved.card.canonicalSource === 'remote') &&
            (resolved.card.relationshipKind === 'root' ||
              resolved.card.relationshipKind === 'orphan') &&
            resolved.card.parentCardId === undefined
          if (
            !isCurrentCanonicalRoute ||
            !isCompleteStableCard ||
            !canonicalSource ||
            !canonicalUpstreamKey
          ) {
            return json({ ok: true, run: null })
          }

          const candidate = await getActiveRunForCard(
            resolved.card.cardId,
            canonicalSegmentKey,
          )
          const run =
            candidate?.cardId === resolved.card.cardId &&
            candidate.canonicalSegmentKey === canonicalSegmentKey
              ? candidate
              : null
          return json({ ok: true, run })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
