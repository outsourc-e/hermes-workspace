// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS,
  appendCardTranscriptRecoveryMessage,
  cardTranscriptMessagesMatch,
  clearCardTranscriptRecovery,
  mergeCardTranscriptRecoveryMessages,
  readCardTranscriptRecovery,
  removeRejectedCardTranscriptRecoveryMessage,
  replaceCardTranscriptRecoveryMessages,
  writeSnapshotAndAcknowledgeCardTranscriptRecovery,
} from './card-transcript-recovery'
import {
  readCardRecovery as readIndexedDbCardRecovery,
  resetWorkspaceChatIndexedDb,
} from './card-transcript-indexeddb'
import { readCardTranscriptSnapshot } from './card-transcript-snapshot'
import { reconcileSessionCardHistoryResponseDurably } from './chat-queries'
import type { SessionCardHistoryResponse } from './chat-queries'
import type {
  CardTranscriptRecoveryOwner,
} from './card-transcript-recovery'
import type { ChatMessage } from './types'

const owner: CardTranscriptRecoveryOwner = { cardId: 'remote:card-a' }
const now = 1_800_000_000_000

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

describe('Card transcript recovery v4 IndexedDB contract', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    const database = await resetWorkspaceChatIndexedDb()
    database.close()
  })

  it('admits recovery only through a strict v4 IndexedDB record', async () => {
    window.localStorage.setItem(
      'workspace.card-transcript-recovery.v2:remote%3Acard-a',
      JSON.stringify({ version: 2, cardId: owner.cardId, messages: [] }),
    )
    window.sessionStorage.setItem(
      'workspace.card-transcript-recovery.v1:remote%3Acard-a:remote%3Asegment',
      JSON.stringify({ version: 1, cardId: owner.cardId, messages: [] }),
    )

    expect(await readCardTranscriptRecovery(owner)).toBeNull()

    const written = await appendCardTranscriptRecoveryMessage(
      owner,
      message('user', 'durable', { clientId: 'client-v4' }),
      { now },
    )
    expect(written).toMatchObject({ version: 4, cardId: owner.cardId })
    expect(written?.messages).toHaveLength(1)

    const raw = await readIndexedDbCardRecovery(owner.cardId)
    expect(raw).toMatchObject({
      schema: 4,
      cardId: owner.cardId,
      payload: { version: 4 },
    })
    expect(window.localStorage).toHaveLength(1)
    expect(window.sessionStorage).toHaveLength(1)
  })

  it('recursively strips transport segment identities before persistence', async () => {
    const written = await appendCardTranscriptRecoveryMessage(
      owner,
      message('assistant', 'safe transcript', {
        sessionKey: 'remote:raw-top',
        metadata: {
          segment_key: 'remote:raw-nested',
          safe: { retained: true },
        },
        toolState: [{ args: { session_id: 'remote:raw-tool', kept: true } }],
      }),
      { now },
    )

    const serialized = JSON.stringify(written)
    expect(serialized).not.toContain('remote:raw-')
    expect(serialized).toContain('"retained":true')
    expect(serialized).toContain('"kept":true')
  })

  it.each([
    ['raw Card ID', { cardId: 'card-a' }],
    ['blank Card ID', { cardId: ' ' }],
  ])('rejects %s ownership without writing', async (_name, invalidOwner) => {
    await expect(
      appendCardTranscriptRecoveryMessage(
        invalidOwner,
        message('user', 'not owned'),
        { now },
      ),
    ).resolves.toBeNull()
    expect(await readIndexedDbCardRecovery(invalidOwner.cardId)).toBeNull()
  })

  it('rejects non-portable rows without replacing accepted recovery', async () => {
    const accepted = message('user', 'accepted', { clientId: 'client-accepted' })
    await appendCardTranscriptRecoveryMessage(owner, accepted, { now })

    await expect(
      appendCardTranscriptRecoveryMessage(
        owner,
        message('assistant', 'x'.repeat(CARD_TRANSCRIPT_RECOVERY_MAX_TEXT_CHARS + 1)),
        { now },
      ),
    ).resolves.toBeNull()
    expect((await readCardTranscriptRecovery(owner))?.messages).toEqual([accepted])
  })

  it('unions concurrent accepted turns through compare-and-swap retry', async () => {
    const first = message('user', 'first tab', { clientId: 'client-first' })
    const second = message('user', 'second tab', { clientId: 'client-second' })

    await Promise.all([
      appendCardTranscriptRecoveryMessage(owner, first, { now }),
      appendCardTranscriptRecoveryMessage(owner, second, { now }),
    ])

    expect((await readCardTranscriptRecovery(owner))?.messages).toEqual(
      expect.arrayContaining([first, second]),
    )
  })

  it('rejects over-capacity admission without evicting durable turns', async () => {
    const accepted = Array.from(
      { length: CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES },
      (_, index) =>
        message('user', `accepted-${index}`, { clientId: `client-${index}` }),
    )
    await replaceCardTranscriptRecoveryMessages(owner, accepted, { now })

    await expect(
      appendCardTranscriptRecoveryMessage(
        owner,
        message('user', 'overflow', { clientId: 'client-overflow' }),
        { now },
      ),
    ).rejects.toThrow('capacity exceeded')
    expect((await readCardTranscriptRecovery(owner))?.messages).toEqual(accepted)
  })

  it('removes only a rejected client identity', async () => {
    const baseline = message('user', 'baseline', { clientId: 'client-baseline' })
    const rejected = message('user', 'rejected', {
      clientId: 'client-rejected',
      __optimisticId: 'client-rejected',
      status: 'sending',
    })
    await replaceCardTranscriptRecoveryMessages(owner, [baseline, rejected], { now })

    const remaining = await removeRejectedCardTranscriptRecoveryMessage(
      owner,
      'client-rejected',
      { now },
    )
    expect(remaining?.messages).toEqual([baseline])
  })

  it('keeps equal assistant text from conflicting runs as distinct evidence', () => {
    const first = message('assistant', 'same', { runId: 'run-a' })
    const second = message('assistant', 'same', { runId: 'run-b' })

    expect(cardTranscriptMessagesMatch(first, second)).toBe(false)
    expect(mergeCardTranscriptRecoveryMessages([first], [second])).toEqual([
      first,
      second,
    ])
  })

  it('atomically writes the latest snapshot and acknowledges matching recovery', async () => {
    const optimistic = message('user', 'sent', {
      clientId: 'client-atomic',
      __optimisticId: 'client-atomic',
      status: 'sending',
    })
    await appendCardTranscriptRecoveryMessage(owner, optimistic, { now })

    const authoritative = message('user', 'sent', {
      clientId: 'client-atomic',
      status: 'sent',
    })
    const acknowledgement =
      await writeSnapshotAndAcknowledgeCardTranscriptRecovery(
        owner,
        [authoritative],
        { now: now + 1 },
      )

    expect(acknowledgement.authoritativeMessages).toHaveLength(1)
    expect(acknowledgement.recovery).toBeNull()
    expect(await readCardTranscriptRecovery(owner)).toBeNull()
    expect((await readCardTranscriptSnapshot(owner.cardId))?.messages).toHaveLength(1)
  })

  it('persists stream-only tool activity by exact authoritative identity', async () => {
    const toolCalls = [
      {
        id: 'tool-1',
        name: 'read_file',
        phase: 'complete',
        args: { path: '/tmp/example.txt' },
        result: 'file contents',
      },
    ]
    await appendCardTranscriptRecoveryMessage(
      owner,
      message('assistant', 'tool-backed response', {
        runId: 'run-snapshot-tools',
        stableId: 'stream-run:run-snapshot-tools',
        __streamingStatus: 'complete',
        __streamToolCalls: toolCalls,
      }),
      { now },
    )
    const authoritative = message('assistant', 'tool-backed response', {
      id: 'server-assistant-snapshot-tools',
    })
    const server: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [authoritative],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    const reconciled = await reconcileSessionCardHistoryResponseDurably(server)

    expect(reconciled.messages).toEqual([
      { ...authoritative, __streamToolCalls: toolCalls },
    ])
    expect(await readCardTranscriptRecovery(owner)).toBeNull()
    expect((await readCardTranscriptSnapshot(owner.cardId))?.messages).toEqual(
      reconciled.messages,
    )

    const reloaded = await reconcileSessionCardHistoryResponseDurably(server)
    expect(reloaded.messages).toEqual(reconciled.messages)

    const newerEqualText = await reconcileSessionCardHistoryResponseDurably({
      ...server,
      messages: [
        message('assistant', 'tool-backed response', {
          id: 'server-assistant-newer-equal-text',
        }),
      ],
    })
    expect(newerEqualText.messages[0]).not.toHaveProperty('__streamToolCalls')
  })

  it('merges newer recovered tool calls into an existing snapshot summary', async () => {
    const toolA = {
      id: 'tool-a',
      name: 'read_file',
      phase: 'complete',
      result: 'A',
    }
    const toolB = {
      id: 'tool-b',
      name: 'web_search',
      phase: 'complete',
      result: 'B',
    }
    const recoveryFields = {
      runId: 'run-partial-tools',
      stableId: 'stream-run:run-partial-tools',
      __streamingStatus: 'complete',
    }
    const authoritative = message('assistant', 'partial tool response', {
      id: 'server-partial-tools',
    })
    const server: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [authoritative],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    await appendCardTranscriptRecoveryMessage(
      owner,
      message('assistant', 'partial tool response', {
        ...recoveryFields,
        __streamToolCalls: [toolA],
      }),
      { now },
    )
    await reconcileSessionCardHistoryResponseDurably(server)

    await appendCardTranscriptRecoveryMessage(
      owner,
      message('assistant', 'partial tool response', {
        ...recoveryFields,
        __streamToolCalls: [toolA, toolB],
      }),
      { now: now + 1 },
    )
    const reconciled = await reconcileSessionCardHistoryResponseDurably(server)

    expect(reconciled.messages[0]?.__streamToolCalls).toEqual([toolA, toolB])
    expect(await readCardTranscriptRecovery(owner)).toBeNull()
    expect(
      (await readCardTranscriptSnapshot(owner.cardId))?.messages[0]
        ?.__streamToolCalls,
    ).toEqual([toolA, toolB])
  })

  it('does not restore snapshot tools across different identity fields', async () => {
    const toolCalls = [
      {
        id: 'tool-cross-field',
        name: 'read_file',
        phase: 'complete',
        result: 'result',
      },
    ]
    await appendCardTranscriptRecoveryMessage(
      owner,
      message('assistant', 'equal text', {
        runId: 'run-cross-field',
        stableId: 'stream-run:run-cross-field',
        __streamingStatus: 'complete',
        __streamToolCalls: toolCalls,
      }),
      { now },
    )
    const server: SessionCardHistoryResponse = {
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: [
        message('assistant', 'equal text', {
          id: 'shared-value-in-different-fields',
        }),
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }
    await reconcileSessionCardHistoryResponseDurably(server)

    const newerEqualText = await reconcileSessionCardHistoryResponseDurably({
      ...server,
      messages: [
        message('assistant', 'equal text', {
          stableId: 'shared-value-in-different-fields',
        }),
      ],
    })

    expect(newerEqualText.messages[0]).not.toHaveProperty('__streamToolCalls')
  })

  it('retires snapshot-backed tool rows before recovery reaches capacity', async () => {
    const recoveryMessages = Array.from(
      { length: CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES },
      (_unused, index) =>
        message('assistant', `tool response ${index}`, {
          runId: `capacity-run-${index}`,
          stableId: `stream-run:capacity-run-${index}`,
          __streamingStatus: 'complete',
          __streamToolCalls: [
            {
              id: `capacity-tool-${index}`,
              name: 'read_file',
              phase: 'complete',
              result: `result ${index}`,
            },
          ],
        }),
    )
    await replaceCardTranscriptRecoveryMessages(owner, recoveryMessages, {
      now,
    })
    const authoritativeMessages = recoveryMessages.map((recovery, index) =>
      message('assistant', `tool response ${index}`, {
        id: `server-capacity-${index}`,
        timestamp: recovery.timestamp,
      }),
    )

    await reconcileSessionCardHistoryResponseDurably({
      sessionKey: 'remote:segment-a',
      ...owner,
      canonicalSegmentKey: 'remote:segment-a',
      messages: authoritativeMessages,
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })

    expect(await readCardTranscriptRecovery(owner)).toBeNull()
    await expect(
      appendCardTranscriptRecoveryMessage(
        owner,
        message('user', 'the next accepted turn', {
          clientId: 'after-capacity',
        }),
        { now },
      ),
    ).resolves.not.toBeNull()
  })

  it('clears exactly the requested Card owner', async () => {
    const sibling = { cardId: 'remote:card-b' }
    await appendCardTranscriptRecoveryMessage(owner, message('user', 'a'))
    await appendCardTranscriptRecoveryMessage(sibling, message('user', 'b'))

    await clearCardTranscriptRecovery(owner)
    expect(await readCardTranscriptRecovery(owner)).toBeNull()
    expect((await readCardTranscriptRecovery(sibling))?.messages).toHaveLength(1)
  })
})
