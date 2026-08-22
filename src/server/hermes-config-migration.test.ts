import { describe, expect, it } from 'vitest'
import { normalizeHermesConfigState } from './hermes-config-migration'

const paths = {
  hermesHome: '/tmp/hermes',
  configPath: '/tmp/hermes/config.yaml',
  envPath: '/tmp/hermes/.env',
  authProfilesPath: '/tmp/hermes/auth-profiles.json',
}

describe('normalizeHermesConfigState', () => {
  it('normalizes flat default provider and model config', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: { provider: 'openrouter', model: 'auto' },
      env: { OPENROUTER_API_KEY: 'sk-openrouter-123456' },
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.activeProvider).toBe('openrouter')
    expect(state.activeModel).toBe('auto')
    expect(state.defaultModel).toEqual({
      provider: 'openrouter',
      model: 'auto',
      source: 'flat',
    })
    const openrouter = state.providers.find((p) => p.id === 'openrouter')
    expect(openrouter?.configured).toBe(true)
    expect(openrouter?.authenticated).toBe(true)
    expect(openrouter?.isDefault).toBe(true)
    expect(openrouter?.authSource).toBe('env')
  })

  it('normalizes nested default provider and model config', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: { model: { provider: 'openai-codex', default: 'gpt-5.4' } },
      env: {},
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.activeProvider).toBe('openai-codex')
    expect(state.activeModel).toBe('gpt-5.4')
    expect(state.defaultModel).toEqual({
      provider: 'openai-codex',
      model: 'gpt-5.4',
      source: 'nested',
    })
  })

  it('falls back to nested model when only a partial flat field is set', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: {
        provider: 'openrouter',
        model: { provider: 'openrouter', default: 'auto' },
      },
      env: {},
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.defaultModel).toEqual({
      provider: 'openrouter',
      model: 'auto',
      source: 'nested',
    })
  })

  it('recognizes Atlas Cloud API key config and default model', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: {
        model: { provider: 'atlascloud', default: 'qwen/qwen3.5-flash' },
        custom_providers: [
          {
            name: 'atlascloud',
            base_url: 'https://api.atlascloud.ai/v1',
            api_mode: 'openai',
          },
        ],
      },
      env: { ATLASCLOUD_API_KEY: 'atlas-test-key-123456' },
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.activeProvider).toBe('atlascloud')
    expect(state.activeModel).toBe('qwen/qwen3.5-flash')
    const atlascloud = state.providers.find((p) => p.id === 'atlascloud')
    expect(atlascloud?.configured).toBe(true)
    expect(atlascloud?.authenticated).toBe(true)
    expect(atlascloud?.isDefault).toBe(true)
    expect(atlascloud?.authSource).toBe('env')
    expect(atlascloud?.envKeys).toContain('ATLASCLOUD_API_KEY')
    expect(atlascloud?.models.map((model) => model.id)).toContain('qwen/qwen3.5-flash')
    expect(atlascloud?.models.map((model) => model.id)).toContain('deepseek-ai/deepseek-v4-pro')
  })
})
