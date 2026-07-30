// @vitest-environment jsdom

import React from 'react'
import { screen, waitFor, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_HAMBURGER_NAV_ITEMS } from './mobile-hamburger-menu'
import { MOBILE_NAV_TABS } from './mobile-tab-bar'
import {
  DESKTOP_SIDEBAR_BACKDROP_CLASS,
  WorkspaceShell,
  resolveShellActiveChatCardId,
} from './workspace-shell'
import { MOBILE_SWIPE_TAB_ORDER } from '@/hooks/use-swipe-navigation'
import {
  buildChatCardNavigation,
  normalizeActiveChatCardId,
  useWorkspaceStore,
} from '@/stores/workspace-store'

const routerContext = vi.hoisted(() => ({
  pathname: '/chat/remote%3Aroot',
  search: {} as Record<string, unknown>,
  navigate: vi.fn().mockResolvedValue(undefined),
}))

const queryContext = vi.hoisted(() => ({
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  sessionCardList: undefined as unknown,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: ({
    children,
    onClick,
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href: '#', onClick }, children),
  useNavigate: () => routerContext.navigate,
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: { pathname: string; search: Record<string, unknown> }
    }) => unknown
  }) =>
    select({
      location: {
        pathname: routerContext.pathname,
        search: routerContext.search,
      },
    }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useQueryClient: () => queryContext,
  useQuery: ({
    queryFn,
    enabled = true,
  }: {
    queryFn?: () => unknown
    enabled?: boolean
  }) => {
    if (enabled) void queryFn?.()
    return {
      data: undefined,
      error: null,
      isLoading: true,
      isFetching: true,
      isPending: true,
      refetch: vi.fn().mockResolvedValue(undefined),
    }
  },
  useInfiniteQuery: ({
    queryFn,
    enabled = true,
  }: {
    queryFn?: (context: { pageParam?: string }) => unknown
    enabled?: boolean
  }) => {
    if (enabled) void queryFn?.({ pageParam: undefined })
    return {
      data:
        enabled && queryContext.sessionCardList
          ? { pages: [queryContext.sessionCardList] }
          : undefined,
      error: null,
      status: 'pending',
      isLoading: true,
      isFetching: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      refetch: vi.fn().mockResolvedValue(undefined),
      fetchNextPage: vi.fn().mockResolvedValue(undefined),
    }
  },
  useMutation: ({
    mutationFn,
  }: {
    mutationFn?: (value: unknown) => unknown
  }) => ({
    mutate: vi.fn((value: unknown) => mutationFn?.(value)),
    mutateAsync: vi.fn((value: unknown) => mutationFn?.(value)),
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/stores/workspace-store', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const state = {
    sidebarCollapsed: false,
    fileExplorerCollapsed: true,
    chatFocusMode: false,
    activeSubPage: null,
    chatPanelOpen: false,
    chatPanelCardId: 'new',
    activeChatCardId: 'new',
    mobileKeyboardOpen: false,
    mobileKeyboardInset: 0,
    mobileComposerFocused: false,
    toggleSidebar: vi.fn(),
    setSidebarCollapsed: vi.fn(),
    toggleFileExplorer: vi.fn(),
    setFileExplorerCollapsed: vi.fn(),
    toggleChatFocusMode: vi.fn(),
    setChatFocusMode: vi.fn(),
    setActiveSubPage: vi.fn(),
    toggleChatPanel: vi.fn(),
    setChatPanelOpen: vi.fn(),
    setChatPanelCardId: vi.fn(),
    setActiveChatCardId: vi.fn(),
    setMobileKeyboardOpen: vi.fn(),
    setMobileKeyboardInset: vi.fn(),
    setMobileComposerFocused: vi.fn(),
  }
  const mockUseWorkspaceStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  )
  return { ...actual, useWorkspaceStore: mockUseWorkspaceStore }
})

vi.mock('@/hooks/use-settings', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const settings = {
    ...(actual.defaultStudioSettings as Record<string, unknown>),
    showSystemMetricsFooter: false,
    experimentalEchoStudio: false,
  }
  const state = { settings, updateSettings: vi.fn() }
  return {
    ...actual,
    useSettings: () => state,
    useSettingsStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  }
})

