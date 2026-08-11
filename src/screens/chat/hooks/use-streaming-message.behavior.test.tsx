// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import React, { useEffect } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySessionRouteResolution } from '../../../routes/chat/-session-route-state'
import { useChatStore } from '../../../stores/chat-store'
import { chatQueryKeys } from '../chat-queries'
import { shouldPinMainSession } from '../chat-screen-utils'
import { resetWorkspaceChatIndexedDb } from '../card-transcript-indexeddb'
import { readCardTranscriptRecovery } from '../card-transcript-recovery'
import {
  consumePendingSend,
  readPendingMessage,
  resetPendingSend,
  stashPendingSend,
} from '../pending-send'
import { useStreamingMessage } from './use-streaming-message'
import type { ChatMessage, HistoryResponse, SessionCard } from '../types'
import type { AuthoritativeCardHandoff } from './use-streaming-message'

type ChatStoreState = ReturnType<typeof useChatStore.getState>

vi.mock('../../../stores/chat-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & { useChatStore: typeof useChatStore }
  >()
  const original = actual.useChatStore
  const useChatStoreWithoutSubscription = Object.assign(
    <T,>(selector: (state: ChatStoreState) => T) =>
      selector(original.getState()),
    original,
  )
  return { ...actual, useChatStore: useChatStoreWithoutSubscription }
})

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true

type StreamingController = ReturnType<typeof useStreamingMessage>

function StreamingHarness({
  onReady,
  onSessionResolved,
  onAbort,
  onReaderOpened,
  pinMainSession,
  activeCard,
  sessionCards,
  onCardHandoff,
  onComplete,
}: {
  onReady: (controller: StreamingController) => void
  onSessionResolved: (payload: {
    fromSessionKey: string
    sessionKey: string
    friendlyId: string
    reason: 'bootstrap' | 'stream-handoff'
  }) => void
  onAbort: (_sessionKey: string) => void
  onReaderOpened?: (sessionKey: string) => void
  pinMainSession: boolean
  activeCard?: SessionCard
  sessionCards?: ReadonlyArray<SessionCard>
  onCardHandoff?: (payload: AuthoritativeCardHandoff) => boolean
  onComplete?: (message: ChatMessage) => void
}) {
  const streaming = useStreamingMessage({
    onSessionResolved,
    onAbort,
    onReaderOpened,
    pinMainSession,
    activeCard,
    sessionCards,
    onCardHandoff,
    onComplete,
  })
  useEffect(() => onReady(streaming), [onReady, streaming])
  return null
}

function userMessage(id: string, text: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: 1,
  }
}

function rootCard(cardId: string, canonicalSegmentKey: string): SessionCard {
  return {
    cardId,
    canonicalSource: cardId.startsWith('remote:') ? 'remote' : 'local',
    canonicalTransport: cardId.startsWith('remote:') ? 'gateway' : 'dashboard',
    title: 'Card',
    titleSource: 'manual',
    canonicalSegmentKey,
    continuationSegmentKeys: [canonicalSegmentKey],
    continuationCount: 1,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: 1,
    archived: false,
    pinned: false,
  }
}

function controlledSseResponse() {
  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
  })
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    emit(event: string, data: Record<string, unknown>) {
      streamController?.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      )
    },
    close() {
      streamController?.close()
    },
  }
}

