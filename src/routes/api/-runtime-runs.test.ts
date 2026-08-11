import { beforeEach, describe, expect, it, vi } from 'vitest'

import {  capabilityMatrix } from '../../server/provider-runtime-control-plane'
import type {ProviderRuntimeRecord} from '../../server/provider-runtime-control-plane';

vi.mock('@tanstack/react-router', () => ({ createFileRoute: (_path: string) => (options: any) => options }))

const mocks = vi.hoisted(() => ({
  auth: vi.fn(() => true),
  list: vi.fn<() => Array<ProviderRuntimeRecord>>(() => []),
  refresh: vi.fn(async () => []),
  routes: vi.fn(() => [
    { id: 'openai-codex/gpt-5.6-sol', account: 'openai-codex', model: 'gpt-5.6-sol', status: 'available' },
  ]),
  catalog: vi.fn(async () => ({
    subscriptionOnly: true,
    models: [
      { id: 'openai-codex/gpt-5.6-sol', account: 'openai-codex', model: 'gpt-5.6-sol', status: 'available', selectable: true, billingClass: 'subscription_included' },
      { id: 'openai-api/paid', account: 'openai-api', model: 'paid', status: 'available', selectable: true, billingClass: 'api_billed' },
    ],
  })),
}))

vi.mock('../../server/auth-middleware', () => ({ requireProviderRuntimeMutationAuth: mocks.auth }))
vi.mock('../../server/provider-runtime-service', () => ({
  getProviderRuntimeService: () => ({ list: mocks.list, refresh: mocks.refresh }),
}))
vi.mock('../../server/runtime-route-cache', () => ({ readRuntimeRouteSnapshot: mocks.routes }))
vi.mock('../../server/subscription-model-catalog', () => ({ loadSubscriptionCatalog: mocks.catalog }))

describe('/api/runtime-runs', () => {
  const getHandler = async () => {
    const { Route } = await import('./runtime-runs')
    return (Route as unknown as { server: { handlers: { GET: (input: { request: Request }) => Promise<Response> } } }).server.handlers.GET
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockReturnValue(true)
    mocks.list.mockReturnValue([])
  })

  it('denies inventory before touching the registry or any provider process seam', async () => {
    mocks.auth.mockReturnValue(false)
    const response = await (await getHandler())({ request: new Request('http://localhost/api/runtime-runs') })
    expect(response.status).toBe(401)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.catalog).not.toHaveBeenCalled()
  })

  it('returns a bounded provider-neutral page and summary without refreshing providers', async () => {
    mocks.list.mockReturnValue([
      {
        runtimeId: 'codex:t1', kind: 'codex_thread', routeRef: 'openai-codex/gpt-5.6-sol', accountAlias: 'openai-codex',
        externalId: 't1', model: 'gpt-5.6-sol', cwd: 'C:/repo', worktree: 'C:/repo', hostKind: 'stdio', hostStatus: 'idle',
        capabilities: capabilityMatrix('codex_thread'), lease: null, parentRuntimeId: null, kanbanTaskId: null, createdAt: 1, updatedAt: 2,
      },
    ])
    const response = await (await getHandler())({ request: new Request('http://localhost/api/runtime-runs?provider=codex&account=openai-codex&project=repo&kanban=unlinked&page=1&size=25') })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: true,
      runs: [{ id: 'codex:t1', source: 'provider-runtime', provider: 'codex' }],
      summary: { total: 1, idleResumable: 1 },
      availableRoutes: [{ id: 'openai-codex/gpt-5.6-sol', account: 'openai-codex', model: 'gpt-5.6-sol', status: 'available' }],
      page: { number: 1, size: 25, total: 1, pages: 1, hasNext: false, hasPrevious: false },
    })
    expect(typeof body.generatedAt).toBe('number')
    expect(body.filters).toMatchObject({ account: ['openai-codex'], project: ['repo'], linked: 'unlinked' })
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect(mocks.routes).toHaveBeenCalledTimes(1)
  })

  it('returns a bounded selected run outside the current filters and page', async () => {
    mocks.list.mockReturnValue([
      {
        runtimeId: 'codex:selected', kind: 'codex_thread', routeRef: null, accountAlias: 'openai-codex',
        externalId: 'selected', model: null, cwd: 'C:/selected', worktree: 'C:/selected', hostKind: 'stdio', hostStatus: 'idle',
        capabilities: capabilityMatrix('codex_thread'), lease: null, parentRuntimeId: null, kanbanTaskId: null, createdAt: 1, updatedAt: 2,
      },
    ])
    const response = await (await getHandler())({
      request: new Request('http://localhost/api/runtime-runs?provider=claude&run=codex%3Aselected&page=9&size=25'),
    })
    const body = await response.json()
    expect(body.runs).toEqual([])
    expect(body.selectedRun).toMatchObject({ id: 'codex:selected', nativeId: 'selected' })
  })

  it('applies bounded project filters longer than 32 characters instead of silently widening results', async () => {
    const longProject = 'project-with-a-deliberately-long-name-12345'
    mocks.list.mockReturnValue([
      {
        runtimeId: 'codex:long', kind: 'codex_thread', routeRef: 'openai-codex/gpt-5.6-sol', accountAlias: 'openai-codex',
        externalId: 'long', model: 'gpt-5.6-sol', cwd: `C:/${longProject}`, worktree: `C:/${longProject}`, hostKind: 'stdio', hostStatus: 'idle',
        capabilities: capabilityMatrix('codex_thread'), lease: null, parentRuntimeId: null, kanbanTaskId: null, createdAt: 1, updatedAt: 2,
      },
      {
        runtimeId: 'codex:other', kind: 'codex_thread', routeRef: 'openai-codex/gpt-5.6-sol', accountAlias: 'openai-codex',
        externalId: 'other', model: 'gpt-5.6-sol', cwd: 'C:/other', worktree: 'C:/other', hostKind: 'stdio', hostStatus: 'idle',
        capabilities: capabilityMatrix('codex_thread'), lease: null, parentRuntimeId: null, kanbanTaskId: null, createdAt: 1, updatedAt: 2,
      },
    ])
    const response = await (await getHandler())({ request: new Request(`http://localhost/api/runtime-runs?project=${longProject}`) })
    const body = await response.json()
    expect(body.page.total).toBe(1)
    expect(body.runs).toEqual([expect.objectContaining({ id: 'codex:long', project: longProject })])
  })

  it('returns a bounded typed error for registry corruption without leaking the raw error', async () => {
    mocks.list.mockImplementation(() => { throw new Error('Provider runtime registry is corrupt at C:/secret/path') })
    const response = await (await getHandler())({ request: new Request('http://localhost/api/runtime-runs') })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({ ok: false, error: 'Provider runtime inventory is unavailable' })
    expect(JSON.stringify(body)).not.toContain('C:/secret/path')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
