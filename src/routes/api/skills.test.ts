/**
 * Tests for the skills route's local skills-dir resolution.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return { ...actual, ...mocks }
})

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises')
  return {
    ...actual,
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
  }
})

const { homedir } = vi.hoisted(() => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

vi.mock('node:os', () => ({
  default: { homedir },
  homedir,
}))

// Module-level server deps — keep them out of the resolution logic under test.
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))
vi.mock('../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  CLAUDE_API: 'http://127.0.0.1:8642',
  CLAUDE_UPGRADE_INSTRUCTIONS: '',
  dashboardFetch: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  getCapabilities: vi.fn(),
}))
vi.mock('../../server/rate-limit', () => ({
  requireJsonContentType: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_HOME
  delete process.env.HERMES_SKILLS_DIR
})

async function loadMod() {
  vi.resetModules()
  return import('./skills')
}

describe('getSkillsDir', () => {
  it('honors HERMES_SKILLS_DIR override', async () => {
    process.env.HERMES_SKILLS_DIR = '/custom/skills'
    const mod = await loadMod()
    expect(mod.getSkillsDir()).toBe('/custom/skills')
  })

  it('honors HERMES_HOME override', async () => {
    process.env.HERMES_HOME = '/custom/hermes'
    const mod = await loadMod()
    expect(mod.getSkillsDir()).toBe('/custom/hermes/skills')
  })

  it('follows active_profile when it names an existing profile', async () => {
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('active_profile')) return 'invest'
      return ''
    })
    mocks.existsSync.mockImplementation(
      (filePath: string) =>
        filePath === path.join('/home/testuser/.hermes/profiles/invest'),
    )
    const mod = await loadMod()
    expect(mod.getSkillsDir()).toBe(
      path.join('/home/testuser/.hermes/profiles/invest/skills'),
    )
  })

  it('falls back to the default home when the profile is missing', async () => {
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('active_profile')) return 'ghost'
      return ''
    })
    mocks.existsSync.mockReturnValue(false)
    const mod = await loadMod()
    expect(mod.getSkillsDir()).toBe(path.join('/home/testuser/.hermes/skills'))
  })

  it('falls back to the default home without an active_profile marker', async () => {
    mocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const mod = await loadMod()
    expect(mod.getSkillsDir()).toBe(path.join('/home/testuser/.hermes/skills'))
  })
})
