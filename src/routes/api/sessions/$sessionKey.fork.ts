import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createCapabilityUnavailablePayload } from '../../../lib/feature-gates'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  SessionForkUnavailableError,
  ensureGatewayProbed,
  forkSession,
  toSessionSummary,
} from '../../../server/claude-api'
import { requireJsonContentType } from '../../../server/rate-limit'

const MESSAGE_TARGET_FIELDS = new Set([
  'keepCount',
  'keep_count',
  'messageId',
  'message_id',
  'messageIndex',
  'message_index',
  'targetMessageId',
  'target_message_id',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

function unavailableResponse(sessionKey: string): Response {
  return json(
    createCapabilityUnavailablePayload('sessionFork', {
      error: 'Whole-session branching is unavailable on this Hermes backend.',
      sessionKey,
      supported: false,
    }),
    { status: 503 },
  )
}

export const Route = createFileRoute('/api/sessions/$sessionKey/fork')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireJsonContentType(request)
        if (contentTypeError) return contentTypeError

        const sessionKey = params.sessionKey.trim()
        if (!sessionKey) {
          return json(
            { ok: false, error: 'sessionKey required' },
            { status: 400 },
          )
        }

        const body = (await request.json().catch(() => null)) as unknown
        if (!isRecord(body)) {
          return json(
            { ok: false, error: 'Request body must be a JSON object' },
            { status: 400 },
          )
        }

        const targetedField = Object.keys(body).find((key) =>
          MESSAGE_TARGET_FIELDS.has(key),
        )
        if (targetedField) {
          return json(
            {
              ok: false,
              error:
                'Message-targeted branching is not supported; fork the whole conversation instead.',
            },
            { status: 400 },
          )
        }

        const unknownField = Object.keys(body).find((key) => key !== 'title')
        if (unknownField) {
          return json(
            { ok: false, error: `Unsupported fork option: ${unknownField}` },
            { status: 400 },
          )
        }
        if (body.title !== undefined && typeof body.title !== 'string') {
          return json(
            { ok: false, error: 'title must be a string' },
            { status: 400 },
          )
        }
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (title.length > 500) {
          return json(
            { ok: false, error: 'title must be 500 characters or fewer' },
            { status: 400 },
          )
        }

        let sessionForkSupported = false
        try {
          sessionForkSupported = (await ensureGatewayProbed()).sessionFork
        } catch {
          // A failed capability probe is indistinguishable from unavailable.
        }
        if (!sessionForkSupported) return unavailableResponse(sessionKey)

        try {
          const result = await forkSession(
            sessionKey,
            title ? { title } : undefined,
          )
          const returnedParentId = result.session.parent_session_id
          const verifiedParentId =
            typeof result.forkedFrom === 'string'
              ? result.forkedFrom
              : typeof returnedParentId === 'string'
                ? returnedParentId
                : null
          if (
            !validOptionalParentIdentity(result.forkedFrom, sessionKey) ||
            !validOptionalParentIdentity(returnedParentId, sessionKey) ||
            verifiedParentId === null
          ) {
            throw new Error(
              'Hermes fork response did not identify the requested parent session.',
            )
          }
          const summary = toSessionSummary(result.session)
          const entry = {
            ...summary,
            lineage: {
              ...(summary.lineage ?? {}),
              parentSessionId: verifiedParentId,
              sessionSource: 'fork',
              relationshipKind: 'branch' as const,
            },
          }
          return json(
            {
              ok: true,
              supported: true,
              parentSessionKey: verifiedParentId,
              sessionKey: summary.key,
              entry,
            },
            { status: 201 },
          )
        } catch (error) {
          if (error instanceof SessionForkUnavailableError) {
            return unavailableResponse(sessionKey)
          }
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
