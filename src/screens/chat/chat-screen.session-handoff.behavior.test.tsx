// @vitest-environment jsdom
import React, { useCallback, useRef, useState } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySessionRouteResolution } from '../../routes/chat/-session-route-state'
import { useChatStore } from '../../stores/chat-store'
import { chatQueryKeys } from './chat-queries'
import { ChatScreen } from './chat-screen'
import {
  hasPendingGeneration,
  persistPendingMessage,
  readPendingMessage,
  resetPendingSend,
} from './pending-send'
import type { SessionRouteResolutionPayload } from '../../routes/chat/-session-route-state'
import type { ChatMessage, HistoryResponse } from './types'

const navigate = vi.fn()
const queryContext = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useQueryClient: () => queryContext.client,
    useQuery: ({ queryKey }: { queryKey: Array<unknown> }) => ({
      data:
        queryKey[0] === 'models'
          ? { models: [] }
          : queryKey[0] === 'claude' && queryKey[1] === 'status'
            ? { ok: true, status: 200 }
            : '',
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      isSuccess: true,
      refetch: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

vi.mock('../../stores/chat-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & { useChatStore: typeof useChatStore }
  >()
  const original = actual.useChatStore
  const useChatStoreWithoutSubscription = Object.assign(
    <T,>(selector: (state: ReturnType<typeof original.getState>) => T) =>
      selector(original.getState()),
    original,
  )
  return { ...actual, useChatStore: useChatStoreWithoutSubscription }
})

vi.mock('@/stores/workspace-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      useWorkspaceStore: {
        getState: () => unknown
      }
    }
  >()
  const original = actual.useWorkspaceStore
  const useWorkspaceStoreWithoutSubscription = Object.assign(
    (selector: (state: unknown) => unknown) => selector(original.getState()),
    original,
  )
  return {
    ...actual,
    useWorkspaceStore: useWorkspaceStoreWithoutSubscription,
  }
})

vi.mock('@/stores/terminal-panel-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      useTerminalPanelStore: {
        getState: () => unknown
      }
    }
  >()
  const original = actual.useTerminalPanelStore
  const useTerminalPanelStoreWithoutSubscription = Object.assign(
    (selector: (state: unknown) => unknown) => selector(original.getState()),
    original,
  )
  return {
    ...actual,
    useTerminalPanelStore: useTerminalPanelStoreWithoutSubscription,
  }
})

