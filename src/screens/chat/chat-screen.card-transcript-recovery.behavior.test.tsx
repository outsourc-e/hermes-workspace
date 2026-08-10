// @vitest-environment jsdom
import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../../stores/chat-store'
import { CHAT_SUBMIT_SELECTION_EVENT } from './chat-events'
import {
  CARD_TRANSCRIPT_RECOVERY_VERSION,
  cardTranscriptRecoveryStorageKey,
  clearCardTranscriptRecoveryMemory,
  readCardTranscriptRecovery,
  replaceCardTranscriptRecoveryMessages,
} from './card-transcript-recovery'
import { ChatScreen } from './chat-screen'
import {
  appendSessionCardHistoryMessage,
  moveSessionCardHistoryMessages,
  sessionCardQueryKeys,
} from './chat-queries'
import type { SessionCardListWire } from './chat-queries'
import type { ChatMessage, SessionCard } from './types'

// These adapters retain the packages' real behavior while avoiding the
// workspace Vitest CJS/ESM split-React dispatcher in mounted tests.
vi.mock('@tanstack/react-query', async () =>
  vi.importActual('../../../node_modules/@tanstack/react-query/src/index.ts'),
)
vi.mock('@tanstack/react-router', async () =>
  vi.importActual('../../../node_modules/@tanstack/react-router/src/index.tsx'),
)
vi.mock('zustand', async () => {
  const ReactModule = await import('react')
  const vanilla = await vi.importActual<{
    createStore: (initializer: never) => unknown
  }>('zustand/vanilla')
  const useStore = <TState, TSlice = TState>(
    api: {
      subscribe: (listener: () => void) => () => void
      getState: () => TState
    },
    selector: (state: TState) => TSlice = (state) => state as unknown as TSlice,
  ) =>
    ReactModule.useSyncExternalStore(
      api.subscribe,
      () => selector(api.getState()),
      () => selector(api.getState()),
    )
  const bind = <TState,>(initializer: unknown) => {
    const api = vanilla.createStore(initializer as never) as {
      subscribe: (listener: () => void) => () => void
      getState: () => TState
    }
    return Object.assign(
      <TSlice,>(selector?: (state: TState) => TSlice) =>
        useStore(api, selector),
      api,
    )
  }
  const create = <TState,>(initializer?: unknown) =>
    initializer === undefined
      ? (nextInitializer: unknown) => bind<TState>(nextInitializer)
      : bind<TState>(initializer)
  return { create, useStore }
})

vi.mock('./hooks/use-smooth-streaming-text', () => ({
  useSmoothStreamingText: (text: string) => text,
}))
vi.mock('./components/chat-header', () => ({ ChatHeader: () => null }))
vi.mock('./components/chat-composer', () => ({
  ChatComposer: ({ onAbort }: { onAbort?: () => void }) => (
    <button type="button" onClick={onAbort}>
      Stop generating
    </button>
  ),
}))
vi.mock('./components/chat-empty-state', () => ({ ChatEmptyState: () => null }))
vi.mock('./components/connection-status-message', () => ({
  ConnectionStatusMessage: () => null,
}))
vi.mock('./components/context-bar', () => ({ ContextBar: () => null }))
vi.mock('./components/message-item', () => ({
  MessageItem: ({
    message: chatMessage,
    onRetryMessage,
  }: {
    message: ChatMessage
    onRetryMessage?: (message: ChatMessage) => void
  }) => {
    const text = Array.isArray(chatMessage.content)
      ? chatMessage.content
          .map((part) =>
            'text' in part && typeof part.text === 'string' ? part.text : '',
          )
          .join('')
      : ''
    const streamingText =
      typeof (chatMessage as Record<string, unknown>).__streamingText ===
      'string'
        ? String((chatMessage as Record<string, unknown>).__streamingText)
        : ''
    return (
      <article data-chat-message-id={String(chatMessage.id ?? '')}>
        {text || streamingText}
        {(chatMessage as Record<string, unknown>).status === 'error' ? (
          <button type="button" onClick={() => onRetryMessage?.(chatMessage)}>
            Retry message
          </button>
        ) : null}
      </article>
    )
  },
}))
vi.mock('./components/scroll-to-bottom-button', () => ({
  ScrollToBottomButton: () => null,
}))
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
vi.mock('@/components/ui/dialog', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    children ?? null
  return {
    DialogRoot: Passthrough,
    DialogTrigger: Passthrough,
    DialogContent: Passthrough,
    DialogTitle: Passthrough,
    DialogDescription: Passthrough,
    DialogClose: Passthrough,
  }
})
vi.mock('@/components/ui/menu', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    children ?? null
  return {
    MenuRoot: Passthrough,
    MenuTrigger: Passthrough,
    MenuContent: Passthrough,
    MenuItem: Passthrough,
  }
})
vi.mock('@/components/ui/tooltip', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    children ?? null
  return {
    TooltipProvider: Passthrough,
    TooltipRoot: Passthrough,
    TooltipTrigger: Passthrough,
    TooltipContent: Passthrough,
  }
})

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

type CardHistoryWire = {
  cardId: string
  canonicalSegmentKey: string
  messages: Array<{ segmentKey: string; message: Record<string, unknown> }>
  completeness: 'complete' | 'partial'
  retryable: boolean
  missingSegments: Array<{
    segmentKey: string
    source?: string
    retryable: true
    error: string
  }>
  loadedSegmentKeys?: Array<string>
}

type CardTranscriptRecoveryWire = {
  version: typeof CARD_TRANSCRIPT_RECOVERY_VERSION
  cardId: string
  createdAt: number
  revision: number
  messages: Array<ChatMessage>
}

function seedCardTranscriptRecovery(
  card: Pick<SessionCard, 'cardId' | 'canonicalSegmentKey'>,
  messages: Array<ChatMessage>,
) {
  const wire: CardTranscriptRecoveryWire = {
    version: CARD_TRANSCRIPT_RECOVERY_VERSION,
    cardId: card.cardId,
    createdAt: Date.now(),
    revision: 1,
    messages,
  }
  window.sessionStorage.setItem(
    cardTranscriptRecoveryStorageKey({ cardId: card.cardId }),
    JSON.stringify(wire),
  )
}