vi.mock('@/hooks/use-chat-settings', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const state = {
    settings: {
      displayName: 'User',
      avatarDataUrl: null,
      agentDisplayName: 'Hermes Agent',
      agentAvatarDataUrl: null,
      sidebarHoverExpand: false,
    },
    updateSettings: vi.fn(),
  }
  return {
    ...actual,
    useChatSettingsStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  }
})

vi.mock('@/hooks/use-search-modal', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const state = { isOpen: false, openModal: vi.fn() }
  return {
    ...actual,
    useSearchModal: (selector: (value: typeof state) => unknown) =>
      selector(state),
  }
})

vi.mock('@/screens/chat/session-title-store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSessionTitles: () => ({}),
}))

vi.mock('@/components/settings-dialog', () => ({
  SettingsDialog: () => null,
}))

vi.mock('@/screens/chat/components/providers-dialog', () => ({
  ProvidersDialog: () => null,
}))

vi.mock('@/screens/chat/components/sidebar/session-rename-dialog', () => ({
  SessionRenameDialog: () => null,
}))

vi.mock('@/screens/chat/components/sidebar/session-delete-dialog', () => ({
  SessionDeleteDialog: () => null,
}))

vi.mock('@/screens/chat/components/sidebar/sidebar-sessions', () => ({
  SidebarSessions: ({
    sessionCards,
  }: {
    sessionCards: Array<{ cardId: string; title: string }>
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'sidebar-sessions' },
      sessionCards.map((card) =>
        React.createElement(
          'a',
          { href: `/chat/${card.cardId}`, key: card.cardId },
          card.title,
        ),
      ),
    ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children),
  buttonVariants: () => '',
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipRoot: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({
    children,
    render,
  }: {
    children?: React.ReactNode
    render?: React.ReactElement
  }) => render ?? children,
}))

