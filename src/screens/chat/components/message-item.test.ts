import { describe, expect, it } from 'vitest'

import {
  buildAttachedToolSections,
  buildInlineToolRenderPlan,
  compactInlineToolRenderPlan,
  deduplicateInlineToolSections,
  detectAssistantCorruptionWarning,
} from './message-item'
import {
  buildDisplayEntries,
  shouldIncludeDisplayMessage,
} from './chat-message-list'
import type { ChatMessage } from '../types'

describe('buildInlineToolRenderPlan', () => {
  it('preserves tool-call position from assistant content order', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Before tool. ' },
        {
          type: 'toolCall',
          id: 'tc-1',
          name: 'browser_snapshot',
          arguments: { full: false },
        },
        { type: 'text', text: 'After tool.' },
      ],
      timestamp: Date.now(),
    }

    const plan = buildInlineToolRenderPlan(message, [
      {
        key: 'tc-1',
        type: 'browser_snapshot',
        preview: '📸 Snapshot',
        outputText: '',
        state: 'input-available',
      },
    ])

    expect(plan).toEqual([
      { kind: 'text', text: 'Before tool. ' },
      {
        kind: 'tool',
        section: {
          key: 'tc-1',
          type: 'browser_snapshot',
          preview: '📸 Snapshot',
          outputText: '',
          state: 'input-available',
        },
      },
      { kind: 'text', text: 'After tool.' },
    ])
  })
})

describe('compactInlineToolRenderPlan', () => {
  it('stacks consecutive tool calls without moving surrounding text', () => {
    const plan = compactInlineToolRenderPlan([
      { kind: 'text', text: 'Before. ' },
      {
        kind: 'tool',
        section: {
          key: 'tc-1',
          type: 'read_file',
          outputText: '',
          state: 'output-available',
        },
      },
      {
        kind: 'tool',
        section: {
          key: 'tc-2',
          type: 'search_files',
          outputText: '',
          state: 'output-available',
        },
      },
      { kind: 'text', text: 'After.' },
    ])

    expect(plan).toEqual([
      { kind: 'text', text: 'Before. ' },
      {
        kind: 'tools',
        sections: [
          {
            key: 'tc-1',
            type: 'read_file',
            outputText: '',
            state: 'output-available',
          },
          {
            key: 'tc-2',
            type: 'search_files',
            outputText: '',
            state: 'output-available',
          },
        ],
      },
      { kind: 'text', text: 'After.' },
    ])
  })

  it('keeps separate stacks when text appears between tool calls', () => {
    const plan = compactInlineToolRenderPlan([
      {
        kind: 'tool',
        section: {
          key: 'tc-1',
          type: 'read_file',
          outputText: '',
          state: 'output-available',
        },
      },
      { kind: 'text', text: 'Then ' },
      {
        kind: 'tool',
        section: {
          key: 'tc-2',
          type: 'search_files',
          outputText: '',
          state: 'output-available',
        },
      },
    ])

    expect(plan).toEqual([
      {
        kind: 'tools',
        sections: [
          {
            key: 'tc-1',
            type: 'read_file',
            outputText: '',
            state: 'output-available',
          },
        ],
      },
      { kind: 'text', text: 'Then ' },
      {
        kind: 'tools',
        sections: [
          {
            key: 'tc-2',
            type: 'search_files',
            outputText: '',
            state: 'output-available',
          },
        ],
      },
    ])
  })
})

