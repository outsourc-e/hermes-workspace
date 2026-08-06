// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreCardStreamingState, useChatStore } from './chat-store'
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

afterEach(() => {
  vi.useRealTimers()
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

  it('hydrates a persisted Card stream after remount and scrubs nested transport identity', () => {
    const key = 'workspace.chat-card-streaming.v1:remote%3Acard-owner'
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        text: 'persisted partial answer',
        thinking: '',
        runId: 'run-persisted',
        lifecycleEvents: [],
        toolCalls: [
          {
            id: 'tool-1',
            name: 'inspect',
            phase: 'start',
            args: {
              sessionKey: 'remote:raw-segment',
              nested: {
                canonicalSegmentKey: 'remote:raw-successor',
                safe: true,
              },
            },
          },
        ],
        _savedAt: Date.now() - 2 * 60 * 1000,
      }),
    )

    useChatStore.getState().hydrateCardStreamingState('remote:card-owner')

    expect(
      useChatStore.getState().streamingState.get('remote:card-owner'),
    ).toMatchObject({
      text: 'persisted partial answer',
      runId: 'run-persisted',
      toolCalls: [{ args: { nested: { safe: true } } }],
    })
    expect(window.sessionStorage.getItem(key)).not.toContain('raw-segment')
    expect(window.sessionStorage.getItem(key)).not.toContain('raw-successor')
  })

  it('persists an actual Card chunk immediately with raw identity sanitized', () => {
    useChatStore.getState().processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'first durable chunk',
      fullReplace: true,
      runId: 'run-first-chunk',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })

    const raw = window.sessionStorage.getItem(
      'workspace.chat-card-streaming.v1:remote%3Acard-owner',
    )
    expect(raw).toContain('first durable chunk')
    expect(raw).toContain('run-first-chunk')
    expect(raw).not.toContain('raw-segment')
  })

  it('checkpoints the latest state during continuous chunks so reload recovery is not trailing-debounce dependent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const store = useChatStore.getState()

    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'a',
      fullReplace: true,
      runId: 'run-continuous',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    vi.advanceTimersByTime(200)
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'ab',
      fullReplace: true,
      runId: 'run-continuous',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    vi.advanceTimersByTime(200)
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'abc',
      fullReplace: true,
      runId: 'run-continuous',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    vi.advanceTimersByTime(100)

    expect(restoreCardStreamingState('remote:card-owner')).toMatchObject({
      text: 'abc',
      runId: 'run-continuous',
    })
  })

  it('cancels and invalidates a pending chunk write when terminal state clears storage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const store = useChatStore.getState()
    const key = 'workspace.chat-card-streaming.v1:remote%3Acard-owner'

    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'first',
      fullReplace: true,
      runId: 'run-terminal-race',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    vi.advanceTimersByTime(100)
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'newer pending chunk',
      fullReplace: true,
      runId: 'run-terminal-race',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'done',
      state: 'complete',
      runId: 'run-terminal-race',
      sessionKey: 'remote:raw-segment',
      transport: 'send-stream',
    })
    expect(window.sessionStorage.getItem(key)).toBeNull()

    vi.advanceTimersByTime(1_000)
    expect(window.sessionStorage.getItem(key)).toBeNull()
    expect(restoreCardStreamingState('remote:card-owner')).toBeNull()
  })

  it('retains concurrent same-Card runs and clears only the terminal run', () => {
    const store = useChatStore.getState()
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'first independent stream',
      fullReplace: true,
      runId: 'run-concurrent-a',
      sessionKey: 'remote:segment-a',
      transport: 'chat-events',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'second independent stream',
      fullReplace: true,
      runId: 'run-concurrent-b',
      sessionKey: 'remote:segment-b',
      transport: 'chat-events',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'lifecycle',
      text: 'still running B',
      runId: 'run-concurrent-b',
      sessionKey: 'remote:segment-b',
      transport: 'chat-events',
    })

    expect(store.getCardStreamingStates('remote:card-owner')).toMatchObject([
      { runId: 'run-concurrent-a', text: 'first independent stream' },
      {
        runId: 'run-concurrent-b',
        text: 'second independent stream',
        lifecycleEvents: [{ text: 'still running B' }],
      },
    ])

    store.processCardEvent('remote:card-owner', {
      type: 'done',
      state: 'complete',
      runId: 'run-concurrent-a',
      sessionKey: 'remote:segment-a',
      transport: 'chat-events',
    })

    expect(store.getCardStreamingStates('remote:card-owner')).toMatchObject([
      {
        runId: 'run-concurrent-b',
        text: 'second independent stream',
        lifecycleEvents: [{ text: 'still running B' }],
      },
    ])
    expect(store.getCardRealtimeMessages('remote:card-owner')).toEqual([
      expect.objectContaining({
        runId: 'run-concurrent-a',
        stableId: 'stream-run:run-concurrent-a',
      }),
    ])
  })

  it('serializes and hydrates every concurrent same-Card run independently after remount', () => {
    const store = useChatStore.getState()
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'alpha partial text',
      fullReplace: true,
      runId: 'run-remount-alpha',
      sessionKey: 'remote:segment-alpha',
      transport: 'chat-events',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'tool',
      name: 'inspect-alpha',
      phase: 'start',
      toolCallId: 'tool-alpha',
      args: { safe: 'alpha' },
      runId: 'run-remount-alpha',
      sessionKey: 'remote:segment-alpha',
      transport: 'chat-events',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'thinking',
      text: 'beta private reasoning',
      runId: 'run-remount-beta',
      sessionKey: 'remote:segment-beta',
      transport: 'chat-events',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'chunk',
      text: 'beta partial text',
      fullReplace: true,
      runId: 'run-remount-beta',
      sessionKey: 'remote:segment-beta',
      transport: 'chat-events',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'lifecycle',
      text: 'beta lifecycle checkpoint',
      runId: 'run-remount-beta',
      sessionKey: 'remote:segment-beta',
      transport: 'chat-events',
    })

    useChatStore.setState({
      streamingState: new Map(),
      cardStreamingRuns: new Map(),
    })
    useChatStore.getState().hydrateCardStreamingState('remote:card-owner')

    expect(
      useChatStore.getState().getCardStreamingStates('remote:card-owner'),
    ).toMatchObject([
      {
        runId: 'run-remount-alpha',
        text: 'alpha partial text',
        toolCalls: [
          {
            id: 'tool-alpha',
            name: 'inspect-alpha',
            args: { safe: 'alpha' },
          },
        ],
      },
      {
        runId: 'run-remount-beta',
        text: 'beta partial text',
        thinking: 'beta private reasoning',
        lifecycleEvents: [{ text: 'beta lifecycle checkpoint' }],
      },
    ])
  })

  it('scrubs raw transport identity from live Card messages and tool state', () => {
    const store = useChatStore.getState()
    store.processCardEvent('remote:card-owner', {
      type: 'message',
      message: {
        ...textMessage('assistant-safe', 'assistant', 'safe answer', 1),
        sessionKey: 'remote:raw-message',
        metadata: {
          canonicalSegmentKey: 'remote:raw-nested-message',
          safe: 'kept',
        },
      } as ChatMessage,
      runId: 'run-safe',
      sessionKey: 'remote:raw-event',
      transport: 'send-stream',
    })
    store.processCardEvent('remote:card-owner', {
      type: 'tool',
      name: 'inspect',
      phase: 'start',
      args: {
        segmentKey: 'remote:raw-tool',
        nested: { session_key: 'remote:raw-tool-nested', safe: 1 },
      },
      sessionKey: 'remote:raw-event',
      transport: 'send-stream',
    })

    const serialized = JSON.stringify({
      messages: store.getCardRealtimeMessages('remote:card-owner'),
      streaming: store.getCardStreamingState('remote:card-owner'),
    })
    expect(serialized).not.toContain('raw-message')
    expect(serialized).not.toContain('raw-nested-message')
    expect(serialized).not.toContain('raw-tool')
    expect(serialized).toContain('"safe":"kept"')
    expect(serialized).toContain('"safe":1')
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

  it('keeps equal terminal answers from separate runs as distinct messages', () => {
    const store = useChatStore.getState()
    store.clearSession('repeated-terminal')
    for (const runId of ['run-first', 'run-second']) {
      store.processEvent({
        type: 'done',
        state: 'complete',
        runId,
        sessionKey: 'repeated-terminal',
        message: textMessage(
          `assistant-${runId}`,
          'assistant',
          'The same terminal answer must remain visible.',
          1,
        ),
        transport: 'send-stream',
      })
    }

    expect(store.getRealtimeMessages('repeated-terminal')).toMatchObject([
      { runId: 'run-first', stableId: 'stream-run:run-first' },
      { runId: 'run-second', stableId: 'stream-run:run-second' },
    ])
  })
})
