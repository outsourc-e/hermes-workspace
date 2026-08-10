import { describe, expect, it } from 'vitest'

import {
  clearConfiguredSessionModelsForTest,
  rememberConfiguredSessionModel,
  resolveConfiguredGatewayModel,
  resolveConfiguredPrimaryModel,
  resolveSessionGatewayModel,
} from './configured-primary-model'

describe('configured primary model resolution', () => {
  const config = {
    model: {
      provider: 'openai-codex',
      default: 'gpt-5.6-terra',
    },
  }

  it('reads the current Hermes provider and model from nested configuration', () => {
    expect(resolveConfiguredPrimaryModel(config)).toEqual({
      provider: 'openai-codex',
      model: 'gpt-5.6-terra',
    })
  })

  it('uses the configured primary model when the request omits a model', () => {
    expect(resolveConfiguredGatewayModel(undefined, config)).toBe(
      'gpt-5.6-terra',
    )
  })

  it('replaces virtual or generic default aliases with the configured primary model', () => {
    expect(resolveConfiguredGatewayModel('hermes-agent', config)).toBe(
      'gpt-5.6-terra',
    )
    expect(resolveConfiguredGatewayModel(' default ', config)).toBe(
      'gpt-5.6-terra',
    )
  })

  it('uses a New Session concrete model for later virtual requests without config resolution', () => {
    clearConfiguredSessionModelsForTest()
    rememberConfiguredSessionModel('session-1', 'gpt-5.6-terra')

    expect(resolveSessionGatewayModel('session-1', 'hermes-agent')).toBe(
      'gpt-5.6-terra',
    )
    expect(resolveSessionGatewayModel('session-1', undefined)).toBe(
      'gpt-5.6-terra',
    )
    expect(resolveSessionGatewayModel('session-1', 'gpt-5.4-mini')).toBe(
      'gpt-5.4-mini',
    )

    clearConfiguredSessionModelsForTest()
  })

  it('preserves an explicit real model selection', () => {
    expect(resolveConfiguredGatewayModel('gpt-5.4-mini', config)).toBe(
      'gpt-5.4-mini',
    )
  })

  it('accepts the legacy flat provider and model configuration', () => {
    expect(
      resolveConfiguredPrimaryModel({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      }),
    ).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
  })

  it('does not forward a virtual configured default', () => {
    expect(
      resolveConfiguredGatewayModel(undefined, {
        model: { provider: 'openai-codex', default: 'hermes-agent' },
      }),
    ).toBeUndefined()
  })
})
