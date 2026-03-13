import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

type SessionsListGatewayResponse = {
  sessions?: Array<Record<string, unknown>>
}

type SessionsListResponse = {
  sessions: Array<Record<string, unknown>>
}

type SessionsPatchResponse = {
  ok?: boolean
  key?: string
  path?: string
  entry?: Record<string, unknown>
}

type SessionsResolveResponse = {
  ok?: boolean
  key?: string
}

const THINKING_VALUES = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'adaptive',
])

function deriveFriendlyIdFromKey(key: unknown): string {
  if (typeof key !== 'string' || key.trim().length === 0) return 'main'
  const parts = key.split(':')
  const tail = parts[parts.length - 1]
  return tail && tail.trim().length > 0 ? tail.trim() : key
}

function normalizeSessions(
  payload: SessionsListGatewayResponse,
): SessionsListResponse {
  const sessions: Array<Record<string, unknown>> = Array.isArray(
    payload.sessions,
  )
    ? payload.sessions
    : []
  const normalized = sessions.map((session) => {
    const rawKey = session.key
    const key = typeof rawKey === 'string' ? rawKey : ''
    const rawFriendly = session.friendlyId
    const friendlyIdFromPayload =
      typeof rawFriendly === 'string' ? rawFriendly.trim() : ''
    const friendlyId =
      friendlyIdFromPayload.length > 0
        ? friendlyIdFromPayload
        : deriveFriendlyIdFromKey(key)
    return {
      ...session,
      key,
      friendlyId,
    }
  })

  return { sessions: normalized }
}

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const payload = await gatewayRpc<SessionsListGatewayResponse>(
            'sessions.list',
            {
              limit: 50,
              includeLastMessage: true,
              includeDerivedTitles: true,
            },
          )

          return json(normalizeSessions(payload))
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheckPost = requireJsonContentType(request)
        if (csrfCheckPost) return csrfCheckPost
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const requestedLabel =
            typeof body.label === 'string' ? body.label.trim() : ''
          const label = requestedLabel || undefined

          const requestedFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const friendlyId = requestedFriendlyId || randomUUID()

          const requestedModel =
            typeof body.model === 'string' ? body.model.trim() : ''
          const model = requestedModel || undefined
          const isolated = body.isolated === true
          const requestedExec =
            typeof body.exec === 'string' ? body.exec.trim() : ''
          const exec = requestedExec || undefined

          // Create the session with its full config in one patch so
          // subagent settings remain scoped to that session.
          const baseParams: Record<string, unknown> = { key: friendlyId }
          if (label) baseParams.label = label
          if (model) baseParams.model = model
          if (isolated) baseParams.isolated = true
          if (exec) baseParams.exec = exec

          const payload = await gatewayRpc<SessionsPatchResponse>(
            'sessions.patch',
            baseParams,
          )

          const returnedKeyRaw = payload.key
          const returnedKey =
            typeof returnedKeyRaw === 'string' && returnedKeyRaw.trim().length > 0
              ? returnedKeyRaw.trim()
              : ''
          const resolvedSessionKey = returnedKey || friendlyId
          if (!resolvedSessionKey) {
            throw new Error('gateway returned an invalid response')
          }

          const modelApplied = !model || payload.ok !== false

          // Register the friendly id so subsequent lookups resolve quickly.
          await gatewayRpc<SessionsResolveResponse>('sessions.resolve', {
            key: friendlyId,
            includeUnknown: true,
            includeGlobal: true,
          }).catch(() => ({ ok: false }))

          return json({
            ok: true,
            sessionKey: resolvedSessionKey,
            friendlyId,
            entry: payload.entry,
            modelApplied,
          })
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
      PATCH: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheckPatch = requireJsonContentType(request)
        if (csrfCheckPatch) return csrfCheckPatch
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const rawFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined
          const thinkingRaw =
            typeof body.thinking === 'string' ? body.thinking.trim() : ''
          const thinking = THINKING_VALUES.has(thinkingRaw)
            ? thinkingRaw
            : undefined
          const hasFast = Object.prototype.hasOwnProperty.call(body, 'fast')
          const hasVerbose = Object.prototype.hasOwnProperty.call(body, 'verbose')
          const hasReasoning = Object.prototype.hasOwnProperty.call(
            body,
            'reasoning',
          )
          const fast = body.fast === true
          const verbose = body.verbose === true
          const reasoning = body.reasoning === true

          let sessionKey = rawSessionKey
          const friendlyId = rawFriendlyId

          if (friendlyId) {
            const resolved = await gatewayRpc<SessionsResolveResponse>(
              'sessions.resolve',
              {
                key: friendlyId,
                includeUnknown: true,
                includeGlobal: true,
              },
            )
            const resolvedKey =
              typeof resolved.key === 'string' ? resolved.key.trim() : ''
            if (resolvedKey.length > 0) sessionKey = resolvedKey
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          const params: Record<string, unknown> = { key: sessionKey }
          if (label) params.label = label
          if (thinking) params.thinking = thinking
          if (hasFast) params.fast = fast
          if (hasVerbose) params.verbose = verbose
          if (hasReasoning) params.reasoning = reasoning

          const payload = await gatewayRpc<SessionsPatchResponse>(
            'sessions.patch',
            params,
          )

          return json({
            ok: true,
            sessionKey,
            entry: payload.entry,
          })
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
      DELETE: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const rawSessionKey = url.searchParams.get('sessionKey') ?? ''
          const rawFriendlyId = url.searchParams.get('friendlyId') ?? ''
          let sessionKey = rawSessionKey.trim()
          const friendlyId = rawFriendlyId.trim()

          if (friendlyId) {
            const resolved = await gatewayRpc<SessionsResolveResponse>(
              'sessions.resolve',
              {
                key: friendlyId,
                includeUnknown: true,
                includeGlobal: true,
              },
            )
            const resolvedKey =
              typeof resolved.key === 'string' ? resolved.key.trim() : ''
            if (resolvedKey.length > 0) sessionKey = resolvedKey
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          await gatewayRpc('sessions.delete', { key: sessionKey })
          if (friendlyId && friendlyId !== sessionKey) {
            await gatewayRpc('sessions.delete', { key: friendlyId }).catch(
              () => ({}),
            )
          }

          return json({ ok: true, sessionKey })
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
