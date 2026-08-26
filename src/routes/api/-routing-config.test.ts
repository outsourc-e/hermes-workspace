import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: unknown) => opts,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

vi.mock('../../server/gateway-capabilities', () => ({
  ensureGatewayProbed: vi.fn(),
  getCapabilities: () => ({ config: true }),
}))

vi.mock('../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  getDiscoveryStatus: () => [],
  getDiscoveredModels: () => [],
}))

let tmpHome = ''
const savedEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-config-test-'))
  setEnv('HERMES_HOME', tmpHome)
  setEnv('CLAUDE_HOME', undefined)
  vi.resetModules()
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(savedEnv)) delete savedEnv[key]
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function loadHandlers() {
  const mod = await import('./hermes-config')
  return (mod as unknown as { Route: { server: { handlers: Record<string, (r: { request: Request }) => Promise<Response>> } } }).Route.server.handlers
}

// ── GET — routingConfig included in response ──────────────────────────────────

describe('GET /api/hermes-config — routingConfig field', () => {
  it('includes routingConfig with defaults when no routing block exists', async () => {
    const handlers = await loadHandlers()
    const res = await handlers.GET({ request: new Request('http://localhost/api/hermes-config') })
    const body = await res.json() as Record<string, unknown>

    expect(body.routingConfig).toBeDefined()
    const rc = body.routingConfig as Record<string, unknown>
    expect(rc.enabled).toBe(false)
    expect(rc.default_provider).toBe('anthropic')
    expect(rc.default_model).toBe('claude-sonnet-4-6')
    const esc = rc.escalation as Record<string, unknown>
    expect(esc.opus_threshold).toBe(0.75)
    expect(esc.daily_opus_budget_usd).toBe(5.0)
    expect(rc.pool).toEqual([])
    expect(rc.policy).toEqual([])
  })

  it('reflects persisted routing block when config.yaml has one', async () => {
    fs.writeFileSync(
      path.join(tmpHome, 'config.yaml'),
      YAML.stringify({ routing: { enabled: true, default_provider: 'openai', default_model: 'gpt-5.4' } }),
      'utf-8',
    )
    const handlers = await loadHandlers()
    const res = await handlers.GET({ request: new Request('http://localhost/api/hermes-config') })
    const body = await res.json() as Record<string, unknown>
    const rc = body.routingConfig as Record<string, unknown>

    expect(rc.enabled).toBe(true)
    expect(rc.default_provider).toBe('openai')
    expect(rc.default_model).toBe('gpt-5.4')
  })
})

// ── PATCH set-routing-config ──────────────────────────────────────────────────

describe('PATCH /api/hermes-config — set-routing-config action', () => {
  it('writes a routing block to a fresh config.yaml', async () => {
    const handlers = await loadHandlers()
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set-routing-config',
          routing: { enabled: true, default_model: 'claude-sonnet-4-6' },
        }),
      }),
    })
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.message).toBe('Routing configuration saved.')

    const onDisk = YAML.parse(fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8')) as Record<string, unknown>
    const routing = onDisk.routing as Record<string, unknown>
    expect(routing.enabled).toBe(true)
    expect(routing.default_model).toBe('claude-sonnet-4-6')
  })

  it('merges over an existing routing block without losing other keys', async () => {
    fs.writeFileSync(
      path.join(tmpHome, 'config.yaml'),
      YAML.stringify({ routing: { enabled: false, default_provider: 'anthropic' }, provider: 'anthropic' }),
      'utf-8',
    )
    const handlers = await loadHandlers()
    await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-routing-config', routing: { enabled: true } }),
      }),
    })
    const onDisk = YAML.parse(fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8')) as Record<string, unknown>
    const routing = onDisk.routing as Record<string, unknown>

    expect(routing.enabled).toBe(true)
    expect(routing.default_provider).toBe('anthropic')
    expect(onDisk.provider).toBe('anthropic')
  })

  it('saves escalation block correctly', async () => {
    const handlers = await loadHandlers()
    await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set-routing-config',
          routing: { escalation: { opus_threshold: 0.9, daily_opus_budget_usd: 10.0 } },
        }),
      }),
    })
    const onDisk = YAML.parse(fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8')) as Record<string, unknown>
    const esc = (onDisk.routing as Record<string, unknown>).escalation as Record<string, unknown>
    expect(esc.opus_threshold).toBe(0.9)
    expect(esc.daily_opus_budget_usd).toBe(10.0)
  })

  it('rejects missing routing field with 400', async () => {
    const handlers = await loadHandlers()
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-routing-config' }),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 503 when gateway capability is unavailable', async () => {
    vi.doMock('../../server/gateway-capabilities', () => ({
      ensureGatewayProbed: vi.fn(),
      getCapabilities: () => ({ config: false }),
    }))
    const handlers = await loadHandlers()
    const res = await handlers.PATCH({
      request: new Request('http://localhost/api/hermes-config', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-routing-config', routing: { enabled: true } }),
      }),
    })
    expect(res.status).toBe(503)
    vi.doUnmock('../../server/gateway-capabilities')
  })
})
