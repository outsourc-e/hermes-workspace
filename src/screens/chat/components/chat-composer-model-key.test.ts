import { describe, expect, it } from 'vitest'
import { getResolvedModelKey, isCurrentModel } from './chat-composer'

describe('chat composer model keys', () => {
  it('uses Hermes provider-qualified request syntax', () => {
    expect(getResolvedModelKey('deepseek/deepseek-v4-pro', 'openrouter')).toBe(
      'openrouter::deepseek/deepseek-v4-pro',
    )
  })

  it('leaves the virtual Hermes model unqualified', () => {
    expect(getResolvedModelKey('Hermes Agent', 'hermes')).toBe('Hermes Agent')
  })

  it('recognizes provider-qualified and legacy selected models', () => {
    expect(
      isCurrentModel(
        'openrouter::deepseek/deepseek-v4-pro',
        'deepseek/deepseek-v4-pro',
        'openrouter',
      ),
    ).toBe(true)
    expect(
      isCurrentModel(
        'openrouter/deepseek/deepseek-v4-pro',
        'deepseek/deepseek-v4-pro',
        'openrouter',
      ),
    ).toBe(true)
  })
})
