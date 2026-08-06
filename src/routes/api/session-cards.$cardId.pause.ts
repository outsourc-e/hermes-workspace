import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import {
  resolveExactSessionCardOperationBinding,
  resolveSessionCardOperationBindingByCardOwner,
} from '../../server/session-card-operation-binding'
import { requireJsonContentType } from '../../server/rate-limit'

const SAFE_HEADERS = { 'Cache-Control': 'no-store' }

type PauseBody = {
  pause?: unknown
  parentCardId?: unknown
}

function readParentCardId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    return undefined
  }
  return value
}

export const Route = createFileRoute('/api/session-cards/$cardId/pause')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const contentTypeError = requireJsonContentType(request)
          if (contentTypeError) return contentTypeError
          const body = (await request
            .json()
            .catch(() => null)) as PauseBody | null
          const parentCardId = readParentCardId(body?.parentCardId)
          const hasUnexpectedFields =
            !!body &&
            Object.keys(body).some(
              (key) => key !== 'pause' && key !== 'parentCardId',
            )
          if (
            !body ||
            hasUnexpectedFields ||
            typeof body.pause !== 'boolean' ||
            parentCardId === undefined
          ) {
            return json(
              {
                ok: false,
                error:
                  'pause must be boolean and parentCardId must be a Card id or null',
              },
              { status: 400, headers: SAFE_HEADERS },
            )
          }

          // Derive the exact upstream segment on the server. The browser only
          // presents the durable Card owner and never receives/echoes a raw key.
          const binding = await resolveSessionCardOperationBindingByCardOwner({
            cardId: params.cardId,
            parentCardId,
            source: 'remote',
            transport: 'gateway',
          })
          if (!binding) {
            return json(
              { ok: false, error: 'Session Card ownership is unavailable' },
              { status: 409, headers: SAFE_HEADERS },
            )
          }

          const capabilities = await ensureGatewayProbed()
          if (!capabilities.dashboard.available) {
            return json(
              { ok: false, error: 'Gateway dashboard is unavailable' },
              { status: 503, headers: SAFE_HEADERS },
            )
          }

          // Capability discovery is awaitable. Revalidate at the mutation edge
          // so a continuation/ownership rollover cannot pause a different agent.
          const owner = await resolveExactSessionCardOperationBinding(binding)
          if (!owner) {
            return json(
              {
                ok: false,
                error: 'Session Card ownership changed before pause',
              },
              { status: 409, headers: SAFE_HEADERS },
            )
          }
          const upstreamRequest = dashboardFetch('/api/agent-pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_key: binding.canonicalSegmentKey,
              pause: body.pause,
            }),
          })
          const response = await upstreamRequest
          const payload = (await response.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          if (!response.ok) {
            return json(
              { ok: false, error: 'Gateway pause operation failed' },
              { status: response.status, headers: SAFE_HEADERS },
            )
          }
          return json(
            {
              ok: true,
              cardId: owner.cardId,
              parentCardId: owner.parentCardId,
              paused:
                typeof payload.paused === 'boolean'
                  ? payload.paused
                  : body.pause,
            },
            { headers: SAFE_HEADERS },
          )
        } catch (error) {
          console.error('[session-card-pause] failed:', error)
          return json(
            { ok: false, error: 'Failed to update agent pause state' },
            { status: 500, headers: SAFE_HEADERS },
          )
        }
      },
    },
  },
})
