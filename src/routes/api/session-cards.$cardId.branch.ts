import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createCapabilityUnavailablePayload } from '../../lib/feature-gates'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SessionForkUnavailableError,
  ensureGatewayProbed,
  forkSession,
} from '../../server/claude-api'
import { sessionCardService } from '../../server/session-card-service'
import {
  invalidRequest,
  isSessionCardNotFound,
  normalizedCardId,
  notFoundResponse,
  readJsonObject,
  requireSessionCardJsonContentType,
} from './-session-card-http'

const MAX_BRANCH_TITLE_LENGTH = 500

function unavailableResponse(cardId: string): Response {
  return json(
    createCapabilityUnavailablePayload('sessionFork', {
      error:
        'Whole-conversation branching is unavailable on this Hermes backend.',
      cardId,
      supported: false,
    }),
    { status: 503 },
  )
}

function branchFailure(): Response {
  return json(
    { ok: false, error: 'Unable to safely create Session Card branch' },
    { status: 502 },
  )
}

function remoteProjectedKey(upstreamKey: string): string {
  return `remote:${encodeURIComponent(upstreamKey)}`
}

function validOptionalParentIdentity(
  value: unknown,
  expectedParent: string,
): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' &&
      value.trim().length > 0 &&
      value === expectedParent)
  )
}

export const Route = createFileRoute('/api/session-cards/$cardId/branch')({
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
        if (!body) return invalidRequest('Request body must be a JSON object')
        if (Object.keys(body).some((key) => key !== 'title')) {
          return invalidRequest('Only an optional title may be provided')
        }
        if (body.title !== undefined && typeof body.title !== 'string') {
          return invalidRequest('title must be a string')
        }
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (title.length > MAX_BRANCH_TITLE_LENGTH) {
          return invalidRequest('title must be 500 characters or fewer')
        }

        let resolved
        try {
          resolved = await sessionCardService.resolveCard(cardId)
        } catch (error) {
          if (isSessionCardNotFound(error)) return notFoundResponse()
          return branchFailure()
        }

        const canonicalSegmentKey = resolved.card.canonicalSegmentKey
        const canonicalSource =
          resolved.sourceBySegmentKey.get(canonicalSegmentKey)
        const authoritativeUpstreamKey =
          resolved.upstreamKeyBySegmentKey.get(canonicalSegmentKey)
        if (
          canonicalSource !== 'gateway' ||
          resolved.collection.completeness !== 'complete'
        ) {
          return unavailableResponse(resolved.card.cardId)
        }
        if (!authoritativeUpstreamKey) return branchFailure()

        let supported = false
        try {
          supported = (await ensureGatewayProbed()).sessionFork
        } catch {
          // A failed capability probe is indistinguishable from unavailable.
        }
        if (!supported) return unavailableResponse(resolved.card.cardId)

        try {
          const result = await forkSession(
            authoritativeUpstreamKey,
            title ? { title } : undefined,
          )
          const childUpstreamKey = result.session.id.trim()
          const returnedParent = result.session.parent_session_id
          if (
            !childUpstreamKey ||
            childUpstreamKey === authoritativeUpstreamKey ||
            !validOptionalParentIdentity(
              result.forkedFrom,
              authoritativeUpstreamKey,
            ) ||
            !validOptionalParentIdentity(
              returnedParent,
              authoritativeUpstreamKey,
            ) ||
            (result.forkedFrom == null && returnedParent == null)
          ) {
            return branchFailure()
          }

          const expectedChildKey = remoteProjectedKey(childUpstreamKey)
          const fresh = await sessionCardService.resolveCard(
            resolved.card.cardId,
            { includeArchived: true },
          )
          const freshCanonicalKey = fresh.card.canonicalSegmentKey
          const child = fresh.card.childNodes.find(
            (candidate) =>
              candidate.relationshipKind === 'branch' &&
              candidate.cardId === expectedChildKey &&
              candidate.sessionKey === expectedChildKey,
          )
          if (!child) return branchFailure()

          const freshParentSource =
            fresh.sourceBySegmentKey.get(freshCanonicalKey)
          const freshParentUpstreamKey =
            fresh.upstreamKeyBySegmentKey.get(freshCanonicalKey)
          const freshChildSource = fresh.sourceBySegmentKey.get(
            child.sessionKey,
          )
          const freshChildUpstreamKey = fresh.upstreamKeyBySegmentKey.get(
            child.sessionKey,
          )
          if (
            fresh.card.cardId !== resolved.card.cardId ||
            fresh.collection.completeness !== 'complete' ||
            freshParentSource !== 'gateway' ||
            freshChildSource !== 'gateway' ||
            freshParentUpstreamKey !== authoritativeUpstreamKey ||
            freshChildUpstreamKey !== childUpstreamKey ||
            freshChildUpstreamKey === freshParentUpstreamKey
          ) {
            return branchFailure()
          }

          return json(
            {
              ok: true,
              cardId: resolved.card.cardId,
              canonicalSegmentKey: freshCanonicalKey,
              childSessionKey: child.sessionKey,
              supported: true,
            },
            { status: 201 },
          )
        } catch (error) {
          if (error instanceof SessionForkUnavailableError) {
            return unavailableResponse(resolved.card.cardId)
          }
          return branchFailure()
        }
      },
    },
  },
})
