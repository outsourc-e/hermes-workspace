import { describe, expect, it } from 'vitest'

import { selectSwarmOrchestratorRoute } from './swarm-decompose-model'

describe('selectSwarmOrchestratorRoute', () => {
  const routes = [
    { id: 'claude-cwm4tx/sonnet', selectable: true },
    { id: 'openai-codex/gpt-5.6-sol', selectable: true },
    { id: 'api/paid-model', selectable: false },
  ]

  it('uses the orchestration policy route when the request has no override', () => {
    expect(
      selectSwarmOrchestratorRoute({
        requestedModel: '',
        orchestratorModelRef: 'claude-cwm4tx/sonnet',
        routes,
      }),
    ).toBe('claude-cwm4tx/sonnet')
  })

  it('falls back to the configured default child route when no orchestrator override exists', () => {
    expect(
      selectSwarmOrchestratorRoute({
        requestedModel: '',
        orchestratorModelRef: '',
        fallbackModelRef: 'openai-codex/gpt-5.6-sol',
        routes,
      }),
    ).toBe('openai-codex/gpt-5.6-sol')
  })

  it('accepts only selectable canonical routes as explicit overrides', () => {
    expect(
      selectSwarmOrchestratorRoute({
        requestedModel: 'openai-codex/gpt-5.6-sol',
        orchestratorModelRef: 'claude-cwm4tx/sonnet',
        routes,
      }),
    ).toBe('openai-codex/gpt-5.6-sol')

    expect(() =>
      selectSwarmOrchestratorRoute({
        requestedModel: 'api/paid-model',
        orchestratorModelRef: 'claude-cwm4tx/sonnet',
        routes,
      }),
    ).toThrow('not a selectable OAuth subscription route')
  })
})
