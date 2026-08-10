import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({ createFileRoute: (_path: string) => (options: any) => options }))
const mocks = vi.hoisted(() => ({
  auth: vi.fn(() => true),
  list: vi.fn(() => []),
  mutate: vi.fn(async () => ({ ok: true })),
  refresh: vi.fn(async () => []),
  catalog: vi.fn(async () => ({ subscriptionOnly: true, models: [{ id: 'openai-codex/gpt-5.6-sol', model: 'gpt-5.6-sol', account: 'openai-codex', billingClass: 'subscription_included', selectable: true }] })),
}))
vi.mock('../../server/auth-middleware', () => ({ requireLocalOrAuth: mocks.auth, requireProviderRuntimeMutationAuth: mocks.auth }))
vi.mock('../../server/provider-runtime-service', () => ({ getProviderRuntimeService: () => ({ list: mocks.list, refresh: mocks.refresh, mutate: mocks.mutate }) }))
vi.mock('../../server/subscription-model-catalog', () => ({ loadSubscriptionCatalog: mocks.catalog }))

describe('/api/provider-runtimes', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue(true) })

  it.each(['resume', 'fork', 'steer', 'interrupt', 'archive', 'create', 'background', 'stop', 'attach', 'link_kanban'])(
    'denies %s before parsing or side effects', async (action) => {
      mocks.auth.mockReturnValue(false)
      const json = vi.fn(async () => ({ action }))
      const { Route } = await import('./provider-runtimes')
      const response = await Route.server.handlers.POST({ request: { json } as unknown as Request })
      expect(response.status).toBe(401)
      expect(json).not.toHaveBeenCalled()
      expect(mocks.catalog).not.toHaveBeenCalled()
      expect(mocks.mutate).not.toHaveBeenCalled()
    },
  )

  it('rejects non-subscription routeRefs before lifecycle side effects', async () => {
    const { Route } = await import('./provider-runtimes')
    const response = await Route.server.handlers.POST({ request: new Request('http://localhost/api/provider-runtimes', { method: 'POST', body: JSON.stringify({ runtimeId: 'codex:t1', action: 'steer', routeRef: 'openai-api/paid', text: 'hello' }) }) })
    expect(response.status).toBe(400)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('binds the catalog provider model into lifecycle execution', async () => {
    const { Route } = await import('./provider-runtimes')
    const requestBody = { runtimeId: 'codex:t1', action: 'archive', routeRef: 'openai-codex/gpt-5.6-sol' }
    const response = await Route.server.handlers.POST({ request: new Request('http://localhost/api/provider-runtimes', { method: 'POST', body: JSON.stringify(requestBody) }) })
    expect(response.status).toBe(200)
    expect(mocks.mutate).toHaveBeenCalledWith({ ...requestBody, providerModel: 'gpt-5.6-sol' })
  })

  it('returns inventory with deferred messaging and runtime ownership choices', async () => {
    const { Route } = await import('./provider-runtimes')
    const response = await Route.server.handlers.GET({ request: new Request('http://localhost/api/provider-runtimes') })
    const body = await response.json()
    expect(body.directProviderMessaging).toMatchObject({ enabled: false, state: 'deferred' })
    expect(body.codexRuntimeChoices).toHaveLength(2)
  })

  it('links Kanban metadata without requiring a provider route lookup', async () => {
    const { Route } = await import('./provider-runtimes')
    const response = await Route.server.handlers.POST({ request: new Request('http://localhost/api/provider-runtimes', { method: 'POST', body: JSON.stringify({ runtimeId: 'codex:t1', action: 'link_kanban', kanbanTaskId: 'task-1' }) }) })
    expect(response.status).toBe(200)
    expect(mocks.mutate).toHaveBeenCalledWith({ runtimeId: 'codex:t1', action: 'link_kanban', kanbanTaskId: 'task-1' })
    expect(mocks.catalog).not.toHaveBeenCalled()
  })
})
