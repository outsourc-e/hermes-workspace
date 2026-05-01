import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

const { existsSync, readFileSync, statSync, readdirSync } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
  readdirSync: vi.fn().mockReturnValue([]),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync, statSync, readdirSync },
  existsSync,
  readFileSync,
  statSync,
  readdirSync,
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
})
