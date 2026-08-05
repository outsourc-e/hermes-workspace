// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS,
  CARD_TRANSCRIPT_RECOVERY_TTL_MS,
  appendCardTranscriptRecoveryMessage,
  cardTranscriptMessagesMatch,
  cardTranscriptRecoveryStorageKey,
  clearCardTranscriptRecovery,
  mergeCardTranscriptRecoveryMessages,
  moveCardTranscriptRecovery,
  parseCardTranscriptRecovery,
  readCardTranscriptRecovery,
  removeAcknowledgedCardTranscriptRecoveryMessages,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import type {
  CardTranscriptRecoveryEnvelope,
  CardTranscriptRecoveryOwner,
} from './card-transcript-recovery'
import type { ChatMessage } from './types'

const now = 1_800_000_000_000
const owner: CardTranscriptRecoveryOwner = {
  cardId: 'remote:card-a',
  canonicalSegmentKey: 'remote:segment-a',
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
    version: 1,
    cardId: owner.cardId,
    canonicalSegmentKey: owner.canonicalSegmentKey,
    createdAt: now,
    messages,
    ...fields,
  }
}

describe('Card transcript recovery storage contract', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('uses one encoded Card-and-canonical-segment storage envelope', () => {
    expect(
      cardTranscriptRecoveryStorageKey({
        cardId: 'remote:card / one',
        canonicalSegmentKey: 'remote:tip?next',
      }),
    ).toBe(
      'workspace.card-transcript-recovery.v1:remote%3Acard%20%2F%20one:remote%3Atip%3Fnext',
    )

    const written = replaceCardTranscriptRecoveryMessages(
      owner,
      [message('user', 'kept', { clientId: 'client-1' })],
      { now },
    )
    expect(written).toMatchObject({
      version: 1,
      ...owner,
      createdAt: now,
    })
    expect(readCardTranscriptRecovery(owner, { now })).toEqual(written)
  })

  it.each([
    ['raw Card ID', { cardId: 'card-a', canonicalSegmentKey: 'remote:tip' }],
    ['raw segment ID', { cardId: 'remote:card-a', canonicalSegmentKey: 'tip' }],
    [
      'cross-source segment',
      { cardId: 'remote:card-a', canonicalSegmentKey: 'local:tip' },
    ],
    ['blank segment', { cardId: 'remote:card-a', canonicalSegmentKey: ' ' }],
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
      JSON.stringify({ ...envelope([]), version: 2 }),
      JSON.stringify({ ...envelope([]), cardId: 'remote:other-card' }),
      JSON.stringify({
        ...envelope([]),
        canonicalSegmentKey: 'remote:other-segment',
      }),
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

  it('moves only between canonical segments of the exact same Card', () => {
    const successor = {
      cardId: owner.cardId,
      canonicalSegmentKey: 'remote:segment-b',
    }
    const overlay = message('assistant', 'move me', { id: 'assistant-1' })
    replaceCardTranscriptRecoveryMessages(owner, [overlay], { now })

    expect(
      moveCardTranscriptRecovery(
        owner,
        { ...successor, cardId: 'remote:other-card' },
        { now },
      ),
    ).toBe(false)
    expect(
      moveCardTranscriptRecovery(
        owner,
        { ...successor, canonicalSegmentKey: 'local:segment-b' },
        { now },
      ),
    ).toBe(false)
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      overlay,
    ])

    expect(moveCardTranscriptRecovery(owner, successor, { now })).toBe(true)
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
    expect(readCardTranscriptRecovery(successor, { now })?.messages).toEqual([
      overlay,
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