vi.mock('@/stores/chat-activity-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      useChatActivityStore: {
        getState: () => unknown
      }
    }
  >()
  const original = actual.useChatActivityStore
  const useChatActivityStoreWithoutSubscription = Object.assign(
    (selector: (state: unknown) => unknown) => selector(original.getState()),
    original,
  )
  return {
    ...actual,
    useChatActivityStore: useChatActivityStoreWithoutSubscription,
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('./components/chat-header', () => ({ ChatHeader: () => null }))
vi.mock('./components/chat-message-list', () => ({
  ChatMessageList: () => null,
}))
vi.mock('./components/chat-empty-state', () => ({ ChatEmptyState: () => null }))
vi.mock('./components/connection-status-message', () => ({
  ConnectionStatusMessage: () => null,
}))
vi.mock('./components/context-bar', () => ({ ContextBar: () => null }))
vi.mock('@/components/file-explorer', () => ({
  FileExplorerSidebar: () => null,
}))
vi.mock('@/components/terminal-panel', () => ({ TerminalPanel: () => null }))
vi.mock('@/components/agent-view/agent-view-panel', () => ({
  AgentViewPanel: () => null,
}))
vi.mock('@/components/model-suggestion-toast', () => ({
  ModelSuggestionToast: () => null,
}))
vi.mock('@/components/mobile-sessions-panel', () => ({
  MobileSessionsPanel: () => null,
}))
vi.mock('@/components/usage-meter/context-alert-modal', () => ({
  ContextAlertModal: () => null,
}))
vi.mock('@/components/error-toast', () => ({
  ErrorToastContainer: () => null,
  showErrorToast: vi.fn(),
}))
vi.mock('./components/chat-composer', () => ({
  ChatComposer: (props: {
    onSubmit: (
      body: string,
      attachments: Array<never>,
      fastMode: boolean,
      helpers: {
        reset: () => void
        setValue: () => void
        getValue: () => string
      },
    ) => void
  }) => (
    <button
      type="button"
      data-testid="send-message"
      onClick={() =>
        props.onSubmit('continue', [], false, {
          reset() {},
          setValue() {},
          getValue: () => '',
        })
      }
    >
      Send
    </button>
  ),
}))

vi.mock('./hooks/use-chat-measurements', () => ({
  useChatMeasurements: () => ({
    headerRef: { current: null },
    composerRef: { current: null },
    mainRef: { current: null },
    pinGroupMinHeight: 0,
    headerHeight: 0,
  }),
}))
vi.mock('./hooks/use-chat-mobile', () => ({
  useChatMobile: () => ({ isMobile: false }),
}))
vi.mock('./hooks/use-chat-sessions', () => ({
  useChatSessions: ({
    activeFriendlyId,
    forcedSessionKey,
  }: {
    activeFriendlyId: string
    forcedSessionKey?: string
  }) => {
    const sessionKey = forcedSessionKey ?? activeFriendlyId
    const activeSession = {
      key: sessionKey,
      friendlyId: activeFriendlyId,
      updatedAt: 1,
      lineage: { source: 'remote' as const },
    }
    return {
      sessionsQuery: {
        status: 'success',
        isSuccess: true,
        refetch: vi.fn(),
      },
      sessions: [activeSession],
      activeSession,
      activeExists: true,
      activeSessionKey: sessionKey,
      activeTitle: activeFriendlyId,
      sessionsError: null,
      sessionsLoading: false,
      sessionsFetching: false,
      refetchSessions: vi.fn(),
    }
  },
}))
vi.mock('./hooks/use-chat-history', () => ({
  useChatHistory: ({
    activeFriendlyId,
    activeSessionKey,
    forcedSessionKey,
  }: {
    activeFriendlyId: string
    activeSessionKey: string
    forcedSessionKey?: string
  }) => {
    const sessionKey = forcedSessionKey ?? activeSessionKey
    return {
      historyQuery: {
        data: { sessionKey, messages: [] },
        dataUpdatedAt: 0,
        isError: false,
        isFetching: false,
        isLoading: false,
        isSuccess: true,
        refetch: vi.fn().mockResolvedValue(undefined),
      },
      historyMessages: [],
      messageCount: 0,
      historyError: null,
      resolvedSessionKey: sessionKey,
      activeCanonicalKey: sessionKey,
      sessionKeyForHistory: sessionKey,
    }
  },
}))
vi.mock('./hooks/use-realtime-chat-history', () => ({
  useRealtimeChatHistory: () => ({
    messages: [],
    lastCompletedRunAt: 0,
    connectionState: 'connected',
    isRealtimeStreaming: false,
    realtimeStreamingText: '',
    realtimeStreamingThinking: '',
    realtimeLifecycleEvents: [],
    completedStreamingText: { current: '' },
    completedStreamingThinking: { current: '' },
    clearCompletedStreaming: vi.fn(),
    streamingRunId: null,
    activeToolCalls: [],
  }),
}))
vi.mock('./hooks/use-smooth-streaming-text', () => ({
  useSmoothStreamingText: (text: string) => text,
}))
vi.mock('./hooks/use-active-run-check', () => ({ useActiveRunCheck: () => {} }))
vi.mock('./hooks/use-auto-session-title', () => ({
  useAutoSessionTitle: () => {},
}))
vi.mock('./hooks/use-rename-session', () => ({
  useRenameSession: () => ({ renameSession: vi.fn(), renaming: false }),
}))
vi.mock('./hooks/use-context-alert', () => ({
  useContextAlert: () => ({
    alertOpen: false,
    alertThreshold: 0,
    alertPercent: 0,
    dismissAlert: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-model-suggestions', () => ({
  useModelSuggestions: () => ({
    suggestion: null,
    dismiss: vi.fn(),
    dismissForSession: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-research-card', () => ({ useResearchCard: () => null }))
vi.mock('@/hooks/use-tap-debug', () => ({ useTapDebug: () => {} }))
vi.mock('@/hooks/use-chat-mode', () => ({ useChatMode: () => 'enhanced' }))

class StubEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await React.act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function userMessage(id: string, text: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: 1,
  }
}

type RouteState = { friendlyId: string; sessionKey: string }

function ChatRouteHarness({
  initialRoute,
  onRouteResolution,
}: {
  initialRoute: RouteState
  onRouteResolution?: (payload: SessionRouteResolutionPayload) => void
}) {
  const queryClient = useQueryClient()
  const [route, setRoute] = useState(initialRoute)
  const latestRouteRef = useRef(initialRoute)
  const handleSessionResolved = useCallback(
    (payload: SessionRouteResolutionPayload) => {
      const currentRoute = latestRouteRef.current
      const transition = applySessionRouteResolution({
        queryClient,
        activeFriendlyId: currentRoute.friendlyId,
        fallbackSessionKey: currentRoute.sessionKey,
        payload,
      })
      latestRouteRef.current = transition.resolvedRoute
      onRouteResolution?.(payload)
      setRoute(transition.resolvedRoute)
    },
    [onRouteResolution, queryClient],
  )

  return (
    <div
      data-testid="route-state"
      data-friendly-id={route.friendlyId}
      data-session-key={route.sessionKey}
    >
      <button
        type="button"
        data-testid="navigate-away"
        onClick={() =>
          setRoute({ friendlyId: 'other-route', sessionKey: 'other-session' })
        }
      >
        Navigate away
      </button>
      <ChatScreen
        activeFriendlyId={route.friendlyId}
        forcedSessionKey={route.sessionKey}
        onSessionResolved={handleSessionResolved}
        compact
      />
    </div>
  )
}

type HandoffEvent = {
  fromSessionKey: string
  sessionKey: string
  friendlyId: string
  runId: string
}

function createReaderHarness(
  handoffs: Array<HandoffEvent> = [
    {
      fromSessionKey: 'backend-parent',
      sessionKey: 'canonical-child',
      friendlyId: 'child-friendly',
      runId: 'run-1',
    },
  ],
) {
  const encoder = new TextEncoder()
  let releaseFirstRead: (() => void) | undefined
  let requestSignal: AbortSignal | undefined
  let rejectCurrentRead: ((reason?: unknown) => void) | undefined
  let rejectFirstRead: ((reason?: unknown) => void) | undefined
  let rejectPendingRead: ((reason?: unknown) => void) | undefined
  const firstRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      rejectFirstRead = reject
      releaseFirstRead = () => {
        rejectCurrentRead = undefined
        resolve({
          done: false,
          value: encoder.encode(
            handoffs
              .flatMap((handoff) => [
                'event: session_handoff',
                `data: ${JSON.stringify(handoff)}`,
                '',
              ])
              .concat('')
              .join('\n'),
          ),
        })
      }
    },
  )
  const pendingRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
    (_resolve, reject) => {
      rejectPendingRead = reject
    },
  )
  const reader = {
    read: vi
      .fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
      .mockImplementationOnce(() => {
        rejectCurrentRead = rejectFirstRead
        return firstRead
      })
      .mockImplementation(() => {
        rejectCurrentRead = rejectPendingRead
        return pendingRead
      }),
    cancel: vi.fn().mockResolvedValue(undefined),
  }

  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (String(input) === '/api/send-stream') {
      requestSignal = init?.signal ?? undefined
      requestSignal?.addEventListener(
        'abort',
        () => rejectCurrentRead?.(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
      return Promise.resolve({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, models: [] }),
      text: () => Promise.resolve(''),
    } as unknown as Response)
  })

  return {
    reader,
    releaseHandoff: () => releaseFirstRead?.(),
    getRequestSignal: () => requestSignal,
  }
}

describe('ChatScreen authoritative session handoff route lifecycle', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('EventSource', StubEventSource)
    window.localStorage.clear()
    window.sessionStorage.clear()
    resetPendingSend()
    navigate.mockReset()
    for (const sessionKey of [
      'new',
      'backend-parent',
      'canonical-child',
      'backend-a',
      'backend-b',
      'friendly-route',
      'other-session',
    ]) {
      useChatStore.getState().clearSession(sessionKey)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetPendingSend()
  })

  it('rerenders the real ChatScreen on an authoritative handoff without aborting its active reader', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'backend-parent',
    )
    const targetHistoryKey = chatQueryKeys.history(
      'child-friendly',
      'canonical-child',
    )
    const routeResolution = vi.fn()
    const stream = createReaderHarness()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{
              friendlyId: 'friendly-route',
              sessionKey: 'backend-parent',
            }}
            onRouteResolution={routeResolution}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => {
      expect(stream.getRequestSignal()).toBeDefined()
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1)
    })

    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    persistPendingMessage({
      sessionKey: 'backend-parent',
      friendlyId: 'friendly-route',
      message: 'continue',
      attachments: [],
      optimisticMessage,
    })
    useChatStore.getState().processEvent({
      type: 'message',
      message: userMessage('live-1', 'live message'),
      sessionKey: 'backend-parent',
      transport: 'send-stream',
    })
    useChatStore.getState().setSessionWaiting('backend-parent', 'run-1')

    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-friendly-id'),
      ).toBe('child-friendly')
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('canonical-child')
    })

    expect(routeResolution).toHaveBeenCalledWith({
      fromSessionKey: 'backend-parent',
      sessionKey: 'canonical-child',
      friendlyId: 'child-friendly',
      reason: 'stream-handoff',
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
    ).toEqual([optimisticMessage])
    expect(
      readPendingMessage('canonical-child', 'child-friendly'),
    ).toMatchObject({
      sessionKey: 'canonical-child',
      friendlyId: 'child-friendly',
      message: 'continue',
    })
    expect(
      useChatStore.getState().getRealtimeMessages('backend-parent'),
    ).toEqual([])
    expect(
      useChatStore.getState().getRealtimeMessages('canonical-child'),
    ).toMatchObject([userMessage('live-1', 'live message')])
    expect(useChatStore.getState().isSessionWaiting('backend-parent')).toBe(
      false,
    )
    expect(useChatStore.getState().isSessionWaiting('canonical-child')).toBe(
      true,
    )
    expect(stream.reader.read).toHaveBeenCalledTimes(2)
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('normalizes bootstrap and immediate authoritative handoffs to the final successor in one reader batch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history('new', 'new')
    const intermediateHistoryKey = chatQueryKeys.history(
      'intermediate-friendly',
      'backend-a',
    )
    const targetHistoryKey = chatQueryKeys.history(
      'successor-friendly',
      'backend-b',
    )
    const stream = createReaderHarness([
      {
        fromSessionKey: 'new',
        sessionKey: 'backend-a',
        friendlyId: 'intermediate-friendly',
        runId: 'run-chain',
      },
      {
        fromSessionKey: 'backend-a',
        sessionKey: 'backend-b',
        friendlyId: 'successor-friendly',
        runId: 'run-chain',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{ friendlyId: 'new', sessionKey: 'new' }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() => {
      expect(stream.getRequestSignal()).toBeDefined()
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1)
    })
    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    persistPendingMessage({
      sessionKey: 'new',
      friendlyId: 'new',
      message: 'continue',
      attachments: [],
      optimisticMessage,
    })
    useChatStore.getState().processEvent({
      type: 'message',
      message: userMessage('live-chain', 'chain message'),
      sessionKey: 'new',
      transport: 'send-stream',
    })
    useChatStore.getState().setSessionWaiting('new', 'run-chain')

    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('backend-b')
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(queryClient.getQueryData(intermediateHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
    ).toEqual([optimisticMessage])
    expect(readPendingMessage('backend-b', 'successor-friendly')).toMatchObject(
      {
        sessionKey: 'backend-b',
        friendlyId: 'successor-friendly',
      },
    )
    expect(useChatStore.getState().getRealtimeMessages('new')).toEqual([])
    expect(useChatStore.getState().getRealtimeMessages('backend-a')).toEqual([])
    expect(
      useChatStore.getState().getRealtimeMessages('backend-b'),
    ).toMatchObject([userMessage('live-chain', 'chain message')])
    expect(useChatStore.getState().isSessionWaiting('new')).toBe(false)
    expect(useChatStore.getState().isSessionWaiting('backend-a')).toBe(false)
    expect(useChatStore.getState().isSessionWaiting('backend-b')).toBe(true)
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('migrates backend state when the successor key collides with the active friendly route id', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'backend-parent',
    )
    const targetHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'friendly-route',
    )
    const stream = createReaderHarness([
      {
        fromSessionKey: 'backend-parent',
        sessionKey: 'friendly-route',
        friendlyId: 'friendly-route',
        runId: 'run-collision',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{
              friendlyId: 'friendly-route',
              sessionKey: 'backend-parent',
            }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() =>
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1),
    )
    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    persistPendingMessage({
      sessionKey: 'backend-parent',
      friendlyId: 'friendly-route',
      message: 'continue',
      attachments: [],
      optimisticMessage,
    })
    useChatStore.getState().setSessionWaiting('backend-parent', 'run-collision')

    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('friendly-route')
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
    ).toEqual([optimisticMessage])
    expect(
      readPendingMessage('friendly-route', 'friendly-route'),
    ).toMatchObject({ sessionKey: 'friendly-route' })
    expect(useChatStore.getState().isSessionWaiting('backend-parent')).toBe(
      false,
    )
    expect(useChatStore.getState().isSessionWaiting('friendly-route')).toBe(
      true,
    )
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('still cancels a stream on unrelated route navigation and leaves state on the origin', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'backend-parent',
    )
    const stream = createReaderHarness()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{
              friendlyId: 'friendly-route',
              sessionKey: 'backend-parent',
            }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() =>
      expect(stream.getRequestSignal()).toBeDefined(),
    )

    useChatStore.getState().processEvent({
      type: 'message',
      message: userMessage('live-origin', 'origin message'),
      sessionKey: 'backend-parent',
      transport: 'send-stream',
    })
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="navigate-away"]')!
        .click()
    })

    await waitForAssertion(() =>
      expect(stream.getRequestSignal()?.aborted).toBe(true),
    )
    await waitForAssertion(() => {
      expect(hasPendingGeneration()).toBe(false)
      expect(useChatStore.getState().isSessionWaiting('backend-parent')).toBe(
        false,
      )
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeDefined()
    expect(
      useChatStore.getState().getRealtimeMessages('backend-parent'),
    ).toMatchObject([userMessage('live-origin', 'origin message')])
    expect(
      useChatStore.getState().getRealtimeMessages('other-session'),
    ).toEqual([])

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })
})