type ScreenInput = {
  activeFriendlyId: string
  activeCard: SessionCard
  inspectedChildCardId?: string
  sessionCardList: SessionCardListWire
  forcedSessionKey?: string
}

const parentCard: SessionCard = {
  cardId: 'remote:card-a',
  canonicalSource: 'remote',
  title: 'Card A',
  titleSource: 'manual',
  canonicalSegmentKey: 'remote:a-tip',
  continuationSegmentKeys: ['remote:a-root', 'remote:a-tip'],
  continuationCount: 2,
  relationshipKind: 'root',
  childNodes: [],
  updatedAt: 3,
  archived: false,
  pinned: false,
}

const successorCard: SessionCard = {
  ...parentCard,
  canonicalSegmentKey: 'remote:a-next',
  continuationSegmentKeys: ['remote:a-root', 'remote:a-tip', 'remote:a-next'],
  continuationCount: 3,
  updatedAt: 4,
}

const childCard = {
  cardId: 'remote:child-card',
  sessionKey: 'remote:child',
  continuationSegmentKeys: ['remote:child'],
  relationshipKind: 'child' as const,
  title: 'Child activity',
  status: 'complete' as const,
  updatedAt: 5,
  continuationCount: 1,
}

const parentWithChild: SessionCard = {
  ...parentCard,
  childNodes: [childCard],
}

const childAsSessionCard: SessionCard = {
  ...parentCard,
  cardId: childCard.cardId,
  canonicalSegmentKey: childCard.sessionKey,
  continuationSegmentKeys: childCard.continuationSegmentKeys,
  continuationCount: 1,
  relationshipKind: 'orphan',
  childNodes: [],
}

const siblingCard: SessionCard = {
  ...parentCard,
  cardId: 'local:other-card',
  canonicalSource: 'local',
  title: 'Other Card',
  canonicalSegmentKey: 'local:other-tip',
  continuationSegmentKeys: ['local:other-tip'],
  continuationCount: 1,
  updatedAt: 6,
}

function cardList(cards: Array<SessionCard>): SessionCardListWire {
  return {
    cards,
    cardResolutions: cards.map((card) => ({
      cardId: card.cardId,
      completeness: 'complete' as const,
      retryable: false,
    })),
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

function completeHistory(
  card: SessionCard,
  messages: Array<{
    segmentKey: string
    message: Record<string, unknown>
  }> = [],
): CardHistoryWire {
  return {
    cardId: card.cardId,
    canonicalSegmentKey: card.canonicalSegmentKey,
    messages,
    completeness: 'complete',
    retryable: false,
    missingSegments: [],
  }
}

function recentHistory(
  card: SessionCard,
  history: CardHistoryWire,
): CardHistoryWire {
  return {
    ...history,
    loadedSegmentKeys: card.continuationSegmentKeys,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

function installBrowserPolyfills() {
  class StubEventSource {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSED = 2
    readyState = 1
    url: string
    withCredentials = false
    onopen: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    constructor(url: string | URL) {
      this.url = String(url)
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true
    }
    close() {
      this.readyState = 2
    }
  }
  vi.stubGlobal('EventSource', StubEventSource)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  const requestFrame = (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(Date.now()), 0)
  const cancelFrame = (id: number) => window.clearTimeout(id)
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: requestFrame,
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: cancelFrame,
  })
  vi.stubGlobal('requestAnimationFrame', requestFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  for (const property of [
    'offsetHeight',
    'clientHeight',
    'scrollHeight',
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get: () => 100,
    })
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}

const mounted: Array<() => void> = []

async function mountChatScreen(
  input: ScreenInput,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  }),
) {
  let setInput: React.Dispatch<React.SetStateAction<ScreenInput>> | undefined
  function RouteComponent() {
    const [current, setCurrent] = useState(input)
    setInput = setCurrent
    return <ChatScreen {...current} compact embedded />
  }

  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: RouteComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  })
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    React.act(() => root.unmount())
    container.remove()
    queryClient.clear()
  }
  mounted.push(cleanup)
  return {
    queryClient,
    update: (next: ScreenInput) => {
      React.act(() => setInput?.(next))
    },
    unmount: cleanup,
  }
}

function defaultInput(card = parentCard): ScreenInput {
  return {
    activeFriendlyId: card.cardId,
    activeCard: card,
    sessionCardList: cardList([card]),
    forcedSessionKey: card.canonicalSegmentKey,
  }
}

function message(
  role: 'user' | 'assistant',
  text: string,
  extra: Record<string, unknown> = {},
): ChatMessage {
  return {
    role,
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
    ...extra,
  }
}

function mockHttp(
  resolveHistory: (cardId: string) => CardHistoryWire = () =>
    completeHistory(parentCard),
) {
  const requests: Array<string> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    requests.push(url)
    const match = /^\/api\/session-cards\/([^/]+)\/history/.exec(url)
    if (match) {
      const cardId = decodeURIComponent(match[1]!)
      const history = resolveHistory(cardId)
      const requestedRecentWindow =
        new URL(url, 'http://test').searchParams.get('window') === 'recent'
      const card = [
        parentCard,
        successorCard,
        childAsSessionCard,
        siblingCard,
      ].find(
        (candidate) =>
          candidate.cardId === cardId &&
          candidate.canonicalSegmentKey === history.canonicalSegmentKey,
      )
      return Promise.resolve(
        jsonResponse({
          ...history,
          ...(requestedRecentWindow
            ? {
                loadedSegmentKeys: card?.continuationSegmentKeys ?? [
                  history.canonicalSegmentKey,
                ],
              }
            : {}),
        }),
      )
    }
    if (url === '/api/status')
      return Promise.resolve(jsonResponse({ ok: true, status: 200 }))
    if (url === '/api/models')
      return Promise.resolve(jsonResponse({ models: [] }))
    return Promise.resolve(jsonResponse({ ok: true }))
  })
  return requests
}

