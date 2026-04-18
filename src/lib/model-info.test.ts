import { describe, expect, it } from 'vitest'
import { normalizeModelInfoResponse } from './model-info'

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
})
