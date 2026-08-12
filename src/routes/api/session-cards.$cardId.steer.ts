import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

const SAFE_HEADERS = { 'Cache-Control': 'no-store' }

type SteerBody = {
  cardBinding?: unknown
  message?: unknown
}

export const Route = createFileRoute('/api/session-cards/$cardId/steer')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          if (!isAuthenticated(request)) {
            return json(
              { ok: false, error: 'Unauthorized' },
              { status: 401, headers: SAFE_HEADERS },
            )
          }
          const contentTypeError = requireJsonContentType(request)
          if (contentTypeError) return contentTypeError
          const body = (await request
            .json()
            .catch(() => null)) as SteerBody | null
          const hasUnexpectedFields =
            !!body &&
            Object.keys(body).some(
              (key) => key !== 'cardBinding' && key !== 'message',
            )
          const message =
            typeof body?.message === 'string' ? body.message.trim() : ''
          const binding = parseSessionCardOperationBinding(body?.cardBinding, {
            source: 'remote',
            transport: 'gateway',
          })
          if (
            !body ||
            hasUnexpectedFields ||
            !message ||
            !binding ||
            binding.cardId !== params.cardId
          ) {
            return json(
              { ok: false, error: 'Invalid Session Card steer binding' },
              { status: 400, headers: SAFE_HEADERS },
            )
          }

          if (!(await resolveExactSessionCardOperationBinding(binding))) {
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

          const owner = await resolveExactSessionCardOperationBinding(binding)
          if (!owner) {
            return json(
              {
                ok: false,
                error: 'Session Card ownership changed before steer',
              },
              { status: 409, headers: SAFE_HEADERS },
            )
          }
          const response = await dashboardFetch('/api/agent-steer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_key: binding.canonicalSegmentKey,
              message,
            }),
          })
          if (!response.ok) {
            return json(
              { ok: false, error: 'Gateway steer operation failed' },
              { status: response.status, headers: SAFE_HEADERS },
            )
          }
          return json(
            {
              ok: true,
              cardId: owner.cardId,
              parentCardId: owner.parentCardId,
            },
            { headers: SAFE_HEADERS },
          )
        } catch (error) {
          console.error('[session-card-steer] failed:', error)
          return json(
            { ok: false, error: 'Failed to steer agent' },
            { status: 500, headers: SAFE_HEADERS },
          )
        }
      },
    },
  },
})
