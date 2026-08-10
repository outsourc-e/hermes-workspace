import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  applyGlobalOrchestrationPolicyTransaction,
  normalizeLoopbackRelayBaseUrl,
  policyToHermesPatch,
  serializeOrchestrationWrite,
  syncGlobalOrchestrationPolicy,
  topLevelModelForRef,
} from './orchestration-hermes-sync'
import {
  DEFAULT_ORCHESTRATION_POLICY,
  getOrchestrationPolicy,
} from './orchestration-policy'
import type { SubscriptionCatalog } from './subscription-model-catalog'

function canonicalCatalog(...ids: Array<string>): SubscriptionCatalog {
  return {
    generatedAt: '2026-08-10T00:00:00.000Z',
    subscriptionOnly: true,
    transports: [],
    visibility: { showNousModels: false, showApiBilledModels: false },
    models: ids.map((id) => {
      const slash = id.indexOf('/')
      return {
        id,
        provider: id.slice(0, slash),
        account: id.slice(0, slash),
        model: id.slice(slash + 1),
        transport: 'test',
        billingClass: 'subscription_included',
        status: 'available',
        selectable: true,
        warning: '',
        resetAt: null,
      }
    }),
  }
}

describe('orchestration policy Hermes synchronization', () => {
  it('rejects non-loopback relay URLs', () => {
    expect(
      normalizeLoopbackRelayBaseUrl(
        'https://example.com/v1',
        'http://127.0.0.1:8651',
      ),
    ).toBe('http://127.0.0.1:8651')
    expect(
      normalizeLoopbackRelayBaseUrl(
        'http://localhost:8651/v1',
        'http://127.0.0.1:8651',
      ),
    ).toBe('http://localhost:8651/v1')
  })

  it('maps subscription defaults, memory review, limits, context, and named workers', () => {
    const patch = policyToHermesPatch(
      {
        ...DEFAULT_ORCHESTRATION_POLICY,
        orchestratorModelRef: 'claude-cwm4tx/sonnet',
        defaultSubagentModelRef: 'openai-codex/gpt-5.6-sol',
        quota: {
          ...DEFAULT_ORCHESTRATION_POLICY.quota,
          fallbackModelRefs: ['claude-cwm4tx/sonnet'],
        },
        namedWorkers: [
          {
            id: 'reviewer',
            name: 'Reviewer',
            description: 'Independent review',
            modelRef: 'openai-codex/gpt-5.6-sol',
            role: 'leaf',
          },
        ],
      },
      {
        model: {
          provider: 'custom',
          base_url: 'http://127.0.0.1:8650/v1',
          api_key: 'local-placeholder',
          api_mode: 'chat_completions',
        },
      },
    )

    expect(patch.model).toEqual({
      provider: 'custom',
      default: 'claude-cwm4tx/sonnet',
      base_url: 'http://127.0.0.1:8650/v1',
      api_key: 'local-placeholder',
      api_mode: 'chat_completions',
    })
    expect(patch.delegation).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-5.6-sol',
      max_concurrent_children: 3,
      max_concurrent_per_account: 1,
      max_spawn_depth: 2,
      max_total_agents: 8,
      context_mode: 'full',
      context_overflow: 'auto_compact_notify',
      memory_access: 'shared_read_write',
      child_memory_write_review: 'parent_queue',
      allow_api_billed_models: false,
    })
    expect(patch.delegation.named_workers[0]).toEqual({
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Independent review',
      model_ref: 'openai-codex/gpt-5.6-sol',
      role: 'leaf',
    })
    expect(patch.fallback_providers).toEqual([
      {
        provider: 'custom',
        model: 'claude-cwm4tx/sonnet',
        base_url: 'http://127.0.0.1:8650/v1',
        api_key: 'local-placeholder',
        api_mode: 'chat_completions',
      },
    ])
    expect(patch.auxiliary).toEqual({ free_only: true })
  })

  it('can switch the orchestrator back to the Claude relay after using another OAuth provider', () => {
    const patch = policyToHermesPatch(
      {
        ...DEFAULT_ORCHESTRATION_POLICY,
        orchestratorModelRef: 'claude-cwm4tx/sonnet',
      },
      {
        model: {
          provider: 'openai-codex',
          model: 'gpt-5.6-sol',
        },
      },
    )

    expect(patch.model).toMatchObject({
      provider: 'custom',
      default: 'claude-cwm4tx/sonnet',
      base_url: 'http://127.0.0.1:8650/v1',
      api_mode: 'chat_completions',
    })
  })

  it('never emits OpenRouter as a fallback provider', () => {
    expect(() =>
      policyToHermesPatch(
        {
          ...DEFAULT_ORCHESTRATION_POLICY,
          quota: {
            ...DEFAULT_ORCHESTRATION_POLICY.quota,
            fallbackModelRefs: [
              'OpenRouter/anthropic/claude-opus-5',
              'openai-codex/gpt-5.6-sol',
            ],
          },
        },
        {},
      ),
    ).toThrow(/OpenRouter.*not permitted/i)
  })

  it('routes Antigravity Gemini models through the authenticated local relay', () => {
    expect(
      topLevelModelForRef('google-antigravity/gemini-3.6-flash-high', {}),
    ).toEqual({
      provider: 'custom',
      default: 'google-antigravity/gemini-3.6-flash-high',
      base_url: 'http://127.0.0.1:8651/v1',
      api_key: 'local-placeholder',
      api_mode: 'chat_completions',
    })
  })

  it('rejects a non-loopback ANTIGRAVITY_RELAY_BASE_URL instead of silently substituting it', () => {
    const previous = process.env.ANTIGRAVITY_RELAY_BASE_URL
    process.env.ANTIGRAVITY_RELAY_BASE_URL = 'http://10.0.0.7:8651'
    try {
      expect(() =>
        topLevelModelForRef('google-antigravity/gemini-3.6-flash-high', {}),
      ).toThrow(/loopback/i)
    } finally {
      if (previous === undefined) delete process.env.ANTIGRAVITY_RELAY_BASE_URL
      else process.env.ANTIGRAVITY_RELAY_BASE_URL = previous
    }
  })

  it('preserves GPT-5.6-sol as an OpenAI Codex OAuth route in generated Hermes config', () => {
    expect(
      policyToHermesPatch(
        {
          ...DEFAULT_ORCHESTRATION_POLICY,
          orchestratorModelRef: 'openai-codex/gpt-5.6-sol',
        },
        {},
      ).model,
    ).toEqual({
      provider: 'openai-codex',
      default: 'gpt-5.6-sol',
    })
  })

  it('removes legacy fallback_model content when generating the canonical fallback chain', () => {
    const home = mkdtempSync(join(tmpdir(), 'orchestration-hermes-sync-'))
    const previousHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = home
    try {
      writeFileSync(
        join(home, 'config.yaml'),
        [
          'fallback_model:',
          '  provider: openrouter',
          '  model: anthropic/claude-opus-5',
          'fallback_providers:',
          '  - provider: openrouter',
          '    model: auto',
          '',
        ].join('\n'),
        'utf8',
      )
      syncGlobalOrchestrationPolicy({
        ...DEFAULT_ORCHESTRATION_POLICY,
        quota: {
          ...DEFAULT_ORCHESTRATION_POLICY.quota,
          fallbackModelRefs: ['openai-codex/gpt-5.6-sol'],
        },
      })

      const raw = readFileSync(join(home, 'config.yaml'), 'utf8')
      const config = YAML.parse(raw)
      expect(config.fallback_model).toBeUndefined()
      expect(config.fallback_providers).toEqual([
        { provider: 'openai-codex', model: 'gpt-5.6-sol' },
      ])
      expect(raw).not.toMatch(/openrouter/i)
    } finally {
      if (previousHome === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('serializes orchestration writes in request order', async () => {
    const events: Array<string> = []
    let releaseFirst = () => {}
    let markFirstStarted = () => {}
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = serializeOrchestrationWrite(async () => {
      events.push('first:start')
      markFirstStarted()
      await firstGate
      events.push('first:end')
    })
    await firstStarted
    const second = serializeOrchestrationWrite(() => {
      events.push('second:start')
      events.push('second:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  it('rolls policy back when the Hermes config commit fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orchestration-transaction-'))
    const stateDir = join(root, 'state')
    const invalidHermesHome = join(root, 'hermes-home-is-a-file')
    writeFileSync(invalidHermesHome, 'not a directory', 'utf8')
    const previousStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
    const previousHome = process.env.HERMES_HOME
    process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
    process.env.HERMES_HOME = invalidHermesHome
    try {
      await expect(
        applyGlobalOrchestrationPolicyTransaction(
          { orchestratorModelRef: 'openai-codex/gpt-5.6-sol' },
          { catalog: canonicalCatalog('openai-codex/gpt-5.6-sol') },
        ),
      ).rejects.toThrow(/synchronize/i)
      expect(getOrchestrationPolicy()).toEqual(DEFAULT_ORCHESTRATION_POLICY)
    } finally {
      if (previousStateDir === undefined)
        delete process.env.HERMES_WORKSPACE_STATE_DIR
      else process.env.HERMES_WORKSPACE_STATE_DIR = previousStateDir
      if (previousHome === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = previousHome
      rmSync(root, { recursive: true, force: true })
    }
  })
})
