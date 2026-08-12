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

function user(text: string, fields: Record<string, unknown>): ChatMessage {
  return {
    role: 'user',
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

  it('preserves repeated persisted user turns with distinct server IDs ten seconds apart', () => {
    expect(
      shouldCollapseTextDuplicate(
        user('continue', { id: 'u1', timestamp: 1_000 }),
        user('continue', { id: 'u2', timestamp: 11_000 }),
      ),
    ).toBe(false)
  })

  it('preserves repeated persisted user turns with distinct server IDs and missing timestamps', () => {
    expect(
      shouldCollapseTextDuplicate(
        user('continue', { id: 'u1' }),
        user('continue', { id: 'u2' }),
      ),
    ).toBe(false)
  })

  it('collapses only an optimistic and confirmed user mirror sharing client identity', () => {
    expect(
      shouldCollapseTextDuplicate(
        user('continue', {
          clientId: 'client-1',
          __optimisticId: 'opt-client-1',
        }),
        user('continue', { id: 'u1', client_id: 'client-1' }),
      ),
    ).toBe(true)
  })
})
