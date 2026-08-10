import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_ORCHESTRATION_POLICY,
  getOrchestrationPolicy,
  getSessionOrchestrationPolicy,
  saveOrchestrationPolicy,
  saveSessionOrchestrationPolicy,
} from './orchestration-policy'
import type { SubscriptionCatalog } from './subscription-model-catalog'

let stateDir = ''
const previousStateDir = process.env.HERMES_WORKSPACE_STATE_DIR

function catalogWith(...ids: Array<string>): SubscriptionCatalog {
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

const canonicalCatalog = catalogWith(
  'openai-codex/gpt-5.6-sol',
  'claude-cwm4tx/sonnet',
)

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'workspace-orchestration-'))
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})

afterEach(() => {
  if (previousStateDir === undefined)
    delete process.env.HERMES_WORKSPACE_STATE_DIR
  else process.env.HERMES_WORKSPACE_STATE_DIR = previousStateDir
  rmSync(stateDir, { recursive: true, force: true })
})

describe('orchestration policy', () => {
  it('uses subscription-only, review-queued, full-context defaults', () => {
    const policy = getOrchestrationPolicy()

    expect(policy).toEqual(DEFAULT_ORCHESTRATION_POLICY)
    expect(policy.billing.allowApiBilledModels).toBe(false)
    expect(policy.billing.showNousModels).toBe(false)
    expect(policy.memory.childAccess).toBe('shared_read_write')
    expect(policy.memory.childWriteReview).toBe('parent_queue')
    expect(policy.context.preferred).toBe('full')
    expect(policy.context.overflow).toBe('auto_compact_notify')
    expect(policy.quota.unattended).toBe('subscription_fallback')
  })

  it('persists validated global policy updates without dropping defaults', () => {
    const saved = saveOrchestrationPolicy(
      {
        defaultSubagentModelRef: 'openai-codex/gpt-5.6-sol',
        limits: { maxConcurrentChildren: 2 },
      },
      { catalog: canonicalCatalog },
    )

    expect(saved.defaultSubagentModelRef).toBe('openai-codex/gpt-5.6-sol')
    expect(saved.limits.maxConcurrentChildren).toBe(2)
    expect(saved.limits.maxSpawnDepth).toBe(
      DEFAULT_ORCHESTRATION_POLICY.limits.maxSpawnDepth,
    )
    expect(
      JSON.parse(
        readFileSync(join(stateDir, 'orchestration-policy.json'), 'utf8'),
      ),
    ).toMatchObject({ defaultSubagentModelRef: 'openai-codex/gpt-5.6-sol' })
  })

  it('stores per-session overrides separately and merges them over global policy', () => {
    saveOrchestrationPolicy(
      {
        orchestratorModelRef: 'claude-cwm4tx/sonnet',
        routingMode: 'explicit',
      },
      { catalog: canonicalCatalog },
    )
    saveSessionOrchestrationPolicy(
      'session/one',
      {
        orchestratorModelRef: 'openai-codex/gpt-5.6-sol',
        routingMode: 'automatic',
        context: { overflow: 'ask' },
      },
      { catalog: canonicalCatalog },
    )

    const effective = getSessionOrchestrationPolicy('session/one')
    expect(effective.orchestratorModelRef).toBe('openai-codex/gpt-5.6-sol')
    expect(effective.routingMode).toBe('automatic')
    expect(effective.context.preferred).toBe('full')
    expect(effective.context.overflow).toBe('ask')
  })

  it('persists the Nous visibility option without enabling API billing', () => {
    const saved = saveOrchestrationPolicy({
      billing: { showNousModels: true },
    })
    expect(saved.billing).toEqual({
      allowApiBilledModels: false,
      showNousModels: true,
    })
  })

  it('rejects unsafe API-billing enablement unless explicitly confirmed', () => {
    expect(() =>
      saveOrchestrationPolicy({
        billing: { allowApiBilledModels: true },
      }),
    ).toThrow(/explicit confirmation/i)

    expect(
      saveOrchestrationPolicy(
        { billing: { allowApiBilledModels: true } },
        { confirmApiBilling: true },
      ).billing.allowApiBilledModels,
    ).toBe(true)
  })

  it('does not allow policy patches to mutate object prototypes', () => {
    const pollutedPatch = JSON.parse(
      '{"__proto__":{"confirmApiBilling":true}}',
    )
    try {
      saveOrchestrationPolicy(pollutedPatch)
      expect(
        ({} as { confirmApiBilling?: boolean }).confirmApiBilling,
      ).toBeUndefined()
    } finally {
      delete (Object.prototype as { confirmApiBilling?: boolean })
        .confirmApiBilling
    }
  })

  it('rejects unknown or unavailable model references in every saved assignment field', () => {
    const unavailableCatalog: SubscriptionCatalog = {
      ...canonicalCatalog,
      models: canonicalCatalog.models.map((model) => ({
        ...model,
        selectable: model.id !== 'claude-cwm4tx/sonnet',
        status:
          model.id === 'claude-cwm4tx/sonnet'
            ? ('unavailable' as const)
            : model.status,
      })),
    }
    const invalidPatches = [
      { orchestratorModelRef: 'unknown/model' },
      { defaultSubagentModelRef: 'unknown/model' },
      { quota: { fallbackModelRefs: ['unknown/model'] } },
      {
        namedWorkers: [
          {
            id: 'reviewer',
            name: 'Reviewer',
            modelRef: 'unknown/model',
            role: 'leaf' as const,
            description: '',
          },
        ],
      },
      { orchestratorModelRef: 'claude-cwm4tx/sonnet' },
    ]

    for (const patch of invalidPatches) {
      expect(() =>
        saveOrchestrationPolicy(patch, { catalog: unavailableCatalog }),
      ).toThrow(/assignable.*catalog/i)
    }
    expect(getOrchestrationPolicy()).toEqual(DEFAULT_ORCHESTRATION_POLICY)
  })

  it('hard-denies OpenRouter case-insensitively in every global and session assignment field', () => {
    const permissiveCatalog = catalogWith(
      'OpenRouter/anthropic/claude-opus-5',
      'openrouter/anthropic/claude-opus-5',
    )
    const openRouterPatches = [
      { orchestratorModelRef: 'OpenRouter/anthropic/claude-opus-5' },
      { defaultSubagentModelRef: 'OPENROUTER/anthropic/claude-opus-5' },
      { quota: { fallbackModelRefs: ['openRouter/anthropic/claude-opus-5'] } },
      {
        namedWorkers: [
          {
            id: 'reviewer',
            name: 'Reviewer',
            modelRef: 'OpenRouter/anthropic/claude-opus-5',
            role: 'leaf' as const,
            description: '',
          },
        ],
      },
    ]

    for (const patch of openRouterPatches) {
      expect(() =>
        saveOrchestrationPolicy(patch, { catalog: permissiveCatalog }),
      ).toThrow(/OpenRouter.*not permitted/i)
    }
    expect(() =>
      saveSessionOrchestrationPolicy(
        'session-one',
        { orchestratorModelRef: 'OpenRouter/anthropic/claude-opus-5' },
        { catalog: permissiveCatalog },
      ),
    ).toThrow(/OpenRouter.*not permitted/i)
  })

  it('requires a canonical catalog whenever a saved policy contains model references', () => {
    expect(() =>
      saveOrchestrationPolicy({
        orchestratorModelRef: 'openai-codex/gpt-5.6-sol',
      }),
    ).toThrow(/canonical catalog/i)
  })
})
