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
