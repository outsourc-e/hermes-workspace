import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VALID_SEED = {
  version: 1,
  presets: [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Read repos via the GitHub MCP server.',
      category: 'Official Presets',
      template: {
        name: 'github',
        transportType: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      },
    },
  ],
}

let homeDir: string
let seedFile: string
const originalHermesHome = process.env.HERMES_HOME
const originalSeedPath = process.env.MCP_PRESETS_SEED_PATH
const originalPassword = process.env.CLAUDE_PASSWORD

interface PresetsRouteModule {
  Route: {
    server: {
      handlers: { GET: (ctx: { request: Request }) => Promise<Response> }
    }
  }
}

async function loadRoute(): Promise<PresetsRouteModule> {
  vi.doMock('@tanstack/react-router', () => ({
    createFileRoute: () => (cfg: unknown) => cfg,
  }))
  return (await import('./presets')) as unknown as PresetsRouteModule
}

beforeEach(() => {
  vi.resetModules()
  homeDir = mkdtempSync(join(tmpdir(), 'hermes-presets-route-'))
  const assetDir = mkdtempSync(join(tmpdir(), 'hermes-seed-route-'))
  seedFile = join(assetDir, 'mcp-presets.seed.json')
  writeFileSync(seedFile, JSON.stringify(VALID_SEED))
  process.env.HERMES_HOME = homeDir
  process.env.MCP_PRESETS_SEED_PATH = seedFile
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  if (originalSeedPath === undefined) delete process.env.MCP_PRESETS_SEED_PATH
  else process.env.MCP_PRESETS_SEED_PATH = originalSeedPath
  if (originalPassword === undefined) delete process.env.CLAUDE_PASSWORD
  else process.env.CLAUDE_PASSWORD = originalPassword
  rmSync(homeDir, { recursive: true, force: true })
})

describe('GET /api/mcp/presets', () => {
  it('returns 401 when password protection is enabled and no auth cookie is present', async () => {
    process.env.CLAUDE_PASSWORD = 'guard'
    const mod = await loadRoute()
    const res = await mod.Route.server.handlers.GET({
      request: new Request('http://localhost/api/mcp/presets'),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 200 with seeded presets when no user file exists', async () => {
    delete process.env.CLAUDE_PASSWORD
    const mod = await loadRoute()
    const res = await mod.Route.server.handlers.GET({
      request: new Request('http://localhost/api/mcp/presets'),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      presets: Array<{ id: string }>
      source: string
    }
    expect(body.ok).toBe(true)
    expect(body.source).toBe('seed')
    expect(body.presets.map((p) => p.id)).toEqual(['github'])
  })

  it('returns 200 with source=invalid + error fields when user file is malformed', async () => {
    delete process.env.CLAUDE_PASSWORD
    writeFileSync(join(homeDir, 'mcp-presets.json'), '{not valid json')
    const mod = await loadRoute()
    const res = await mod.Route.server.handlers.GET({
      request: new Request('http://localhost/api/mcp/presets'),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      source: string
      error?: string
      errorPath?: string
      validationErrors?: Array<{ path: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.source).toBe('invalid')
    expect(body.error).toBeTruthy()
    expect(body.errorPath).toBe(join(homeDir, 'mcp-presets.json'))
    expect((body.validationErrors ?? []).length).toBeGreaterThan(0)
  })
})
