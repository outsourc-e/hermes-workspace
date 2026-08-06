// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldCollapseTextDuplicate } from './chat-screen'
import type { ChatMessage } from './types'

function assistant(text: string, fields: Record<string, unknown>): ChatMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    ...fields,
  }
}

describe('ChatScreen textual duplicate ownership', () => {
  it('preserves distinct assistant turns when stable identities differ', () => {
    expect(
      shouldCollapseTextDuplicate(
        assistant('Same answer', { id: 'assistant-turn-a', runId: 'run-a' }),
        assistant('Same answer', { id: 'assistant-turn-b', runId: 'run-b' }),
      ),
    ).toBe(false)
  })

  it('collapses a persisted and streaming copy proven to belong to one run', () => {
    expect(
      shouldCollapseTextDuplicate(
        assistant('One streamed answer', {
          id: 'persisted-answer',
          runId: 'run-shared',
        }),
        assistant('One streamed answer', {
          runId: 'run-shared',
          __streamingStatus: 'complete',
        }),
      ),
    ).toBe(true)
  })
})
