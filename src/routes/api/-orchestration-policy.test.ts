import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => true),
  requireLocalOrAuth: vi.fn(() => true),
}))
const catalogMocks = vi.hoisted(() => ({
  loadSubscriptionCatalog: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => authMocks)
vi.mock('../../server/subscription-model-catalog', () => catalogMocks)

let stateDir = ''
const previousStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
const previousHermesHome = process.env.HERMES_HOME

const catalog = {
  generatedAt: '2026-08-10T00:00:00.000Z',
  subscriptionOnly: true,
  transports: [],
  visibility: { showNousModels: false, showApiBilledModels: false },
  models: [
    {
      id: 'openai-codex/gpt-5.6-sol',
      provider: 'openai-codex',
      account: 'openai-codex',
      model: 'gpt-5.6-sol',
      transport: 'openai-codex-oauth',
      billingClass: 'subscription_included',
      status: 'available',
      selectable: true,
      warning: '',
      resetAt: null,
    },
  ],
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'workspace-orchestration-route-'))
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
  process.env.HERMES_HOME = join(stateDir, 'hermes-home')
  vi.resetModules()
  authMocks.isAuthenticated.mockReturnValue(true)
  authMocks.requireLocalOrAuth.mockReturnValue(true)
  catalogMocks.loadSubscriptionCatalog.mockResolvedValue(catalog)
  vi.clearAllMocks()
})

afterEach(() => {
  if (previousStateDir === undefined)
    delete process.env.HERMES_WORKSPACE_STATE_DIR
  else process.env.HERMES_WORKSPACE_STATE_DIR = previousStateDir
  if (previousHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = previousHermesHome
  rmSync(stateDir, { recursive: true, force: true })
})

async function handlers() {
  const module = await import('./orchestration-policy')
  return (module as any).Route.server.handlers
}

describe('/api/orchestration-policy', () => {
  it('rejects policy mutations denied by the local-or-auth boundary', async () => {
    authMocks.requireLocalOrAuth.mockReturnValue(false)
    const route = await handlers()
    const response = await route.PATCH({
      request: new Request(
        'http://workspace.example/api/orchestration-policy',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'global',
            patch: { billing: { allowApiBilledModels: true } },
            confirmApiBilling: true,
          }),
        },
      ),
    })

    expect(authMocks.requireLocalOrAuth).toHaveBeenCalledOnce()
    expect(response.status).toBe(401)
  })

  it('returns global defaults and effective session policy', async () => {
    const route = await handlers()
    const response = await route.GET({
      request: new Request(
        'http://localhost/api/orchestration-policy?sessionKey=s1',
      ),
    })
    const body = await response.json()

    expect(body.ok).toBe(true)
    expect(body.global.memory.childWriteReview).toBe('parent_queue')
    expect(body.effective.context.overflow).toBe('auto_compact_notify')
  })

  it('saves global and per-session policies', async () => {
    const route = await handlers()
    const globalResponse = await route.PATCH({
      request: new Request('http://localhost/api/orchestration-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          patch: { defaultSubagentModelRef: 'openai-codex/gpt-5.6-sol' },
        }),
      }),
    })
    expect(globalResponse.status).toBe(200)

    const sessionResponse = await route.PATCH({
      request: new Request('http://localhost/api/orchestration-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'session',
          sessionKey: 's1',
          patch: { routingMode: 'automatic' },
        }),
      }),
    })
    const body = await sessionResponse.json()
    expect(body.policy.defaultSubagentModelRef).toBe('openai-codex/gpt-5.6-sol')
    expect(body.policy.routingMode).toBe('automatic')
  })

  it('requires explicit API-billing confirmation', async () => {
    const route = await handlers()
    const response = await route.PATCH({
      request: new Request('http://localhost/api/orchestration-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          patch: { billing: { allowApiBilledModels: true } },
        }),
      }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects unknown and case-varied OpenRouter model assignments without mutating policy', async () => {
    const route = await handlers()
    for (const modelRef of [
      'unknown/model',
      'OpenRouter/anthropic/claude-opus-5',
    ]) {
      const response = await route.PATCH({
        request: new Request('http://localhost/api/orchestration-policy', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'global',
            patch: { orchestratorModelRef: modelRef },
          }),
        }),
      })
      expect(response.status).toBe(400)
    }

    const response = await route.GET({
      request: new Request('http://localhost/api/orchestration-policy'),
    })
    expect((await response.json()).global.orchestratorModelRef).toBe('')
  })
})
