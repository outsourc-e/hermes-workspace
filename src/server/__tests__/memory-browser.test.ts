import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
  readdirSync: vi.fn().mockReturnValue([]),
}))

vi.mock('node:fs', () => ({
  default: { ...mocks },
  ...mocks,
}))

const { homedir } = vi.hoisted(() => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

vi.mock('node:os', () => ({
  default: { homedir },
  homedir,
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.HERMES_HOME
  delete process.env.CLAUDE_HOME
})

async function loadMod() {
  vi.resetModules()
  return import('../memory-browser')
}

describe('memory-browser', () => {
  it('normalizes workspace root with HERMES_HOME via path.resolve', async () => {
    process.env.HERMES_HOME = '/custom/hermes'
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/custom/hermes'))
  })

  it('falls back to ~/.hermes when HERMES_HOME is not set', async () => {
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/home/testuser/.hermes'))
  })

  it('uses path.resolve on env path with trailing slash', async () => {
    process.env.HERMES_HOME = '/custom/hermes/'
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/custom/hermes'))
  })

  it('follows active_profile when it names an existing profile', async () => {
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('active_profile')) return 'invest'
      return ''
    })
    mocks.existsSync.mockImplementation((filePath: string) =>
      filePath === path.resolve('/home/testuser/.hermes/profiles/invest'),
    )
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/home/testuser/.hermes/profiles/invest'))
  })

  it('ignores active_profile naming a missing profile', async () => {
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('active_profile')) return 'ghost'
      return ''
    })
    mocks.existsSync.mockReturnValue(false)
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/home/testuser/.hermes'))
  })

  it('ignores active_profile = default', async () => {
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('active_profile')) return 'default'
      return ''
    })
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/home/testuser/.hermes'))
  })

  it('HERMES_HOME wins over active_profile', async () => {
    process.env.HERMES_HOME = '/custom/hermes'
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith('active_profile')) return 'invest'
      return ''
    })
    mocks.existsSync.mockReturnValue(true)
    const mod = await loadMod()
    const root = mod.getMemoryWorkspaceRoot()
    expect(root).toBe(path.resolve('/custom/hermes'))
  })
})