function expectCardOnlyTranscriptBoundary(
  requests: Array<string>,
  cards: Array<SessionCard> = [parentCard],
) {
  expect(requests.some((url) => url.startsWith('/api/history'))).toBe(false)
  for (const card of cards) {
    expect(document.body.textContent).not.toContain(card.canonicalSegmentKey)
  }
}

function submitSelection(text: string) {
  React.act(() => {
    window.dispatchEvent(
      new CustomEvent(CHAT_SUBMIT_SELECTION_EVENT, { detail: { text } }),
    )
  })
}

describe('mounted Session Card transcript recovery lifecycle', () => {
  beforeEach(() => {
    clearCardTranscriptRecoveryMemory()
    installBrowserPolyfills()
    window.localStorage.clear()
    window.sessionStorage.clear()
    for (const key of [
      'remote:a-root',
      'remote:a-tip',
      'remote:a-next',
      'remote:child',
      'local:other-tip',
    ]) {
      useChatStore.getState().clearSession(key)
    }
    useChatStore.getState().clearCard(parentCard.cardId)
    useChatStore.getState().clearCard(childAsSessionCard.cardId)
  })

  afterEach(async () => {
    vi.useRealTimers()
    while (mounted.length > 0) mounted.pop()?.()
    // ChatContainer schedules ResizeObserver setup in requestAnimationFrame.
    // Flush that queued callback before removing the test polyfills.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps active Card tool and waiting state when switching to another Card', async () => {
    mockHttp()
    const activeRunId = 'run-background-card'
    const activeToolId = 'tool-background-card'
    const mountedScreen = await mountChatScreen(defaultInput())
    React.act(() => {
      useChatStore.getState().setCardWaiting(parentCard.cardId, activeRunId)
      useChatStore.getState().processCardEvent(parentCard.cardId, {
        type: 'tool',
        phase: 'calling',
        name: 'terminal',
        toolCallId: activeToolId,
        args: { command: 'sleep 30' },
        sessionKey: parentCard.canonicalSegmentKey,
        runId: activeRunId,
      })
    })
    vi.useFakeTimers()
    mountedScreen.update({
      activeFriendlyId: siblingCard.cardId,
      activeCard: siblingCard,
      sessionCardList: cardList([parentCard, siblingCard]),
      forcedSessionKey: siblingCard.canonicalSegmentKey,
    })

    React.act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(useChatStore.getState().isCardWaiting(parentCard.cardId)).toBe(true)
    expect(
      useChatStore.getState().getCardStreamingStates(parentCard.cardId),
    ).toEqual([
      expect.objectContaining({
        runId: activeRunId,
        toolCalls: [
          expect.objectContaining({
            id: activeToolId,
            name: 'terminal',
            phase: 'calling',
          }),
        ],
      }),
    ])
    vi.useRealTimers()
  })

  it.each([
    {
      name: 'ten seconds apart',
      firstTimestamp: 1_000,
      secondTimestamp: 11_000,
    },
    {
      name: 'without timestamps',
      firstTimestamp: undefined,
      secondTimestamp: undefined,
    },
  ])(
    'renders distinct persisted repeated user turns $name around an assistant turn',
    async ({ firstTimestamp, secondTimestamp }) => {
      const requests = mockHttp(() =>
        completeHistory(parentCard, [
          {
            segmentKey: 'remote:a-root',
            message: {
              id: 'u1',
              role: 'user',
              content: 'continue',
              ...(firstTimestamp === undefined
                ? {}
                : { timestamp: firstTimestamp }),
            },
          },
          {
            segmentKey: 'remote:a-root',
            message: {
              id: 'a1',
              role: 'assistant',
              content: 'acknowledged',
              ...(firstTimestamp === undefined ? {} : { timestamp: 5_000 }),
            },
          },
          {
            segmentKey: 'remote:a-tip',
            message: {
              id: 'u2',
              role: 'user',
              content: 'continue',
              ...(secondTimestamp === undefined
                ? {}
                : { timestamp: secondTimestamp }),
            },
          },
        ]),
      )

      await mountChatScreen(defaultInput())
      await waitFor(() =>
        expect(screen.getAllByText('continue')).toHaveLength(2),
      )
      expect(
        [...document.querySelectorAll('[data-chat-message-id]')]
          .map((node) => node.getAttribute('data-chat-message-id'))
          .sort(),
      ).toEqual(['a1', 'u1', 'u2'])
      expectCardOnlyTranscriptBoundary(requests)
    },
  )

  it('renders persisted messages from a retryable partial Card response beside incomplete/retry UI without raw fallback', async () => {
    const requests: Array<string> = []
    const initialPartial: CardHistoryWire = {
      ...completeHistory(parentCard, [
        {
          segmentKey: 'remote:a-root',
          message: {
            id: 'persisted-user',
            role: 'user',
            content: 'persisted partial message',
            timestamp: 1,
          },
        },
      ]),
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:a-tip',
          source: 'remote',
          retryable: true,
          error: 'temporary read failure',
        },
      ],
    }
    const subsequentPartial: CardHistoryWire = {
      ...initialPartial,
      messages: [],
      missingSegments: [
        {
          segmentKey: 'remote:a-root',
          source: 'remote',
          retryable: true,
          error: 'temporary read failure on retry',
        },
        ...initialPartial.missingSegments,
      ],
    }
    let historyRequestCount = 0
    let resolveRetry: (() => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('/api/session-cards/')) {
        historyRequestCount += 1
        if (historyRequestCount === 1) {
          return Promise.resolve(
            jsonResponse(recentHistory(parentCard, initialPartial)),
          )
        }
        return new Promise<Response>((resolve) => {
          resolveRetry = () =>
            resolve(jsonResponse(recentHistory(parentCard, subsequentPartial)))
        })
      }
      if (url === '/api/status')
        return Promise.resolve(jsonResponse({ ok: true, status: 200 }))
      if (url === '/api/models')
        return Promise.resolve(jsonResponse({ models: [] }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })

    await mountChatScreen(defaultInput())

    await waitFor(() => {
      expect(screen.getByText('persisted partial message')).toBeTruthy()
      expect(screen.getByRole('status').textContent).toContain(
        'History is incomplete for this Session Card. Available messages remain visible. 1 part could not be loaded.',
      )
      expect(
        screen.getByRole('button', {
          name: 'Retry parent conversation history',
        }),
      ).toBeTruthy()
    })
    const statusText = screen.getByRole('status').textContent
    expect(statusText).not.toContain('remote:')
    expect(statusText).not.toContain('temporary read failure')

    const retryButton = screen.getByRole('button', {
      name: 'Retry parent conversation history',
    })
    React.act(() => fireEvent.click(retryButton))
    expect(historyRequestCount).toBe(2)
    expect(screen.getByText('persisted partial message')).toBeTruthy()
    expect(retryButton).toHaveProperty('disabled', true)
    expect(retryButton.textContent).toBe('Retrying…')

    React.act(() => {
      if (typeof resolveRetry !== 'function') {
        throw new Error('Retry request did not start')
      }
      resolveRetry()
    })
    await waitFor(() => {
      expect(screen.getByText('persisted partial message')).toBeTruthy()
      expect(screen.getByRole('status').textContent).toContain(
        '2 parts could not be loaded.',
      )
      expect(retryButton).toHaveProperty('disabled', false)
    })
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('warns when a complete transcript is visible but its durable snapshot fails, then clears after a verified retry', async () => {
    const completeText = 'complete transcript visible before durable retry'
    replaceCardTranscriptRecoveryMessages({ cardId: parentCard.cardId }, [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'locally accepted message still recovering' },
        ],
        clientId: 'recovery-warning-client',
        status: 'sent',
      },
    ])
    const requests = mockHttp(() =>
      completeHistory(parentCard, [
        {
          segmentKey: parentCard.canonicalSegmentKey,
          message: {
            id: 'complete-before-storage-retry',
            role: 'assistant',
            content: completeText,
          },
        },
      ]),
    )
    const originalSetItem = Storage.prototype.setItem
    const storageSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (
          this === window.localStorage &&
          key.startsWith('workspace.card-transcript-snapshot.v3:')
        ) {
          throw new DOMException(
            'persistent transcript snapshot denied',
            'QuotaExceededError',
          )
        }
        return originalSetItem.call(this, key, value)
      })

    const mountedChat = await mountChatScreen(defaultInput())

    await waitFor(() => {
      expect(screen.getByText(completeText)).toBeTruthy()
      expect(
        screen.getByText(
          'Transcript recovery storage is unavailable. This complete transcript is not guaranteed to survive a reload until storage recovers.',
        ),
      ).toBeTruthy()
    })

    storageSpy.mockRestore()
    await React.act(async () => {
      await mountedChat.queryClient.refetchQueries({
        queryKey: sessionCardQueryKeys.history(parentCard.cardId),
      })
    })
    await waitFor(() => {
      expect(
        screen.queryByText(
          'Transcript recovery storage is unavailable. This complete transcript is not guaranteed to survive a reload until storage recovers.',
        ),
      ).toBeNull()
    })
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('does not warn again when an unchanged complete transcript already has a verified persistent snapshot', async () => {
    const completeText =
      'already durable complete transcript after revalidation'
    const requests = mockHttp(() =>
      completeHistory(parentCard, [
        {
          segmentKey: parentCard.canonicalSegmentKey,
          message: {
            id: 'already-durable-complete-transcript',
            role: 'assistant',
            content: completeText,
          },
        },
      ]),
    )
    const mountedChat = await mountChatScreen(defaultInput())

    await waitFor(() => expect(screen.getByText(completeText)).toBeTruthy())
    expect(
      screen.queryByText(
        'Transcript recovery storage is unavailable. This complete transcript is not guaranteed to survive a reload until storage recovers.',
      ),
    ).toBeNull()

    const originalSetItem = Storage.prototype.setItem
    let snapshotWriteAttempts = 0
    const storageSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (
          this === window.localStorage &&
          key.startsWith('workspace.card-transcript-snapshot.v3:')
        ) {
          snapshotWriteAttempts += 1
          throw new DOMException(
            'persistent transcript snapshot denied after it was already saved',
            'QuotaExceededError',
          )
        }
        return originalSetItem.call(this, key, value)
      })

    await React.act(async () => {
      await mountedChat.queryClient.refetchQueries({
        queryKey: sessionCardQueryKeys.history(parentCard.cardId),
      })
    })

    expect(snapshotWriteAttempts).toBe(0)
    expect(
      screen.queryByText(
        'Transcript recovery storage is unavailable. This complete transcript is not guaranteed to survive a reload until storage recovers.',
      ),
    ).toBeNull()
    storageSpy.mockRestore()
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('hydrates persisted partial Card streaming text after remount while history is stale and incomplete', async () => {
    const requests = mockHttp(() => ({
      ...completeHistory(parentCard),
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: parentCard.canonicalSegmentKey,
          source: 'remote',
          retryable: true,
          error: 'history is still catching up',
        },
      ],
    }))
    const streamingStorageKey =
      'workspace.chat-card-streaming.v1:remote%3Acard-a'
    window.sessionStorage.setItem(
      streamingStorageKey,
      JSON.stringify({
        text: 'persisted partial stream after remount',
        thinking: '',
        runId: 'run-remount-partial',
        lifecycleEvents: [],
        toolCalls: [
          {
            id: 'tool-remount',
            name: 'inspect',
            phase: 'start',
            args: {
              sessionId: 'remote:raw-session-id',
              nested: {
                canonicalSegmentKey: 'remote:raw-segment-key',
                safe: true,
              },
            },
          },
        ],
        _savedAt: Date.now(),
      }),
    )

    await mountChatScreen(defaultInput())

    await waitFor(() => {
      expect(
        screen.getByText('persisted partial stream after remount'),
      ).toBeTruthy()
      expect(screen.getByRole('status').textContent).toContain(
        'History is incomplete for this Session Card.',
      )
    })
    const repairedStreamingStorage =
      window.sessionStorage.getItem(streamingStorageKey) ?? ''
    expect(repairedStreamingStorage).not.toContain('raw-session-id')
    expect(repairedStreamingStorage).not.toContain('raw-segment-key')
    expect(repairedStreamingStorage).toContain('"safe":true')
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('keeps an optimistic Card user message through a pre-echo refetch and never requests raw history', async () => {
    const requests = mockHttp()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    queryClient.setQueryData(sessionCardQueryKeys.history(parentCard.cardId), {
      sessionKey: parentCard.canonicalSegmentKey,
      cardId: parentCard.cardId,
      canonicalSegmentKey: parentCard.canonicalSegmentKey,
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    appendSessionCardHistoryMessage(
      queryClient,
      parentCard.cardId,
      parentCard.canonicalSegmentKey,
      message('user', 'optimistic before echo', {
        clientId: 'client-optimistic',
        __optimisticId: 'opt-client-optimistic',
        status: 'sending',
      }),
    )

    const mountedScreen = await mountChatScreen(defaultInput(), queryClient)
    await waitFor(() =>
      expect(screen.getByText('optimistic before echo')).toBeTruthy(),
    )
    await React.act(async () => {
      await queryClient.refetchQueries({
        queryKey: sessionCardQueryKeys.history(parentCard.cardId),
        exact: true,
      })
    })
    expect(screen.getByText('optimistic before echo')).toBeTruthy()
    expectCardOnlyTranscriptBoundary(requests)
    mountedScreen.unmount()
  })

  it('removes uniquely acknowledged optimistic and terminal overlays when Card history preserves client identity', async () => {
    const sentAt = Date.now()
    seedCardTranscriptRecovery(parentCard, [
      message('user', 'ordinary server user acknowledgement', {
        timestamp: sentAt,
        clientId: 'local-client-ack',
        status: 'sent',
      }),
      message('assistant', 'ordinary server assistant acknowledgement', {
        timestamp: sentAt + 1,
        runId: 'local-run-ack',
        stableId: 'stream-run:local-run-ack',
        __streamingStatus: 'complete',
      }),
    ])
    let historyAcknowledged = false
    const requests = mockHttp(() =>
      completeHistory(
        parentCard,
        historyAcknowledged
          ? [
              {
                segmentKey: parentCard.canonicalSegmentKey,
                message: {
                  id: 'server-user-ack',
                  client_id: 'local-client-ack',
                  role: 'user',
                  content: 'ordinary server user acknowledgement',
                  timestamp: sentAt,
                },
              },
              {
                segmentKey: parentCard.canonicalSegmentKey,
                message: {
                  id: 'server-assistant-ack',
                  role: 'assistant',
                  content: 'ordinary server assistant acknowledgement',
                  timestamp: sentAt + 1,
                },
              },
            ]
          : [],
      ),
    )

    const mountedScreen = await mountChatScreen(defaultInput())
    await waitFor(() => {
      expect(
        screen.getByText('ordinary server user acknowledgement'),
      ).toBeTruthy()
      expect(
        screen.getByText('ordinary server assistant acknowledgement'),
      ).toBeTruthy()
    })

    historyAcknowledged = true
    await React.act(async () => {
      await mountedScreen.queryClient.refetchQueries({
        queryKey: sessionCardQueryKeys.history(parentCard.cardId),
        exact: true,
      })
    })
    await waitFor(() =>
      expect(
        readCardTranscriptRecovery({ cardId: parentCard.cardId }),
      ).toBeNull(),
    )
    expect(
      screen.getAllByText('ordinary server user acknowledgement'),
    ).toHaveLength(1)
    expect(
      screen.getAllByText('ordinary server assistant acknowledgement'),
    ).toHaveLength(1)
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('preserves terminal assistant text while complete Card history still lags', async () => {
    const requests = mockHttp()
    const store = useChatStore.getState()
    store.processCardEvent(parentCard.cardId, {
      type: 'chunk',
      text: 'terminal answer survives lag',
      fullReplace: true,
      runId: 'run-terminal',
      sessionKey: parentCard.canonicalSegmentKey,
      transport: 'send-stream',
    })
    store.processCardEvent(parentCard.cardId, {
      type: 'done',
      state: 'complete',
      runId: 'run-terminal',
      sessionKey: parentCard.canonicalSegmentKey,
      transport: 'send-stream',
      message: message('assistant', 'terminal answer survives lag'),
    })

    const mountedScreen = await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(screen.getByText('terminal answer survives lag')).toBeTruthy(),
    )
    await React.act(async () => {
      await mountedScreen.queryClient.refetchQueries({
        queryKey: sessionCardQueryKeys.history(parentCard.cardId),
        exact: true,
      })
    })
    expect(screen.getByText('terminal answer survives lag')).toBeTruthy()
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('keeps a sibling run mounted when another same-Card run ends through the production realtime hook', async () => {
    const requests = mockHttp()
    await mountChatScreen(defaultInput())
    const store = useChatStore.getState()

    React.act(() => {
      store.processCardEvent(parentCard.cardId, {
        type: 'chunk',
        text: 'first concurrent production stream',
        fullReplace: true,
        runId: 'run-production-a',
        sessionKey: parentCard.canonicalSegmentKey,
        transport: 'chat-events',
      })
      store.processCardEvent(parentCard.cardId, {
        type: 'chunk',
        text: 'second concurrent production stream',
        fullReplace: true,
        runId: 'run-production-b',
        sessionKey: parentCard.canonicalSegmentKey,
        transport: 'chat-events',
      })
    })

    await waitFor(() => {
      expect(
        screen.getByText('first concurrent production stream'),
      ).toBeTruthy()
      expect(
        screen.getByText('second concurrent production stream'),
      ).toBeTruthy()
    })

    React.act(() => {
      store.processCardEvent(parentCard.cardId, {
        type: 'done',
        state: 'complete',
        runId: 'run-production-a',
        sessionKey: parentCard.canonicalSegmentKey,
        transport: 'chat-events',
      })
    })

    await waitFor(() => {
      expect(
        screen.getByText('second concurrent production stream'),
      ).toBeTruthy()
      expect(
        useChatStore
          .getState()
          .getCardStreamingStates(parentCard.cardId)
          .map((state) => state.runId),
      ).toEqual(['run-production-b'])
    })
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('seals a chunk before a stream error and restores the interrupted assistant after remount', async () => {
    const requests: Array<string> = []
    const encoder = new TextEncoder()
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('/api/session-cards/')) {
        return Promise.resolve(
          jsonResponse(recentHistory(parentCard, completeHistory(parentCard))),
        )
      }
      if (url === '/api/send-stream') {
        const reader = {
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: encoder.encode(
                [
                  'event: started',
                  'data: {"runId":"run-chunk-error"}',
                  '',
                  'event: chunk',
                  'data: {"delta":"partial answer before error"}',
                  '',
                  'event: error',
                  'data: {"message":"simulated stream failure"}',
                  '',
                  '',
                ].join('\n'),
              ),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn().mockResolvedValue(undefined),
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: { getReader: () => reader },
          text: () => Promise.resolve(''),
          json: () => Promise.resolve({}),
        } as unknown as Response)
      }
      if (url === '/api/status')
        return Promise.resolve(jsonResponse({ ok: true, status: 200 }))
      if (url === '/api/models')
        return Promise.resolve(jsonResponse({ models: [] }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })

    const mountedScreen = await mountChatScreen(defaultInput())
    submitSelection('produce a partial error response')
    await waitFor(() => {
      expect(screen.getByText('partial answer before error')).toBeTruthy()
      expect(
        readCardTranscriptRecovery({ cardId: parentCard.cardId })?.messages,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            runId: 'run-chunk-error',
            __streamingStatus: 'interrupted',
          }),
        ]),
      )
    })

    mountedScreen.unmount()
    clearCardTranscriptRecoveryMemory()
    useChatStore.getState().clearCardRealtimeBuffer(parentCard.cardId)
    useChatStore.getState().clearCardStreaming(parentCard.cardId)
    await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(screen.getByText('partial answer before error')).toBeTruthy(),
    )
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('seals a chunk before user cancellation and restores the interrupted assistant after remount', async () => {
    const requests: Array<string> = []
    const encoder = new TextEncoder()
    let finishRead: (() => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('/api/session-cards/')) {
        return Promise.resolve(
          jsonResponse(recentHistory(parentCard, completeHistory(parentCard))),
        )
      }
      if (url === '/api/send-stream') {
        const pendingRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
          (resolve) => {
            finishRead = () => resolve({ done: true, value: undefined })
          },
        )
        init?.signal?.addEventListener('abort', () => finishRead?.(), {
          once: true,
        })
        const reader = {
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: encoder.encode(
                [
                  'event: started',
                  'data: {"runId":"run-chunk-cancel"}',
                  '',
                  'event: chunk',
                  'data: {"delta":"partial answer before cancel"}',
                  '',
                  '',
                ].join('\n'),
              ),
            })
            .mockReturnValueOnce(pendingRead),
          cancel: vi.fn().mockResolvedValue(undefined),
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: { getReader: () => reader },
          text: () => Promise.resolve(''),
          json: () => Promise.resolve({}),
        } as unknown as Response)
      }
      if (url === '/api/status')
        return Promise.resolve(jsonResponse({ ok: true, status: 200 }))
      if (url === '/api/models')
        return Promise.resolve(jsonResponse({ models: [] }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })

    const mountedScreen = await mountChatScreen(defaultInput())
    submitSelection('produce a cancellable partial response')
    await waitFor(() =>
      expect(screen.getByText('partial answer before cancel')).toBeTruthy(),
    )
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Stop generating' })),
    )
    await waitFor(() =>
      expect(
        readCardTranscriptRecovery({ cardId: parentCard.cardId })?.messages,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            runId: 'run-chunk-cancel',
            __streamingStatus: 'interrupted',
          }),
        ]),
      ),
    )

    mountedScreen.unmount()
    clearCardTranscriptRecoveryMemory()
    useChatStore.getState().clearCardRealtimeBuffer(parentCard.cardId)
    useChatStore.getState().clearCardStreaming(parentCard.cardId)
    await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(screen.getByText('partial answer before cancel')).toBeTruthy(),
    )
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('restores a Card-scoped user overlay after a reload with a new query client', async () => {
    const requests = mockHttp()
    seedCardTranscriptRecovery(parentCard, [
      message('user', 'user overlay after reload', {
        clientId: 'reload-user',
        status: 'sent',
      }),
    ])

    await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(screen.getByText('user overlay after reload')).toBeTruthy(),
    )
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('restores a terminal assistant overlay after remount', async () => {
    const requests = mockHttp()
    seedCardTranscriptRecovery(parentCard, [
      message('assistant', 'assistant overlay after remount', {
        __streamingStatus: 'complete',
      }),
    ])

    await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(screen.getByText('assistant overlay after remount')).toBeTruthy(),
    )
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('does not resurrect an unverified journal write after rejected admission and a cold remount', async () => {
    const baselineText = 'accepted baseline survives rejected admission'
    const rejectedText = 'candidate whose journal readback fails'
    expect(
      replaceCardTranscriptRecoveryMessages({ cardId: parentCard.cardId }, [
        message('user', baselineText, { clientId: 'accepted-baseline' }),
      ]),
    ).not.toBeNull()

    const requests = mockHttp()
    const originalSetItem = Storage.prototype.setItem
    const originalGetItem = Storage.prototype.getItem
    const originalRemoveItem = Storage.prototype.removeItem
    let persistentJournalUnavailable = false
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        originalSetItem.call(this, key, value)
        if (
          this === window.localStorage &&
          key.includes(':entry:') &&
          value.includes(rejectedText)
        ) {
          persistentJournalUnavailable = true
        }
      })
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key) {
        if (this === window.localStorage && persistentJournalUnavailable) {
          throw new DOMException(
            'persistent storage unavailable',
            'SecurityError',
          )
        }
        return originalGetItem.call(this, key)
      })
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key) {
        if (this === window.localStorage && persistentJournalUnavailable) {
          throw new DOMException(
            'persistent storage unavailable',
            'SecurityError',
          )
        }
        return originalRemoveItem.call(this, key)
      })

    const mountedScreen = await mountChatScreen(defaultInput())
    await waitFor(() => expect(screen.getByText(baselineText)).toBeTruthy())
    submitSelection(rejectedText)
    await waitFor(() => {
      expect(screen.queryByText(rejectedText)).toBeNull()
      expect(requests).not.toContain('/api/send-stream')
    })

    mountedScreen.unmount()
    clearCardTranscriptRecoveryMemory()
    window.sessionStorage.clear()
    useChatStore.getState().clearCardRealtimeBuffer(parentCard.cardId)
    useChatStore.getState().clearCardStreaming(parentCard.cardId)
    setItemSpy.mockRestore()
    getItemSpy.mockRestore()
    removeItemSpy.mockRestore()

    await mountChatScreen(defaultInput())
    await waitFor(() => expect(screen.getByText(baselineText)).toBeTruthy())
    expect(screen.queryByText(rejectedText)).toBeNull()
    expect(requests).not.toContain('/api/send-stream')
  })

  it('keeps send errors retryable after refetch and a cold Card remount', async () => {
    const requests: Array<string> = []
    let sendAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('/api/session-cards/')) {
        return Promise.resolve(
          jsonResponse(recentHistory(parentCard, completeHistory(parentCard))),
        )
      }
      if (url === '/api/send-stream') {
        sendAttempts += 1
        return Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve('simulated retryable send failure'),
          json: () => Promise.resolve({}),
        } as Response)
      }
      if (url === '/api/status')
        return Promise.resolve(jsonResponse({ ok: true, status: 200 }))
      if (url === '/api/models')
        return Promise.resolve(jsonResponse({ models: [] }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })

    const mountedScreen = await mountChatScreen(defaultInput())
    submitSelection('retry this durable Card message')
    await waitFor(() => {
      expect(screen.getByText('retry this durable Card message')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Retry message' })).toBeTruthy()
      expect(sendAttempts).toBe(1)
    })
    expect(
      readCardTranscriptRecovery({ cardId: parentCard.cardId })?.messages,
    ).toMatchObject([
      expect.objectContaining({
        role: 'user',
        status: 'error',
      }),
    ])

    await React.act(async () => {
      await mountedScreen.queryClient.refetchQueries({
        queryKey: sessionCardQueryKeys.history(parentCard.cardId),
        exact: true,
      })
    })
    expect(screen.getByRole('button', { name: 'Retry message' })).toBeTruthy()
    mountedScreen.unmount()
    clearCardTranscriptRecoveryMemory()
    useChatStore.getState().clearCardRealtimeBuffer(parentCard.cardId)
    useChatStore.getState().clearCardStreaming(parentCard.cardId)

    await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry message' }),
      ).toBeTruthy(),
    )
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Retry message' })),
    )
    await waitFor(() => {
      expect(sendAttempts).toBe(2)
      expect(screen.getByRole('button', { name: 'Retry message' })).toBeTruthy()
    })
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('persists equal terminal text from distinct runs separately and scrubs nested transport identities', async () => {
    const requests: Array<string> = []
    const runIds = ['run-repeat-first', 'run-repeat-second']
    let sendIndex = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('/api/session-cards/')) {
        return Promise.resolve(
          jsonResponse(recentHistory(parentCard, completeHistory(parentCard))),
        )
      }
      if (url === '/api/send-stream') {
        const runId = runIds[sendIndex++]
        const encoder = new TextEncoder()
        const reader = {
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: encoder.encode(
                [
                  'event: started',
                  `data: ${JSON.stringify({ runId, sessionKey: parentCard.canonicalSegmentKey })}`,
                  '',
                  'event: chunk',
                  `data: ${JSON.stringify({ delta: 'Identical terminal answer', runId })}`,
                  '',
                  'event: done',
                  `data: ${JSON.stringify({ state: 'complete', sessionKey: parentCard.canonicalSegmentKey, runId, metadata: { sessionId: `remote:raw-session-${runId}`, nested: { segmentId: `remote:raw-segment-${runId}`, canonicalSessionIdentity: `remote:raw-canonical-${runId}`, safe: runId } } })}`,
                  '',
                  '',
                ].join('\n'),
              ),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn().mockResolvedValue(undefined),
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: { getReader: () => reader },
          text: () => Promise.resolve(''),
          json: () => Promise.resolve({}),
        } as unknown as Response)
      }
      if (url === '/api/status')
        return Promise.resolve(jsonResponse({ ok: true, status: 200 }))
      if (url === '/api/models')
        return Promise.resolve(jsonResponse({ models: [] }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })

    const mountedScreen = await mountChatScreen(defaultInput())
    submitSelection('first repeated terminal run')
    await waitFor(() =>
      expect(
        readCardTranscriptRecovery({ cardId: parentCard.cardId })?.messages,
      ).toHaveLength(2),
    )
    submitSelection('second repeated terminal run')
    await waitFor(() => {
      const recovery = readCardTranscriptRecovery({ cardId: parentCard.cardId })
      expect(recovery?.messages).toHaveLength(4)
      expect(
        recovery?.messages.filter((entry) => entry.role === 'assistant'),
      ).toMatchObject([
        { runId: runIds[0], stableId: `stream-run:${runIds[0]}` },
        { runId: runIds[1], stableId: `stream-run:${runIds[1]}` },
      ])
    })
    const recoveryKey = cardTranscriptRecoveryStorageKey({
      cardId: parentCard.cardId,
    })
    const persisted = window.sessionStorage.getItem(recoveryKey) ?? ''
    expect(persisted).not.toContain('remote:raw-session-')
    expect(persisted).not.toContain('remote:raw-segment-')
    expect(persisted).not.toContain('remote:raw-canonical-')
    expect(persisted).toContain('"safe":"run-repeat-first"')
    expect(persisted).toContain('"safe":"run-repeat-second"')

    mountedScreen.unmount()
    clearCardTranscriptRecoveryMemory()
    useChatStore.getState().clearCardRealtimeBuffer(parentCard.cardId)
    useChatStore.getState().clearCardStreaming(parentCard.cardId)
    await mountChatScreen(defaultInput())
    await waitFor(() =>
      expect(screen.getAllByText('Identical terminal answer')).toHaveLength(2),
    )
    expectCardOnlyTranscriptBoundary(requests)
  })

  it('preserves the overlay across a valid same-Card continuation handoff', async () => {
    const requests = mockHttp((_cardId) => completeHistory(successorCard))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const overlays = [
      message('user', 'same Card user handoff overlay', {
        clientId: 'same-card-user',
        status: 'sent',
      }),
      message('assistant', 'same Card assistant handoff overlay', {
        __streamingStatus: 'complete',
      }),
    ]
    seedCardTranscriptRecovery(parentCard, overlays)
    for (const overlay of overlays) {
      appendSessionCardHistoryMessage(
        queryClient,
        parentCard.cardId,
        parentCard.canonicalSegmentKey,
        overlay,
      )
    }
    moveSessionCardHistoryMessages(
      queryClient,
      {
        cardId: parentCard.cardId,
        fromSegmentKey: parentCard.canonicalSegmentKey,
        canonicalSegmentKey: successorCard.canonicalSegmentKey,
        runId: 'run-card-handoff',
        verifiedContinuationSegmentKeys: successorCard.continuationSegmentKeys,
      },
      parentCard,
      [parentCard],
    )

    const recoveryStorageKey = cardTranscriptRecoveryStorageKey({
      cardId: parentCard.cardId,
    })
    expect(window.sessionStorage.getItem(recoveryStorageKey)).not.toBeNull()
    expect(recoveryStorageKey).not.toContain(parentCard.canonicalSegmentKey)
    expect(recoveryStorageKey).not.toContain(successorCard.canonicalSegmentKey)

    const mountedScreen = await mountChatScreen(
      defaultInput(successorCard),
      queryClient,
    )
    await waitFor(() => {
      expect(screen.getByText('same Card user handoff overlay')).toBeTruthy()
      expect(
        screen.getByText('same Card assistant handoff overlay'),
      ).toBeTruthy()
    })

    mountedScreen.unmount()
    await mountChatScreen(defaultInput(successorCard))
    await waitFor(() => {
      expect(screen.getByText('same Card user handoff overlay')).toBeTruthy()
      expect(
        screen.getByText('same Card assistant handoff overlay'),
      ).toBeTruthy()
    })
    expectCardOnlyTranscriptBoundary(requests, [successorCard])
  })

  it('keeps parent overlay state through parent-child-parent inspection', async () => {
    const childPartialHistory: CardHistoryWire = {
      ...completeHistory(childAsSessionCard, [
        {
          segmentKey: childCard.sessionKey,
          message: {
            id: 'child-message',
            role: 'assistant',
            content: 'child transcript',
          },
        },
      ]),
      completeness: 'partial',
      retryable: true,
      missingSegments: [],
    }
    const requests = mockHttp((cardId) =>
      cardId === childCard.cardId
        ? childPartialHistory
        : completeHistory(parentWithChild),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    appendSessionCardHistoryMessage(
      queryClient,
      parentWithChild.cardId,
      parentWithChild.canonicalSegmentKey,
      message('user', 'parent overlay retained', {
        clientId: 'parent-overlay',
        status: 'sending',
      }),
    )
    const mountedScreen = await mountChatScreen(
      defaultInput(parentWithChild),
      queryClient,
    )
    await waitFor(() =>
      expect(screen.getByText('parent overlay retained')).toBeTruthy(),
    )
    await mountedScreen.update({
      ...defaultInput(parentWithChild),
      inspectedChildCardId: childCard.cardId,
    })
    await waitFor(() => {
      expect(screen.getByText('child transcript')).toBeTruthy()
      expect(screen.getByRole('status').textContent).toContain(
        'History is incomplete for the inspected child Card.',
      )
    })
    const childHistoryRequestCount = requests.filter((url) =>
      url.startsWith(
        `/api/session-cards/${encodeURIComponent(childCard.cardId)}/history`,
      ),
    ).length
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Retry inspected child history',
        }),
      ),
    )
    await waitFor(() => {
      expect(
        requests.filter((url) =>
          url.startsWith(
            `/api/session-cards/${encodeURIComponent(childCard.cardId)}/history`,
          ),
        ).length,
      ).toBe(childHistoryRequestCount + 1)
      expect(screen.getByText('child transcript')).toBeTruthy()
    })
    await mountedScreen.update(defaultInput(parentWithChild))
    await waitFor(() =>
      expect(screen.getByText('parent overlay retained')).toBeTruthy(),
    )
    expectCardOnlyTranscriptBoundary(requests, [parentWithChild])
  })

  it('does not migrate overlay state across source, Card, or child boundaries or expose raw identity', async () => {
    const requests = mockHttp((cardId) =>
      cardId === siblingCard.cardId
        ? completeHistory(siblingCard)
        : completeHistory(parentCard),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    appendSessionCardHistoryMessage(
      queryClient,
      parentCard.cardId,
      parentCard.canonicalSegmentKey,
      message('user', 'must stay on origin Card', {
        clientId: 'origin-only',
        status: 'sending',
      }),
    )
    const mountedScreen = await mountChatScreen(
      defaultInput(parentCard),
      queryClient,
    )
    await waitFor(() =>
      expect(screen.getByText('must stay on origin Card')).toBeTruthy(),
    )
    await mountedScreen.update(defaultInput(siblingCard))
    await waitFor(() =>
      expect(screen.queryByText('must stay on origin Card')).toBeNull(),
    )
    expectCardOnlyTranscriptBoundary(requests, [parentCard, siblingCard])
  })
})
