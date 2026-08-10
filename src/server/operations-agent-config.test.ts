import { describe, expect, it } from 'vitest'

import { buildSubscriptionCatalog } from './subscription-model-catalog'
import { operationsModelSelectionPatch } from './operations-agent-config'

const catalog = buildSubscriptionCatalog({
  relayModels: [
    { id: 'claude-cwm4tx/opus-5', account: 'cwm4tx', status: 'available' },
  ],
  oauthProviders: [
    {
      provider: 'openai-codex',
      authenticated: true,
      models: ['gpt-5.6-sol'],
    },
    {
      provider: 'nous',
      authenticated: true,
      models: ['google/gemini-3.1-pro-preview'],
    },
  ],
  transports: [],
  allowApiBilledModels: false,
  showNousModels: true,
  capabilities: {
    'claude-cwm4tx/opus-5': {
      contextWindow: 1_000_000,
      maxInputTokens: null,
      maxOutputTokens: 128_000,
      supportsReasoning: true,
      supportsTools: true,
      supportsVision: true,
      metadataSource: 'models.dev',
    },
    'openai-codex/gpt-5.6-sol': {
      contextWindow: 1_050_000,
      maxInputTokens: 922_000,
      maxOutputTokens: 128_000,
      supportsReasoning: true,
      supportsTools: true,
      supportsVision: true,
      metadataSource: 'models.dev',
    },
    'nous/google/gemini-3.1-pro-preview': {
      contextWindow: 1_048_576,
      maxInputTokens: null,
      maxOutputTokens: 65_536,
      supportsReasoning: true,
      supportsTools: true,
      supportsVision: true,
      metadataSource: 'models.dev',
    },
  },
})

describe('Operations agent model selection', () => {
  it('translates a canonical Codex route into executable Hermes profile config', () => {
    expect(
      operationsModelSelectionPatch(
        {
          routeRef: 'openai-codex/gpt-5.6-sol',
          reasoningEffort: 'high',
        },
        {},
        catalog,
      ),
    ).toEqual({
      model: {
        provider: 'openai-codex',
        default: 'gpt-5.6-sol',
        openai_runtime: 'hermes_default',
      },
      agent: { reasoning_effort: 'high' },
      workspace: { route_ref: 'openai-codex/gpt-5.6-sol', codex_runtime: 'hermes_default' },
    })
  })

  it('persists explicit Codex app-server ownership and preserves unknown legacy values safely', () => {
    expect(operationsModelSelectionPatch({ routeRef: 'openai-codex/gpt-5.6-sol', codexRuntime: 'codex_app_server' }, {}, catalog).workspace)
      .toEqual({ route_ref: 'openai-codex/gpt-5.6-sol', codex_runtime: 'codex_app_server' })
    expect(operationsModelSelectionPatch({ routeRef: 'openai-codex/gpt-5.6-sol', codexRuntime: 'future_runtime' }, {}, catalog).workspace)
      .toEqual({ route_ref: 'openai-codex/gpt-5.6-sol', codex_runtime: 'hermes_default', codex_runtime_configured: 'future_runtime' })
  })

  it('keeps Claude account identity and configured relay transport', () => {
    expect(
      operationsModelSelectionPatch(
        {
          routeRef: 'claude-cwm4tx/opus-5',
          reasoningEffort: 'max',
        },
        {
          model: {
            provider: 'custom',
            base_url: 'http://127.0.0.1:8650/v1',
            api_key: 'existing-secret-reference',
            api_mode: 'chat_completions',
          },
        },
        catalog,
      ).model,
    ).toEqual({
      provider: 'custom',
      default: 'claude-cwm4tx/opus-5',
      base_url: 'http://127.0.0.1:8650/v1',
      api_key: 'existing-secret-reference',
      api_mode: 'chat_completions',
    })
  })

  it('rejects unknown, unavailable, and unsupported settings', () => {
    expect(() =>
      operationsModelSelectionPatch(
        { routeRef: 'openai-api/gpt-paid' },
        {},
        catalog,
      ),
    ).toThrow('not an assignable subscription route')
    expect(() =>
      operationsModelSelectionPatch(
        {
          routeRef: 'openai-codex/gpt-5.6-sol',
          reasoningEffort: 'extreme',
        },
        {},
        catalog,
      ),
    ).toThrow('Unsupported reasoning effort')
    expect(() =>
      operationsModelSelectionPatch(
        {
          routeRef: 'openai-codex/gpt-5.6-sol',
          maxOutputTokens: 32_768,
        },
        {},
        catalog,
      ),
    ).toThrow('does not consume a configurable output-token cap')
    expect(() =>
      operationsModelSelectionPatch(
        {
          routeRef: 'claude-cwm4tx/opus-5',
          maxOutputTokens: 32_768,
        },
        {},
        catalog,
      ),
    ).toThrow('does not consume a configurable output-token cap')
    expect(() =>
      operationsModelSelectionPatch(
        {
          routeRef: 'nous/google/gemini-3.1-pro-preview',
          maxOutputTokens: 65_537,
        },
        {},
        catalog,
      ),
    ).toThrow('exceeds the model maximum')
  })

  it('persists an output cap only for a transport that consumes it', () => {
    expect(
      operationsModelSelectionPatch(
        {
          routeRef: 'nous/google/gemini-3.1-pro-preview',
          maxOutputTokens: 32_768,
        },
        {},
        catalog,
      ).model,
    ).toMatchObject({ max_tokens: 32_768 })
  })

  it('allows an authenticated API route after the explicit unhide option is enabled', () => {
    const apiCatalog = buildSubscriptionCatalog({
      relayModels: [],
      oauthProviders: [
        {
          provider: 'openai-api',
          authenticated: true,
          models: ['gpt-paid'],
          billingClass: 'api_billed',
        },
      ],
      transports: [],
      allowApiBilledModels: true,
    })
    expect(
      operationsModelSelectionPatch(
        { routeRef: 'openai-api/gpt-paid' },
        {},
        apiCatalog,
      ).model,
    ).toEqual({ provider: 'openai-api', default: 'gpt-paid' })
  })
})
