import { describe, expect, it } from 'vitest'

import {
  estimateContextTokensFromCacheRead,
  estimateContextTokensFromMessages,
} from './context-usage'

describe('context usage estimation', () => {
  it('counts serialized content arrays and tool results instead of only string lengths', () => {
    const tokens = estimateContextTokensFromMessages([
      {
        content: [{ type: 'text', text: 'hello world' }],
      },
      {
        content: [
          {
            type: 'tool_result',
            text: 'x'.repeat(400),
          },
        ],
      },
    ])

    expect(tokens).toBeGreaterThan(100)
  })

  it('does not double-count top-level text when it mirrors structured content', () => {
    const mirroredToolOutput = JSON.stringify({ output: 'x'.repeat(4000) })
    const withMirroredText = estimateContextTokensFromMessages([
      {
        content: [{ type: 'tool_result', text: mirroredToolOutput }],
        text: mirroredToolOutput,
      },
    ])
    const contentOnly = estimateContextTokensFromMessages([
      {
        content: [{ type: 'tool_result', text: mirroredToolOutput }],
      },
    ])

    expect(withMirroredText).toBe(contentOnly)
  })

  it('keeps cumulative cache-read totals as a fallback, not the primary estimate', () => {
    const messageEstimate = estimateContextTokensFromMessages([
      { content: 'x'.repeat(4_000) },
    ])
    const cacheEstimate = estimateContextTokensFromCacheRead(14_100_480, 123)

    expect(messageEstimate).toBeLessThan(cacheEstimate)
    expect(messageEstimate).toBeGreaterThan(1000)
    expect(messageEstimate).toBeLessThan(1200)
  })
})
