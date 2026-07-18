import { describe, expect, it } from 'vitest'
import {
  buildDisplayEntries,
  getTrailingToolOnlyTurnSummary,
} from './chat-message-list'
import type { ChatMessage } from '../types'

function textMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string,
): ChatMessage {
  return {
    id,
    role,
    content: [{ type: 'text', text }],
    timestamp: 1,
  } as ChatMessage
}

function toolOnlyAssistant(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: `${id}-tool`,
        name: 'terminal',
        arguments: {},
      },
    ],
    timestamp: 2,
  } as ChatMessage
}

describe('buildDisplayEntries', () => {
  it('does not attach trailing persisted tool-only assistant messages to the last text reply', () => {
    const entries = buildDisplayEntries([
      textMessage('u1', 'user', 'show issues'),
      textMessage('a1', 'assistant', 'Open issues: 2'),
      toolOnlyAssistant('a2'),
      toolOnlyAssistant('a3'),
    ])

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.message.id)).toEqual(['u1', 'a1'])
    expect(entries[1].attachedToolMessages).toHaveLength(0)
  })

  it('routes a toolResult to the pending tool-only turn, not the earlier text reply', () => {
    const entries = buildDisplayEntries([
      textMessage('u1', 'user', 'show issues'),
      textMessage('a1', 'assistant', 'Open issues: 2'),
      toolOnlyAssistant('a2'),
      {
        id: 't1',
        role: 'toolResult',
        toolCallId: 'a2-tool',
        toolName: 'terminal',
        content: [{ type: 'text', text: 'ok' }],
        timestamp: 3,
      } as ChatMessage,
    ])

    // t1 belongs to the pending a2 turn — it must not leak onto a1.
    expect(entries.map((entry) => entry.message.id)).toEqual(['u1', 'a1'])
    expect(entries[1].attachedToolMessages).toHaveLength(0)
  })

  it('still attaches a pending tool-only turn and its result to the next assistant text', () => {
    const entries = buildDisplayEntries([
      textMessage('u1', 'user', 'show issues'),
      toolOnlyAssistant('a1'),
      {
        id: 't1',
        role: 'toolResult',
        toolCallId: 'a1-tool',
        toolName: 'terminal',
        content: [{ type: 'text', text: 'ok' }],
        timestamp: 3,
      } as ChatMessage,
      textMessage('a2', 'assistant', 'Open issues: 2'),
    ])

    expect(entries.map((entry) => entry.message.id)).toEqual(['u1', 'a2'])
    expect(entries[1].attachedToolMessages.map((m) => m.id)).toEqual(['a1', 't1'])
  })
})

describe('getTrailingToolOnlyTurnSummary', () => {
  it('detects hidden trailing tool-only messages after the final assistant response', () => {
    const summary = getTrailingToolOnlyTurnSummary([
      textMessage('u1', 'user', 'show issues'),
      textMessage('a1', 'assistant', 'Open issues: 2'),
      toolOnlyAssistant('a2'),
      {
        id: 't1',
        role: 'toolResult',
        toolCallId: 'a2-tool',
        toolName: 'terminal',
        content: [{ type: 'text', text: 'ok' }],
        timestamp: 3,
      } as ChatMessage,
      toolOnlyAssistant('a3'),
    ])

    expect(summary).toEqual({
      count: 3,
      toolNames: ['terminal'],
      hasFinalAssistantText: true,
    })
  })

  it('returns null when the thread already ends with assistant text', () => {
    const summary = getTrailingToolOnlyTurnSummary([
      textMessage('u1', 'user', 'show issues'),
      toolOnlyAssistant('a2'),
      textMessage('a1', 'assistant', 'Done.'),
    ])

    expect(summary).toBeNull()
  })
})