describe('completed tool summary normalization', () => {
  it('counts one persisted call/result pair and its recovered stream summary once', () => {
    const entries = buildDisplayEntries([
      {
        id: 'persisted-call-row',
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'tool-1',
            name: 'read_file',
            arguments: { path: '/tmp/example.txt' },
          },
        ],
        timestamp: 1,
      } as ChatMessage,
      {
        id: 'persisted-result-row',
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        content: [{ type: 'text', text: 'file contents' }],
        timestamp: 2,
      } as ChatMessage,
      {
        id: 'final-assistant-row',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        timestamp: 3,
      } as ChatMessage,
    ])

    expect(entries).toHaveLength(1)
    const persistedSections = buildAttachedToolSections(
      entries[0]!.attachedToolMessages,
    )
    const sections = deduplicateInlineToolSections([
      {
        key: 'tool-1',
        type: 'read_file',
        input: { path: '/tmp/example.txt' },
        outputText: 'stream copy',
        state: 'output-available',
      },
      ...persistedSections,
    ])

    expect(sections).toEqual([
      expect.objectContaining({
        key: 'tool-1',
        type: 'read_file',
        outputText: 'file contents',
        state: 'output-available',
      }),
    ])
  })

  it('normalizes production snake_case tool-result aliases before deduplication', () => {
    const productionMessages = [
      {
        id: 'persisted-call-row',
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'tool-1',
            name: 'read_file',
            arguments: { path: '/tmp/example.txt' },
          },
        ],
        timestamp: 1,
      } as ChatMessage,
      {
        id: 'persisted-result-row',
        role: 'tool',
        tool_call_id: 'tool-1',
        tool_name: 'read_file',
        content: [{ type: 'text', text: 'fresh persisted output' }],
        timestamp: 2,
      } as ChatMessage,
      {
        id: 'final-assistant-row',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        timestamp: 3,
      } as ChatMessage,
    ]
    const filteredMessages = productionMessages.filter((message) =>
      shouldIncludeDisplayMessage(message),
    )
    expect(filteredMessages.map((message) => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
    ])
    const entries = buildDisplayEntries(filteredMessages)

    const persistedSections = buildAttachedToolSections(
      entries[0]!.attachedToolMessages,
    )
    const sections = deduplicateInlineToolSections([
      {
        key: 'tool-1',
        type: 'read_file',
        outputText: 'stale stream output',
        state: 'output-available',
      },
      ...persistedSections,
    ])

    expect(sections).toHaveLength(1)
    expect(sections[0]).toEqual(
      expect.objectContaining({
        key: 'tool-1',
        type: 'read_file',
        outputText: 'fresh persisted output',
        state: 'output-available',
      }),
    )
  })

  it('lets an empty persisted success clear stale stream output', () => {
    const persistedSections = buildAttachedToolSections([
      {
        id: 'persisted-call-row',
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'write_file',
            arguments: { path: '/tmp/example.txt' },
          },
        ],
        timestamp: 1,
      } as ChatMessage,
      {
        id: 'persisted-result-row',
        role: 'tool',
        tool_call_id: 'call-1',
        tool_name: 'write_file',
        content: [],
        isError: false,
        timestamp: 2,
      } as ChatMessage,
    ])

    const sections = deduplicateInlineToolSections([
      {
        key: 'call-1',
        type: 'write_file',
        outputText: 'stale stream output that never persisted',
        state: 'output-available',
      },
      ...persistedSections,
    ])

    expect(sections).toHaveLength(1)
    expect(sections[0]).toEqual(
      expect.objectContaining({
        key: 'call-1',
        outputText: '',
        errorText: undefined,
        state: 'output-available',
      }),
    )
  })

  it('lets a persisted success clear stale stream error state and text', () => {
    const persistedSections = buildAttachedToolSections([
      {
        id: 'persisted-call-row',
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'write_file',
            arguments: { path: '/tmp/example.txt' },
          },
        ],
        timestamp: 1,
      } as ChatMessage,
      {
        id: 'persisted-result-row',
        role: 'tool',
        tool_call_id: 'call-1',
        tool_name: 'write_file',
        content: [{ type: 'text', text: 'persisted success' }],
        isError: false,
        timestamp: 2,
      } as ChatMessage,
    ])

    const sections = deduplicateInlineToolSections([
      ...persistedSections,
      {
        key: 'call-1',
        type: 'write_file',
        outputText: 'stale stream failure',
        errorText: 'stale stream failure',
        state: 'output-error',
      },
    ])

    expect(sections).toHaveLength(1)
    expect(sections[0]).toEqual(
      expect.objectContaining({
        key: 'call-1',
        outputText: 'persisted success',
        errorText: undefined,
        state: 'output-available',
      }),
    )
  })
})

describe('detectAssistantCorruptionWarning', () => {
  it('flags assistant messages that begin with raw user role text', () => {
    const warning = detectAssistantCorruptionWarning(
      'assistant',
      'user\nNew reviews are fine...',
    )

    expect(warning?.kind).toBe('role-prefix')
    expect(warning?.detail).toContain('Stored role is assistant')
  })

  it('does not flag real user messages with the same body text', () => {
    expect(
      detectAssistantCorruptionWarning('user', 'user\nNew reviews are fine...'),
    ).toBeNull()
  })

  it('flags very large repeated divider loops', () => {
    const text = `${'normal text\n'.repeat(2000)}${'----------\n'.repeat(25)}`

    expect(detectAssistantCorruptionWarning('assistant', text)?.kind).toBe(
      'divider-loop',
    )
  })
})
