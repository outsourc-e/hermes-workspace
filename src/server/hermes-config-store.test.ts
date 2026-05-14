import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyHermesConfigPatch,
  parseEnvFile,
  resolveHermesConfigPaths,
  stringifyEnv,
} from './hermes-config-store'

let tmpHome = ''
const originalEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in originalEnv)) originalEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-store-'))
  setEnv('HERMES_HOME', tmpHome)
  setEnv('CLAUDE_HOME', undefined)
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(originalEnv)) delete originalEnv[key]
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('applyHermesConfigPatch', () => {
  it('set-default-model writes flat provider/model when no nested model exists', () => {
    const paths = resolveHermesConfigPaths()
    applyHermesConfigPatch(paths, {
      action: 'set-default-model',
      providerId: 'openrouter',
      modelId: 'auto',
    })

    const parsed = YAML.parse(
      fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8'),
    )
    expect(parsed).toMatchObject({ provider: 'openrouter', model: 'auto' })
  })

  it('set-default-model preserves nested-model extension fields and updates default/provider', () => {
    fs.mkdirSync(tmpHome, { recursive: true })
    fs.writeFileSync(
      path.join(tmpHome, 'config.yaml'),
      'model:\n  default: legacy\n  provider: legacy\n  temperature: 0.7\n',
      'utf-8',
    )

    const paths = resolveHermesConfigPaths()
    applyHermesConfigPatch(paths, {
      action: 'set-default-model',
      providerId: 'openrouter',
      modelId: 'auto',
    })

    const parsed = YAML.parse(
      fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8'),
    )
    expect(parsed.model).toEqual({
      default: 'auto',
      provider: 'openrouter',
      temperature: 0.7,
    })
    expect(parsed.provider).toBe('openrouter')
  })

  it('set-api-key writes the env value to .env', () => {
    const paths = resolveHermesConfigPaths()
    applyHermesConfigPatch(paths, {
      action: 'set-api-key',
      envKey: 'OPENROUTER_API_KEY',
      value: 'sk-or-99999',
    })
    expect(fs.readFileSync(path.join(tmpHome, '.env'), 'utf-8')).toContain(
      'OPENROUTER_API_KEY=sk-or-99999',
    )
  })

  it('remove-api-key deletes only the named entry', () => {
    fs.mkdirSync(tmpHome, { recursive: true })
    fs.writeFileSync(
      path.join(tmpHome, '.env'),
      'OPENROUTER_API_KEY=sk-old\nKEEP=yes\n',
      'utf-8',
    )

    const paths = resolveHermesConfigPaths()
    applyHermesConfigPatch(paths, {
      action: 'remove-api-key',
      envKey: 'OPENROUTER_API_KEY',
    })

    const env = parseEnvFile(
      fs.readFileSync(path.join(tmpHome, '.env'), 'utf-8'),
    )
    expect(env).toEqual({ KEEP: 'yes' })
  })

  it('set-custom-provider upserts an entry by name; remove drops it', () => {
    const paths = resolveHermesConfigPaths()
    applyHermesConfigPatch(paths, {
      action: 'set-custom-provider',
      provider: { name: 'gw', baseUrl: 'https://a.test/v1' },
    })
    applyHermesConfigPatch(paths, {
      action: 'set-custom-provider',
      provider: { name: 'gw', baseUrl: 'https://b.test/v1' },
    })

    let parsed = YAML.parse(
      fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8'),
    )
    expect(parsed.custom_providers).toEqual([
      { name: 'gw', base_url: 'https://b.test/v1' },
    ])

    applyHermesConfigPatch(paths, { action: 'remove-custom-provider', name: 'gw' })
    parsed = YAML.parse(
      fs.readFileSync(path.join(tmpHome, 'config.yaml'), 'utf-8'),
    )
    expect(parsed.custom_providers).toBeUndefined()
  })
})

describe('env value round-tripping', () => {
  it('quotes whitespace, "#", "=" and quotes; parser strips outer quotes', () => {
    const env = {
      PLAIN: 'sk-no-special-chars',
      WITH_SPACE: 'value with spaces',
      WITH_HASH: 'pre#post',
      WITH_EQ: 'a=b',
      WITH_QUOTES: `say "hi"`,
    }
    expect(parseEnvFile(stringifyEnv(env))).toEqual(env)
  })

  it('refuses to write values containing newlines', () => {
    expect(() => stringifyEnv({ BAD: 'one\ntwo' })).toThrow(/newlines/)
  })
})
