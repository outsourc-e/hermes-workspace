import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as yaml from 'yaml'
import {
  getWorkerPermissionMode,
  isSwarmPermissionMode,
  setWorkerPermissionMode,
} from './swarm-permissions'

let hermesHome: string
let previousHermesHome: string | undefined
let previousClaudeHome: string | undefined

function writeWorkerConfig(
  workerId: string,
  config: Record<string, unknown>,
): string {
  const profileDir = join(hermesHome, 'profiles', workerId)
  mkdirSync(profileDir, { recursive: true })
  const configPath = join(profileDir, 'config.yaml')
  writeFileSync(configPath, yaml.stringify(config), 'utf8')
  return configPath
}

beforeEach(() => {
  hermesHome = mkdtempSync(join(tmpdir(), 'swarm-permissions-'))
  previousHermesHome = process.env.HERMES_HOME
  previousClaudeHome = process.env.CLAUDE_HOME
  process.env.HERMES_HOME = hermesHome
  delete process.env.CLAUDE_HOME
})

afterEach(() => {
  if (previousHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = previousHermesHome
  if (previousClaudeHome === undefined) delete process.env.CLAUDE_HOME
  else process.env.CLAUDE_HOME = previousClaudeHome
  rmSync(hermesHome, { recursive: true, force: true })
})

describe('isSwarmPermissionMode', () => {
  it('accepts the four valid modes', () => {
    for (const mode of ['ask', 'smart', 'auto', 'yolo']) {
      expect(isSwarmPermissionMode(mode)).toBe(true)
    }
  })

  it('rejects invalid values', () => {
    for (const value of ['bypass', '', 'ASK', 42, null, undefined, {}]) {
      expect(isSwarmPermissionMode(value)).toBe(false)
    }
  })
})

describe('getWorkerPermissionMode', () => {
  it('returns the configured approvals.mode', () => {
    writeWorkerConfig('swarm1', { approvals: { mode: 'yolo' } })
    const result = getWorkerPermissionMode('swarm1')
    expect(result).toEqual({ ok: true, mode: 'yolo' })
  })

  it('falls back to smart when approvals block is missing', () => {
    writeWorkerConfig('swarm1', { model: { provider: 'x', default: 'y' } })
    const result = getWorkerPermissionMode('swarm1')
    expect(result).toEqual({ ok: true, mode: 'smart' })
  })

  it('falls back to smart when approvals.mode is unrecognised', () => {
    writeWorkerConfig('swarm1', { approvals: { mode: 'bogus' } })
    const result = getWorkerPermissionMode('swarm1')
    expect(result).toEqual({ ok: true, mode: 'smart' })
  })

  it('returns ok=false when config.yaml is missing', () => {
    const result = getWorkerPermissionMode('swarm-missing')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('config.yaml missing')
  })
})

describe('setWorkerPermissionMode', () => {
  it('rejects invalid modes without touching the file', () => {
    const configPath = writeWorkerConfig('swarm1', {
      approvals: { mode: 'smart' },
    })
    const before = readFileSync(configPath, 'utf8')
    const result = setWorkerPermissionMode('swarm1', 'bypass')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('invalid permission mode')
    expect(readFileSync(configPath, 'utf8')).toBe(before)
  })

  it('sets approvals.mode and reports the previous mode', () => {
    const configPath = writeWorkerConfig('swarm1', {
      approvals: { mode: 'smart' },
    })
    const result = setWorkerPermissionMode('swarm1', 'auto')
    expect(result).toEqual({ ok: true, changed: true, previous: 'smart' })
    const reread = yaml.parse(readFileSync(configPath, 'utf8')) as {
      approvals: { mode: string }
    }
    expect(reread.approvals.mode).toBe('auto')
  })

  it('creates the approvals block when absent', () => {
    const configPath = writeWorkerConfig('swarm1', {
      model: { provider: 'openai-codex', default: 'gpt-5.5' },
    })
    const result = setWorkerPermissionMode('swarm1', 'ask')
    expect(result).toEqual({ ok: true, changed: true, previous: null })
    const reread = yaml.parse(readFileSync(configPath, 'utf8')) as Record<
      string,
      any
    >
    expect(reread.approvals.mode).toBe('ask')
  })

  it('is a no-op when the mode already matches', () => {
    writeWorkerConfig('swarm1', { approvals: { mode: 'yolo' } })
    const result = setWorkerPermissionMode('swarm1', 'yolo')
    expect(result).toEqual({ ok: true, changed: false, previous: 'yolo' })
  })

  it('preserves unrelated yaml keys and sibling approvals fields', () => {
    const configPath = writeWorkerConfig('swarm1', {
      model: { provider: 'openai-codex', default: 'gpt-5.5', alternates: ['a'] },
      approvals: { mode: 'smart', allowlist: ['git status'] },
      providers: { custom: { baseUrl: 'http://localhost:1234' } },
    })
    const result = setWorkerPermissionMode('swarm1', 'yolo')
    expect(result.ok).toBe(true)
    const reread = yaml.parse(readFileSync(configPath, 'utf8')) as Record<
      string,
      any
    >
    expect(reread.approvals.mode).toBe('yolo')
    expect(reread.approvals.allowlist).toEqual(['git status'])
    expect(reread.model).toEqual({
      provider: 'openai-codex',
      default: 'gpt-5.5',
      alternates: ['a'],
    })
    expect(reread.providers.custom.baseUrl).toBe('http://localhost:1234')
  })

  it('returns ok=false when config.yaml is missing', () => {
    const result = setWorkerPermissionMode('swarm-missing', 'auto')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('config.yaml missing')
  })
})
