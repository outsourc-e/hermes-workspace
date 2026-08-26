import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

import {
  DEFAULT_ROUTING_CONFIG,
  readRoutingConfig,
  applyHermesConfigPatch,
  resolveHermesConfigPaths,
} from './hermes-config-store'
import type { HermesConfigPaths } from './hermes-config-migration'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTmpHome(): { dir: string; paths: HermesConfigPaths } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'))
  const paths: HermesConfigPaths = {
    hermesHome: dir,
    configPath: path.join(dir, 'config.yaml'),
    envPath: path.join(dir, '.env'),
    authProfilesPath: path.join(dir, 'auth-profiles.json'),
  }
  return { dir, paths }
}

function writeConfig(configPath: string, content: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, YAML.stringify(content), 'utf-8')
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('readRoutingConfig', () => {
  let dir: string
  let paths: HermesConfigPaths

  beforeEach(() => {
    const tmp = makeTmpHome()
    dir = tmp.dir
    paths = tmp.paths
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when config.yaml does not exist', () => {
    const result = readRoutingConfig(paths)
    expect(result.enabled).toBe(false)
    expect(result.default_provider).toBe('anthropic')
    expect(result.default_model).toBe('claude-sonnet-4-6')
    expect(result.escalation.opus_threshold).toBe(0.75)
    expect(result.escalation.daily_opus_budget_usd).toBe(5.0)
    expect(result.pool).toEqual([])
    expect(result.policy).toEqual([])
  })

  it('returns defaults when config.yaml has no routing block', () => {
    writeConfig(paths.configPath, { provider: 'anthropic', model: 'claude-sonnet-4-6' })
    const result = readRoutingConfig(paths)
    expect(result).toMatchObject(DEFAULT_ROUTING_CONFIG)
  })

  it('returns defaults when routing block is not an object', () => {
    writeConfig(paths.configPath, { routing: 'invalid' })
    const result = readRoutingConfig(paths)
    expect(result.enabled).toBe(false)
  })

  it('reads enabled flag', () => {
    writeConfig(paths.configPath, { routing: { enabled: true } })
    expect(readRoutingConfig(paths).enabled).toBe(true)
  })

  it('reads default_provider and default_model', () => {
    writeConfig(paths.configPath, {
      routing: { default_provider: 'openai', default_model: 'gpt-5.4' },
    })
    const result = readRoutingConfig(paths)
    expect(result.default_provider).toBe('openai')
    expect(result.default_model).toBe('gpt-5.4')
  })

  it('reads escalation thresholds', () => {
    writeConfig(paths.configPath, {
      routing: { escalation: { opus_threshold: 0.9, daily_opus_budget_usd: 10.0 } },
    })
    const result = readRoutingConfig(paths)
    expect(result.escalation.opus_threshold).toBe(0.9)
    expect(result.escalation.daily_opus_budget_usd).toBe(10.0)
  })

  it('falls back escalation fields to defaults when malformed', () => {
    writeConfig(paths.configPath, { routing: { escalation: { opus_threshold: 'bad' } } })
    const result = readRoutingConfig(paths)
    expect(result.escalation.opus_threshold).toBe(DEFAULT_ROUTING_CONFIG.escalation.opus_threshold)
  })

  it('parses a valid pool entry', () => {
    writeConfig(paths.configPath, {
      routing: {
        pool: [
          { provider: 'anthropic', models: ['claude-sonnet-4-6'], enabled: true },
          { provider: 'openai', models: ['gpt-5.4'], base_url: 'https://api.openai.com/v1', enabled: false },
        ],
      },
    })
    const result = readRoutingConfig(paths)
    expect(result.pool).toHaveLength(2)
    expect(result.pool[0]).toEqual({ provider: 'anthropic', models: ['claude-sonnet-4-6'], enabled: true })
    expect(result.pool[1].base_url).toBe('https://api.openai.com/v1')
  })

  it('skips pool entries missing a provider', () => {
    writeConfig(paths.configPath, {
      routing: { pool: [{ models: ['gpt-5.4'], enabled: true }] },
    })
    expect(readRoutingConfig(paths).pool).toHaveLength(0)
  })

  it('parses a valid policy rule', () => {
    writeConfig(paths.configPath, {
      routing: {
        policy: [
          { match: { task_type: 'coding' }, route: { provider: 'openai', model: 'gpt-5.4' } },
          { match: { complexity_gte: 0.75 }, route: { provider: 'anthropic', model: 'claude-opus-4-8' } },
        ],
      },
    })
    const result = readRoutingConfig(paths)
    expect(result.policy).toHaveLength(2)
    expect(result.policy[0].match.task_type).toBe('coding')
    expect(result.policy[0].route.provider).toBe('openai')
    expect(result.policy[1].match.complexity_gte).toBe(0.75)
  })

  it('skips policy rules missing a route provider', () => {
    writeConfig(paths.configPath, {
      routing: { policy: [{ match: { task_type: 'coding' }, route: { model: 'gpt-5.4' } }] },
    })
    expect(readRoutingConfig(paths).policy).toHaveLength(0)
  })

  it('returns independent copies so mutations do not affect defaults', () => {
    const a = readRoutingConfig(paths)
    a.escalation.opus_threshold = 0.0
    const b = readRoutingConfig(paths)
    expect(b.escalation.opus_threshold).toBe(DEFAULT_ROUTING_CONFIG.escalation.opus_threshold)
  })
})

describe('applyHermesConfigPatch — set-routing-config', () => {
  let dir: string
  let paths: HermesConfigPaths

  beforeEach(() => {
    const tmp = makeTmpHome()
    dir = tmp.dir
    paths = tmp.paths
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes a routing block to a fresh config.yaml', () => {
    const result = applyHermesConfigPatch(paths, {
      action: 'set-routing-config',
      routing: { enabled: true, default_model: 'claude-sonnet-4-6' },
    })
    expect(result.ok).toBe(true)
    const written = YAML.parse(fs.readFileSync(paths.configPath, 'utf-8')) as Record<string, unknown>
    const routing = written.routing as Record<string, unknown>
    expect(routing.enabled).toBe(true)
    expect(routing.default_model).toBe('claude-sonnet-4-6')
  })

  it('merges over an existing routing block without losing other keys', () => {
    writeConfig(paths.configPath, { routing: { enabled: false, default_provider: 'anthropic' } })
    applyHermesConfigPatch(paths, {
      action: 'set-routing-config',
      routing: { enabled: true },
    })
    const written = YAML.parse(fs.readFileSync(paths.configPath, 'utf-8')) as Record<string, unknown>
    const routing = written.routing as Record<string, unknown>
    expect(routing.enabled).toBe(true)
    expect(routing.default_provider).toBe('anthropic')
  })

  it('preserves non-routing keys in config.yaml', () => {
    writeConfig(paths.configPath, { provider: 'anthropic', model: 'claude-sonnet-4-6' })
    applyHermesConfigPatch(paths, {
      action: 'set-routing-config',
      routing: { enabled: true },
    })
    const written = YAML.parse(fs.readFileSync(paths.configPath, 'utf-8')) as Record<string, unknown>
    expect(written.provider).toBe('anthropic')
    expect(written.model).toBe('claude-sonnet-4-6')
  })
})
