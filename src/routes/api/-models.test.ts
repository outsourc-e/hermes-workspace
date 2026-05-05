import { describe, expect, it } from 'vitest'
import { mergeModelEntries } from './models'

describe('mergeModelEntries', () => {
  it('keeps local catalog entries and appends Hermes backend models without duplicates', () => {
    const merged = mergeModelEntries(
      [
        { id: 'workspace/default', name: 'Workspace default', provider: 'workspace' },
        { id: 'openai/gpt-4.1', name: 'GPT-4.1 from local catalog', provider: 'openai' },
      ],
      [
        { id: 'openai/gpt-4.1', name: 'GPT-4.1 from Hermes', provider: 'openai' },
        { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet', provider: 'anthropic' },
      ],
    )

    expect(merged.map((model) => model.id)).toEqual([
      'workspace/default',
      'openai/gpt-4.1',
      'anthropic/claude-sonnet-4.5',
    ])
    expect(merged[1]?.name).toBe('GPT-4.1 from local catalog')
  })

  it('normalizes string model ids from Hermes-compatible /v1/models responses', () => {
    expect(mergeModelEntries(['openrouter/qwen/qwen3-coder'])).toEqual([
      {
        id: 'openrouter/qwen/qwen3-coder',
        name: 'openrouter/qwen/qwen3-coder',
        provider: 'openrouter',
      },
    ])
  })
})