vi.mock('@/components/ui/menu', () => ({
  MenuRoot: ({ children }: { children: React.ReactNode }) => children,
  MenuTrigger: ({ children }: { children: React.ReactNode }) => children,
  MenuContent: ({ children }: { children: React.ReactNode }) => children,
  MenuItem: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('motion/react', () => {
  const element = (tag: string) =>
    function MotionElement({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) {
      return React.createElement(tag, props, children)
    }
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      aside: element('aside'),
      div: element('div'),
      section: element('section'),
      span: element('span'),
    },
  }
})

vi.mock('@/components/terminal/terminal-workspace', () => ({
  TerminalWorkspace: () => null,
}))

vi.mock('@/components/connection-startup-screen', () => ({
  ConnectionStartupScreen: () => null,
}))

const sessionCardList = {
  cards: [
    {
      cardId: 'remote:root',
      canonicalSource: 'remote',
      title: 'Root Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:tip',
      continuationSegmentKeys: ['remote:root', 'remote:tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 123,
      archived: false,
      pinned: false,
    },
  ],
  cardResolutions: [
    {
      cardId: 'remote:root',
      completeness: 'complete',
      retryable: false,
    },
  ],
  completeness: 'complete',
  retryable: false,
  sources: [],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installDesktopViewport() {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: '(max-width: 767px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
const mountedRoots: Array<() => void> = []

async function mountWorkspaceShell(path: string) {
  routerContext.pathname = path
  routerContext.search = {}
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await React.act(async () => {
    root.render(
      React.createElement(
        WorkspaceShell,
        null,
        React.createElement('div', { 'data-testid': 'chat-route-content' }),
      ),
    )
    await Promise.resolve()
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  queryContext.sessionCardList = undefined
  vi.unstubAllGlobals()
})

describe('workspace shell Session Card cutover', () => {
  it('limits the Card session panel and its endpoint to Chat routes', async () => {
    installDesktopViewport()
    queryContext.sessionCardList = { ...sessionCardList, totalCards: 1 }
    const requestedPaths: Array<string> = []
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString()
      requestedPaths.push(path)

      if (path === '/api/session-cards?view=chat') {
        return jsonResponse({ ...sessionCardList, totalCards: 1 })
      }
      if (path === '/api/session-cards/remote%3Aroot') {
        return jsonResponse({
          card: sessionCardList.cards[0],
          resolution: sessionCardList.cardResolutions[0],
          completeness: sessionCardList.completeness,
          retryable: sessionCardList.retryable,
          sources: sessionCardList.sources,
        })
      }
      if (path === '/api/session-cards') return jsonResponse(sessionCardList)
      if (path === '/api/sessions') {
        return jsonResponse({ sessions: [] })
      }
      if (path === '/api/auth-check') {
        return jsonResponse({ authenticated: true, authRequired: false })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    await mountWorkspaceShell('/dashboard')

    await waitFor(() => {
      expect(screen.queryByLabelText('Session history')).toBeNull()
      expect(screen.queryByTestId('sidebar-sessions')).toBeNull()
    })
    expect(requestedPaths).not.toContain('/api/session-cards?view=chat')
    expect(requestedPaths).not.toContain('/api/session-cards/remote%3Aroot')
    expect(requestedPaths).not.toContain('/api/session-cards')
    expect(requestedPaths).not.toContain('/api/sessions')

    await mountWorkspaceShell('/chat/new')

    await waitFor(() => {
      expect(requestedPaths).toContain('/api/session-cards?view=chat')
      const history = screen.getByLabelText('Session history')
      expect(within(history).getByText('Root Card')).toBeTruthy()
    })
    expect(requestedPaths).not.toContain('/api/session-cards')
    expect(requestedPaths).not.toContain('/api/sessions')
  })
})

describe('workspace shell sidebar backdrop', () => {
  it('only spans the desktop sidebar width, not the full viewport', () => {
    expect(DESKTOP_SIDEBAR_BACKDROP_CLASS).toContain('w-[300px]')
    expect(DESKTOP_SIDEBAR_BACKDROP_CLASS).not.toContain('inset-0')
  })
})

describe('swarm2 navigation alias handling', () => {
  it('keeps /swarm as the only user-visible swarm entry in the mobile hamburger menu', () => {
    const swarm = MOBILE_HAMBURGER_NAV_ITEMS.find((item) => item.id === 'swarm')
    const swarm2 = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'swarm2',
    )

    expect(swarm?.to).toBe('/swarm')
    expect(swarm2).toBeUndefined()
  })

  it('keeps /swarm as the only user-visible swarm tab', () => {
    const swarm = MOBILE_NAV_TABS.find((item) => item.id === 'swarm')
    const swarm2 = MOBILE_NAV_TABS.find((item) => item.id === 'swarm2')

    expect(swarm?.to).toBe('/swarm')
    expect(swarm2).toBeUndefined()
  })
})

describe('Card-native chat navigation', () => {
  it('keeps new as the only static chat bootstrap destination', () => {
    const tab = MOBILE_NAV_TABS.find((item) => item.id === 'chat')
    const hamburger = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'chat',
    )

    expect(tab?.to).toBe('/chat/new')
    expect(hamburger?.to).toBe('/chat/new')
    expect(MOBILE_SWIPE_TAB_ORDER[0]).toBe('/chat/new')
  })

  it('returns to the current stable Card and never emits the retired main alias', () => {
    expect(buildChatCardNavigation('remote:current-card')).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:current-card' },
    })
    expect(buildChatCardNavigation('main')).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'new' },
    })
    expect(normalizeActiveChatCardId('')).toBe('new')
    expect(normalizeActiveChatCardId('main')).toBe('new')
  })

  it('uses a Card route when present and a controlled new bootstrap otherwise', () => {
    expect(resolveShellActiveChatCardId('/chat/remote%3Acard')).toBe(
      'remote:card',
    )
    expect(resolveShellActiveChatCardId('/chat/new')).toBe('new')
    expect(resolveShellActiveChatCardId('/chat/main')).toBe('new')
    expect(resolveShellActiveChatCardId('/dashboard')).toBeNull()
  })

  it('initializes persisted navigation with the controlled new bootstrap', () => {
    expect(useWorkspaceStore.getState().activeChatCardId).toBe('new')
  })
})
