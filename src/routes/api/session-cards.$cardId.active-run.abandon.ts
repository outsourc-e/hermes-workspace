import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { abandonActiveCardRun, listAllActiveRuns } from '../../server/run-store'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationProjection,
} from '../../server/session-card-operation-binding'
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
        const rawBinding =
          body && typeof body === 'object' && !Array.isArray(body)
            ? (body as Record<string, unknown>).cardBinding
            : null
        const rawSource =
          rawBinding &&
          typeof rawBinding === 'object' &&
          !Array.isArray(rawBinding)
            ? (rawBinding as Record<string, unknown>).canonicalSource
            : null
        const cardBinding =
          rawSource === 'local' || rawSource === 'remote'
            ? parseSessionCardOperationBinding(rawBinding, {
                source: rawSource,
                transport: rawSource === 'local' ? 'tmux' : 'gateway',
              })
            : null
        if (!runId) {
          return json(
            { ok: false, error: 'Valid runId required' },
            { status: 400 },
          )
        }
        if (!cardBinding || cardBinding.cardId !== cardId) {
          return json(
            { ok: false, error: 'Valid Session Card run binding required' },
            { status: 400 },
          )
        }

        try {
          let owner =
            await resolveExactSessionCardOperationProjection(cardBinding)
          if (!owner) {
            return unavailable()
          }
          const runs = await listAllActiveRuns()
          // The active-run scan is awaitable. Re-resolve the exact parent/child
          // binding before using its continuation set as authority.
          owner = await resolveExactSessionCardOperationProjection(cardBinding)
          if (!owner) {
            return unavailable()
          }
          const ownedSegments = new Set(owner.continuationSegmentKeys)
          const candidates = runs.filter((run) => {
            if (run.runId !== runId) return false
            return (
              run.cardId === cardId &&
              typeof run.canonicalSegmentKey === 'string' &&
              ownedSegments.has(run.canonicalSegmentKey) &&
              ownedSegments.has(run.sessionKey)
            )
          })
          if (candidates.length !== 1) {
            return json(
              { ok: false, error: 'Active Card run not found' },
              { status: candidates.length > 1 ? 409 : 404 },
            )
          }

          const run = candidates[0]!
          const result = await abandonActiveCardRun({
            sessionKey: run.sessionKey,
            runId: run.runId,
            cardId,
            ownedSegmentKeys: owner.continuationSegmentKeys,
            revalidateCardOwner: async () => {
              const freshOwner =
                await resolveExactSessionCardOperationProjection(cardBinding)
              return Boolean(
                freshOwner &&
                typeof run.canonicalSegmentKey === 'string' &&
                freshOwner.continuationSegmentKeys.includes(run.sessionKey) &&
                freshOwner.continuationSegmentKeys.includes(
                  run.canonicalSegmentKey,
                ),
              )
            },
          })
          if (result.outcome === 'not-found') {
            return json(
              { ok: false, error: 'Active Card run not found' },
              { status: 404 },
            )
          }
          if (result.outcome === 'terminal') {
            return json(
              {
                ok: false,
                cardId,
                status: result.run.status,
                error: 'Active Card run is already terminal',
              },
              { status: 409 },
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
