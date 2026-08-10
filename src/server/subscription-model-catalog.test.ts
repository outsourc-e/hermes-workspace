import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import {
  buildRelayModelInputs,
  buildSubscriptionCatalog,
  configuredApiBilledProviderInputs,
  createAuxiliaryTransportResolver,
  createCachedCapabilityResolver,
  createProviderModelResolver,
  discoverModelCapabilities,
  metadataIdentityForRoute,
  openAiCodexModelInventory,
  parseAntigravityModelRows,
  parseAntigravityModels,
  resolveAntigravityProviderInventory,
  resolveAntigravityRelayBaseUrl,
  resolveHermesPython,
  sanitizeProviderWarning,
} from './subscription-model-catalog'

describe('subscription model catalog', () => {
  it('includes authenticated OAuth models and keeps limited accounts visible but disabled', () => {
    const catalog = buildSubscriptionCatalog({
      relayModels: [
        { id: 'claude-cwm4tx/sonnet', account: 'cwm4tx', status: 'available' },
        {
          id: 'claude-gp/sonnet',
          account: 'gp',
          status: 'quota_limited',
          warning: 'Monthly allocation reached',
        },
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
          models: ['anthropic/claude-opus-4.8'],
        },
        {
          provider: 'google-antigravity',
          authenticated: true,
          models: ['gemini-3.1-pro', 'gemini-3.1-flash'],
        },
      ],
      transports: [],
      allowApiBilledModels: false,
      showNousModels: false,
    })

    expect(catalog.models.map((model) => model.id)).toEqual([
      'claude-cwm4tx/sonnet',
      'claude-gp/sonnet',
      'openai-codex/gpt-5.6-sol',
      'google-antigravity/gemini-3.1-pro',
      'google-antigravity/gemini-3.1-flash',
    ])
    expect(
      catalog.models.find((model) => model.id === 'claude-gp/sonnet'),
    ).toMatchObject({ selectable: false, status: 'quota_limited' })
    expect(
      catalog.models.every((model) => model.billingClass !== 'api_billed'),
    ).toBe(true)
  })

  it('keeps static OpenAI Codex OAuth routes visible but unavailable when discovery and auth fail', () => {
    const models = openAiCodexModelInventory([])
    expect(models).toEqual(
      expect.arrayContaining([
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
        'gpt-5.5',
        'gpt-5.4',
      ]),
    )

    const catalog = buildSubscriptionCatalog({
      relayModels: [],
      oauthProviders: [
        {
          provider: 'openai-codex',
          authenticated: false,
          models,
        },
      ],
      transports: [],
      allowApiBilledModels: false,
      showNousModels: false,
    })
    expect(catalog.models.map((model) => model.id)).toContain(
      'openai-codex/gpt-5.6-sol',
    )
    expect(catalog.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openai-codex/gpt-5.6-sol',
          status: 'unavailable',
          selectable: false,
        }),
      ]),
    )
  })

  it('keeps Nous configured but hides it until the visibility option is enabled', () => {
    const common = {
      relayModels: [],
      oauthProviders: [
        {
          provider: 'nous',
          authenticated: true,
          models: ['google/gemini-3.1-pro-preview'],
        },
      ],
      transports: [],
      allowApiBilledModels: false,
    }
    expect(
      buildSubscriptionCatalog({ ...common, showNousModels: false }).models,
    ).toHaveLength(0)
    expect(
      buildSubscriptionCatalog({ ...common, showNousModels: true }).models,
    ).toHaveLength(1)
  })

  it('keeps visible Nous subscription-unknown routes non-selectable without verified entitlement', () => {
    const common = {
      relayModels: [],
      transports: [],
      allowApiBilledModels: false,
      showNousModels: true,
    }
    const unverified = buildSubscriptionCatalog({
      ...common,
      oauthProviders: [
        {
          provider: 'nous',
          authenticated: true,
          models: ['google/gemini-3.1-pro-preview'],
          billingClass: 'subscription_unknown' as const,
        },
      ],
    })
    const entitled = buildSubscriptionCatalog({
      ...common,
      oauthProviders: [
        {
          provider: 'nous',
          authenticated: true,
          subscriptionEntitled: true,
          models: ['google/gemini-3.1-pro-preview'],
          billingClass: 'subscription_unknown' as const,
        },
      ],
    })

    expect(unverified.models[0]).toMatchObject({
      status: 'unknown',
      selectable: false,
    })
    expect(entitled.models[0]).toMatchObject({
      status: 'available',
      selectable: true,
    })
  })

  it('marks relay rows without matching account health unavailable', () => {
    const relayModels = buildRelayModelInputs(
      [{ id: 'claude-cwm4tx/sonnet' }],
      {},
    )
    const catalog = buildSubscriptionCatalog({
      relayModels,
      oauthProviders: [],
      transports: [],
      allowApiBilledModels: false,
    })

    expect(catalog.models[0]).toMatchObject({
      id: 'claude-cwm4tx/sonnet',
      status: 'unavailable',
      selectable: false,
      warning: 'Account health could not be verified.',
    })
  })

  it('discovers only concrete Gemini routes from Antigravity inventory', () => {
    expect(
      parseAntigravityModels(
        [
          'Fetching available models...',
          'gemini-3.6-flash-high\tGemini 3.6 Flash (High)',
          'gemini-3.1-pro-low\tGemini 3.1 Pro (Low)',
          'claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)',
        ].join('\n'),
      ),
    ).toEqual(['gemini-3.6-flash-high', 'gemini-3.1-pro-low'])
  })

  it('rejects non-Gemini IDs returned by the Antigravity relay', () => {
    expect(
      parseAntigravityModelRows([
        { id: 'google-antigravity/gemini-3.6-flash-high' },
        { id: 'google-antigravity/claude-opus-4-6-thinking' },
        { id: '../gemini-unsafe' },
        { id: null },
      ]),
    ).toEqual(['gemini-3.6-flash-high'])
  })

  it('maps provider warnings to fixed human-safe messages', () => {
    const warning = sanitizeProviderWarning(
      'prefix {"api_error_status":429,"result":"You have hit your monthly spend limit · raise it at claude.ai/settings/usage?from=cc_cli_limit_message","uuid":"secret-run-id"}',
    )
    expect(warning).toBe('Provider quota is currently limited.')

    const unsafe = sanitizeProviderWarning(
      'relay C:\\Users\\alice\\.hermes token sk-secret-123 request req_abc',
    )
    expect(unsafe).toBe('Provider is temporarily unavailable.')
    expect(unsafe).not.toMatch(/alice|hermes|sk-secret|req_abc/i)
  })

  it('persists concrete Antigravity inventory and reuses it as unavailable after discovery failure', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'antigravity-inventory-'))
    try {
      const inventoryPath = join(stateDir, 'inventory.json')
      const live = resolveAntigravityProviderInventory(
        ['gemini-3.6-flash-high', '../gemini-unsafe', 'claude-opus'],
        inventoryPath,
      )
      const cached = resolveAntigravityProviderInventory([], inventoryPath)

      expect(live).toMatchObject({
        authenticated: true,
        models: ['gemini-3.6-flash-high'],
      })
      expect(cached).toMatchObject({
        authenticated: false,
        models: ['gemini-3.6-flash-high'],
      })
      const catalog = buildSubscriptionCatalog({
        relayModels: [],
        oauthProviders: [cached],
        transports: [],
        allowApiBilledModels: false,
      })
      expect(catalog.models[0]).toMatchObject({
        id: 'google-antigravity/gemini-3.6-flash-high',
        status: 'unavailable',
        selectable: false,
      })
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it('rejects non-loopback Antigravity relay base URLs', () => {
    expect(() =>
      resolveAntigravityRelayBaseUrl('http://192.168.1.12:8651'),
    ).toThrow(/loopback/i)
    expect(resolveAntigravityRelayBaseUrl('http://localhost:8651/')).toBe(
      'http://localhost:8651',
    )
  })

  it('builds secret-free API-billed rows only for configured non-OpenRouter providers', () => {
    const providers = configuredApiBilledProviderInputs(
      {
        ANTHROPIC_API_KEY: 'sk-ant-secret',
        OPENROUTER_API_KEY: 'sk-or-secret',
      },
      (provider) =>
        provider === 'anthropic' ? ['claude-sonnet-4-6'] : ['paid-model'],
    )

    expect(providers).toEqual([
      {
        provider: 'anthropic',
        authenticated: true,
        models: ['claude-sonnet-4-6'],
        billingClass: 'api_billed',
      },
    ])
    expect(JSON.stringify(providers)).not.toMatch(/sk-ant|sk-or|secret/i)
    expect(
      buildSubscriptionCatalog({
        relayModels: [],
        oauthProviders: providers,
        transports: [],
        allowApiBilledModels: true,
      }).models,
    ).toEqual([
      expect.objectContaining({
        id: 'anthropic/claude-sonnet-4-6',
        billingClass: 'api_billed',
        selectable: true,
      }),
    ])
  })

  it('enriches routes with model limits and provider-specific reasoning options', () => {
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
      ],
      transports: [],
      allowApiBilledModels: false,
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
      },
    })

    expect(catalog.models[0]?.capabilities).toMatchObject({
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      supportsOutputTokenLimit: false,
      reasoningEfforts: [
        'provider_default',
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ],
    })
    expect(catalog.models[1]?.capabilities).toMatchObject({
      maxInputTokens: 922_000,
      supportsOutputTokenLimit: false,
      reasoningEfforts: [
        'provider_default',
        'none',
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
        'ultra',
      ],
    })
  })

  it('hides API-billed transports until the future-use config is enabled', () => {
    const common = {
      relayModels: [],
      oauthProviders: [
        {
          provider: 'openai-api',
          authenticated: true,
          models: ['gpt-api'],
          billingClass: 'api_billed' as const,
        },
      ],
      transports: [],
    }
    expect(
      buildSubscriptionCatalog({ ...common, allowApiBilledModels: false })
        .models,
    ).toHaveLength(0)
    expect(
      buildSubscriptionCatalog({ ...common, allowApiBilledModels: true })
        .models,
    ).toHaveLength(1)
  })

  it('reports authenticated transports that are not currently usable', () => {
    const catalog = buildSubscriptionCatalog({
      relayModels: [],
      oauthProviders: [],
      transports: [
        {
          id: 'gemini-cli',
          label: 'Gemini CLI OAuth',
          authenticated: true,
          status: 'ineligible',
          warning:
            'Authenticated account is not eligible for this CLI transport.',
        },
      ],
      allowApiBilledModels: false,
    })
    expect(catalog.transports[0]).toMatchObject({
      authenticated: true,
      status: 'ineligible',
    })
  })

  it('keeps quota-limited OAuth routes visible but disables unavailable routes', () => {
    const catalog = buildSubscriptionCatalog({
      relayModels: [
        { id: 'claude-cwm4tx/opus', account: 'cwm4tx', status: 'auth_expired' },
        { id: 'claude-gp/opus', account: 'gp', status: 'quota_limited' },
      ],
      oauthProviders: [],
      transports: [],
      allowApiBilledModels: false,
    })

    expect(
      catalog.models.find((model) => model.id === 'claude-cwm4tx/opus'),
    ).toMatchObject({ selectable: false, status: 'auth_expired' })
    expect(
      catalog.models.find((model) => model.id === 'claude-gp/opus'),
    ).toMatchObject({ selectable: false, status: 'quota_limited' })
  })

  it('uses the Hermes-managed interpreter for live OAuth model discovery', () => {
    const expected =
      'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\python.exe'
    expect(
      resolveHermesPython(
        { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
        (candidate) => candidate === expected,
        'C:\\Users\\test',
        'win32',
      ),
    ).toBe(expected)
  })

  it('normalizes transport-prefixed routes for capability metadata only', () => {
    expect(
      metadataIdentityForRoute({
        id: 'nous/anthropic/claude-opus-4.8',
        provider: 'nous',
        model: 'anthropic/claude-opus-4.8',
      }),
    ).toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' })
    expect(
      metadataIdentityForRoute({
        id: 'openai-codex/gpt-5.6-sol',
        provider: 'openai-codex',
        model: 'gpt-5.6-sol',
      }),
    ).toEqual({ provider: 'openai', model: 'gpt-5.6-sol' })
    expect(
      metadataIdentityForRoute({
        id: 'claude-cwm4tx/fable',
        provider: 'claude-max-relay',
        model: 'fable',
      }),
    ).toEqual({ provider: 'anthropic', model: 'claude-fable-5' })
    expect(
      metadataIdentityForRoute({
        id: 'claude-cwm4tx/claude-opus-5',
        provider: 'claude-max-relay',
        model: 'claude-opus-5',
      }),
    ).toEqual({ provider: 'anthropic', model: 'claude-opus-5' })
    expect(
      metadataIdentityForRoute({
        id: 'claude-cwm4tx/opus-5',
        provider: 'claude-max-relay',
        model: 'opus-5',
      }),
    ).toEqual({ provider: 'anthropic', model: 'claude-opus-5' })
  })

  it('discovers route capabilities without changing route identity', () => {
    const capabilities = discoverModelCapabilities(
      [
        {
          id: 'openai-codex/gpt-5.6-sol',
          provider: 'openai-codex',
          model: 'gpt-5.6-sol',
        },
      ],
      (_command, args) => {
        const queries = inflateSync(
          Buffer.from(String(args.at(-1)), 'base64'),
        ).toString('utf8')
        expect(queries).toContain('openai-codex/gpt-5.6-sol')
        return JSON.stringify({
          'openai-codex/gpt-5.6-sol': {
            context_window: 1_050_000,
            max_input_tokens: 922_000,
            max_output_tokens: 128_000,
            supports_reasoning: true,
            supports_tools: true,
            supports_vision: true,
          },
        })
      },
    )

    expect(capabilities['openai-codex/gpt-5.6-sol']).toEqual({
      contextWindow: 1_050_000,
      maxInputTokens: 922_000,
      maxOutputTokens: 128_000,
      supportsReasoning: true,
      supportsTools: true,
      supportsVision: true,
      metadataSource: 'models.dev',
    })
  })

  it('compresses capability discovery into one managed-Python process', () => {
    let calls = 0
    discoverModelCapabilities(
      Array.from({ length: 51 }, (_, index) => ({
        id: `openai-codex/model-${index}`,
        provider: 'openai-codex',
        model: `model-${index}`,
      })),
      () => {
        calls += 1
        return '{}'
      },
    )
    expect(calls).toBe(1)
  })

  it('caches static capabilities while invalidating when route identity changes', () => {
    let calls = 0
    const resolve = createCachedCapabilityResolver((routes) => {
      calls += 1
      return Object.fromEntries(
        routes.map((route) => [
          route.id,
          {
            contextWindow: 1000,
            maxInputTokens: null,
            maxOutputTokens: 100,
            supportsReasoning: true,
            supportsTools: true,
            supportsVision: false,
            metadataSource: 'test',
          },
        ]),
      )
    })
    const routes = [
      {
        id: 'claude-cwm4tx/fable',
        provider: 'claude-max-relay',
        model: 'fable',
      },
    ]

    resolve(routes)
    resolve([...routes])
    expect(calls).toBe(1)
    resolve([{ ...routes[0], model: 'claude-fable-5' }])
    expect(calls).toBe(2)
  })

  it('does not probe the deprecated Gemini CLI', () => {
    let now = 1000
    let calls = 0
    const resolve = createAuxiliaryTransportResolver(
      (command) => {
        calls += 1
        if (command === 'codex') return 'Logged in using ChatGPT'
        return 'Copilot CLI'
      },
      () => now,
      60_000,
    )

    expect(resolve().map((transport) => transport.id)).toEqual([
      'openai-codex',
      'github-copilot-cli',
    ])
    expect(resolve()).toHaveLength(2)
    expect(calls).toBe(2)
    now += 60_001
    resolve()
    expect(calls).toBe(4)
  })

  it('briefly caches static provider model inventories per provider', () => {
    let now = 1000
    let calls = 0
    const resolve = createProviderModelResolver(
      () => {
        calls += 1
        return '["model-a"]'
      },
      () => now,
      60_000,
    )

    expect(resolve('nous')).toEqual(['model-a'])
    expect(resolve('nous')).toEqual(['model-a'])
    expect(resolve('openai-codex')).toEqual(['model-a'])
    expect(calls).toBe(2)
    now += 60_001
    resolve('nous')
    expect(calls).toBe(3)
  })
})
