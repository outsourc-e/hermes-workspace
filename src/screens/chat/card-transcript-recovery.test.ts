// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS,
  appendCardTranscriptRecoveryMessage,
  cardTranscriptMessagesMatch,
  cardTranscriptRecoveryStorageKey,
  clearCardTranscriptRecovery,
  clearCardTranscriptRecoveryMemory,
  mergeCardTranscriptRecoveryMessages,
  parseCardTranscriptRecovery,
  readCardTranscriptRecovery,
  removeAcknowledgedCardTranscriptRecoveryMessages,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import { reconcileSessionCardHistoryResponse } from './chat-queries'
import type { SessionCardHistoryResponse } from './chat-queries'
import type {
  CardTranscriptRecoveryEnvelope,
  CardTranscriptRecoveryOwner,
} from './card-transcript-recovery'
import type { ChatMessage } from './types'

const now = 1_800_000_000_000
const owner: CardTranscriptRecoveryOwner = {
  cardId: 'remote:card-a',
}

function message(
  role: 'user' | 'assistant',
  text: string,
  fields: Record<string, unknown> = {},
): ChatMessage {
  return {
    role,
    content: [{ type: 'text', text }],
    timestamp: now,
    ...fields,
  }
}

function envelope(
  messages: Array<ChatMessage>,
  fields: Partial<CardTranscriptRecoveryEnvelope> = {},
): CardTranscriptRecoveryEnvelope {
  return {
    version: 2,
    cardId: owner.cardId,
    createdAt: now,
    messages,
    ...fields,
  }
}