describe('useStreamingMessage authoritative handoff behavior', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    await resetPendingSend()
    const database = await resetWorkspaceChatIndexedDb()
    database.close()
    useChatStore.getState().clearSession('new')
    useChatStore.getState().clearSession('main')
    useChatStore.getState().clearSession('backend-parent')
    useChatStore.getState().clearSession('canonical-child')
    useChatStore.getState().clearSession('remote:created-segment')
    useChatStore.getState().clearSession('remote:continuation-segment')
    useChatStore.getState().clearCard('remote:card')
    useChatStore.getState().clearCard('remote:parent-card')
    useChatStore.getState().clearCard('remote:created-card')
    useChatStore.getState().clearCard('remote:concurrent-card')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await resetPendingSend()
  })

  it('completes an assistant overlay with immutable identity derived from the run', async () => {
    const encoder = new TextEncoder()
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode(
            [
              'event: started',
              'data: {"runId":"run-identity","sessionKey":"remote:segment"}',
              '',
              'event: chunk',
              'data: {"text":"OK","runId":"run-identity"}',
              '',
              'event: done',
              'data: {"state":"complete","sessionKey":"remote:segment","runId":"run-identity"}',
              '',
              '',
            ].join('\n'),
          ),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
      text: () => Promise.resolve(''),
    } as unknown as Response)
    const onComplete = vi.fn()
    let controller: StreamingController | null = null
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <StreamingHarness
          onReady={(next) => {
            controller = next
          }}
          onSessionResolved={vi.fn()}
          onAbort={vi.fn()}
          pinMainSession={false}
          onComplete={onComplete}
        />,
      )
    })

    await React.act(async () => {
      await controller!.startStreaming({
        sessionKey: 'remote:segment',
        friendlyId: 'remote:card',
        cardId: 'remote:card',
        message: 'continue',
      })
    })

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        runId: 'run-identity',
        stableId: 'stream-run:run-identity',
      }),
    )
    React.act(() => root.unmount())
    document.body.removeChild(container)
  })

  it('keeps two actual send-stream readers independent through interleaved production events and sibling termination', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const card = rootCard('remote:concurrent-card', 'remote:concurrent-segment')
    const firstStream = controlledSseResponse()
    const secondStream = controlledSseResponse()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    let firstController: StreamingController | null = null
    let secondController: StreamingController | null = null
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(
        <>
          <StreamingHarness
            onReady={(next) => {
              firstController = next
            }}
            onSessionResolved={vi.fn()}
            onAbort={vi.fn()}
            pinMainSession={false}
            activeCard={card}
            sessionCards={[card]}
          />
          <StreamingHarness
            onReady={(next) => {
              secondController = next
            }}
            onSessionResolved={vi.fn()}
            onAbort={vi.fn()}
            pinMainSession={false}
            activeCard={card}
            sessionCards={[card]}
          />
        </>,
      )
    })

    let firstRun: Promise<void> | undefined
    let secondRun: Promise<void> | undefined
    await React.act(async () => {
      firstRun = firstController!.startStreaming({
        sessionKey: card.canonicalSegmentKey,
        friendlyId: card.cardId,
        cardId: card.cardId,
        message: 'first concurrent turn',
      })
      secondRun = secondController!.startStreaming({
        sessionKey: card.canonicalSegmentKey,
        friendlyId: card.cardId,
        cardId: card.cardId,
        message: 'second concurrent turn',
      })
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await React.act(async () => {
      firstStream.emit('started', {
        runId: 'run-concurrent-a',
        sessionKey: card.canonicalSegmentKey,
      })
      secondStream.emit('started', {
        runId: 'run-concurrent-b',
        sessionKey: card.canonicalSegmentKey,
      })
      firstStream.emit('chunk', {
        text: 'alpha',
        fullReplace: true,
        runId: 'run-concurrent-a',
      })
      secondStream.emit('chunk', {
        text: 'bravo',
        fullReplace: true,
        runId: 'run-concurrent-b',
      })
      firstStream.emit('chunk', {
        text: 'alpha continued',
        fullReplace: true,
        runId: 'run-concurrent-a',
      })
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(
        useChatStore
          .getState()
          .getCardStreamingStates(card.cardId)
          .map(({ runId, text }) => ({ runId, text }))
          .sort((left, right) =>
            String(left.runId).localeCompare(String(right.runId)),
          ),
      ).toEqual([
        { runId: 'run-concurrent-a', text: 'alpha continued' },
        { runId: 'run-concurrent-b', text: 'bravo' },
      ])
    })

    await React.act(async () => {
      firstStream.emit('done', {
        state: 'complete',
        sessionKey: card.canonicalSegmentKey,
        runId: 'run-concurrent-a',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'alpha continued' }],
        },
      })
      firstStream.close()
      await firstRun
    })

    expect(
      useChatStore
        .getState()
        .getCardStreamingStates(card.cardId)
        .map(({ runId, text }) => ({ runId, text })),
    ).toEqual([{ runId: 'run-concurrent-b', text: 'bravo' }])

    await React.act(async () => {
      secondStream.emit('chunk', {
        text: 'bravo survives sibling completion',
        fullReplace: true,
        runId: 'run-concurrent-b',
      })
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(
        useChatStore.getState().getCardStreamingStates(card.cardId),
      ).toEqual([
        expect.objectContaining({
          runId: 'run-concurrent-b',
          text: 'bravo survives sibling completion',
        }),
      ])
    })

    await React.act(async () => {
      secondStream.emit('done', {
        state: 'complete',
        sessionKey: card.canonicalSegmentKey,
        runId: 'run-concurrent-b',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'bravo survives sibling completion' },
          ],
        },
      })
      secondStream.close()
      await secondRun
    })
    expect(useChatStore.getState().getCardStreamingStates(card.cardId)).toEqual(
      [],
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
  })

  it.each([
    {
      name: 'bootstrap new route',
      activeFriendlyId: 'new',
      fromSessionKey: 'new',
      fallbackSessionKey: 'new',
      targetFriendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      reason: 'bootstrap' as const,
      portableMode: false,
      sessionSource: 'remote' as const,
    },
    {
      name: 'remote main bootstrap route before session metadata resolves',
      activeFriendlyId: 'main',
      fromSessionKey: 'main',
      fallbackSessionKey: 'main',
      targetFriendlyId: 'canonical-main',
      cardId: 'remote:parent-card',
      reason: 'bootstrap' as const,
      portableMode: false,
      sessionSource: 'unknown' as const,
    },
    {
      name: 'authoritative backend key when the friendly id differs',
      activeFriendlyId: 'friendly-route',
      fromSessionKey: 'backend-parent',
      fallbackSessionKey: 'wrong-friendly-source',
      targetFriendlyId: 'child-friendly',
      cardId: 'remote:parent-card',
      reason: 'stream-handoff' as const,
      portableMode: false,
      sessionSource: 'remote' as const,
    },
  ])(
    'moves route/cache/store/pending state for $name without aborting the reader',
    async ({
      activeFriendlyId,
      fromSessionKey,
      fallbackSessionKey,
      targetFriendlyId,
      cardId,
      reason,
      portableMode,
      sessionSource,
    }) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const sourceHistoryKey = chatQueryKeys.history(
        activeFriendlyId,
        fromSessionKey,
      )
      const targetHistoryKey = chatQueryKeys.history(
        targetFriendlyId,
        'canonical-child',
      )
      const optimisticMessage = {
        ...userMessage('optimistic-1', 'continue'),
        clientId: 'client-1',
        __optimisticId: 'opt-client-1',
        status: 'sending',
      }
      queryClient.setQueryData<HistoryResponse>(sourceHistoryKey, {
        sessionKey: fromSessionKey,
        messages: [optimisticMessage],
      })
      await stashPendingSend({
        sessionKey: fromSessionKey,
        friendlyId: activeFriendlyId,
        message: 'continue',
        attachments: [],
        optimisticMessage,
      })

      const store = useChatStore.getState()
      store.processCardEvent(cardId, {
        type: 'message',
        message: userMessage('live-1', 'live message'),
        sessionKey: fromSessionKey,
        transport: 'send-stream',
      })
      store.setCardWaiting(cardId, 'run-1')

      const encoder = new TextEncoder()
      const reader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(
              [
                'event: session_handoff',
                `data: ${JSON.stringify({ fromSessionKey, sessionKey: 'canonical-child', friendlyId: targetFriendlyId, runId: 'run-1' })}`,
                '',
                'event: started',
                'data: {"runId":"run-1","sessionKey":"canonical-child"}',
                '',
                'event: done',
                'data: {"state":"complete","sessionKey":"canonical-child","runId":"run-1"}',
                '',
                '',
              ].join('\n'),
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: vi.fn().mockResolvedValue(undefined),
      }
      let requestSignal: AbortSignal | undefined
      let requestPayload: Record<string, unknown> | undefined
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        requestSignal = init?.signal ?? undefined
        requestPayload = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >
        return Promise.resolve({
          ok: true,
          body: { getReader: () => reader },
          text: () => Promise.resolve(''),
        } as unknown as Response)
      })

      const navigate = vi.fn()
      const onAbort = vi.fn()
      let controller: StreamingController | null = null
      const onReady = (next: StreamingController) => {
        controller = next
      }
      const onSessionResolved = vi.fn(
        async (payload: {
          fromSessionKey: string
          sessionKey: string
          friendlyId: string
          reason: 'bootstrap' | 'stream-handoff'
        }) => {
          const transition = await applySessionRouteResolution({
            queryClient,
            activeFriendlyId,
            fallbackSessionKey,
            payload,
          })
          navigate(transition.navigation)
        },
      )

      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      React.act(() => {
        root.render(
          <StreamingHarness
            onReady={onReady}
            onSessionResolved={onSessionResolved}
            onAbort={onAbort}
            pinMainSession={shouldPinMainSession({
              activeFriendlyId,
              resolvedSessionKey: fromSessionKey,
              portableMode,
              sessionSource,
            })}
          />,
        )
      })

      expect(controller).not.toBeNull()
      await React.act(async () => {
        await controller!.startStreaming({
          sessionKey: fromSessionKey,
          friendlyId: activeFriendlyId,
          cardId,
          message: 'continue',
          idempotencyKey: 'client-1',
        })
      })
      expect(onSessionResolved).toHaveBeenCalledTimes(1)
      await onSessionResolved.mock.results[0]!.value

      expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
      expect(
        queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
      ).toEqual([optimisticMessage])
      if (fromSessionKey === 'new') {
        expect(await readPendingMessage('new', 'new')).toBeNull()
        expect(
          (
            await readCardTranscriptRecovery({ cardId: targetFriendlyId })
          )?.messages,
        ).toMatchObject([optimisticMessage])
      } else {
        expect(
          await readPendingMessage('canonical-child', targetFriendlyId),
        ).toMatchObject({
          sessionKey: 'canonical-child',
          friendlyId: targetFriendlyId,
          message: 'continue',
        })
      }
      expect(
        useChatStore.getState().getRealtimeMessages(fromSessionKey),
      ).toEqual([])
      expect(
        useChatStore.getState().getRealtimeMessages('canonical-child'),
      ).toEqual([])
      expect(
        useChatStore.getState().getCardRealtimeMessages(cardId),
      ).toMatchObject([userMessage('live-1', 'live message')])
      expect(useChatStore.getState().isSessionWaiting(fromSessionKey)).toBe(
        false,
      )
      expect(useChatStore.getState().isSessionWaiting('canonical-child')).toBe(
        false,
      )
      expect(useChatStore.getState().isCardWaiting(cardId)).toBe(true)
      expect(navigate).toHaveBeenCalledWith({
        to: '/chat/$sessionKey',
        params: { sessionKey: targetFriendlyId },
        search: true,
        hash: true,
        state: true,
        replace: true,
      })
      expect(onSessionResolved).toHaveBeenCalledWith({
        fromSessionKey,
        sessionKey: 'canonical-child',
        friendlyId: targetFriendlyId,
        reason,
      })
      expect(reader.cancel).not.toHaveBeenCalled()
      expect(requestSignal?.aborted).toBe(false)
      expect(requestPayload?.cardId).toBe(cardId)
      expect(onAbort).not.toHaveBeenCalled()

      React.act(() => root.unmount())
      document.body.removeChild(container)
      queryClient.clear()
    },
  )

  it.each(['main', 'new'])(
    'ignores invalid handoff target %s without migrating route/cache/store/pending state',
    async (invalidTarget) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const sourceHistoryKey = chatQueryKeys.history(
        'friendly-route',
        'backend-parent',
      )
      const targetHistoryKey = chatQueryKeys.history(
        invalidTarget,
        invalidTarget,
      )
      const optimisticMessage = {
        ...userMessage('optimistic-invalid', 'stay put'),
        clientId: 'client-invalid',
        __optimisticId: 'opt-client-invalid',
        status: 'sending',
      }
      queryClient.setQueryData<HistoryResponse>(sourceHistoryKey, {
        sessionKey: 'backend-parent',
        messages: [optimisticMessage],
      })
      await stashPendingSend({
        sessionKey: 'backend-parent',
        friendlyId: 'friendly-route',
        message: 'stay put',
        attachments: [],
        optimisticMessage,
      })
      useChatStore.getState().processEvent({
        type: 'message',
        message: userMessage('live-invalid', 'source message'),
        sessionKey: 'backend-parent',
        transport: 'send-stream',
      })

      const encoder = new TextEncoder()
      const reader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(
              [
                'event: session_handoff',
                `data: ${JSON.stringify({ fromSessionKey: 'backend-parent', sessionKey: invalidTarget, friendlyId: invalidTarget, runId: 'run-invalid' })}`,
                '',
                'event: done',
                'data: {"state":"complete","sessionKey":"backend-parent","runId":"run-invalid"}',
                '',
                '',
              ].join('\n'),
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: vi.fn().mockResolvedValue(undefined),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
        text: () => Promise.resolve(''),
      } as unknown as Response)

      const onSessionResolved = vi.fn()
      let controller: StreamingController | null = null
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      React.act(() => {
        root.render(
          <StreamingHarness
            onReady={(next) => {
              controller = next
            }}
            onSessionResolved={onSessionResolved}
            onAbort={vi.fn()}
            pinMainSession={false}
          />,
        )
      })

      await React.act(async () => {
        await controller!.startStreaming({
          sessionKey: 'backend-parent',
          friendlyId: 'friendly-route',
          message: 'stay put',
          idempotencyKey: 'client-invalid',
        })
      })

      expect(onSessionResolved).not.toHaveBeenCalled()
      expect(queryClient.getQueryData(sourceHistoryKey)).toEqual({
        sessionKey: 'backend-parent',
        messages: [optimisticMessage],
      })
      expect(queryClient.getQueryData(targetHistoryKey)).toBeUndefined()
      expect(
        useChatStore.getState().getRealtimeMessages('backend-parent'),
      ).toMatchObject([userMessage('live-invalid', 'source message')])
      expect(
        useChatStore.getState().getRealtimeMessages(invalidTarget),
      ).toEqual([])
      expect(
        consumePendingSend('backend-parent', 'friendly-route'),
      ).toMatchObject({
        sessionKey: 'backend-parent',
        friendlyId: 'friendly-route',
      })

      React.act(() => root.unmount())
      document.body.removeChild(container)
      queryClient.clear()
    },
  )

  it('applies a bootstrap and Card handoff coalesced in one reader chunk before rerender', async () => {
    const encoder = new TextEncoder()
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode(
            [
              'event: session_handoff',
              `data: ${JSON.stringify({ fromSessionKey: 'new', sessionKey: 'remote:created-segment', friendlyId: 'remote:created-card', runId: 'run-bootstrap', verifiedCardAuthority: { cardId: 'remote:created-card', canonicalSource: 'remote', canonicalSegmentKey: 'remote:created-segment', continuationSegmentKeys: ['remote:created-segment'], relationshipKind: 'root' } })}`,
              '',
              'event: card_handoff',
              `data: ${JSON.stringify({ cardId: 'remote:created-card', fromSegmentKey: 'remote:created-segment', canonicalSegmentKey: 'remote:continuation-segment', runId: 'run-bootstrap', verifiedContinuationSegmentKeys: ['remote:created-segment', 'remote:continuation-segment'] })}`,
              '',
              'event: chunk',
              'data: {"delta":"content after the chained handoff"}',
              '',
              'event: done',
              'data: {"state":"complete","sessionKey":"remote:continuation-segment","runId":"run-bootstrap"}',
              '',
              '',
            ].join('\n'),
          ),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
      text: () => Promise.resolve(''),
    } as unknown as Response)

    const onSessionResolved = vi.fn()
    const onCardHandoff = vi.fn(() => true)
    const onAbort = vi.fn()
    let controller: StreamingController | null = null
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(
        <StreamingHarness
          onReady={(next) => {
            controller = next
          }}
          onSessionResolved={onSessionResolved}
          onAbort={onAbort}
          pinMainSession={false}
          onCardHandoff={onCardHandoff}
        />,
      )
    })

    await React.act(async () => {
      await controller!.startStreaming({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'bootstrap Card',
        idempotencyKey: 'client-coalesced-card',
      })
    })

    expect(onSessionResolved).toHaveBeenCalledWith({
      fromSessionKey: 'new',
      sessionKey: 'remote:created-segment',
      friendlyId: 'remote:created-card',
      reason: 'bootstrap',
    })
    expect(onCardHandoff).toHaveBeenCalledWith(
      {
        cardId: 'remote:created-card',
        fromSegmentKey: 'remote:created-segment',
        canonicalSegmentKey: 'remote:continuation-segment',
        runId: 'run-bootstrap',
        verifiedContinuationSegmentKeys: [
          'remote:created-segment',
          'remote:continuation-segment',
        ],
      },
      expect.anything(),
    )
    expect(
      useChatStore.getState().getCardRealtimeMessages('remote:created-card'),
    ).toMatchObject([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'content after the chained handoff' }],
      },
    ])
    expect(
      useChatStore.getState().getRealtimeMessages('remote:created-segment'),
    ).toEqual([])
    expect(reader.cancel).not.toHaveBeenCalled()
    expect(onAbort).not.toHaveBeenCalled()

    React.act(() => root.unmount())
    document.body.removeChild(container)
  })

  it.each([
    {
      name: 'accepts the promoted Card handoff',
      handoffCardId: 'remote:created-card',
      expectedHandoffs: 1,
    },
    {
      name: 'rejects a handoff for an unrelated Card',
      handoffCardId: 'remote:unrelated-card',
      expectedHandoffs: 0,
    },
  ])(
    '$name after the bootstrap session handoff',
    async ({ handoffCardId, expectedHandoffs }) => {
      const encoder = new TextEncoder()
      let resolveCardHandoffRead: (
        result: ReadableStreamReadResult<Uint8Array>,
      ) => void = () => undefined
      const cardHandoffRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve) => {
          resolveCardHandoffRead = resolve
        },
      )
      const reader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(
              [
                'event: session_handoff',
                `data: ${JSON.stringify({ fromSessionKey: 'new', sessionKey: 'remote:created-segment', friendlyId: 'remote:created-card', runId: 'run-bootstrap', verifiedCardAuthority: { cardId: 'remote:created-card', canonicalSource: 'remote', canonicalSegmentKey: 'remote:created-segment', continuationSegmentKeys: ['remote:created-segment'], relationshipKind: 'root' } })}`,
                '',
                '',
              ].join('\n'),
            ),
          })
          .mockReturnValueOnce(cardHandoffRead)
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: vi.fn().mockResolvedValue(undefined),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
        text: () => Promise.resolve(''),
      } as unknown as Response)

      const onSessionResolved = vi.fn()
      const onCardHandoff = vi.fn(() => true)
      const onAbort = vi.fn()
      let controller: StreamingController | null = null
      const onReady = (next: StreamingController) => {
        controller = next
      }
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      const renderHarness = (activeCard?: SessionCard) => (
        <StreamingHarness
          onReady={onReady}
          onSessionResolved={onSessionResolved}
          onAbort={onAbort}
          pinMainSession={false}
          activeCard={activeCard}
          sessionCards={activeCard ? [activeCard] : []}
          onCardHandoff={onCardHandoff}
        />
      )

      React.act(() => root.render(renderHarness()))
      expect(controller).not.toBeNull()

      let streamPromise: Promise<void> | undefined
      React.act(() => {
        streamPromise = controller!.startStreaming({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'bootstrap Card',
          idempotencyKey: 'client-bootstrap-card',
        })
      })

      await vi.waitFor(() => {
        expect(onSessionResolved).toHaveBeenCalledWith({
          fromSessionKey: 'new',
          sessionKey: 'remote:created-segment',
          friendlyId: 'remote:created-card',
          reason: 'bootstrap',
        })
      })
      React.act(() =>
        root.render(
          renderHarness(
            rootCard('remote:created-card', 'remote:created-segment'),
          ),
        ),
      )

      await React.act(async () => {
        resolveCardHandoffRead({
          done: false,
          value: encoder.encode(
            [
              'event: card_handoff',
              `data: ${JSON.stringify({ cardId: handoffCardId, fromSegmentKey: 'remote:created-segment', canonicalSegmentKey: 'remote:continuation-segment', runId: 'run-bootstrap', verifiedContinuationSegmentKeys: ['remote:created-segment', 'remote:continuation-segment'] })}`,
              '',
              '',
            ].join('\n'),
          ),
        })
        await streamPromise
      })

      expect(onCardHandoff).toHaveBeenCalledTimes(expectedHandoffs)
      if (expectedHandoffs === 1) {
        expect(onCardHandoff).toHaveBeenCalledWith(
          {
            cardId: 'remote:created-card',
            fromSegmentKey: 'remote:created-segment',
            canonicalSegmentKey: 'remote:continuation-segment',
            runId: 'run-bootstrap',
            verifiedContinuationSegmentKeys: [
              'remote:created-segment',
              'remote:continuation-segment',
            ],
          },
          expect.anything(),
        )
      }
      expect(reader.cancel).not.toHaveBeenCalled()
      expect(onAbort).not.toHaveBeenCalled()

      React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  )

  it.each([
    {
      name: 'cross-source successor',
      payload: {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'local:successor',
        runId: 'run-current',
      },
    },
    {
      name: 'another Card successor',
      payload: {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'remote:other-segment',
        runId: 'run-current',
      },
    },
    {
      name: 'child-boundary successor',
      payload: {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'remote:child-segment',
        runId: 'run-current',
      },
    },
    {
      name: 'stale run relationship',
      payload: {
        cardId: 'remote:parent-card',
        fromSegmentKey: 'remote:parent-segment',
        canonicalSegmentKey: 'remote:successor',
        runId: 'run-stale',
      },
    },
  ])(
    'keeps live state on the origin for an invalid $name',
    async ({ payload }) => {
      const activeCard: SessionCard = {
        ...rootCard('remote:parent-card', 'remote:parent-segment'),
        childNodes: [
          {
            cardId: 'remote:child-card',
            sessionKey: 'remote:child-segment',
            continuationSegmentKeys: ['remote:child-segment'],
            relationshipKind: 'child',
            title: 'Child',
            status: 'running',
            updatedAt: 1,
            continuationCount: 1,
          },
        ],
      }
      const otherCard = rootCard('remote:other-card', 'remote:other-segment')
      const encoder = new TextEncoder()
      const reader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: encoder.encode(
              [
                'event: started',
                'data: {"runId":"run-current"}',
                '',
                'event: card_handoff',
                `data: ${JSON.stringify(payload)}`,
                '',
                'event: chunk',
                'data: {"delta":"stays on the origin Card"}',
                '',
                'event: done',
                'data: {"state":"complete","runId":"run-current"}',
                '',
                '',
              ].join('\n'),
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: vi.fn().mockResolvedValue(undefined),
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
        text: () => Promise.resolve(''),
      } as unknown as Response)

      useChatStore.getState().clearCard(activeCard.cardId)
      useChatStore.getState().clearSession(payload.canonicalSegmentKey)
      const onCardHandoff = vi.fn(() => true)
      let controller: StreamingController | null = null
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      React.act(() => {
        root.render(
          <StreamingHarness
            onReady={(next) => {
              controller = next
            }}
            onSessionResolved={vi.fn()}
            onAbort={vi.fn()}
            pinMainSession={false}
            activeCard={activeCard}
            sessionCards={[activeCard, otherCard]}
            onCardHandoff={onCardHandoff}
          />,
        )
      })

      await React.act(async () => {
        await controller!.startStreaming({
          sessionKey: 'remote:parent-segment',
          friendlyId: activeCard.cardId,
          cardId: activeCard.cardId,
          message: 'keep this Card native',
        })
      })

      expect(onCardHandoff).not.toHaveBeenCalled()
      expect(
        useChatStore.getState().getCardRealtimeMessages(activeCard.cardId),
      ).toMatchObject([
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'stays on the origin Card' }],
        },
      ])
      expect(
        useChatStore
          .getState()
          .getRealtimeMessages(payload.canonicalSegmentKey),
      ).toEqual([])

      React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  )

  it('claims local ownership only after an SSE reader is acquired', async () => {
    let controller: StreamingController | null = null
    let resolveFetch: ((response: Response) => void) | undefined
    const onReaderOpened = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(
        <StreamingHarness
          onReady={(value) => {
            controller = value
          }}
          onSessionResolved={vi.fn()}
          onAbort={vi.fn()}
          onReaderOpened={onReaderOpened}
          pinMainSession={false}
        />,
      )
    })
    expect(controller).not.toBeNull()

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        body: null,
        text: () => Promise.resolve(''),
      } as unknown as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          }),
      )

    await React.act(async () => {
      await controller!.startStreaming({
        sessionKey: 'backend-parent',
        friendlyId: 'friendly-route',
        message: 'body-less response',
      })
    })
    expect(onReaderOpened).not.toHaveBeenCalled()

    let hangingRequest: Promise<void> | undefined
    React.act(() => {
      hangingRequest = controller!.startStreaming({
        sessionKey: 'backend-parent',
        friendlyId: 'friendly-route',
        message: 'hanging response',
      })
    })
    await React.act(async () => {
      await Promise.resolve()
    })
    expect(resolveFetch).toBeDefined()
    expect(onReaderOpened).not.toHaveBeenCalled()

    React.act(() => {
      controller!.cancelStreaming()
    })
    resolveFetch?.({
      ok: true,
      body: null,
      text: () => Promise.resolve(''),
    } as unknown as Response)
    await React.act(async () => {
      await hangingRequest
    })
    expect(onReaderOpened).not.toHaveBeenCalled()
    React.act(() => root.unmount())
    document.body.removeChild(container)
  })
})
