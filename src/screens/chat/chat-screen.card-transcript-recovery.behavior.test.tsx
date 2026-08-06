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

vi.mock('./components/chat-header', () => ({ ChatHeader: () => null }))
vi.mock('./components/chat-composer', () => ({
  ChatComposer: () => null,
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
    return (
      <article data-chat-message-id={String(chatMessage.id ?? '')}>
        {text}
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
}

type CardTranscriptRecoveryWire = {
  version: 1
  cardId: string
  canonicalSegmentKey: string
  createdAt: number
  messages: Array<ChatMessage>
}

const CARD_TRANSCRIPT_RECOVERY_PREFIX = 'workspace.card-transcript-recovery.v1'

function cardTranscriptRecoveryKey(
  cardId: string,
  canonicalSegmentKey: string,
) {
  return `${CARD_TRANSCRIPT_RECOVERY_PREFIX}:${encodeURIComponent(cardId)}:${encodeURIComponent(canonicalSegmentKey)}`
}

function seedCardTranscriptRecovery(
  card: Pick<SessionCard, 'cardId' | 'canonicalSegmentKey'>,
  messages: Array<ChatMessage>,
) {
  const wire: CardTranscriptRecoveryWire = {
    version: 1,
    cardId: card.cardId,
    canonicalSegmentKey: card.canonicalSegmentKey,
    createdAt: Date.now(),
    messages,
  }
  window.sessionStorage.setItem(
    cardTranscriptRecoveryKey(card.cardId, card.canonicalSegmentKey),
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
    if (match)
      return Promise.resolve(
        jsonResponse(resolveHistory(decodeURIComponent(match[1]!))),
      )
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

describe('mounted Session Card transcript recovery lifecycle', () => {
  beforeEach(() => {
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
  })

  afterEach(async () => {
    while (mounted.length > 0) mounted.pop()?.()
    // ChatContainer schedules ResizeObserver setup in requestAnimationFrame.
    // Flush that queued callback before removing the test polyfills.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

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
          return Promise.resolve(jsonResponse(initialPartial))
        }
        return new Promise<Response>((resolve) => {
          resolveRetry = () => resolve(jsonResponse(subsequentPartial))
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

  it('keeps an optimistic Card user message through a pre-echo refetch and never requests raw history', async () => {
    const requests = mockHttp()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    queryClient.setQueryData(
      sessionCardQueryKeys.history(
        parentCard.cardId,
        parentCard.canonicalSegmentKey,
      ),
      {
        sessionKey: parentCard.canonicalSegmentKey,
        cardId: parentCard.cardId,
        canonicalSegmentKey: parentCard.canonicalSegmentKey,
        messages: [],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      },
    )
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
        queryKey: sessionCardQueryKeys.history(
          parentCard.cardId,
          parentCard.canonicalSegmentKey,
        ),
        exact: true,
      })
    })
    expect(screen.getByText('optimistic before echo')).toBeTruthy()
    expectCardOnlyTranscriptBoundary(requests)
    mountedScreen.unmount()
  })

  it('preserves terminal assistant text while complete Card history still lags', async () => {
    const requests = mockHttp()
    const store = useChatStore.getState()
    store.processEvent({
      type: 'chunk',
      text: 'terminal answer survives lag',
      fullReplace: true,
      runId: 'run-terminal',
      sessionKey: parentCard.canonicalSegmentKey,
      transport: 'send-stream',
    })
    store.processEvent({
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
        queryKey: sessionCardQueryKeys.history(
          parentCard.cardId,
          parentCard.canonicalSegmentKey,
        ),
        exact: true,
      })
    })
    expect(screen.getByText('terminal answer survives lag')).toBeTruthy()
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

    expect(
      window.sessionStorage.getItem(
        cardTranscriptRecoveryKey(
          parentCard.cardId,
          parentCard.canonicalSegmentKey,
        ),
      ),
    ).toBeNull()
    expect(
      window.sessionStorage.getItem(
        cardTranscriptRecoveryKey(
          successorCard.cardId,
          successorCard.canonicalSegmentKey,
        ),
      ),
    ).not.toBeNull()

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
