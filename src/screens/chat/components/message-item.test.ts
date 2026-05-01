import { describe, expect, it } from 'vitest'

import {
  buildInlineToolRenderPlan,
  compactInlineToolRenderPlan,
  detectAssistantCorruptionWarning,
} from './message-item'
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
