// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS,
  acknowledgeDeliveredCardTranscriptRecoveryMessage,
  appendCardTranscriptRecoveryMessage,
  cardTranscriptMessagesMatch,
  cardTranscriptRecoveryStorageKey,
  clearCardTranscriptRecovery,
  clearCardTranscriptRecoveryMemory,
  mergeCardTranscriptRecoveryMessages,
  parseCardTranscriptRecovery,
  readCardTranscriptRecovery,
  removeAcknowledgedCardTranscriptRecoveryMessages,
  removeRejectedCardTranscriptRecoveryMessage,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import { reconcileSessionCardHistoryResponse } from './chat-queries'
import type { SessionCardHistoryResponse } from './chat-queries'
import type {
  CardTranscriptRecoveryEnvelope,
  CardTranscriptRecoveryOwner,
} from './card-transcript-recovery'
import type { ChatMessage } from './types'
import { swarmDirectChatContentDigest } from '@/lib/swarm-direct-chat-delivery'

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
    revision: 1,
    messages,
    ...fields,
  }
}

describe('Card transcript recovery storage contract', () => {
  beforeEach(() => {
    clearCardTranscriptRecoveryMemory()
    clearCardTranscriptRecovery(owner)
    window.localStorage.clear()
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

  it('retains future-dated recovery after an arbitrary clock rollback', () => {
    const future = message('user', 'accepted before the clock rolled back', {
      clientId: 'client-clock-rollback',
    })
    const key = cardTranscriptRecoveryStorageKey(owner)
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...envelope([future]), createdAt: now + 86_400_000 }),
    )

    expect(
      readCardTranscriptRecovery(owner, { now: now - 365 * 86_400_000 })
        ?.messages,
    ).toEqual([future])
    expect(window.localStorage.getItem(key)).not.toBeNull()
  })

  it('rejects unsafe recovery revisions without letting them dominate a valid mirror', () => {
    const key = cardTranscriptRecoveryStorageKey(owner)
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        ...envelope([message('assistant', 'unsafe mirror')]),
        revision: Number.MAX_SAFE_INTEGER + 1,
      }),
    )
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...envelope([message('assistant', 'valid mirror')]),
        revision: 7,
      }),
    )

    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      message('assistant', 'valid mirror'),
    ])
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })

  it('unions divergent accepted rows even when a stale context publishes last', () => {
    const baseline = message('user', 'baseline', {
      clientId: 'client-baseline',
    })
    const fromFirstContext = message('user', 'first tab accepted', {
      clientId: 'client-first-tab',
    })
    const fromSecondContext = message('user', 'second tab accepted', {
      clientId: 'client-second-tab',
    })
    replaceCardTranscriptRecoveryMessages(owner, [baseline], { now })
    const key = cardTranscriptRecoveryStorageKey(owner)
    const staleRaw = window.localStorage.getItem(key)
    replaceCardTranscriptRecoveryMessages(owner, [baseline, fromFirstContext], {
      now,
    })
    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      storageKey,
    ) {
      if (this === window.localStorage && storageKey === key) return staleRaw
      return originalGetItem.call(this, storageKey)
    })

    expect(
      replaceCardTranscriptRecoveryMessages(
        owner,
        [baseline, fromSecondContext],
        { now },
      ),
    ).not.toBeNull()
    vi.mocked(Storage.prototype.getItem).mockRestore()
    clearCardTranscriptRecoveryMemory()

    const texts = readCardTranscriptRecovery(owner, { now })?.messages.map(
      (entry) => (entry.content?.[0] as { text?: string } | undefined)?.text,
    )
    expect(texts).toEqual(
      expect.arrayContaining([
        'baseline',
        'first tab accepted',
        'second tab accepted',
      ]),
    )
  })

  it('removes one rejected client identity from every recovery authority while preserving the accepted baseline', () => {
    const baseline = message('user', 'accepted baseline', {
      clientId: 'client-baseline',
    })
    const rejected = message('user', 'rejected before transport', {
      clientId: 'client-rejected',
      __optimisticId: 'opt-client-rejected',
      status: 'sending',
    })
    expect(
      replaceCardTranscriptRecoveryMessages(owner, [baseline], { now }),
    ).not.toBeNull()

    let denyRejectedPersistentWrite = true
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (
        denyRejectedPersistentWrite &&
        this === window.localStorage &&
        key.includes(':entry:') &&
        value.includes('client-rejected')
      ) {
        denyRejectedPersistentWrite = false
        throw new DOMException('transient quota failure', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    expect(
      appendCardTranscriptRecoveryMessage(owner, rejected, { now }),
    ).toBeNull()
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      baseline,
      rejected,
    ])

    expect(
      removeRejectedCardTranscriptRecoveryMessage(owner, 'client-rejected', {
        now,
      })?.messages,
    ).toEqual([baseline])
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      baseline,
    ])

    clearCardTranscriptRecoveryMemory()
    window.sessionStorage.clear()
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      baseline,
    ])
    expect(
      Array.from({ length: window.localStorage.length }, (_, index) =>
        window.localStorage.getItem(window.localStorage.key(index) ?? ''),
      ).join('\n'),
    ).not.toContain('client-rejected')
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

  it('preserves equal assistant recovery rows with distinct recovery-only identities', () => {
    const first = message('assistant', 'Recovered answer', {
      recoveryId: 'recovery-only-a',
      __streamingStatus: 'complete',
    })
    const second = message('assistant', 'Recovered answer', {
      recoveryId: 'recovery-only-b',
      __streamingStatus: 'complete',
      timestamp: now + 1_000,
    })

    expect(cardTranscriptMessagesMatch(first, second)).toBe(false)
    expect(
      replaceCardTranscriptRecoveryMessages(owner, [first, second], { now })
        ?.messages,
    ).toEqual([first, second])

    clearCardTranscriptRecoveryMemory()
    window.sessionStorage.clear()
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      first,
      second,
    ])
  })

  it('never acknowledges equal text and timestamps across conflicting non-null run identities', () => {
    const overlay = message('assistant', 'same answer at the same instant', {
      runId: 'run-local',
      stableId: 'stream-run:run-local',
      __streamingStatus: 'complete',
      timestamp: now,
    })
    replaceCardTranscriptRecoveryMessages(owner, [overlay], { now })

    const authoritative = message(
      'assistant',
      'same answer at the same instant',
      {
        id: 'server-assistant',
        runId: 'run-other',
        timestamp: now,
      },
    )
    const reconciled = removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [authoritative],
      { now },
    )

    expect(reconciled?.messages).toEqual([overlay])
    expect(
      mergeCardTranscriptRecoveryMessages([authoritative], [overlay]),
    ).toEqual([authoritative, overlay])
  })

  it('acknowledges ordinary server rows with matching client identity when server run identity is absent', () => {
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
          client_id: 'client-local',
        }),
        message('assistant', 'ordinary assistant acknowledgement', {
          id: 'server-assistant',
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
          client_id: 'repeat-first',
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
            client_id: 'repeat-first',
          }),
        ],
        [first, second],
      ),
    ).toEqual([expect.objectContaining({ id: 'server-repeat' }), second])
  })

  it('does not let a stale client-identified server row acknowledge a newer repeated user turn', () => {
    const newer = message('user', 'repeat after a stale history window', {
      clientId: 'client-newer',
      __optimisticId: 'opt-client-newer',
      status: 'sent',
      timestamp: now,
    })
    replaceCardTranscriptRecoveryMessages(owner, [newer], { now })

    const staleAuthoritative = message(
      'user',
      'repeat after a stale history window',
      {
        id: 'server-old-row',
        client_id: 'client-older',
        timestamp: now,
      },
    )
    const reconciled = removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [staleAuthoritative],
      { now },
    )

    expect(reconciled?.messages).toEqual([newer])
    expect(
      mergeCardTranscriptRecoveryMessages([staleAuthoritative], [newer]),
    ).toEqual([staleAuthoritative, newer])
  })

  it('reconciles a server-observed Swarm delivery without duplicating or losing attachment recovery', () => {
    const deliveredContent =
      '[User attached file: /tmp/swarm/evidence.txt]\nReview the evidence'
    const attachment = {
      id: 'swarm-attachment-1',
      name: 'evidence.txt',
      contentType: 'text/plain',
      size: 5,
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
      contentDigest:
        'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    }
    const optimistic = message('user', 'Review the evidence', {
      clientId: 'swarm-client-1',
      __optimisticId: 'opt-swarm-client-1',
      status: 'sent',
      attachments: [attachment],
      __swarmDeliveryAcknowledgement: {
        version: 2,
        clientId: 'swarm-client-1',
        observedAt: now,
        contentDigest: swarmDirectChatContentDigest(deliveredContent),
        attachments: [
          {
            id: attachment.id,
            name: attachment.name,
            contentType: attachment.contentType,
            size: attachment.size,
            contentDigest: attachment.contentDigest,
          },
        ],
      },
    })
    const authoritative = message('user', deliveredContent, {
      id: 'server-swarm-user',
      timestamp: now,
    })
    replaceCardTranscriptRecoveryMessages(owner, [optimistic], { now })

    const first = reconcileSessionCardHistoryResponse({
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [authoritative],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })

    expect(first.messages).toHaveLength(1)
    expect(first.messages[0]).toMatchObject({
      id: 'server-swarm-user',
      content: optimistic.content,
      attachments: [attachment],
      __swarmDeliveryAcknowledgement: optimistic.__swarmDeliveryAcknowledgement,
    })
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()

    const partial = reconcileSessionCardHistoryResponse({
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:segment-a',
          retryable: true,
          error: 'temporarily unavailable',
        },
      ],
    })
    expect(partial.messages).toHaveLength(1)
    expect(partial.messages[0]).toMatchObject({
      id: 'server-swarm-user',
      content: optimistic.content,
      attachments: [attachment],
    })
  })

  it('keeps attachment recovery when the server acknowledgement digest does not match the durable bytes', () => {
    const attachment = {
      id: 'swarm-attachment-integrity',
      name: 'evidence.txt',
      contentType: 'text/plain',
      size: 5,
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
      contentDigest:
        'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    }
    const deliveredContent =
      '[User attached file: /tmp/swarm/evidence.txt]\nReview the evidence'
    const optimistic = message('user', 'Review the evidence', {
      clientId: 'swarm-client-integrity',
      status: 'sending',
      attachments: [attachment],
    })
    appendCardTranscriptRecoveryMessage(owner, optimistic, { now })

    expect(
      acknowledgeDeliveredCardTranscriptRecoveryMessage(
        owner,
        'swarm-client-integrity',
        {
          version: 2,
          clientId: 'swarm-client-integrity',
          observedAt: now,
          contentDigest: swarmDirectChatContentDigest(deliveredContent),
          attachments: [
            {
              id: attachment.id,
              name: attachment.name,
              contentType: attachment.contentType,
              size: attachment.size,
              contentDigest: `sha256:${'0'.repeat(64)}`,
            },
          ],
        },
        { now },
      ),
    ).toBeNull()
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      optimistic,
    ])
  })

  it('retires 50 exactly acknowledged attachment turns so a text followup remains admissible', () => {
    const attachmentDigest =
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    for (
      let index = 0;
      index < CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES;
      index += 1
    ) {
      const clientId = `swarm-capacity-${index}`
      const attachmentId = `attachment-${index}`
      const deliveredContent =
        `[User attached file: /tmp/swarm/evidence-${index}.txt]\n` +
        `Review evidence ${index}`
      const optimistic = message('user', `Review evidence ${index}`, {
        clientId,
        status: 'sending',
        attachments: [
          {
            id: attachmentId,
            name: `evidence-${index}.txt`,
            contentType: 'text/plain',
            size: 5,
            dataUrl: 'data:text/plain;base64,aGVsbG8=',
            contentDigest: attachmentDigest,
          },
        ],
      })
      expect(
        appendCardTranscriptRecoveryMessage(owner, optimistic, {
          now: now + index,
        }),
      ).not.toBeNull()
      const acknowledgement = {
        version: 2,
        clientId,
        observedAt: now + index,
        contentDigest: swarmDirectChatContentDigest(deliveredContent),
        attachments: [
          {
            id: attachmentId,
            name: `evidence-${index}.txt`,
            contentType: 'text/plain',
            size: 5,
            contentDigest: attachmentDigest,
          },
        ],
      }
      expect(
        acknowledgeDeliveredCardTranscriptRecoveryMessage(
          owner,
          clientId,
          acknowledgement,
          { now: now + index },
        ),
      ).not.toBeNull()
      expect(
        removeAcknowledgedCardTranscriptRecoveryMessages(
          owner,
          [
            message('user', deliveredContent, {
              id: `server-${index}`,
              timestamp: now + index,
            }),
          ],
          { now: now + index },
        ),
      ).toBeNull()
    }

    expect(
      appendCardTranscriptRecoveryMessage(
        owner,
        message('user', 'Text followup after attachments', {
          clientId: 'swarm-text-followup',
        }),
        { now: now + CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES },
      ),
    ).not.toBeNull()
  })

  it('removes a Swarm text-only recovery row only after its exact observed echo is complete and durable', () => {
    const optimistic = message('user', 'Run the focused checks', {
      clientId: 'swarm-client-text',
      __optimisticId: 'opt-swarm-client-text',
      status: 'sent',
      __swarmDeliveryAcknowledgement: {
        version: 1,
        clientId: 'swarm-client-text',
        observedAt: now,
        contentDigest: swarmDirectChatContentDigest('Run the focused checks'),
      },
    })
    replaceCardTranscriptRecoveryMessages(owner, [optimistic], { now })

    const staleEqualText = message('user', 'Run the focused checks', {
      id: 'server-stale-swarm-user',
      timestamp: now - 1,
    })
    expect(
      removeAcknowledgedCardTranscriptRecoveryMessages(
        owner,
        [staleEqualText],
        { now },
      )?.messages,
    ).toEqual([optimistic])

    const observedEcho = message('user', 'Run the focused checks', {
      id: 'server-observed-swarm-user',
      timestamp: now,
    })
    expect(
      removeAcknowledgedCardTranscriptRecoveryMessages(owner, [observedEcho], {
        now,
      }),
    ).toBeNull()
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
        message('user', 'same prompt', {
          id: 'server-user-a',
          client_id: 'client-a',
        }),
        message('assistant', 'same acknowledgement', {
          id: 'server-assistant-a',
        }),
        message('user', 'same prompt', {
          id: 'server-user-b',
          client_id: 'client-b',
        }),
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

  it('keeps complete-history durability verified on an unchanged refetch when storage writes are denied', () => {
    const complete: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [message('assistant', 'already durable complete transcript')],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }
    expect(
      reconcileSessionCardHistoryResponse(complete).completeSnapshotDurability,
    ).toBe('verified')

    const blockedWrite = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function () {
        throw new DOMException(
          'storage is temporarily unavailable',
          'QuotaExceededError',
        )
      })

    const repeated = reconcileSessionCardHistoryResponse(complete)

    expect(repeated.completeSnapshotDurability).toBe('verified')
    expect(blockedWrite).not.toHaveBeenCalled()
  })

  it('does not acknowledge durable recovery from a session-only snapshot before tab close', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const accepted = message('user', 'survive the tab close', {
      clientId: 'client-tab-close',
      status: 'sent',
    })
    replaceCardTranscriptRecoveryMessages(owner, [accepted], { now })
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (
        this === window.localStorage &&
        key.startsWith('workspace.card-transcript-snapshot.')
      ) {
        throw new DOMException(
          'persistent snapshot denied',
          'QuotaExceededError',
        )
      }
      return originalSetItem.call(this, key, value)
    })
    const complete: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [
        message('user', 'survive the tab close', { id: 'server-tab-close' }),
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    reconcileSessionCardHistoryResponse(complete)
    expect(
      JSON.parse(
        window.localStorage.getItem(cardTranscriptRecoveryStorageKey(owner)) ??
          '{}',
      ).messages,
    ).toHaveLength(1)

    vi.mocked(Storage.prototype.setItem).mockRestore()
    window.sessionStorage.clear()
    clearCardTranscriptRecoveryMemory()
    const partial = reconcileSessionCardHistoryResponse({
      ...complete,
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        { segmentKey: 'remote:segment-a', retryable: true, error: 'retry' },
      ],
    })
    expect(partial.messages).toEqual([accepted])
  })

  it('hydrates partial attachment history without clearing recovery until authoritative content is complete', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const attachment = {
      id: 'attachment-local',
      name: 'notes.txt',
      contentType: 'text/plain',
      size: 5,
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
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
            client_id: 'client-file',
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
              dataUrl: 'data:text/plain;base64,aGVsbG8=',
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

  it('reconciles reordered attachments by stable identity without cross-wiring content', () => {
    const attachmentA = {
      id: 'attachment-a',
      name: 'duplicate.txt',
      contentType: 'text/plain',
      size: 1,
      dataUrl: 'data:text/plain;base64,QQ==',
    }
    const attachmentB = {
      id: 'attachment-b',
      name: 'duplicate.txt',
      contentType: 'text/plain',
      size: 1,
      dataUrl: 'data:text/plain;base64,Qg==',
    }
    const recoveryMessage = {
      ...message('user', 'review both files', { clientId: 'client-reordered' }),
      attachments: [attachmentA, attachmentB],
    }
    replaceCardTranscriptRecoveryMessages(owner, [recoveryMessage], { now })

    const partialAuthoritative = message('user', 'review both files', {
      id: 'server-reordered',
      client_id: 'client-reordered',
      attachments: [
        {
          id: 'attachment-b',
          name: 'duplicate.txt',
          contentType: 'text/plain',
          size: 1,
        },
        {
          id: 'attachment-a',
          name: 'duplicate.txt',
          contentType: 'text/plain',
          size: 1,
        },
      ],
    })

    expect(
      mergeCardTranscriptRecoveryMessages(
        [partialAuthoritative],
        [recoveryMessage],
      )[0]?.attachments,
    ).toEqual([attachmentB, attachmentA])

    const crossWiredAuthoritative = {
      ...partialAuthoritative,
      attachments: [
        { ...attachmentB, dataUrl: attachmentA.dataUrl },
        { ...attachmentA, dataUrl: attachmentB.dataUrl },
      ],
    }
    expect(
      mergeCardTranscriptRecoveryMessages(
        [crossWiredAuthoritative],
        [recoveryMessage],
      )[0]?.attachments,
    ).toEqual([attachmentB, attachmentA])
    removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [crossWiredAuthoritative],
      { now },
    )
    expect(readCardTranscriptRecovery(owner, { now })?.messages).toHaveLength(1)

    removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [
        {
          ...partialAuthoritative,
          attachments: [attachmentB, attachmentA],
        },
      ],
      { now },
    )
    expect(readCardTranscriptRecovery(owner, { now })).toBeNull()
  })

  it('does not position-match duplicate attachment names without stable IDs', () => {
    const recoveryMessage = {
      ...message('user', 'ambiguous files', { clientId: 'client-ambiguous' }),
      attachments: [
        {
          name: 'duplicate.txt',
          contentType: 'text/plain',
          size: 1,
          dataUrl: 'data:text/plain;base64,QQ==',
        },
        {
          name: 'duplicate.txt',
          contentType: 'text/plain',
          size: 1,
          dataUrl: 'data:text/plain;base64,Qg==',
        },
      ],
    }
    replaceCardTranscriptRecoveryMessages(owner, [recoveryMessage], { now })

    removeAcknowledgedCardTranscriptRecoveryMessages(
      owner,
      [
        message('user', 'ambiguous files', {
          id: 'server-ambiguous',
          client_id: 'client-ambiguous',
          attachments: [
            {
              name: 'duplicate.txt',
              contentType: 'text/plain',
              size: 1,
              dataUrl: 'data:text/plain;base64,QQ==',
            },
            {
              name: 'duplicate.txt',
              contentType: 'text/plain',
              size: 1,
              dataUrl: 'data:text/plain;base64,Qg==',
            },
          ],
        }),
      ],
      { now },
    )

    expect(readCardTranscriptRecovery(owner, { now })?.messages).toEqual([
      recoveryMessage,
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