describe('Card transcript recovery storage contract', () => {
  beforeEach(() => {
    clearCardTranscriptRecoveryMemory()
    clearCardTranscriptRecovery(owner)
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses one encoded Card-only storage envelope', () => {
    expect(
      cardTranscriptRecoveryStorageKey({
        cardId: 'remote:card / one',
      }),
    ).toBe('workspace.card-transcript-recovery.v2:remote%3Acard%20%2F%20one')

    const written = replaceCardTranscriptRecoveryMessages(
      owner,
      [message('user', 'kept', { clientId: 'client-1' })],
      { now },
    )
    expect(written).toMatchObject({
      version: 2,
      ...owner,
      createdAt: now,
    })
    expect(readCardTranscriptRecovery(owner, { now })).toEqual(written)
  })

  it('recursively removes raw transport identities on write and repairs tainted storage on read', () => {
    const tainted = message('assistant', 'safe transcript text', {
      sessionKey: 'remote:raw-top',
      canonicalSegmentKey: 'remote:raw-canonical',
      metadata: {
        segment_key: 'remote:raw-nested',
        sessionId: 'remote:raw-session-id',
        canonicalSessionIdentity: 'remote:raw-canonical-identity',
        safe: { value: 1 },
      },
      toolState: [
        {
          args: {
            session_key: 'remote:raw-tool',
            segment: 'remote:raw-segment-value',
            continuationSegmentKeys: ['remote:raw-list'],
            kept: true,
          },
        },
      ],
    })

    const written = replaceCardTranscriptRecoveryMessages(owner, [tainted], {
      now,
    })
    expect(JSON.stringify(written)).not.toContain('remote:raw-')
    expect(JSON.stringify(written)).toContain('"safe":{"value":1}')
    expect(JSON.stringify(written)).toContain('"kept":true')

    clearCardTranscriptRecoveryMemory()
    const key = cardTranscriptRecoveryStorageKey(owner)
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        ...envelope([tainted]),
        sessionKey: 'remote:raw-envelope',
      }),
    )
    const restored = readCardTranscriptRecovery(owner, { now })
    expect(JSON.stringify(restored)).not.toContain('remote:raw-')
    expect(window.sessionStorage.getItem(key)).not.toContain('remote:raw-')
  })

  it.each([
    ['raw Card ID', { cardId: 'card-a' }],
    ['blank Card ID', { cardId: ' ' }],
  ])('rejects %s ownership without writing', (_name, invalidOwner) => {
    expect(
      appendCardTranscriptRecoveryMessage(
        invalidOwner,
        message('user', 'not owned'),
        { now },
      ),
    ).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('rejects malformed, wrong-version, and mismatched records', () => {
    const key = cardTranscriptRecoveryStorageKey(owner)
    const rejected = [
      '{',
      JSON.stringify({ ...envelope([]), version: 1 }),
      JSON.stringify({ ...envelope([]), cardId: 'remote:other-card' }),
      JSON.stringify(envelope([{ role: 'system', content: [] }])),
    ]

    for (const raw of rejected) {
      window.sessionStorage.setItem(key, raw)
      expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
      expect(window.sessionStorage.getItem(key)).toBeNull()
    }
  })

  it('never expires unacknowledged recovery turns by age', () => {
    const old = message('assistant', 'retryable assistant prefix')
    window.sessionStorage.setItem(
      cardTranscriptRecoveryStorageKey(owner),
      JSON.stringify({
        ...envelope([old]),
        createdAt: now - 365 * 24 * 60 * 60 * 1_000,
      }),
    )

    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([old])
  })

  it('clears and ignores legacy segment-keyed recovery records', () => {
    const legacyKey =
      'workspace.card-transcript-recovery.v1:remote%3Acard-a:remote%3Asegment-a'
    window.sessionStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 1,
        cardId: owner.cardId,
        canonicalSegmentKey: 'remote:segment-a',
        createdAt: now,
        messages: [message('user', 'legacy must not revive')],
      }),
    )

    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
    expect(window.sessionStorage.getItem(legacyKey)).toBeNull()
  })

  it('rejects over-capacity admission without evicting any durable recovery turn', () => {
    expect(
      appendCardTranscriptRecoveryMessage(
        owner,
        message(
          'user',
          'x'.repeat(CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS + 1),
        ),
        { now },
      ),
    ).toBeNull()

    const messages = Array.from(
      { length: CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES + 3 },
      (_, index) =>
        message('user', `message ${index}`, {
          clientId: `client-${index}`,
          timestamp: now + index,
        }),
    )
    const baseline = messages.slice(0, CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES)
    const written = replaceCardTranscriptRecoveryMessages(owner, baseline, {
      now,
    })
    expect(written?.messages).toEqual(baseline)
    expect(
      appendCardTranscriptRecoveryMessage(
        owner,
        messages[CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES]!,
        { now },
      ),
    ).toBeNull()
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual(
      baseline,
    )
  })

  it('appends, replaces, and deduplicates only evidence-backed matches', () => {
    const first = message('user', 'same message', {
      clientId: 'client-1',
      status: 'sending',
    })
    const replacement = message('user', 'same message', {
      client_id: 'client-1',
      status: 'sent',
    })
    const differentContent = message('user', 'different message', {
      clientId: 'client-1',
    })

    appendCardTranscriptRecoveryMessage(owner, first, { now })
    appendCardTranscriptRecoveryMessage(owner, replacement, { now })
    appendCardTranscriptRecoveryMessage(owner, differentContent, { now })

    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      replacement,
      differentContent,
    ])
    expect(cardTranscriptMessagesMatch(first, replacement)).toBe(true)
    expect(cardTranscriptMessagesMatch(first, differentContent)).toBe(false)
    expect(
      cardTranscriptMessagesMatch(
        first,
        message('assistant', 'same message', { clientId: 'client-1' }),
      ),
    ).toBe(false)
  })

  it('retains repeated terminal messages with conflicting stable identities', () => {
    const first = message('assistant', 'Done.', {
      id: 'server-assistant-1',
      timestamp: now,
    })
    const second = message('assistant', 'Done.', {
      id: 'server-assistant-2',
      timestamp: now + 1_000,
    })

    expect(cardTranscriptMessagesMatch(first, second)).toBe(false)
    replaceCardTranscriptRecoveryMessages(owner, [first, second], { now })
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      first,
      second,
    ])
  })

  it('uses run identity before fallback matching so equal assistant text from distinct runs remains durable', () => {
    const firstOverlay = message('assistant', 'OK', {
      stableId: 'stream-run:run-a',
      runId: 'run-a',
    })
    const secondOverlay = message('assistant', 'OK', {
      stableId: 'stream-run:run-b',
      runId: 'run-b',
      timestamp: now + 1_000,
    })
    const firstPersisted = message('assistant', 'OK', {
      id: 'server-a',
      runId: 'run-a',
    })

    replaceCardTranscriptRecoveryMessages(
      owner,
      [firstOverlay, secondOverlay],
      {
        now,
      },
    )
    const reconciled = removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [firstPersisted],
      { now },
    )

    expect(reconciled?.messages).toEqual([secondOverlay])
    expect(
      mergeCardTranscriptRecoveryMessages(
        [firstPersisted],
        reconciled?.messages ?? [],
      ),
    ).toEqual([firstPersisted, secondOverlay])
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      secondOverlay,
    ])
  })

  it('acknowledges uniquely matching ordinary server rows when client and run identities differ', () => {
    const optimistic = message('user', 'ordinary user acknowledgement', {
      clientId: 'client-local',
      __optimisticId: 'opt-client-local',
      status: 'sent',
    })
    const terminal = message(
      'assistant',
      'ordinary assistant acknowledgement',
      {
        runId: 'run-local',
        stableId: 'stream-run:run-local',
        __streamingStatus: 'complete',
      },
    )
    replaceCardTranscriptRecoveryMessages(owner, [optimistic, terminal], {
      now,
    })

    const reconciled = removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [
        message('user', 'ordinary user acknowledgement', {
          id: 'server-user',
          client_id: 'server-client',
        }),
        message('assistant', 'ordinary assistant acknowledgement', {
          id: 'server-assistant',
          run_id: 'server-run',
        }),
      ],
      { now },
    )

    expect(reconciled).toBeNull()
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
  })

  it('consumes one repeated ordinary server acknowledgement and preserves the additional turn', () => {
    const first = message('user', 'repeat this exact turn', {
      clientId: 'repeat-first',
      status: 'sent',
    })
    const second = message('user', 'repeat this exact turn', {
      clientId: 'repeat-second',
      status: 'sent',
    })
    replaceCardTranscriptRecoveryMessages(owner, [first, second], { now })

    const reconciled = removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [
        message('user', 'repeat this exact turn', {
          id: 'server-repeat',
          client_id: 'server-client',
        }),
      ],
      { now },
    )

    expect(reconciled?.messages).toEqual([second])
    expect(
      mergeCardTranscriptRecoveryMessages(
        [
          message('user', 'repeat this exact turn', {
            id: 'server-repeat',
          }),
        ],
        [first, second],
      ),
    ).toEqual([expect.objectContaining({ id: 'server-repeat' }), second])
  })

  it('acknowledges repeated equal paired turns in order without duplicate overlays', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const overlays = [
      message('user', 'same prompt', { clientId: 'client-a' }),
      message('assistant', 'same acknowledgement', { runId: 'run-a' }),
      message('user', 'same prompt', { clientId: 'client-b' }),
      message('assistant', 'same acknowledgement', { runId: 'run-b' }),
    ]
    replaceCardTranscriptRecoveryMessages(owner, overlays, { now })

    const server: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [
        message('user', 'same prompt', { id: 'server-user-a' }),
        message('assistant', 'same acknowledgement', {
          id: 'server-assistant-a',
        }),
        message('user', 'same prompt', { id: 'server-user-b' }),
        message('assistant', 'same acknowledgement', {
          id: 'server-assistant-b',
        }),
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    const reconciled = reconcileSessionCardHistoryResponse(server)
    expect(reconciled.messages).toEqual(server.messages)
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
  })

  it('hydrates partial attachment history without clearing recovery until authoritative content is complete', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const attachment = {
      id: 'attachment-local',
      name: 'notes.txt',
      contentType: 'text/plain',
      size: 5,
      dataUrl: 'hello',
    }
    replaceCardTranscriptRecoveryMessages(
      owner,
      [
        {
          ...message('user', 'review this file', { clientId: 'client-file' }),
          attachments: [attachment],
        },
      ],
      { now },
    )
    const server: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [
        {
          ...message('user', 'review this file', {
            id: 'server-file-message',
          }),
          attachments: [
            {
              id: 'attachment-server',
              name: 'notes.txt',
              contentType: 'text/plain',
              size: 5,
            },
          ],
        },
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    const reconciled = reconcileSessionCardHistoryResponse(server)
    expect(reconciled.messages).toHaveLength(1)
    expect(reconciled.messages[0]).toMatchObject({
      id: 'server-file-message',
      attachments: [
        {
          ...attachment,
          id: 'attachment-server',
        },
      ],
    })
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      expect.objectContaining({
        clientId: 'client-file',
        attachments: [attachment],
      }),
    ])

    const completeAttachmentServer = {
      ...server,
      messages: [
        {
          ...server.messages[0]!,
          attachments: [
            {
              id: 'attachment-server',
              name: 'notes.txt',
              contentType: 'text/plain',
              size: 5,
              dataUrl: 'hello',
            },
          ],
        },
      ],
    }
    const acknowledged = reconcileSessionCardHistoryResponse(
      completeAttachmentServer,
    )
    expect(acknowledged.messages).toEqual(completeAttachmentServer.messages)
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
  })

  it('keeps user and terminal assistant overlays through a stale complete refetch when quota persistence throws', () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.startsWith('workspace.card-transcript-recovery.')) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })
    const optimistic = message('user', 'continue', {
      clientId: 'client-quota',
      __optimisticId: 'opt-client-quota',
    })
    const terminal = message('assistant', 'OK', {
      stableId: 'stream-run:run-quota',
      runId: 'run-quota',
    })

    expect(
      appendCardTranscriptRecoveryMessage(owner, optimistic, { now }),
    ).toBeNull()
    expect(
      appendCardTranscriptRecoveryMessage(owner, terminal, { now }),
    ).toBeNull()

    const staleServer: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }
    expect(reconcileSessionCardHistoryResponse(staleServer).messages).toEqual([
      optimistic,
      terminal,
    ])
  })

  it('merges persisted history first and removes only authoritative echoes', () => {
    const persisted = message('assistant', 'persisted', { id: 'server-1' })
    const acknowledged = message('user', 'accepted locally', {
      clientId: 'client-1',
    })
    const pending = message('assistant', 'history still lags', {
      stableId: 'assistant-local-1',
      timestamp: now + 10,
    })
    replaceCardTranscriptRecoveryMessages(owner, [acknowledged, pending], {
      now,
    })

    expect(
      mergeCardTranscriptRecoveryMessages(
        [persisted],
        readCardTranscriptRecovery(owner, { now })!.messages,
      ),
    ).toEqual([persisted, acknowledged, pending])

    const echoed = message('user', 'accepted locally', {
      client_id: 'client-1',
      id: 'server-user-1',
    })
    removeAcknowledgedCardTranscriptRecoveryMessages(owner, [echoed], { now })
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      pending,
    ])

    removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [
        message('assistant', 'different content', {
          stableId: 'assistant-local-1',
        }),
      ],
      { now },
    )
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      pending,
    ])
  })

  it('clears the exact owner and parse rejects a cross-Card envelope', () => {
    const overlay = message('user', 'clear me', { clientId: 'clear-1' })
    replaceCardTranscriptRecoveryMessages(owner, [overlay], { now })
    expect(
      parseCardTranscriptRecovery(
        envelope([overlay], { cardId: 'remote:other-card' }),
        owner,
        now,
      ),
    ).toBeNull()
    clearCardTranscriptRecovery(owner)
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
  })
})
