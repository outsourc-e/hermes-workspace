import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { listAllActiveRuns, markRunStatus } from '../../server/run-store'
import { sessionCardService } from '../../server/session-card-service'
import { normalizedCardId } from './-session-card-http'

function unavailable(): Response {
  return json(
    {
      ok: false,
      error: 'Session Card inventory is temporarily unavailable',
      retryable: true,
    },
    { status: 503 },
  )
}

function exactRunId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null
}

export const Route = createFileRoute(
  '/api/session-cards/$cardId/active-run/abandon',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const cardId = normalizedCardId(params.cardId)
        if (!cardId) {
          return json(
            { ok: false, error: 'Valid cardId required' },
            { status: 400 },
          )
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json(
            { ok: false, error: 'Invalid request body' },
            { status: 400 },
          )
        }
        const runId =
          body && typeof body === 'object' && !Array.isArray(body)
            ? exactRunId((body as Record<string, unknown>).runId)
            : null
        if (!runId) {
          return json(
            { ok: false, error: 'Valid runId required' },
            { status: 400 },
          )
        }

        try {
          // Resolve after reading the mutable run set so the destructive write
          // is authorized against the freshest complete Card projection.
          const runs = await listAllActiveRuns()
          const resolved = await sessionCardService.resolveCard(cardId)
          if (resolved.collection.completeness !== 'complete') {
            return unavailable()
          }
          if (resolved.card.cardId !== cardId) {
            return json(
              { ok: false, error: 'Active Card run not found' },
              { status: 404 },
            )
          }

          const ownedSegments = new Set(resolved.card.continuationSegmentKeys)
          const candidates = runs.filter((run) => {
            if (run.runId !== runId) return false
            const hasPersistedCardOwner =
              run.cardId !== undefined || run.canonicalSegmentKey !== undefined
            if (hasPersistedCardOwner) {
              return (
                run.cardId === cardId &&
                typeof run.canonicalSegmentKey === 'string' &&
                ownedSegments.has(run.canonicalSegmentKey) &&
                ownedSegments.has(run.sessionKey)
              )
            }
            return ownedSegments.has(run.sessionKey)
          })
          if (candidates.length !== 1) {
            return json(
              { ok: false, error: 'Active Card run not found' },
              { status: candidates.length > 1 ? 409 : 404 },
            )
          }

          const run = candidates[0]!
          const updated = await markRunStatus(
            run.sessionKey,
            run.runId,
            'error',
            'Abandoned by user',
          )
          if (!updated) {
            return json(
              { ok: false, error: 'Active Card run not found' },
              { status: 404 },
            )
          }
          return json({ ok: true, cardId, status: 'error' })
        } catch {
          return json(
            { ok: false, error: 'Unable to mark the active Card run dead' },
            { status: 500 },
          )
        }
      },
    },
  },
})
