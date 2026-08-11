// @vitest-environment jsdom
import 'fake-indexeddb/auto'

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
import { useSessionModelStore } from '../../stores/session-model-store'
import { ChatScreen } from './chat-screen'
import { registerNewSessionCardForPrimaryModel } from './new-session-discard'
import { resetWorkspaceChatIndexedDb } from './card-transcript-indexeddb'
import {
  cardDraftStorageKey,
  cardThinkingStorageKey,
} from './session-card-ui-state'
import type { SessionCardListWire } from './chat-queries'
import type { SessionCard } from './types'

// Keep the production components and stores mounted while avoiding the
// workspace Vitest CJS/ESM split-React dispatcher.
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
vi.mock('./hooks/use-chat-measurements', () => ({
  useChatMeasurements: () => ({
    headerRef: { current: null },
    composerRef: { current: null },
    mainRef: { current: null },
    pinGroupMinHeight: 0,
    headerHeight: 0,
  }),
}))
vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      render?: React.ReactElement
    }
  >(({ children, render, ...props }, ref) =>
    render
      ? React.cloneElement(render, { ...props, ref } as never)
      : React.createElement('button', { ...props, ref }, children),
  ),
  buttonVariants: () => '',
}))
vi.mock('@/components/ui/tooltip', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    children ?? null
  const Trigger = ({
    children,
    render,
  }: {
    children?: React.ReactNode
    render?: React.ReactNode
  }) => render ?? children ?? null
  return {
    TooltipProvider: Passthrough,
    TooltipRoot: Passthrough,
    TooltipTrigger: Trigger,
    TooltipContent: () => null,
  }
})

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const cardA: SessionCard = {
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

const cardB: SessionCard = {
  ...cardA,
  cardId: 'remote:card-b',
  title: 'Card B',
  canonicalSegmentKey: 'remote:b-tip',
  continuationSegmentKeys: ['remote:b-tip'],
  continuationCount: 1,
  updatedAt: 4,
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

type ScreenInput = {
  activeFriendlyId: string
  activeCard?: SessionCard
  sessionCardList?: SessionCardListWire
  forcedSessionKey?: string
  isNewChat?: boolean
}

function inputForCard(card: SessionCard): ScreenInput {
  return {
    activeFriendlyId: card.cardId,
    activeCard: card,
    sessionCardList: cardList([cardA, cardB]),
    forcedSessionKey: card.canonicalSegmentKey,
  }
}

function installBrowserPolyfills() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: '(max-width: 767px)',
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
  vi.stubGlobal(
    'EventSource',
    class EventSource {
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type CapturedRequest = {
  url: string
  body: Record<string, unknown>
}

function installHttp(statusModels: Record<string, string> = {}) {
  const requests: Array<CapturedRequest> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    await Promise.resolve()
    const url = String(input)
    if (url === '/api/send-stream') {
      requests.push({
        url,
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      })
      return new Response('event: done\ndata: {}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const historyMatch = /^\/api\/session-cards\/([^/]+)\/history/.exec(url)
    if (historyMatch) {
      const cardId = decodeURIComponent(historyMatch[1]!)
      const card = cardId === cardB.cardId ? cardB : cardA
      const requestedRecentWindow =
        new URL(url, 'http://test').searchParams.get('window') === 'recent'
      return jsonResponse({
        cardId: card.cardId,
        canonicalSegmentKey: card.canonicalSegmentKey,
        messages: [],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
        ...(requestedRecentWindow
          ? { loadedSegmentKeys: card.continuationSegmentKeys }
          : {}),
      })
    }
    if (url.startsWith('/api/session-status?cardId=')) {
      const cardId = decodeURIComponent(url.split('=')[1] ?? '')
      const model =
        statusModels[cardId] ??
        (cardId === cardB.cardId
          ? 'anthropic/claude-4.6-sonnet'
          : 'openrouter/model-a')
      return jsonResponse({
        payload: {
          cards: [
            {
              cardId,
              usage: {
                model,
                contextPercent: 0,
                maxTokens: 0,
                usedTokens: 0,
              },
            },
          ],
        },
      })
    }
    if (url === '/api/models') {
      return jsonResponse({
        currentProvider: 'openrouter',
        models: [
          { id: 'model-a', name: 'Model A', provider: 'openrouter' },
          { id: 'model-b', name: 'Model B', provider: 'openrouter' },
        ],
      })
    }
    if (url === '/api/hermes-config') {
      return jsonResponse({ config: { agent: { reasoning_effort: 'medium' } } })
    }
    if (url === '/api/profiles') {
      return jsonResponse({ profiles: [{ name: 'default', active: true }] })
    }
    if (url === '/api/workspace') {
      return jsonResponse({ folderName: 'Workspace', workspaces: [] })
    }
    if (url === '/api/commands') return jsonResponse({ commands: [] })
    if (url === '/api/claude-config') return jsonResponse({ config: {} })
    if (url === '/api/model/info') {
      return jsonResponse({
        supportsRuntimeSwitching: true,
        vanillaAgent: true,
      })
    }
    if (url === '/api/status') {
      return jsonResponse({ ok: true, status: 200, mode: 'enhanced' })
    }
    if (url.startsWith('/api/session-cards/') && url.endsWith('/active-run')) {
      return jsonResponse({ active: false })
    }
    return jsonResponse({ ok: true })
  })
  return requests
}

const mounted: Array<() => void> = []

async function mountChatScreen(input: ScreenInput) {
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
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
  const cleanup = () => {
    React.act(() => root.unmount())
    container.remove()
    queryClient.clear()
  }
  mounted.push(cleanup)
  return {
    update(next: ScreenInput) {
      React.act(() => setInput?.(next))
    },
  }
}

function sessionStorageKeys(): Array<string> {
  return Array.from({ length: window.sessionStorage.length }, (_, index) =>
    window.sessionStorage.key(index),
  ).filter((key): key is string => key !== null)
}

function click(element: Element) {
  React.act(() => fireEvent.click(element))
}

function change(element: Element, value: string) {
  React.act(() => fireEvent.change(element, { target: { value } }))
}

describe('mounted Card-owned ChatScreen composer state', () => {
  beforeEach(async () => {
    const database = await resetWorkspaceChatIndexedDb()
    database.close()
    installBrowserPolyfills()
    window.localStorage.clear()
    window.sessionStorage.clear()
    useSessionModelStore.setState({ models: {} })
    for (const key of [
      cardA.canonicalSegmentKey,
      cardB.canonicalSegmentKey,
      'new',
    ]) {
      useChatStore.getState().clearSession(key)
    }
  })

  afterEach(async () => {
    while (mounted.length > 0) mounted.pop()?.()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends an explicit Composer model even for a New Session Card', async () => {
    const requests = installHttp()
    registerNewSessionCardForPrimaryModel(cardA.cardId)
    await mountChatScreen(inputForCard(cardA))

    const controls = await screen.findByRole('button', {
      name: /Chat controls, current model:/,
    })
    click(controls)
    click(
      await screen.findByRole('button', {
        name: /Select model, current model:/,
      }),
    )
    click(await screen.findByRole('button', { name: /^Model B$/ }))

    const textbox = screen.getByRole('textbox')
    change(textbox, 'first send after selection')
    click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]!.body.model).toBe('openrouter/model-b')
    expect(requests[0]!.body.cardId).toBe(cardA.cardId)
  })

  it('uses the configured concrete label and omits a New Session Card virtual default', async () => {
    const requests = installHttp({ [cardA.cardId]: 'hermes-agent' })
    registerNewSessionCardForPrimaryModel(cardA.cardId)
    await mountChatScreen(inputForCard(cardA))
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Chat controls, current model:.*model-a/i,
        }),
      ).toBeTruthy(),
    )

    const textbox = await screen.findByRole('textbox')
    change(textbox, 'first default-model send')
    click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]!.body).not.toHaveProperty('model')
    expect(requests[0]!.body.cardId).toBe(cardA.cardId)
  })

  it('never forwards a virtual Card model as an explicit provider selection', async () => {
    const requests = installHttp({ [cardA.cardId]: 'hermes-agent' })
    await mountChatScreen(inputForCard(cardA))
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Chat controls, current model:.*model-a/i,
        }),
      ).toBeTruthy(),
    )

    const textbox = await screen.findByRole('textbox')
    change(textbox, 'existing empty Card send')
    click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]!.body).not.toHaveProperty('model')
    expect(requests[0]!.body.cardId).toBe(cardA.cardId)
  })

  it('disables New Chat model selection with an accessible explanation and writes no bootstrap draft/thinking keys', async () => {
    installHttp()
    await mountChatScreen({ activeFriendlyId: 'new', isNewChat: true })

    const controls = await screen.findByRole('button', {
      name: /Chat controls, current model:/,
    })
    click(controls)
    const selector = await screen.findByRole('button', {
      name: 'Model selection is available after this chat becomes a Session Card',
    })
    expect((selector as HTMLButtonElement).disabled).toBe(true)
    expect(selector.getAttribute('title')).toContain('create a Session Card')

    const textbox = screen.getByRole('textbox')
    change(textbox, 'bootstrap draft')
    React.act(() =>
      fireEvent.keyDown(window, { key: 'm', ctrlKey: true, shiftKey: true }),
    )
    expect(screen.queryByRole('button', { name: /^Model B$/ })).toBeNull()
    expect(
      sessionStorageKeys().filter(
        (key) =>
          key.startsWith('workspace.card-draft.') ||
          key.startsWith('workspace.card-thinking.'),
      ),
    ).toEqual([])
  })

  it('switches draft and thinking state at the Card boundary without inheriting the prior Card', async () => {
    installHttp()
    window.sessionStorage.setItem(cardDraftStorageKey(cardA.cardId)!, 'draft A')
    window.sessionStorage.setItem(cardDraftStorageKey(cardB.cardId)!, 'draft B')
    window.sessionStorage.setItem(cardThinkingStorageKey(cardA.cardId)!, 'high')

    const mountedScreen = await mountChatScreen(inputForCard(cardA))
    await waitFor(() =>
      expect(screen.getByRole('textbox')).toHaveProperty('value', 'draft A'),
    )
    click(screen.getByRole('button', { name: /Chat controls, current model:/ }))
    expect(screen.getByTitle('Reasoning effort: High')).toBeTruthy()

    mountedScreen.update(inputForCard(cardB))

    expect(screen.getByRole('textbox')).toHaveProperty('value', 'draft B')
    expect(screen.queryByTitle('Reasoning effort: High')).toBeNull()
    await waitFor(() =>
      expect(screen.getByTitle('Reasoning effort: Adaptive')).toBeTruthy(),
    )
    expect(
      window.sessionStorage.getItem(cardThinkingStorageKey(cardB.cardId)!),
    ).toBeNull()
  })
})
