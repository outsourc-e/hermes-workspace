import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

const { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, gatewayCapabilities, requireLocalOrAuth, loadSubscriptionCatalog } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  mkdirSync: vi.fn().mockImplementation(() => {}),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
  readdirSync: vi.fn().mockReturnValue([]),
  gatewayCapabilities: { models: false },
  requireLocalOrAuth: vi.fn(() => true),
  loadSubscriptionCatalog: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync },
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('@tanstack/react-start', () => ({
  json: (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      ...(init || {}),
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    }),
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
  requireLocalOrAuth,
}))

vi.mock('../../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  CLAUDE_API: 'http://127.0.0.1:8642',
}))

vi.mock('../../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: () => gatewayCapabilities,
}))

vi.mock('../../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  getDiscoveredModels: () => [],
  ensureProviderInConfig: () => false,
}))

vi.mock('../../../server/subscription-model-catalog', () => ({
  loadSubscriptionCatalog,
}))

beforeEach(() => {
  vi.clearAllMocks()
  gatewayCapabilities.models = false
  requireLocalOrAuth.mockReturnValue(true)
  loadSubscriptionCatalog.mockResolvedValue({
    generatedAt: new Date(0).toISOString(),
    subscriptionOnly: true,
    models: [],
    transports: [],
  })
  vi.unstubAllGlobals()
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_HOME
})

describe('models route', () => {
  it('rejects requests outside the local-or-auth boundary before probing providers', async () => {
    requireLocalOrAuth.mockReturnValue(false)
    const get = await getHandler()
    const res = await get({
      request: new Request('http://workspace.example/api/models'),
    })

    expect(requireLocalOrAuth).toHaveBeenCalledOnce()
    expect(res.status).toBe(401)
  })

  it('enriches duplicate model entries with later subscription status metadata', async () => {
    const { mergeModelEntries, subscriptionModelToEntry } = await import('../models')

    expect(
      mergeModelEntries(
        [{ id: 'claude-gp/sonnet', name: 'claude-gp/sonnet' }],
        [
          subscriptionModelToEntry({
            id: 'claude-gp/sonnet',
            name: 'claude-gp/sonnet',
            provider: 'claude-gp',
            status: 'quota_limited',
            warning: 'Monthly allocation exhausted',
          }),
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'claude-gp/sonnet',
        availability: 'quota_limited',
        warning: 'Monthly allocation exhausted',
      }),
    ])
  })

  async function importModels() {
    vi.resetModules()
    const mod = await import('../models')
    return mod
  }

  async function getHandler() {
    const mod = await importModels()
    const get = (mod as any).Route.server.handlers.GET
    return get
  }

  it('GET returns ok:true and empty models without config', async () => {
    const get = await getHandler()
    expect(typeof get).toBe('function')
    const request = new Request('http://localhost/api/models')
    const res = await get({ request })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data).toEqual([])
  })

  it('redacts arbitrary provider errors from the client response', async () => {
    const rawError = 'provider diagnostic secret-model-token'
    loadSubscriptionCatalog.mockRejectedValueOnce(new Error(rawError))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const get = await getHandler()
    const res = await get({
      request: new Request('http://localhost/api/models'),
    })

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: 'Model catalog unavailable.' })
    expect(JSON.stringify(body)).not.toContain(rawError)
    expect(errorSpy).toHaveBeenCalledWith(
      '[models] request failed',
      expect.any(Error),
    )
  })

  it('keeps catalogs available when gateway model discovery rejects authentication', async () => {
    gatewayCapabilities.models = true
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    const get = await getHandler()
    const res = await get({ request: new Request('http://localhost/api/models') })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('reads default model from CLAUDE_HOME config using YAML.parse', async () => {
    const envHome = '/mock/profiles/jarvis'
    process.env.CLAUDE_HOME = envHome

    const configYaml = 'model: jarvis-model\nprovider: nous\n'
    const modelsJson = '[{"model":"x","provider":"y"}]'
    existsSync.mockImplementation((p: string) => {
      return p === path.join(envHome, 'models.json') || p === path.join(envHome, 'config.yaml')
    })
    readFileSync.mockImplementation((p: string) => {
      if (p === path.join(envHome, 'config.yaml')) return configYaml
      if (p === path.join(envHome, 'models.json')) return modelsJson
      return ''
    })

    const get = await getHandler()
    const request = new Request('http://localhost/api/models')
    const res = await get({ request })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.models[0].id).toBe('jarvis-model')
    expect(json.models[0].provider).toBe('nous')
  })

  it('reads nested model object syntax from config using YAML.parse', async () => {
    const envHome = '/mock/profiles/jarvis'
    process.env.CLAUDE_HOME = envHome

    const configYaml = 'model:\n  default: nest-model\n  provider: anthropic\n'
    existsSync.mockImplementation((p: string) => p === path.join(envHome, 'config.yaml'))
    readFileSync.mockImplementation((p: string) => {
      if (p === path.join(envHome, 'config.yaml')) return configYaml
      return ''
    })

    const get = await getHandler()
    const request = new Request('http://localhost/api/models')
    const res = await get({ request })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.models[0].id).toBe('nest-model')
    expect(json.models[0].provider).toBe('anthropic')
  })
})
