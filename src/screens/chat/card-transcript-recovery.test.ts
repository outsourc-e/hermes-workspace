// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS,
  CARD_TRANSCRIPT_RECOVERY_TTL_MS,
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

  it('rejects malformed, wrong-version, mismatched, and expired records', () => {
    const key = cardTranscriptRecoveryStorageKey(owner)
    const rejected = [
      '{',
      JSON.stringify({ ...envelope([]), version: 1 }),
      JSON.stringify({ ...envelope([]), cardId: 'remote:other-card' }),
      JSON.stringify({
        ...envelope([]),
        createdAt: now - CARD_TRANSCRIPT_RECOVERY_TTL_MS - 1,
      }),
      JSON.stringify(envelope([{ role: 'system', content: [] }])),
    ]

    for (const raw of rejected) {
      window.sessionStorage.setItem(key, raw)
      expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
      expect(window.sessionStorage.getItem(key)).toBeNull()
    }
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

  it('bounds text size and message count while retaining the newest messages', () => {
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
    const written = replaceCardTranscriptRecoveryMessages(owner, messages, {
      now,
    })
    expect(written?.messages).toHaveLength(
      CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
    )
    expect(written?.messages[0]).toMatchObject({ clientId: 'client-3' })
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
