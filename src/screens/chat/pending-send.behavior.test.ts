// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES,
  readCardTranscriptRecovery,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import {
  appendPendingRecoveryMessage,
  checkpointPendingRecoveryMessage,
  getNewChatProvisionalOwnerId,
  handoffPendingSend,
  pendingSendOwnerKey,
  persistPendingMessage,
  readPendingMessage,
  resetPendingSend,
} from './pending-send'
import {
  readPendingSend as readIndexedDbPendingSend,
  resetWorkspaceChatIndexedDb,
} from './card-transcript-indexeddb'
import type { ChatMessage } from './types'

function user(clientId: string, text: string, timestamp = 1): ChatMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp,
    clientId,
    client_id: clientId,
    __optimisticId: `opt-${clientId}`,
    status: 'sending',
  }
}

function payload(
  provisionalOwnerId: string,
  clientId = 'client-bootstrap',
  text = 'bootstrap question',
) {
  const optimisticMessage = user(clientId, text)
  return {
    sessionKey: 'new',
    friendlyId: 'new',
    provisionalOwnerId,
    message: text,
    attachments: [],
    optimisticMessage,
  }
}

describe('pending-send v4 IndexedDB ownership', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    await resetPendingSend()
    const database = await resetWorkspaceChatIndexedDb()
    database.close()
  })

  it('admits the first turn to IndexedDB without a browser payload mirror', async () => {
    const provisionalOwnerId = getNewChatProvisionalOwnerId()
    expect(await persistPendingMessage(payload(provisionalOwnerId))).toBe(true)

    expect(await readPendingMessage('new', 'new', provisionalOwnerId)).toMatchObject({
      provisionalOwnerId,
      message: 'bootstrap question',
    })
    expect(
      await readIndexedDbPendingSend(
        pendingSendOwnerKey('new', provisionalOwnerId),
      ),
    ).toMatchObject({ schema: 4 })
    expect(window.localStorage).toHaveLength(0)
    expect(window.sessionStorage).toHaveLength(1)
    expect(
      window.sessionStorage.getItem('workspace.chat-provisional-owner.v4'),
    ).toBe(provisionalOwnerId)
    expect(window.sessionStorage.getItem('workspace.chat-provisional-owner.v4')).not.toContain(
      'bootstrap question',
    )
  })

  it('appends and checkpoints a sanitized assistant before terminal cleanup', async () => {
    const provisionalOwnerId = 'owner-checkpoint'
    await persistPendingMessage(payload(provisionalOwnerId))

    expect(
      await appendPendingRecoveryMessage(
        'new',
        'new',
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'partial' }],
          timestamp: 2,
          runId: 'run-1',
          stableId: 'stream-run:run-1',
          sessionKey: 'remote:raw-segment',
          __streamingStatus: 'streaming',
        },
        provisionalOwnerId,
      ),
    ).toBe(true)
    expect(
      await checkpointPendingRecoveryMessage(
        'new',
        'new',
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'complete' }],
          timestamp: 3,
          runId: 'run-1',
          stableId: 'stream-run:run-1',
          __streamingStatus: 'complete',
        },
        provisionalOwnerId,
      ),
    ).toBe(true)

    const pending = await readPendingMessage('new', 'new', provisionalOwnerId)
    expect(pending?.recoveryMessages).toHaveLength(2)
    expect(JSON.stringify(pending)).not.toContain('remote:raw-segment')
    expect(JSON.stringify(pending)).toContain('complete')
    expect(JSON.stringify(pending)).not.toContain('partial')
  })

  it('retains every accepted provisional turn for one owner', async () => {
    const provisionalOwnerId = 'owner-multi-turn'
    expect(
      await persistPendingMessage(
        payload(provisionalOwnerId, 'client-first', 'first'),
      ),
    ).toBe(true)
    expect(
      await persistPendingMessage(
        payload(provisionalOwnerId, 'client-second', 'second'),
      ),
    ).toBe(true)

    const pending = await readPendingMessage('new', 'new', provisionalOwnerId)
    expect(pending?.recoveryMessages?.map((entry) => entry.clientId)).toEqual([
      'client-first',
      'client-second',
    ])
  })

  it('isolates simultaneous provisional owners', async () => {
    await Promise.all([
      persistPendingMessage(payload('owner-a', 'client-a', 'from a')),
      persistPendingMessage(payload('owner-b', 'client-b', 'from b')),
    ])

    expect((await readPendingMessage('new', 'new', 'owner-a'))?.message).toBe(
      'from a',
    )
    expect((await readPendingMessage('new', 'new', 'owner-b'))?.message).toBe(
      'from b',
    )
  })

  it('rejects over-capacity admission without deleting accepted pending recovery', async () => {
    const provisionalOwnerId = 'owner-capacity'
    const accepted = Array.from(
      { length: CARD_TRANSCRIPT_RECOVERY_MAX_MESSAGES },
      (_, index) => user(`client-${index}`, `accepted-${index}`, index),
    )
    const first = payload(provisionalOwnerId, 'client-0', 'accepted-0')
    first.optimisticMessage = accepted[0]!
    expect(await persistPendingMessage(first)).toBe(true)
    for (const acceptedMessage of accepted.slice(1)) {
      expect(
        await appendPendingRecoveryMessage(
          'new',
          'new',
          acceptedMessage,
          provisionalOwnerId,
        ),
      ).toBe(true)
    }

    expect(
      await persistPendingMessage(
        payload(provisionalOwnerId, 'client-overflow', 'overflow'),
      ),
    ).toBe(false)
    expect(
      (await readPendingMessage('new', 'new', provisionalOwnerId))
        ?.recoveryMessages,
    ).toEqual(accepted)
  })

  it('retains provisional recovery for an unverified destination', async () => {
    const provisionalOwnerId = 'owner-unverified'
    await persistPendingMessage(payload(provisionalOwnerId))

    expect(
      await handoffPendingSend('new', 'remote:segment', 'remote:card-a', {
        provisionalOwnerId,
        verifiedCardDestination: false,
      }),
    ).toBe(false)
    expect(await readPendingMessage('new', 'new', provisionalOwnerId)).not.toBeNull()
    expect(await readCardTranscriptRecovery({ cardId: 'remote:card-a' })).toBeNull()
  })

  it('atomically promotes pending recovery before deleting the provisional owner', async () => {
    const provisionalOwnerId = 'owner-handoff'
    const existing = user('client-existing', 'existing Card turn', 0)
    await replaceCardTranscriptRecoveryMessages(
      { cardId: 'remote:card-a' },
      [existing],
    )
    await persistPendingMessage(payload(provisionalOwnerId))

    expect(
      await handoffPendingSend('new', 'remote:segment', 'remote:card-a', {
        provisionalOwnerId,
        verifiedCardDestination: true,
      }),
    ).toBe(true)
    expect(await readPendingMessage('new', 'new', provisionalOwnerId)).toBeNull()
    expect(
      (await readCardTranscriptRecovery({ cardId: 'remote:card-a' }))?.messages,
    ).toEqual(expect.arrayContaining([existing, user('client-bootstrap', 'bootstrap question')]))
  })
})
