import { describe, expect, it } from 'vitest'
import { useChatStore } from './chat-store'
import type { ChatMessage } from '../screens/chat/types'

function textMessage(
  id: string,
  role: string,
  text: string,
  historyIndex: number,
): ChatMessage {
  return {
    id,
    role,
    timestamp: 1_700_000_000_000,
    __historyIndex: historyIndex,
    content: [{ type: 'text', text }],
  }
}

describe('chat-store history merge ordering', () => {
  it('preserves persisted history order when messages share a timestamp', () => {
    const messages: Array<ChatMessage> = [
      textMessage('m1', 'user', 'first question', 0),
      textMessage('m2', 'assistant', 'first answer', 1),
      textMessage('m3', 'user', 'follow-up', 2),
    ]

    const merged = useChatStore
      .getState()
      .mergeHistoryMessages('history-order-session', messages)

    expect(merged.map((message) => message.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('accepts local-store historyIndex as a persisted order hint', () => {
    const messages: Array<ChatMessage> = [
      {
        id: 'local-1',
        role: 'user',
        timestamp: 1_700_000_000_000,
        historyIndex: 0,
        content: [{ type: 'text', text: 'local question' }],
      },
      {
        id: 'local-2',
        role: 'assistant',
        timestamp: 1_700_000_000_000,
        historyIndex: 1,
        content: [{ type: 'text', text: 'local answer' }],
      },
      {
        id: 'local-3',
        role: 'user',
        timestamp: 1_700_000_000_000,
        historyIndex: 2,
        content: [{ type: 'text', text: 'local follow-up' }],
      },
    ]

    const merged = useChatStore
      .getState()
      .mergeHistoryMessages('local-history-order-session', messages)

    expect(merged.map((message) => message.id)).toEqual([
      'local-1',
      'local-2',
      'local-3',
    ])
  })
})

describe('chat-store session handoff', () => {
  it('moves active stream state and deduplicates terminal messages across ids', () => {
    const store = useChatStore.getState()
    store.clearSession('parent-handoff')
    store.clearSession('child-handoff')

    const finalMessage = textMessage(
      'assistant-final',
      'assistant',
      'Canonical response',
      1,
    )
    store.processEvent({
      type: 'chunk',
      text: 'Canonical response',
      runId: 'run-handoff',
      sessionKey: 'parent-handoff',
      transport: 'send-stream',
    })
    store.processEvent({
      type: 'message',
      message: finalMessage,
      runId: 'run-handoff',
      sessionKey: 'parent-handoff',
      transport: 'send-stream',
    })
    store.processEvent({
      type: 'message',
      message: finalMessage,
      runId: 'run-handoff',
      sessionKey: 'child-handoff',
      transport: 'send-stream',
    })
    store.setSessionWaiting('parent-handoff', 'run-handoff')

    store.handoffSession('parent-handoff', 'child-handoff')

    const next = useChatStore.getState()
    expect(next.getRealtimeMessages('parent-handoff')).toEqual([])
    expect(next.getRealtimeMessages('child-handoff')).toHaveLength(1)
    expect(next.getStreamingState('parent-handoff')).toBeNull()
    expect(next.getStreamingState('child-handoff')).toMatchObject({
      runId: 'run-handoff',
      text: 'Canonical response',
    })
    expect(next.isSessionWaiting('parent-handoff')).toBe(false)
    expect(next.isSessionWaiting('child-handoff')).toBe(true)
  })
})
