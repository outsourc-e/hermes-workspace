import { describe, expect, it } from 'vitest'

import {
  buildOutputCapOptions,
  groupOperationsCatalogModels,
  operationsModelDisplayName,
  operationsModelLifecycle,
} from './operations-model-config'

const models = [
  {
    id: 'claude-cwm4tx/opus-5',
    provider: 'claude-max-relay',
    account: 'cwm4tx',
    model: 'opus-5',
    transport: 'claude-cli-oauth',
    billingClass: 'subscription_included',
    status: 'available',
    selectable: true,
    warning: '',
    resetAt: null,
  },
  {
    id: 'nous/google/gemini-3.1-pro-preview',
    provider: 'nous',
    account: 'nous',
    model: 'google/gemini-3.1-pro-preview',
    transport: 'nous-oauth',
    billingClass: 'subscription_unknown',
    status: 'available',
    selectable: true,
    warning: 'Entitlement varies',
    resetAt: null,
  },
  {
    id: 'openai-codex/gpt-5.6-sol',
    provider: 'openai-codex',
    account: 'openai-codex',
    model: 'gpt-5.6-sol',
    transport: 'openai-codex-oauth',
    billingClass: 'subscription_included',
    status: 'available',
    selectable: true,
    warning: '',
    resetAt: null,
  },
  {
    id: 'google-antigravity/gemini-3.1-pro',
    provider: 'google-antigravity',
    account: 'google-antigravity',
    model: 'gemini-3.1-pro',
    transport: 'google-antigravity-oauth',
    billingClass: 'subscription_included',
    status: 'available',
    selectable: true,
    warning: '',
    resetAt: null,
  },
  {
    id: 'blocked/model',
    provider: 'blocked',
    account: 'blocked',
    model: 'model',
    transport: 'blocked',
    billingClass: 'api_billed',
    status: 'unavailable',
    selectable: false,
    warning: '',
    resetAt: null,
  },
] as const

describe('Operations model catalog grouping', () => {
  it('groups selectable routes by account-aware transport and searches all labels', () => {
    expect(groupOperationsCatalogModels(models as any, 'gemini', '')).toEqual([
      { label: 'Antigravity — Gemini', models: [models[3]] },
    ])
    expect(groupOperationsCatalogModels(models as any, '', '')[0]?.label).toBe(
      'Claude Max — CWM',
    )
    expect(operationsModelDisplayName(models[3] as any)).toBe(
      'Antigravity — Gemini 3.1 Pro',
    )
    expect(operationsModelDisplayName(models[2] as any)).toBe(
      'OpenAI Codex — GPT 5.6 Sol',
    )
  })

  it('always shows Codex while hiding Nous and API models until explicitly unhidden', () => {
    const defaultIds = groupOperationsCatalogModels(models as any, '', '')
      .flatMap((group) => group.models.map((model) => model.id))
    expect(defaultIds).toContain('openai-codex/gpt-5.6-sol')
    expect(defaultIds).not.toContain('nous/google/gemini-3.1-pro-preview')
    expect(defaultIds).not.toContain('blocked/model')

    const visibleIds = groupOperationsCatalogModels(
      models as any,
      '',
      '',
      false,
      { showNous: true, showApi: true },
    ).flatMap((group) => group.models.map((model) => model.id))
    expect(visibleIds).toContain('nous/google/gemini-3.1-pro-preview')
    expect(visibleIds).not.toContain('blocked/model')
  })

  it('preserves a selected unknown legacy route without exposing blocked catalog routes', () => {
    const grouped = groupOperationsCatalogModels(
      models as any,
      '',
      'legacy/model',
    )
    expect(
      grouped.flatMap((group) => group.models).map((model) => model.id),
    ).toEqual([
      'legacy/model',
      'claude-cwm4tx/opus-5',
      'openai-codex/gpt-5.6-sol',
      'google-antigravity/gemini-3.1-pro',
    ])
  })

  it('preserves a selected catalog route that becomes unavailable', () => {
    const expired = {
      ...models[0],
      status: 'auth_expired',
      selectable: false,
      warning: 'Claude OAuth expired',
    }
    const grouped = groupOperationsCatalogModels(
      [expired, models[1]] as any,
      'gemini',
      expired.id,
    )

    expect(grouped.flatMap((group) => group.models)).toContainEqual(expired)
  })

  it('prioritizes latest aliases and hides previous Claude snapshots by default', () => {
    const claudeModels = [
      { ...models[0], id: 'claude-cwm4tx/fable', model: 'fable' },
      {
        ...models[0],
        id: 'claude-cwm4tx/claude-fable-5',
        model: 'claude-fable-5',
      },
      {
        ...models[0],
        id: 'claude-cwm4tx/claude-opus-4-8',
        model: 'claude-opus-4-8',
      },
    ]

    expect(operationsModelLifecycle(claudeModels[0] as any)).toBe(
      'latest_alias',
    )
    expect(operationsModelLifecycle(claudeModels[1] as any)).toBe(
      'current_pinned',
    )
    expect(operationsModelLifecycle(claudeModels[2] as any)).toBe(
      'previous_pinned',
    )
    expect(
      operationsModelLifecycle({
        ...models[1],
        id: 'nous/anthropic/claude-opus-4.8',
        model: 'anthropic/claude-opus-4.8',
      } as any),
    ).toBe('previous_pinned')
    expect(
      groupOperationsCatalogModels(claudeModels as any, '', '').flatMap(
        (group) => group.models.map((model) => model.id),
      ),
    ).toEqual(['claude-cwm4tx/fable', 'claude-cwm4tx/claude-fable-5'])
    expect(
      groupOperationsCatalogModels(
        claudeModels as any,
        '',
        'claude-cwm4tx/claude-opus-4-8',
      ).flatMap((group) => group.models.map((model) => model.id)),
    ).toContain('claude-cwm4tx/claude-opus-4-8')
    expect(
      groupOperationsCatalogModels(claudeModels as any, '', '', true).flatMap(
        (group) => group.models.map((model) => model.id),
      ),
    ).toContain('claude-cwm4tx/claude-opus-4-8')
  })

  it('builds configured output caps from each model hard maximum', () => {
    expect(buildOutputCapOptions(65_536)).toEqual([
      4096, 8192, 16_384, 32_768, 65_536,
    ])
    expect(buildOutputCapOptions(256_000)).toEqual([
      4096, 8192, 16_384, 32_768, 65_536, 128_000, 256_000,
    ])
    expect(buildOutputCapOptions(8192, 6000)).toEqual([4096, 6000, 8192])
  })
})
