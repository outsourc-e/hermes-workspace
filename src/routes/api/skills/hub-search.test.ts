/**
 * Tests for the skills hub-search Python bridge resolver.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import path from 'node:path'

const { accessSync } = vi.hoisted(() => ({
  accessSync: vi.fn(),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return { ...actual, accessSync }
})

const { homedir } = vi.hoisted(() => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

vi.mock('node:os', () => ({
  default: { homedir },
  homedir,
}))

// The route file imports the auth middleware at module time; keep it out of
// the resolution logic under test.
vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.HERMES_AGENT_HOME
})

async function loadMod() {
  vi.resetModules()
  return import('./hub-search')
}

describe('resolveSkillsSearchPython', () => {
  it('prefers the hermes venv python under ~/.hermes/hermes-agent', async () => {
    accessSync.mockImplementation((candidate: string) => {
      if (candidate.endsWith('.hermes/hermes-agent/venv/bin/python')) return
      throw new Error('not found')
    })
    const mod = await loadMod()
    expect(mod.resolveSkillsSearchPython()).toBe(
      path.join('/home/testuser/.hermes/hermes-agent/venv/bin/python'),
    )
  })

  it('falls back to the legacy ~/hermes-agent venv when the standard one is missing', async () => {
    const legacy = path.join('/home/testuser/hermes-agent/venv/bin/python')
    accessSync.mockImplementation((candidate: string) => {
      if (candidate === legacy) return
      throw new Error('not found')
    })
    const mod = await loadMod()
    expect(mod.resolveSkillsSearchPython()).toBe(legacy)
  })

  it('falls back to plain python3 when no venv exists', async () => {
    accessSync.mockImplementation(() => {
      throw new Error('not found')
    })
    const mod = await loadMod()
    expect(mod.resolveSkillsSearchPython()).toBe('python3')
  })

  it('honors HERMES_AGENT_HOME when set', async () => {
    process.env.HERMES_AGENT_HOME = '/opt/hermes-agent'
    accessSync.mockImplementation((candidate: string) => {
      if (candidate === '/opt/hermes-agent/venv/bin/python') return
      throw new Error('not found')
    })
    const mod = await loadMod()
    expect(mod.resolveSkillsSearchPython()).toBe('/opt/hermes-agent/venv/bin/python')
  })
})
