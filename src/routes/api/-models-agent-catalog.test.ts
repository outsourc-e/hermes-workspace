import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (cfg: unknown) => cfg,
}))
vi.mock('@tanstack/react-start', () => ({
  json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
}))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: () => ({ models: false }),
}))
vi.mock('../../server/local-provider-discovery', () => ({
  ensureDiscovery: vi.fn(),
  ensureProviderInConfig: vi.fn(),
  getDiscoveredModels: () => [],
}))

import { readAgentModelCatalog } from './models'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hermes-model-catalog-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeCatalog(payload: unknown): string {
  const p = join(dir, 'model_catalog.json')
  writeFileSync(p, typeof payload === 'string' ? payload : JSON.stringify(payload))
  return p
}

describe('readAgentModelCatalog', () => {
  it('flattens providers.*.models into provider-tagged entries', () => {
    const p = writeCatalog({
      version: 1,
      providers: {
        openrouter: {
          metadata: { display_name: 'OpenRouter' },
          models: [
            { id: 'anthropic/claude-fable-5', description: '' },
            { id: 'anthropic/claude-opus-4.8' },
          ],
        },
        nous: { models: [{ id: 'anthropic/claude-sonnet-5' }] },
      },
    })
    const models = readAgentModelCatalog(p)
    expect(models).toEqual([
      { id: 'anthropic/claude-fable-5', name: 'anthropic/claude-fable-5', provider: 'openrouter' },
      { id: 'anthropic/claude-opus-4.8', name: 'anthropic/claude-opus-4.8', provider: 'openrouter' },
      { id: 'anthropic/claude-sonnet-5', name: 'anthropic/claude-sonnet-5', provider: 'nous' },
    ])
  })

  it('accepts plain-string model entries', () => {
    const p = writeCatalog({ providers: { nous: { models: ['hermes-4-405b'] } } })
    expect(readAgentModelCatalog(p)).toEqual([
      { id: 'hermes-4-405b', name: 'hermes-4-405b', provider: 'nous' },
    ])
  })

  it('returns empty for missing file, malformed JSON, and wrong shapes', () => {
    expect(readAgentModelCatalog(join(dir, 'nope.json'))).toEqual([])
    expect(readAgentModelCatalog(writeCatalog('{not json'))).toEqual([])
    expect(readAgentModelCatalog(writeCatalog({ providers: 'oops' }))).toEqual([])
    expect(
      readAgentModelCatalog(writeCatalog({ providers: { nous: { models: [{}, { id: '' }] } } })),
    ).toEqual([])
  })
})
