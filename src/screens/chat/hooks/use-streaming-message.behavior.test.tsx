// @vitest-environment jsdom
import React, { useEffect } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySessionRouteResolution } from '../../../routes/chat/-session-route-state'
import { useChatStore } from '../../../stores/chat-store'
import { chatQueryKeys } from '../chat-queries'
import { shouldPinMainSession } from '../chat-screen-utils'
import {
  consumePendingSend,
  resetPendingSend,
  stashPendingSend,
} from '../pending-send'
import { useStreamingMessage } from './use-streaming-message'
import type { ChatMessage, HistoryResponse } from '../types'
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
  pinMainSession,
  activeCardId,
  onCardHandoff,
}: {
  onReady: (controller: StreamingController) => void
  onSessionResolved: (payload: {
    fromSessionKey: string
    sessionKey: string
    friendlyId: string
    reason: 'bootstrap' | 'stream-handoff'
  }) => void
  onAbort: () => void
  pinMainSession: boolean
  activeCardId?: string
  onCardHandoff?: (payload: AuthoritativeCardHandoff) => void
}) {
  const streaming = useStreamingMessage({
    onSessionResolved,
    onAbort,
    pinMainSession,
    activeCardId,
    onCardHandoff,
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

describe('useStreamingMessage authoritative handoff behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    resetPendingSend()
    useChatStore.getState().clearSession('new')
    useChatStore.getState().clearSession('main')
    useChatStore.getState().clearSession('backend-parent')
    useChatStore.getState().clearSession('canonical-child')
    useChatStore.getState().clearSession('remote:created-segment')
    useChatStore.getState().clearSession('remote:continuation-segment')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetPendingSend()
  })

  it.each([
    {
      name: 'bootstrap new route',
      activeFriendlyId: 'new',
      fromSessionKey: 'new',
      fallbackSessionKey: 'new',
      targetFriendlyId: 'canonical-child',
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
      stashPendingSend({
        sessionKey: fromSessionKey,
        friendlyId: activeFriendlyId,
        message: 'continue',
        attachments: [],
        optimisticMessage,
      })

      const store = useChatStore.getState()
      store.processEvent({
        type: 'message',
        message: userMessage('live-1', 'live message'),
        sessionKey: fromSessionKey,
        transport: 'send-stream',
      })
      store.setSessionWaiting(fromSessionKey, 'run-1')

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
        (payload: {
          fromSessionKey: string
          sessionKey: string
          friendlyId: string
          reason: 'bootstrap' | 'stream-handoff'
        }) => {
          const transition = applySessionRouteResolution({
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

      expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
      expect(
        queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
      ).toEqual([optimisticMessage])
      expect(
        consumePendingSend('canonical-child', targetFriendlyId),
      ).toMatchObject({
        sessionKey: 'canonical-child',
        friendlyId: targetFriendlyId,
        message: 'continue',
      })
      expect(
        useChatStore.getState().getRealtimeMessages(fromSessionKey),
      ).toEqual([])
      expect(
        useChatStore.getState().getRealtimeMessages('canonical-child'),
      ).toMatchObject([userMessage('live-1', 'live message')])
      expect(useChatStore.getState().isSessionWaiting(fromSessionKey)).toBe(
        false,
      )
      expect(useChatStore.getState().isSessionWaiting('canonical-child')).toBe(
        true,
      )
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
      stashPendingSend({
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
              `data: ${JSON.stringify({ fromSessionKey: 'new', sessionKey: 'remote:created-segment', friendlyId: 'remote:created-card', runId: 'run-bootstrap' })}`,
              '',
              'event: card_handoff',
              `data: ${JSON.stringify({ cardId: 'remote:created-card', fromSegmentKey: 'remote:created-segment', canonicalSegmentKey: 'remote:continuation-segment', runId: 'run-continuation' })}`,
              '',
              'event: chunk',
              'data: {"delta":"content after the chained handoff"}',
              '',
              'event: done',
              'data: {"state":"complete","sessionKey":"remote:continuation-segment","runId":"run-continuation"}',
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
    const onCardHandoff = vi.fn()
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
    expect(onCardHandoff).toHaveBeenCalledWith({
      cardId: 'remote:created-card',
      fromSegmentKey: 'remote:created-segment',
      canonicalSegmentKey: 'remote:continuation-segment',
      runId: 'run-continuation',
    })
    expect(
      useChatStore
        .getState()
        .getRealtimeMessages('remote:continuation-segment'),
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
                `data: ${JSON.stringify({ fromSessionKey: 'new', sessionKey: 'remote:created-segment', friendlyId: 'remote:created-card', runId: 'run-bootstrap' })}`,
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
      const onCardHandoff = vi.fn()
      const onAbort = vi.fn()
      let controller: StreamingController | null = null
      const onReady = (next: StreamingController) => {
        controller = next
      }
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      const renderHarness = (activeCardId?: string) => (
        <StreamingHarness
          onReady={onReady}
          onSessionResolved={onSessionResolved}
          onAbort={onAbort}
          pinMainSession={false}
          activeCardId={activeCardId}
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
      React.act(() => root.render(renderHarness('remote:created-card')))

      await React.act(async () => {
        resolveCardHandoffRead({
          done: false,
          value: encoder.encode(
            [
              'event: card_handoff',
              `data: ${JSON.stringify({ cardId: handoffCardId, fromSegmentKey: 'remote:created-segment', canonicalSegmentKey: 'remote:continuation-segment', runId: 'run-continuation' })}`,
              '',
              '',
            ].join('\n'),
          ),
        })
        await streamPromise
      })

      expect(onCardHandoff).toHaveBeenCalledTimes(expectedHandoffs)
      if (expectedHandoffs === 1) {
        expect(onCardHandoff).toHaveBeenCalledWith({
          cardId: 'remote:created-card',
          fromSegmentKey: 'remote:created-segment',
          canonicalSegmentKey: 'remote:continuation-segment',
          runId: 'run-continuation',
        })
      }
      expect(reader.cancel).not.toHaveBeenCalled()
      expect(onAbort).not.toHaveBeenCalled()

      React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  )
})
