import { describe, expect, it } from 'vitest'
import { buildDisplayEntries } from './chat-message-list'
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
  it('attaches trailing persisted tool-only assistant messages to the last text reply', () => {
    const entries = buildDisplayEntries([
      textMessage('u1', 'user', 'show issues'),
      textMessage('a1', 'assistant', 'Open issues: 2'),
      toolOnlyAssistant('a2'),
      toolOnlyAssistant('a3'),
    ])

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.message.id)).toEqual(['u1', 'a1'])
    expect(entries[1].attachedToolMessages.map((message) => message.id)).toEqual([
      'a2',
      'a3',
    ])
  })
})