// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
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

beforeEach(() => {
  window.sessionStorage.clear()
  useChatStore.getState().clearCard('remote:card-owner')
})

describe('chat-store Card ownership', () => {
  it('keeps live, streaming, and waiting state under one Card owner', () => {
    const store = useChatStore.getState()
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'response',
      runId: 'run-card',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'message',
      message: textMessage('assistant-card', 'assistant', 'response', 1),
      runId: 'run-card',
      sessionKey: 'remote:successor-segment',
      transport: 'send-stream',
    })
    store.setCardWaiting('remote:card-owner', 'run-card')

    const next = useChatStore.getState()
    expect([...next.realtimeMessages.keys()]).toEqual(['remote:card-owner'])
    expect([...next.streamingState.keys()]).toEqual(['remote:card-owner'])
    expect([...next.waitingSessionKeys]).toEqual(['remote:card-owner'])
    const stored = Array.from(
      { length: window.sessionStorage.length },
      (_, index) => {
        const key = window.sessionStorage.key(index)
        return [key, key ? window.sessionStorage.getItem(key) : null]
      },
    )
    expect(stored).toContainEqual([
      'workspace.chat-card-waiting.v1:remote%3Acard-owner',
      expect.stringContaining('remote:card-owner'),
    ])
    expect(JSON.stringify(stored)).not.toContain('raw-segment')
    expect(JSON.stringify(stored)).not.toContain('successor-segment')
  })

  it('drops legacy raw waiting and streaming storage without restoring it', () => {
    window.sessionStorage.setItem(
      'claude_waiting_remote:raw-segment',
      JSON.stringify({ since: Date.now(), runId: 'legacy-run' }),
    )
    window.sessionStorage.setItem(
      'claude_streaming_remote:raw-segment',
      JSON.stringify({ text: 'legacy response', _savedAt: Date.now() }),
    )

    useChatStore.getState().setCardWaiting('remote:card-owner', 'new-run')

    expect(
      window.sessionStorage.getItem('claude_waiting_remote:raw-segment'),
    ).toBeNull()
    expect(
      window.sessionStorage.getItem('claude_streaming_remote:raw-segment'),
    ).toBeNull()
    expect(useChatStore.getState().isCardWaiting('remote:raw-segment')).toBe(
      false,
    )
    expect(
      useChatStore.getState().getCardStreamingState('remote:raw-segment'),
    ).toBeNull()
  })
})

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
