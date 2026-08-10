import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireLocalOrAuth: vi.fn(() => true),
  createProfile: vi.fn(() => ({ config: {} })),
  readProfile: vi.fn(() => ({ config: {} })),
  updateProfileConfig: vi.fn(
    (_name: string, patch: Record<string, unknown>) => ({
      config: patch,
    }),
  ),
  loadSubscriptionCatalog: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (options: unknown) => options,
}))
vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(() => true),
  requireLocalOrAuth: mocks.requireLocalOrAuth,
}))
vi.mock('../../../server/profiles-browser', () => ({
  createProfile: mocks.createProfile,
  readProfile: mocks.readProfile,
  updateProfileConfig: mocks.updateProfileConfig,
}))
vi.mock('../../../server/subscription-model-catalog', async () => {
  const actual = await vi.importActual(
    '../../../server/subscription-model-catalog',
  )
  return { ...actual, loadSubscriptionCatalog: mocks.loadSubscriptionCatalog }
})

function catalog() {
  return {
    generatedAt: new Date(0).toISOString(),
    subscriptionOnly: true,
    transports: [],
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
        capabilities: {
          contextWindow: 1_050_000,
          maxInputTokens: 922_000,
          maxOutputTokens: 128_000,
          supportsReasoning: true,
          supportsTools: true,
          supportsVision: true,
          supportsOutputTokenLimit: false,
          reasoningEfforts: ['provider_default', 'low', 'high'],
          metadataSource: 'models.dev',
        },
      },
      {
        id: 'nous/google/gemini-3.1-pro-preview',
        provider: 'nous',
        account: 'nous',
        model: 'google/gemini-3.1-pro-preview',
        transport: 'nous-oauth',
        billingClass: 'subscription_unknown',
        status: 'available',
        selectable: true,
        warning: '',
        resetAt: null,
        capabilities: {
          contextWindow: 1_048_576,
          maxInputTokens: null,
          maxOutputTokens: 65_536,
          supportsReasoning: true,
          supportsTools: true,
          supportsVision: true,
          supportsOutputTokenLimit: true,
          reasoningEfforts: ['provider_default', 'low', 'high'],
          metadataSource: 'models.dev',
        },
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireLocalOrAuth.mockReturnValue(true)
  mocks.loadSubscriptionCatalog.mockResolvedValue(catalog())
  mocks.readProfile.mockReturnValue({ config: {} })
})

async function createHandler() {
  const module = await import('./create')
  return (module as any).Route.server.handlers.POST
}

async function updateHandler() {
  const module = await import('./update')
  return (module as any).Route.server.handlers.POST
}

describe('Operations profile model mutations', () => {
  it('denies profile creation before loading catalogs or touching disk', async () => {
    mocks.requireLocalOrAuth.mockReturnValue(false)
    const response = await (
      await createHandler()
    )({
      request: new Request('http://workspace.example/api/profiles/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'worker' }),
      }),
    })

    expect(response.status).toBe(401)
    expect(mocks.loadSubscriptionCatalog).not.toHaveBeenCalled()
    expect(mocks.createProfile).not.toHaveBeenCalled()
  })

  it('creates a profile with an executable canonical model selection', async () => {
    const response = await (
      await createHandler()
    )({
      request: new Request('http://localhost/api/profiles/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'worker',
          modelSelection: {
            routeRef: 'nous/google/gemini-3.1-pro-preview',
            reasoningEffort: 'high',
            maxOutputTokens: 32768,
          },
        }),
      }),
    })

    expect(response.status).toBe(200)
    expect(mocks.createProfile).toHaveBeenCalledWith('worker', {
      cloneFrom: undefined,
    })
    expect(mocks.updateProfileConfig).toHaveBeenCalledWith(
      'worker',
      expect.objectContaining({
        model: {
          provider: 'nous',
          default: 'google/gemini-3.1-pro-preview',
          max_tokens: 32768,
        },
        agent: { reasoning_effort: 'high' },
        workspace: { route_ref: 'nous/google/gemini-3.1-pro-preview' },
      }),
    )
  })

  it('updates only allowlisted profile fields with canonical selection', async () => {
    const response = await (
      await updateHandler()
    )({
      request: new Request('http://localhost/api/profiles/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'worker',
          patch: { system_prompt: 'Safe prompt', arbitrary: 'blocked' },
          modelSelection: {
            routeRef: 'openai-codex/gpt-5.6-sol',
            reasoningEffort: 'low',
          },
        }),
      }),
    })

    expect(response.status).toBe(200)
    expect(mocks.updateProfileConfig).toHaveBeenCalledWith('worker', {
      system_prompt: 'Safe prompt',
      model: { provider: 'openai-codex', default: 'gpt-5.6-sol', openai_runtime: 'hermes_default' },
      agent: { reasoning_effort: 'low' },
      workspace: { route_ref: 'openai-codex/gpt-5.6-sol', codex_runtime: 'hermes_default' },
    })
  })
})
