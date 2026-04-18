import { describe, expect, it } from 'vitest'

import { advanceStickyStreamingText } from './chat-screen-utils'

describe('advanceStickyStreamingText', () => {
  it('preserves the last non-empty streaming text when a tool phase temporarily reports empty text', () => {
    const afterText = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-1',
      rawText: 'Working through the task',
      smoothedText: 'Working through the task',
      previousState: { runId: null, text: '' },
    })

    const afterToolPhase = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-1',
      rawText: '',
      smoothedText: '',
      previousState: afterText,
    })

    expect(afterToolPhase).toEqual({
      runId: 'run-1',
      text: 'Working through the task',
    })
  })

  it('resets sticky text when a new run starts', () => {
    const next = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-2',
      rawText: '',
      smoothedText: '',
      previousState: { runId: 'run-1', text: 'Old stream text' },
    })

    expect(next).toEqual({ runId: 'run-2', text: '' })
  })

  it('clears sticky text when streaming ends', () => {
    const next = advanceStickyStreamingText({
      isStreaming: false,
      runId: null,
      rawText: '',
      smoothedText: '',
      previousState: { runId: 'run-1', text: 'Old stream text' },
    })

    expect(next).toEqual({ runId: null, text: '' })
  })
})
