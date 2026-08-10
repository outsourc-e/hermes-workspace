import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gatewayState = vi.hoisted(() => ({ config: true, local: true }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

vi.mock('../../server/gateway-capabilities', () => ({
  ensureGatewayProbed: vi.fn(),
  getCapabilities: () => ({ config: gatewayState.config }),
  isLocalhostDeployment: () => gatewayState.local,
}))

vi.mock('../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  getDiscoveryStatus: () => [],
  getDiscoveredModels: () => [],
}))

let tmpHome = ''
const originalEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in originalEnv)) originalEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  gatewayState.config = true
  gatewayState.local = true
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-route-'))
  setEnv('HERMES_HOME', tmpHome)
  setEnv('CLAUDE_HOME', undefined)
  vi.resetModules()
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(originalEnv)) delete originalEnv[key]
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function loadHandlers(modulePath: string) {
  const mod = await import(modulePath)
  return (mod as any).Route.server.handlers
}

describe('canonical /api/hermes-config route', () => {
  it('GET returns normalized provider state with paths and active provider', async () => {
    fs.writeFileSync(
      path.join(tmpHome, 'config.yaml'),
      'provider: openrouter\nmodel: auto\n',
      'utf-8',
    )
    fs.writeFileSync(
      path.join(tmpHome, '.env'),
      'OPENROUTER_API_KEY=sk-test-1234\n',
      'utf-8',
    )

    const handlers = await loadHandlers('./hermes-config')
    const res = await handlers.GET({
      request: new Request('http://localhost/api/hermes-config'),
    })
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.activeProvider).toBe('openrouter')
    expect(body.activeModel).toBe('auto')
    expect(body.paths.hermesHome).toBe(tmpHome)
    const openrouter = body.providers.find((p: any) => p.id === 'openrouter')
    expect(openrouter.configured).toBe(true)
    expect(openrouter.isDefault).toBe(true)
  })

  it('PATCH dispatches set-default-model and returns the action message', async () => {
    const handlers = await loadHandlers('./hermes-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set-default-model',
          providerId: 'openai-codex',
          modelId: 'gpt-5.6-sol',
        }),
      }),
    })
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, message: 'Default model updated.' })
    expect(
      fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8'),
    ).toMatch(/provider: openai-codex/)
  })

  it('PATCH rejects OpenRouter action writes without touching config', async () => {
    const handlers = await loadHandlers('./hermes-config')
    for (const payload of [
      {
        action: 'set-default-model',
        providerId: 'OpenRouter',
        modelId: 'anthropic/claude-opus',
      },
      {
        action: 'set-custom-provider',
        provider: {
          name: 'gateway',
          baseUrl: 'https://openrouter.ai/api/v1',
        },
      },
      {
        action: 'set-custom-provider',
        provider: {
          name: 'gateway-fqdn',
          baseUrl: 'https://openrouter.ai./api/v1',
        },
      },
      {
        action: 'set-custom-provider',
        provider: {
          name: 'gateway-schemeless',
          baseUrl: 'openrouter.ai/api/v1',
        },
      },
      {
        action: 'set-custom-provider',
        provider: {
          name: 'gateway-missing-slashes',
          baseUrl: 'https:openrouter.ai/api/v1',
        },
      },
      {
        action: 'set-custom-provider',
        provider: {
          name: 'gateway-one-slash',
          baseUrl: 'https:/openrouter.ai/api/v1',
        },
      },
      {
        action: 'set-custom-provider',
        provider: {
          name: 'gateway-backslash',
          baseUrl: 'https:\\openrouter.ai/api/v1',
        },
      },
    ]) {
      const res = await handlers.PATCH({
        request: new Request('http://localhost/api/hermes-config', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      })
      expect(res.status).toBe(400)
    }
    expect(fs.existsSync(path.join(tmpHome, 'config.yaml'))).toBe(false)
  })

  it('PATCH rejects OpenRouter assignments in the legacy config body', async () => {
    const handlers = await loadHandlers('./claude-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/claude-config', {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            provider: 'openrouter',
            model: 'openrouter/anthropic/claude-opus',
          },
        }),
      }),
    })

    expect(res.status).toBe(400)
    expect(fs.existsSync(path.join(tmpHome, 'config.yaml'))).toBe(false)
  })

  it('PATCH rejects a schemeless OpenRouter URL in the legacy config body', async () => {
    const handlers = await loadHandlers('./claude-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/claude-config', {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            custom_providers: [
              { name: 'gateway', base_url: 'api.openrouter.ai/v1' },
            ],
          },
        }),
      }),
    })

    expect(res.status).toBe(400)
    expect(fs.existsSync(path.join(tmpHome, 'config.yaml'))).toBe(false)
  })

  it('PATCH allows benign OpenRouter text outside routing fields', async () => {
    const handlers = await loadHandlers('./claude-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/claude-config', {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            agent: {
              system_prompt: 'openrouter/example must not be used as a fallback.',
            },
          },
        }),
      }),
    })

    expect(res.status).toBe(200)
  })

  it('PATCH rejects prototype-polluting legacy config keys', async () => {
    const handlers = await loadHandlers('./claude-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/claude-config', {
        method: 'PATCH',
        body: '{"config":{"memory":{"__proto__":{"confirmApiBilling":true}}}}',
      }),
    })

    expect(res.status).toBe(400)
    expect(({} as { confirmApiBilling?: boolean }).confirmApiBilling).toBeUndefined()
    expect(fs.existsSync(path.join(tmpHome, 'config.yaml'))).toBe(false)
  })

  it('PATCH legacy { config } body deep-merges and preserves siblings', async () => {
    fs.writeFileSync(
      path.join(tmpHome, 'config.yaml'),
      'memory:\n  user_profile_enabled: true\n',
      'utf-8',
    )

    const handlers = await loadHandlers('./hermes-config')
    await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({ config: { memory: { memory_enabled: true } } }),
      }),
    })

    const onDisk = fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8')
    expect(onDisk).toContain('memory_enabled: true')
    expect(onDisk).toContain('user_profile_enabled: true')
  })

  it('PATCH rejects malformed action bodies with 400', async () => {
    const handlers = await loadHandlers('./hermes-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-default-model' }),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('PATCH returns 503 when the gateway capability is unavailable', async () => {
    gatewayState.config = false
    gatewayState.local = false
    const handlers = await loadHandlers('./hermes-config')
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-api-key', envKey: 'X', value: 'y' }),
      }),
    })
    expect(res.status).toBe(503)
  })

  it('GET uses the local Hermes config when the loopback gateway lacks config endpoints', async () => {
    gatewayState.config = false
    gatewayState.local = true
    fs.writeFileSync(
      path.join(tmpHome, 'config.yaml'),
      'provider: custom\nmodel: claude-cwm4tx/sonnet\n',
      'utf-8',
    )

    const handlers = await loadHandlers('./hermes-config')
    const res = await handlers.GET({
      request: new Request('http://localhost/api/hermes-config'),
    })
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.activeProvider).toBe('custom')
    expect(body.activeModel).toBe('claude-cwm4tx/sonnet')
  })
})

describe('legacy /api/claude-config alias', () => {
  it('GET aliases provider.maskedCredentials to provider.maskedKeys for the legacy /settings page', async () => {
    fs.writeFileSync(
      path.join(tmpHome, '.env'),
      'OPENROUTER_API_KEY=sk-test-1234\n',
      'utf-8',
    )

    const handlers = await loadHandlers('./claude-config')
    const res = await handlers.GET({
      request: new Request('http://localhost/api/claude-config'),
    })
    const body = await res.json()
    const openrouter = body.providers.find((p: any) => p.id === 'openrouter')

    expect(openrouter.maskedKeys).toEqual(openrouter.maskedCredentials)
    expect(openrouter.maskedKeys.OPENROUTER_API_KEY).toBeTruthy()
  })
})
