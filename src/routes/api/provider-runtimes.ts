import { createFileRoute } from '@tanstack/react-router'

import { requireProviderRuntimeMutationAuth } from '../../server/auth-middleware'
import { getProviderRuntimeService } from '../../server/provider-runtime-service'
import { loadSubscriptionCatalog } from '../../server/subscription-model-catalog'

const MAX_TEXT = 32_000

function inventoryResponse(refresh: unknown = null, availableRoutes: Array<unknown> = []): Response {
  return Response.json({
    ok: true,
    runtimes: getProviderRuntimeService().list(),
    refresh,
    availableRoutes,
    kanbanAuthority: 'Kanban task state remains authoritative; runtime linkage is metadata only.',
    restartSemantics: 'Resume preserves provider identity when supported; create/fork produces a new runtime identity.',
    directProviderMessaging: { enabled: false, state: 'deferred', explanation: 'Deferred until provider-native live stability is proven.' },
    codexRuntimeChoices: [
      { value: 'hermes_default', label: 'Hermes default', explanation: 'Hermes owns tools and the worker lifecycle.' },
      { value: 'codex_app_server', label: 'Codex app server', explanation: 'Codex owns its provider-native thread and tool loop through local stdio.' },
    ],
  })
}

export const Route = createFileRoute('/api/provider-runtimes')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireProviderRuntimeMutationAuth(request)) return Response.json({ ok: false, error: 'Provider runtime inventory requires dashboard authentication' }, { status: 401 })
        const catalog = await loadSubscriptionCatalog()
        const availableRoutes = catalog.models
          .filter((entry) => entry.selectable && entry.billingClass === 'subscription_included')
          .map((entry) => ({ id: entry.id, account: entry.account, model: entry.model, status: entry.status }))
        return inventoryResponse(null, availableRoutes)
      },
      POST: async ({ request }) => {
        // Deliberately first: denial must happen before body parsing, catalog
        // lookup, lease acquisition, CLI launch, or provider invocation.
        if (!requireProviderRuntimeMutationAuth(request)) return Response.json({ ok: false, error: 'Provider runtime mutations require dashboard authentication' }, { status: 401 })
        let body: unknown
        try { body = await request.json() } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }) }
        if (!body || typeof body !== 'object') return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 })
        if ((body as Record<string, unknown>).action === 'refresh') {
          const refresh = await getProviderRuntimeService().refresh()
          return inventoryResponse(refresh)
        }
        if ((body as Record<string, unknown>).action === 'recover-lease') {
          const runtimeId = (body as Record<string, unknown>).runtimeId
          if (typeof runtimeId !== 'string' || !runtimeId) return Response.json({ ok: false, error: 'runtimeId required' }, { status: 400 })
          const result = getProviderRuntimeService().recoverLease(runtimeId)
          return Response.json(result, { status: result.ok ? 200 : 409 })
        }
        if ((body as Record<string, unknown>).action === 'link_kanban') {
          const result = await getProviderRuntimeService().mutate(body as Record<string, unknown>)
          const ok = Boolean((result as { ok?: unknown })?.ok)
          return Response.json({ ok, result }, { status: ok ? 200 : 409 })
        }
        const raw = body as Record<string, unknown>
        const action = typeof raw.action === 'string' ? raw.action : ''
        const runtimeId = typeof raw.runtimeId === 'string' ? raw.runtimeId : ''
        const routeRef = typeof raw.routeRef === 'string' ? raw.routeRef.trim() : ''
        const text = typeof raw.text === 'string' ? raw.text : (typeof raw.prompt === 'string' ? raw.prompt : '')
        if (!action || action.length > 32 || runtimeId.length > 300 || text.length > MAX_TEXT || !routeRef) {
          return Response.json({ ok: false, error: 'Invalid or oversized lifecycle request' }, { status: 400 })
        }
        const catalog = await loadSubscriptionCatalog()
        const route = catalog.models.find((entry) => entry.id === routeRef)
        if (!catalog.subscriptionOnly || !route?.selectable || route.billingClass !== 'subscription_included') {
          return Response.json({ ok: false, error: 'routeRef is not an assignable subscription-included route' }, { status: 400 })
        }
        const accountAlias = typeof raw.accountAlias === 'string' ? raw.accountAlias : ''
        const isClaudeAction = runtimeId.startsWith('claude:') || action === 'create' || action === 'background'
        if (isClaudeAction && route.account !== accountAlias) {
          return Response.json({ ok: false, error: 'Claude account and routeRef do not match' }, { status: 400 })
        }
        if (runtimeId.startsWith('codex:') && route.account !== 'openai-codex') {
          return Response.json({ ok: false, error: 'Codex runtime requires an OpenAI Codex subscription route' }, { status: 400 })
        }
        const result = await getProviderRuntimeService().mutate({ ...raw, providerModel: route.model })
        if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true) {
          return Response.json({ ok: false, result }, { status: 409 })
        }
        return Response.json({ ok: true, result })
      },
    },
  },
})
