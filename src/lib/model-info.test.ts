import { describe, expect, it } from 'vitest'
import {
  deriveFallbackModelInfoFromGateway,
  normalizeModelInfoResponse,
} from './model-info'

describe('normalizeModelInfoResponse', () => {
  it('recognizes explicit runtime switching support', () => {
    expect(
      normalizeModelInfoResponse({
        supports_runtime_switching: true,
        vanilla_agent: false,
      }),
    ).toMatchObject({
      supportsRuntimeSwitching: true,
      vanillaAgent: false,
    })
  })

  it('recognizes vanilla mode strings from dashboard payloads', () => {
    expect(
      normalizeModelInfoResponse({
        mode: 'vanilla',
      }),
    ).toMatchObject({
      supportsRuntimeSwitching: false,
      vanillaAgent: true,
    })
  })

  it('leaves unknown payloads as unknown instead of guessing', () => {
    expect(normalizeModelInfoResponse({})).toMatchObject({
      supportsRuntimeSwitching: null,
      vanillaAgent: null,
    })
  })

  it('falls back to gateway capabilities for enhanced-fork runtimes when dashboard model info is unavailable', () => {
    expect(
      deriveFallbackModelInfoFromGateway('enhanced-fork', {
        enhancedChat: true,
        config: true,
        sessions: true,
      }),
    ).toMatchObject({
      supportsRuntimeSwitching: true,
      vanillaAgent: false,
      mode: 'enhanced',
    })
  })
})
