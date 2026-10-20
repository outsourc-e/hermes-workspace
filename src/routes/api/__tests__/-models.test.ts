import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getGatewayCapabilities } from '../../../server/claude-api'
import path from 'node:path'

const { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  mkdirSync: vi.fn().mockImplementation(() => {}),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
  readdirSync: vi.fn().mockReturnValue([]),
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
}))

vi.mock('../../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  CLAUDE_API: 'http://127.0.0.1:8642',
}))

vi.mock('../../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: vi.fn(() => ({ models: false })),
}))

vi.mock('../../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  getDiscoveredModels: () => [],
  ensureProviderInConfig: () => false,
}))

beforeEach(() => {
  vi.clearAllMocks()
  existsSync.mockReturnValue(false)
  readFileSync.mockReturnValue('')
  vi.mocked(getGatewayCapabilities).mockReturnValue({ models: false } as any)
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_HOME
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('models route', () => {
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

  it('refreshes the ordinary catalog while preserving saved defaults and custom models', async () => {
    process.env.HERMES_HOME = '/mock/minimax'
    existsSync.mockImplementation((p: string) => p.startsWith('/mock/minimax/'))
    readFileSync.mockImplementation((p: string) => p.endsWith('config.yaml')
      ? 'model:\n  provider: minimax\n  default: MiniMax-M2.7\n'
      : '[{"model":"MiniMax-M2.5","provider":"minimax"},{"model":"custom/model","provider":"custom"}]')
    vi.mocked(getGatewayCapabilities).mockReturnValue({ models: true } as any)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [
      { id: 'MiniMax-M2.7', provider: 'minimax' },
      { id: 'MiniMax-M2.5', provider: 'minimax' },
      { id: 'MiniMax-M2.1', provider: 'minimax' },
      { id: 'MiniMax-M3', provider: 'minimax' },
      { id: 'speech-02-hd', provider: 'minimax' },
    ] })))
    const get = await getHandler()
    const response = await get({ request: new Request('http://localhost/api/models') })
    const payload = await response.json()
    expect(payload.models.map((model: { id: string }) => model.id)).toEqual([
      'MiniMax-M2.7', 'MiniMax-M2.5', 'custom/model',
      'MiniMax-M3.1-Flash', 'MiniMax-M3', 'speech-02-hd',
    ])
    expect(writeFileSync).not.toHaveBeenCalled()
    vi.mocked(getGatewayCapabilities).mockReturnValue({ models: false } as any)
  })

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

  it('reads default model from CLAUDE_HOME config using YAML.parse', async () => {
    const envHome = '/mock/profiles/jarvis'
    process.env.CLAUDE_HOME = envHome

    const configYaml = 'model: jarvis-model\nprovider: nous\n'
    const modelsJson = '[{"model":"x","provider":"y"}]'
    existsSync.mockImplementation((p: string) => {
      return p === `${envHome}/models.json` || p === `${envHome}/config.yaml`
    })
    readFileSync.mockImplementation((p: string) => {
      if (p === `${envHome}/config.yaml`) return configYaml
      if (p === `${envHome}/models.json`) return modelsJson
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
    existsSync.mockImplementation((p: string) => p === `${envHome}/config.yaml`)
    readFileSync.mockImplementation((p: string) => {
      if (p === `${envHome}/config.yaml`) return configYaml
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
