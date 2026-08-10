import { describe, expect, it } from 'vitest'

import { extractProfileModelSettings } from './profiles-browser'

describe('profile model settings readback', () => {
  it('prefers the persisted canonical route and returns tuning values', () => {
    expect(
      extractProfileModelSettings({
        model: {
          provider: 'custom',
          default: 'claude-cwm4tx/opus-5',
          max_tokens: 32768,
        },
        agent: { reasoning_effort: 'max' },
        workspace: { route_ref: 'claude-cwm4tx/opus-5' },
      }),
    ).toEqual({
      model: 'claude-cwm4tx/opus-5',
      provider: 'custom',
      routeRef: 'claude-cwm4tx/opus-5',
      reasoningEffort: 'max',
      maxOutputTokens: 32_768,
      codexRuntime: 'hermes_default',
      codexRuntimeConfigured: 'hermes_default',
    })
  })

  it('reconstructs canonical provider routes and preserves legacy strings', () => {
    expect(
      extractProfileModelSettings({
        model: { provider: 'openai-codex', default: 'gpt-5.6-sol' },
      }).routeRef,
    ).toBe('openai-codex/gpt-5.6-sol')
    expect(
      extractProfileModelSettings({ model: 'legacy-model' }).routeRef,
    ).toBe('legacy-model')
  })

  it('reads Codex runtime ownership with a safe effective fallback', () => {
    expect(extractProfileModelSettings({ workspace: { codex_runtime: 'codex_app_server' } })).toMatchObject({ codexRuntime: 'codex_app_server', codexRuntimeConfigured: 'codex_app_server' })
    expect(extractProfileModelSettings({ workspace: { codex_runtime: 'future_runtime' } })).toMatchObject({ codexRuntime: 'hermes_default', codexRuntimeConfigured: 'future_runtime' })
    expect(extractProfileModelSettings({})).toMatchObject({ codexRuntime: 'hermes_default', codexRuntimeConfigured: 'hermes_default' })
  })
})
