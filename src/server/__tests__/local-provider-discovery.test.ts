import { describe, it, expect, vi, beforeEach } from 'vitest'
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

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CLAUDE_HOME
})

async function loadMod() {
  vi.resetModules()
  return import('../local-provider-discovery')
}

describe('local-provider-discovery', () => {
  it('isProviderConfigured uses YAML.parse and reads from CLAUDE_HOME', async () => {
    const activeHome = '/mock/profiles/jarvis'
    process.env.CLAUDE_HOME = activeHome
    const configPath = `${activeHome}/config.yaml`
    existsSync.mockImplementation((p: string) => p === configPath)
    readFileSync.mockImplementation((p: string) => {
      if (p === configPath)
        return 'custom_providers:\n  - name: ollama\n    baseUrl: http://127.0.0.1:11434/v1\n'
      return ''
    })

    const mod = await loadMod()
    expect(mod.isProviderConfigured('ollama')).toBe(true)
    expect(mod.isProviderConfigured('atomic-chat')).toBe(false)
  })

  it('isProviderConfigured returns false when custom_providers is missing', async () => {
    const activeHome = '/mock/profiles/default'
    process.env.CLAUDE_HOME = activeHome
    const configPath = `${activeHome}/config.yaml`
    existsSync.mockImplementation((p: string) => p === configPath)
    readFileSync.mockImplementation((p: string) => {
      if (p === configPath) return 'model: some-model\n'
      return ''
    })

    const mod = await loadMod()
    expect(mod.isProviderConfigured('ollama')).toBe(false)
  })

  it('ensureProviderInConfig rate-limits warnings via loggedWarnings Set', async () => {
    const activeHome = '/mock/profiles/default'
    process.env.CLAUDE_HOME = activeHome
    const configPath = `${activeHome}/config.yaml`
    existsSync.mockImplementation((p: string) => p === configPath)
    readFileSync.mockImplementation((p: string) => {
      if (p === configPath) return 'model: m\n'
      return ''
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const mod = await loadMod()
    logSpy.mockClear()

    // first call should log
    mod.ensureProviderInConfig('ollama')
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0][0]).toContain('Gateway restart needed')

    // second call should NOT log (rate limited by Set)
    logSpy.mockClear()
    mod.ensureProviderInConfig('ollama')
    expect(logSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })
})
