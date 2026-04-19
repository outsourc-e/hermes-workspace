import { describe, expect, it } from 'vitest'

import { buildInlineToolRenderPlan } from './message-item'
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
