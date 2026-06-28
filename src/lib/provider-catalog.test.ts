import { describe, expect, it } from 'vitest'
import { PROVIDER_CATALOG, getProviderInfo, getProviderDisplayName } from './provider-catalog'

describe('PROVIDER_CATALOG', () => {
  it('includes deepseek', () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id)
    expect(ids).toContain('deepseek')
  })

  it('deepseek entry has required fields', () => {
    const ds = getProviderInfo('deepseek')
    expect(ds).not.toBeNull()
    expect(ds?.name).toBe('DeepSeek')
    expect(ds?.authTypes).toContain('api-key')
    expect(ds?.docsUrl).toContain('deepseek.com')
  })

  it('deepseek configExample is valid JSON', () => {
    const ds = getProviderInfo('deepseek')
    expect(() => JSON.parse(ds!.configExample)).not.toThrow()
  })

  it('deepseek appears before ollama (ordering: external APIs before local)', () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id)
    expect(ids.indexOf('deepseek')).toBeLessThan(ids.indexOf('ollama'))
  })
})

describe('getProviderInfo', () => {
  it('returns null for unknown provider', () => {
    expect(getProviderInfo('unknown-xyz')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(getProviderInfo('DeepSeek')).not.toBeNull()
    expect(getProviderInfo('ANTHROPIC')).not.toBeNull()
  })
})

describe('getProviderDisplayName', () => {
  it('returns the catalog name for known providers', () => {
    expect(getProviderDisplayName('deepseek')).toBe('DeepSeek')
    expect(getProviderDisplayName('anthropic')).toBe('Anthropic')
  })

  it('title-cases unknown provider ids', () => {
    expect(getProviderDisplayName('my-custom-llm')).toBe('My Custom Llm')
  })
})
