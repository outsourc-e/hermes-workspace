// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearCardTranscriptRecoveryMemory,
  readCardTranscriptRecovery,
} from './card-transcript-recovery'
import {
  appendPendingRecoveryMessage,
  getPendingRecoveryMessages,
  handoffPendingSend,
  persistPendingMessage,
  readPendingMessage,
  resetPendingSend,
} from './pending-send'
import type { ChatMessage } from './types'

function bootstrapUser(): ChatMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text: 'bootstrap question' }],
    timestamp: 1,
    clientId: 'client-bootstrap',
    client_id: 'client-bootstrap',
    __optimisticId: 'opt-client-bootstrap',
    status: 'sent',
  }
}

function provisionalUser(
  clientId: string,
  text: string,
  timestamp: number,
): ChatMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp,
    clientId,
    client_id: clientId,
    __optimisticId: `opt-${clientId}`,
    status: 'sent',
  }
}

function persistBootstrap(): void {
  const optimisticMessage = bootstrapUser()
  expect(
    persistPendingMessage({
      sessionKey: 'new',
      friendlyId: 'new',
      message: 'bootstrap question',
      attachments: [],
      optimisticMessage,
    }),
  ).toBe(true)
}

describe('bootstrap pending-send recovery ownership', () => {
  beforeEach(() => {
    resetPendingSend()
    window.localStorage.clear()
    window.sessionStorage.clear()
    clearCardTranscriptRecoveryMemory()
  })

  it('durably appends a sanitized terminal assistant without clearing provisional ownership', () => {
    persistBootstrap()

    expect(
      appendPendingRecoveryMessage('new', 'new', {
        role: 'assistant',
        content: [{ type: 'text', text: 'durable answer' }],
        timestamp: 2,
        runId: 'run-bootstrap',
        stableId: 'stream-run:run-bootstrap',
        sessionKey: 'remote:raw-session',
        metadata: {
          canonicalSegmentKey: 'remote:raw-segment',
          safe: true,
        },
      } as ChatMessage),
    ).toBe(true)

    const pending = readPendingMessage('new', 'new')
    expect(getPendingRecoveryMessages(pending!)).toMatchObject([
      { role: 'user', clientId: 'client-bootstrap' },
      {
        role: 'assistant',
        runId: 'run-bootstrap',
        stableId: 'stream-run:run-bootstrap',
      },
    ])
    const serialized = window.localStorage.getItem(
      'workspace.chat-provisional-send.v1:new-chat',
    )
    expect(serialized).toContain('durable answer')
    expect(serialized).not.toContain('remote:raw-session')
    expect(serialized).not.toContain('remote:raw-segment')
  })

  it('retains every accepted provisional turn across multiple no-handoff sends', () => {
    persistBootstrap()
    expect(
      appendPendingRecoveryMessage('new', 'new', {
        role: 'assistant',
        content: [{ type: 'text', text: 'first answer' }],
        timestamp: 2,
        runId: 'run-first',
      }),
    ).toBe(true)

    const second = provisionalUser('client-second', 'second question', 3)
    expect(
      persistPendingMessage({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'second question',
        attachments: [],
        optimisticMessage: second,
      }),
    ).toBe(true)
    expect(
      appendPendingRecoveryMessage('new', 'new', {
        role: 'assistant',
        content: [{ type: 'text', text: 'second answer' }],
        timestamp: 4,
        runId: 'run-second',
      }),
    ).toBe(true)

    expect(
      getPendingRecoveryMessages(readPendingMessage('new', 'new')!).map(
        (entry) => entry.content?.[0],
      ),
    ).toMatchObject([
      { text: 'bootstrap question' },
      { text: 'first answer' },
      { text: 'second question' },
      { text: 'second answer' },
    ])
  })

  it('fails admission before transport instead of evicting retryable recovery rows', () => {
    persistBootstrap()
    for (let index = 1; index < 48; index += 1) {
      const appended = appendPendingRecoveryMessage('new', 'new', {
        role: 'assistant',
        content: [{ type: 'text', text: `retained-${index}` }],
        timestamp: index + 1,
        runId: `run-retained-${index}`,
      })
      if (!appended) throw new Error(`recovery append failed at ${index}`)
    }
    expect(
      getPendingRecoveryMessages(readPendingMessage('new', 'new')!),
    ).toHaveLength(48)

    const admitted = provisionalUser(
      'client-last-admitted',
      'last admitted',
      500,
    )
    expect(
      persistPendingMessage({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'last admitted',
        attachments: [],
        optimisticMessage: admitted,
      }),
    ).toBe(true)
    expect(
      appendPendingRecoveryMessage('new', 'new', {
        role: 'assistant',
        content: [{ type: 'text', text: 'reserved terminal' }],
        timestamp: 501,
        runId: 'run-reserved-terminal',
      }),
    ).toBe(true)
    const beforeRejectedSend = getPendingRecoveryMessages(
      readPendingMessage('new', 'new')!,
    )
    expect(beforeRejectedSend).toHaveLength(50)

    const rejected = provisionalUser('client-rejected', 'must not send', 502)
    expect(
      persistPendingMessage({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'must not send',
        attachments: [],
        optimisticMessage: rejected,
      }),
    ).toBe(false)
    expect(
      getPendingRecoveryMessages(readPendingMessage('new', 'new')!),
    ).toEqual(beforeRejectedSend)
  })

  it('retains provisional recovery for an unverified or legacy destination', () => {
    persistBootstrap()

    handoffPendingSend('new', 'remote:raw-segment', 'remote:card-a')
    handoffPendingSend('new', 'remote:raw-segment', 'legacy-friendly', {
      verifiedCardDestination: true,
    })

    expect(readPendingMessage('new', 'new')).not.toBeNull()
    expect(readPendingMessage('remote:raw-segment', 'remote:card-a')).toBeNull()
    expect(readCardTranscriptRecovery({ cardId: 'remote:card-a' })).toBeNull()
  })

  it('clears provisional ownership only after verified Card migration lands', () => {
    persistBootstrap()
    expect(
      appendPendingRecoveryMessage('new', 'new', {
        role: 'assistant',
        content: [{ type: 'text', text: 'migrate me' }],
        timestamp: 2,
        runId: 'run-migrate',
        stableId: 'stream-run:run-migrate',
      }),
    ).toBe(true)

    handoffPendingSend('new', 'remote:raw-segment', 'remote:card-a', {
      verifiedCardDestination: true,
    })

    expect(readPendingMessage('new', 'new')).toBeNull()
    expect(readPendingMessage('remote:raw-segment', 'remote:card-a')).toBeNull()
    expect(
      readCardTranscriptRecovery({ cardId: 'remote:card-a' })?.messages,
    ).toMatchObject([{ role: 'user' }, { role: 'assistant' }])
    expect(
      window.localStorage.getItem('claude_pending_msg_remote:raw-segment'),
    ).toBeNull()
  })
})
