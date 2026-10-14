import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  getGatewayCapabilities: () => ({ models: false }),
}))

vi.mock('../../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  getDiscoveredModels: () => [],
  ensureProviderInConfig: () => false,
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_HOME
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

  async function getConfigModels(configYaml: string, modelsJson?: string) {
    const envHome = '/mock/profiles/catalog'
    process.env.HERMES_HOME = envHome
    existsSync.mockImplementation(
      (p: string) =>
        p === `${envHome}/config.yaml` ||
        (modelsJson !== undefined && p === `${envHome}/models.json`),
    )
    readFileSync.mockImplementation((p: string) => {
      if (p === `${envHome}/config.yaml`) return configYaml
      if (p === `${envHome}/models.json`) return modelsJson ?? ''
      return ''
    })
    const get = await getHandler()
    const res = await get({
      request: new Request('http://localhost/api/models'),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(body.models)
    return body
  }

  it('reads dictionary model IDs with metadata and provider grouping', async () => {
    const body = await getConfigModels(`
providers:
  llama.cpp:
    default_model: Qwen3.6-35B
    models:
      Qwen3.6-35B:
        context_length: 262144
      Qwen3.8-Flash-Next:
        id: ignored-metadata-id
        name: Qwen Flash
        context_length: 524288
        max_tokens: 8192
      " padded-model ": {}
      empty-metadata:
  another-provider:
    models:
      other-model: {}
`)
    expect(body.models).toEqual([
      {
        id: 'Qwen3.6-35B',
        name: 'Qwen3.6-35B',
        provider: 'llama.cpp',
        context_length: 262144,
      },
      {
        id: 'Qwen3.8-Flash-Next',
        name: 'Qwen Flash',
        provider: 'llama.cpp',
        context_length: 524288,
        max_tokens: 8192,
      },
      { id: 'padded-model', name: 'padded-model', provider: 'llama.cpp' },
      { id: 'empty-metadata', name: 'empty-metadata', provider: 'llama.cpp' },
      { id: 'other-model', name: 'other-model', provider: 'another-provider' },
    ])
    expect(body.configuredProviders).toEqual(['llama.cpp', 'another-provider'])
  })

  it('preserves legacy string and object arrays alongside dictionaries', async () => {
    const body = await getConfigModels(`
providers:
  legacy:
    models:
      - " string-model "
      - id: id-model
        name: Display name
        provider: explicit-provider
      - model: model-field
      - name: name-field
      - ""
      - null
      - 42
      - {}
      - string-model
  modern:
    models:
      dict-model: {}
`)
    expect(body.models).toEqual([
      { id: 'string-model', name: 'string-model', provider: 'legacy' },
      { id: 'id-model', name: 'Display name', provider: 'explicit-provider' },
      { id: 'model-field', name: 'model-field', provider: 'legacy' },
      { id: 'name-field', name: 'name-field', provider: 'legacy' },
      { id: 'dict-model', name: 'dict-model', provider: 'modern' },
    ])
  })

  it.each(['default_model', 'model', 'default'])(
    'includes the provider %s even without a model list',
    async (field) => {
      const body = await getConfigModels(
        `providers:\n  custom:\n    ${field}: " default-only "\n`,
      )
      expect(body.models).toEqual([
        { id: 'default-only', name: 'default-only', provider: 'custom' },
      ])
    },
  )

  it('prefers default_model over the legacy provider default fields', async () => {
    const body = await getConfigModels(`
providers:
  custom:
    default_model: current-default
    model: old-model
    default: old-default
`)
    expect(body.models).toEqual([
      { id: 'current-default', name: 'current-default', provider: 'custom' },
    ])
  })

  it('ignores blank dictionary IDs and tolerates malformed provider blocks', async () => {
    const body = await getConfigModels(`
providers:
  missing:
  invalid: 42
  invalid-models:
    models: false
  valid:
    default_model: " "
    model: fallback
    models:
      " ": {name: ignored}
      valid-model: {}
`)
    expect(body.models).toEqual([
      { id: 'valid-model', name: 'valid-model', provider: 'valid' },
      { id: 'fallback', name: 'fallback', provider: 'valid' },
    ])
  })

  it('merges the catalog with models.json, top-level defaults and aliases without duplicates', async () => {
    const body = await getConfigModels(
      `
model:
  default: top-default
  provider: custom
providers:
  custom:
    default_model: listed
    models:
      top-default: {}
      listed: {}
      additional: {}
model_aliases:
  fast: custom/additional
`,
      '[{"model":"listed","name":"Existing name","provider":"custom"}]',
    )
    expect(body.models).toEqual([
      { id: 'top-default', name: 'top-default', provider: 'custom' },
      { id: 'listed', name: 'Existing name', provider: 'custom' },
      { id: 'additional', name: 'additional', provider: 'custom' },
      {
        id: 'fast',
        name: 'fast → custom/additional',
        provider: 'custom',
        alias: true,
        target: 'custom/additional',
      },
    ])
  })
})
