import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  SessionCardChatCursorError,
  sessionCardService,
} from '../../server/session-card-service'
import { createSession } from '../../server/claude-api'
import {
  internalFailure,
  invalidRequest,
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

function listCardsInput(
  request: Request,
):
  | { view: 'ordinary'; includeArchived: boolean; limit?: number }
  | { view: 'chat'; cursor?: string }
  | null {
  const search = new URL(request.url).searchParams
  const viewValues = search.getAll('view')
  if (viewValues.length > 1) return null
  if (viewValues.length === 1) {
    if (viewValues[0] !== 'chat') return null
    if ([...search.keys()].some((key) => key !== 'view' && key !== 'cursor')) {
      return null
    }
    const cursorValues = search.getAll('cursor')
    if (cursorValues.length > 1) return null
    const cursor = cursorValues[0]
    if (
      cursor !== undefined &&
      (!cursor || cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))
    ) {
      return null
    }
    return { view: 'chat', ...(cursor === undefined ? {} : { cursor }) }
  }
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
  if (limitValues.length === 0) return { view: 'ordinary', includeArchived }
  const rawLimit = limitValues[0]
  if (!rawLimit || !/^[1-9][0-9]*$/.test(rawLimit)) return null
  const limit = Number(rawLimit)
  if (!Number.isSafeInteger(limit) || limit > 100) return null
  return { view: 'ordinary', includeArchived, limit }
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
          return invalidRequest('Invalid Session Card list query')
        }

        try {
          const result =
            input.view === 'chat'
              ? await sessionCardService.listChatCards(
                  input.cursor === undefined ? {} : { cursor: input.cursor },
                )
              : await sessionCardService.listCards({
                  includeArchived: input.includeArchived,
                  ...(input.limit === undefined ? {} : { limit: input.limit }),
                })
          return json(sanitizeSourceDiagnostics(result))
        } catch (error) {
          if (error instanceof SessionCardChatCursorError) {
            return invalidRequest('Invalid Session Card chat cursor')
          }
          return internalFailure('Unable to list Session Cards')
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireSessionCardJsonContentType(request)
        if (contentTypeError) return contentTypeError
        const body = await readJsonObject(request)
        if (!body || Object.keys(body).length !== 0) {
          return invalidRequest('Request body must be an empty JSON object')
        }

        try {
          const session = await createSession()
          const upstreamSessionKey = session.id.trim()
          if (!upstreamSessionKey) {
            return internalFailure('Unable to create Session Card')
          }
          sessionCardService.invalidateTopology()
          const resolved =
            await sessionCardService.resolveRemoteCardByUpstreamSession(
              upstreamSessionKey,
            )
          if (
            resolved.collection.completeness !== 'complete' ||
            resolved.collection.retryable
          ) {
            return projectionUnavailable()
          }
          return json(
            sanitizeSourceDiagnostics({
              card: resolved.card,
              resolution: {
                cardId: resolved.card.cardId,
                completeness: resolved.collection.completeness,
                retryable: resolved.collection.retryable,
              },
              completeness: resolved.collection.completeness,
              retryable: resolved.collection.retryable,
              sources: resolved.collection.sources,
            }),
          )
        } catch {
          return internalFailure('Unable to create Session Card')
        }
      },
    },
  },
})
