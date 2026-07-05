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
  it('deduplicates assistant realtime messages that only differ by whitespace', () => {
    const sessionKey = 'assistant-whitespace-realtime-session'
    const readableText = [
      'Checked. Short status:',
      '',
      'Configuration',
      'Hermes Config: /Users/example/.hermes/config.yaml',
      'Active model: gpt-5.5',
      'Gateway: running via launchd',
      'Telegram: configured',
      '',
      'Jobs',
      'Seven active scheduled jobs are configured and all are active.',
    ].join('\n')
    const compactText = readableText.replace(/\s+/g, '')
    const store = useChatStore.getState()

    store.clearSession(sessionKey)
    store.processEvent({
      type: 'message',
      sessionKey,
      message: textMessage('readable', 'assistant', readableText, 0),
    })
    store.processEvent({
      type: 'message',
      sessionKey,
      message: textMessage('compact', 'assistant', compactText, 1),
    })

    expect(
      store.getRealtimeMessages(sessionKey).map((message) => message.id),
    ).toEqual(['readable'])
  })

  it('deduplicates history and realtime assistant messages that only differ by whitespace', () => {
    const sessionKey = 'assistant-whitespace-history-session'
    const readableText = [
      'Checked. Short status:',
      '',
      'Configuration',
      'Hermes Config: /Users/example/.hermes/config.yaml',
      'Active model: gpt-5.5',
      'Gateway: running via launchd',
      'Telegram: configured',
      '',
      'Jobs',
      'Seven active scheduled jobs are configured and all are active.',
    ].join('\n')
    const compactText = readableText.replace(/\s+/g, '')
    const store = useChatStore.getState()

    store.clearSession(sessionKey)
    store.processEvent({
      type: 'message',
      sessionKey,
      message: textMessage('compact', 'assistant', compactText, 1),
    })

    const merged = store.mergeHistoryMessages(sessionKey, [
      textMessage('readable', 'assistant', readableText, 0),
    ])

    expect(merged.map((message) => message.id)).toEqual(['readable'])
  })

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
