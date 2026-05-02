import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { syncSwarmProfileModel } from './swarm-profile-config'

function makeProfile(initial: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-profile-cfg-'))
  writeFileSync(join(dir, 'config.yaml'), yaml.stringify(initial), 'utf8')
  return dir
}

describe('syncSwarmProfileModel', () => {
  it('returns ok=false when the profile path does not exist', () => {
    const result = syncSwarmProfileModel('/nope/does-not-exist', {
      provider: 'openai-codex',
      default: 'gpt-5.5',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('profile path missing')
    }
  })

  it('returns ok=false when config.yaml does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swarm-profile-cfg-'))
    try {
      const result = syncSwarmProfileModel(dir, {
        provider: 'openai-codex',
        default: 'gpt-5.5',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('config.yaml missing')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('updates model.provider and model.default when they differ', () => {
    const dir = makeProfile({
      model: { provider: 'openai-codex', default: 'gpt-5.5' },
      providers: {},
    })
    try {
      const result = syncSwarmProfileModel(dir, {
        provider: 'anthropic-oauth',
        default: 'claude-opus-4-7',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.changed).toBe(true)
        expect(result.previous).toEqual({
          provider: 'openai-codex',
          default: 'gpt-5.5',
        })
      }
      const reread = yaml.parse(
        readFileSync(join(dir, 'config.yaml'), 'utf8'),
      ) as { model: { provider: string; default: string } }
      expect(reread.model.provider).toBe('anthropic-oauth')
      expect(reread.model.default).toBe('claude-opus-4-7')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports changed=false when config already matches target', () => {
    const dir = makeProfile({
      model: { provider: 'openai-codex', default: 'gpt-5.5' },
    })
    try {
      const result = syncSwarmProfileModel(dir, {
        provider: 'openai-codex',
        default: 'gpt-5.5',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.changed).toBe(false)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves sibling top-level keys (providers, toolsets, agent)', () => {
    const dir = makeProfile({
      model: { provider: 'openai-codex', default: 'gpt-5.5' },
      providers: { ollama: { api_key: 'ollama' } },
      toolsets: ['file', 'browser'],
      agent: { max_turns: 90 },
    })
    try {
      syncSwarmProfileModel(dir, {
        provider: 'anthropic-oauth',
        default: 'claude-opus-4-7',
      })
      const reread = yaml.parse(
        readFileSync(join(dir, 'config.yaml'), 'utf8'),
      ) as Record<string, unknown>
      expect(reread.providers).toEqual({ ollama: { api_key: 'ollama' } })
      expect(reread.toolsets).toEqual(['file', 'browser'])
      expect(reread.agent).toEqual({ max_turns: 90 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves sibling fields inside model (e.g. model.alternates)', () => {
    const dir = makeProfile({
      model: {
        provider: 'openai-codex',
        default: 'gpt-5.5',
        alternates: ['gpt-5.4'],
      },
    })
    try {
      syncSwarmProfileModel(dir, {
        provider: 'anthropic-oauth',
        default: 'claude-opus-4-7',
      })
      const reread = yaml.parse(
        readFileSync(join(dir, 'config.yaml'), 'utf8'),
      ) as { model: Record<string, unknown> }
      expect(reread.model.provider).toBe('anthropic-oauth')
      expect(reread.model.default).toBe('claude-opus-4-7')
      expect(reread.model.alternates).toEqual(['gpt-5.4'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns ok=false when config.yaml is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swarm-profile-cfg-'))
    writeFileSync(join(dir, 'config.yaml'), '::: not yaml :::', 'utf8')
    try {
      const result = syncSwarmProfileModel(dir, {
        provider: 'openai-codex',
        default: 'gpt-5.5',
      })
      expect(result.ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
