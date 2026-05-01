import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

const { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, copyFileSync, renameSync, readdirSync, statSync } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  mkdirSync: vi.fn().mockImplementation(() => {}),
  unlinkSync: vi.fn().mockImplementation(() => {}),
  copyFileSync: vi.fn().mockImplementation(() => {}),
  renameSync: vi.fn().mockImplementation(() => {}),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, copyFileSync, renameSync, readdirSync, statSync },
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  copyFileSync,
  renameSync,
  readdirSync,
  statSync,
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
  delete process.env.CLAUDE_HOME
})

async function loadMod() {
  vi.resetModules()
  return import('../profiles-browser')
}

describe('profiles-browser', () => {
  describe('setActiveProfile', () => {
    it('emits console.warn about gateway restart when setting non-default profile', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      existsSync.mockImplementation((p: string) => {
        if (p === path.join('/home/testuser', '.claude', 'profiles', 'jarvis')) return true
        return false
      })

      const mod = await loadMod()
      mod.setActiveProfile('jarvis')
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('Restart the Claude gateway')

      warnSpy.mockRestore()
    })

    it('clears active profile file when setting default', async () => {
      existsSync.mockImplementation((p: string) => {
        if (p === path.join('/home/testuser', '.claude', 'active_profile')) return true
        return false
      })

      const mod = await loadMod()
      mod.setActiveProfile('default')
      expect(unlinkSync).toHaveBeenCalledWith(path.join('/home/testuser', '.claude', 'active_profile'))
    })
  })

  describe('updateProfileConfig', () => {
    it('deep-merges nested objects instead of overwriting', async () => {
      const root = path.join('/home/testuser', '.claude')
      const configPath = path.join(root, 'config.yaml')
      const existingYaml =
        'model:\n  default: gpt-4\n  provider: openai\n  extra: keep-me\ntopLevel: stay\n'

      existsSync.mockImplementation((p: string) => {
        return p === configPath || p === root
      })
      readFileSync.mockImplementation((p: string) => {
        if (p === configPath) return existingYaml
        return ''
      })

      const mod = await loadMod()
      mod.updateProfileConfig('default', {
        model: { provider: 'nous' },
      })

      const writtenCall = writeFileSync.mock.calls.find(
        (call) => (call[0] as string).endsWith('config.yaml'),
      )
      expect(writtenCall).toBeDefined()
      const writtenYaml = writtenCall![1] as string
      expect(writtenYaml).toContain('default: gpt-4')
      expect(writtenYaml).toContain('provider: nous')
      expect(writtenYaml).toContain('extra: keep-me')
      expect(writtenYaml).toContain('topLevel: stay')
    })

    it('handles null as explicit deletion of keys', async () => {
      const root = path.join('/home/testuser', '.claude')
      const configPath = path.join(root, 'config.yaml')
      const existingYaml =
        'model:\n  default: gpt-4\n  provider: openai\napi_key: secret\n'

      existsSync.mockImplementation((p: string) => {
        return p === configPath || p === root
      })
      readFileSync.mockImplementation((p: string) => {
        if (p === configPath) return existingYaml
        return ''
      })

      const mod = await loadMod()
      mod.updateProfileConfig('default', {
        api_key: null,
      })

      const writtenCall = writeFileSync.mock.calls.find(
        (call) => (call[0] as string).endsWith('config.yaml'),
      )
      expect(writtenCall).toBeDefined()
      const writtenYaml = writtenCall![1] as string
      expect(writtenYaml).not.toContain('api_key:')
      expect(writtenYaml).toContain('model:')
      expect(writtenYaml).toContain('default: gpt-4')
      expect(writtenYaml).toContain('provider: openai')
    })
  })
})
