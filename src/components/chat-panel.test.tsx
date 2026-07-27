// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatPanel } from './chat-panel'
import type { SessionCard } from '@/screens/chat/types'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  chatScreenProps: [] as Array<Record<string, unknown>>,
  queryOptions: undefined as
    | { queryFn: () => Promise<SessionCardListWire> }
    | undefined,
  queryState: {} as {
    status: 'pending' | 'error' | 'success'
    data?: SessionCardListWire
    isPending: boolean
    refetch: ReturnType<typeof vi.fn>
  },
  queryClient: {
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  },
  workspaceState: {
    chatPanelOpen: true,
    chatPanelCardId: 'remote:parent-card',
    setChatPanelOpen: vi.fn(),
    setChatPanelCardId: vi.fn(),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryFn: () => Promise<SessionCardListWire> }) => {
    mocks.queryOptions = options
    return mocks.queryState
  },
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: (
    selector: (state: typeof mocks.workspaceState) => unknown,
  ) => selector(mocks.workspaceState),
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string
    variant?: string
  }) => <button {...props}>{children}</button>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipRoot: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({
    onClick,
    render,
  }: {
    onClick?: () => void
    render: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={render.props['aria-label']}
      disabled={render.props.disabled}
    >
      {render.props.children}
    </button>
  ),
}))

vi.mock('@/screens/chat/chat-screen', () => ({
  ChatScreen: (props: Record<string, unknown>) => {
    mocks.chatScreenProps.push(props)
    return <div data-testid="chat-screen" />
  },
}))

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function card(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'remote:parent-card',
    canonicalSource: 'remote',
    title: 'Parent Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:parent-tip',
    continuationSegmentKeys: ['remote:parent-card', 'remote:parent-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: 3,
    archived: false,
    pinned: false,
    ...overrides,
  }
}

function wire(
  cards: Array<SessionCard>,
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  return {
    cards,
    cardResolutions: cards.map((sessionCard) => ({
      cardId: sessionCard.cardId,
      completeness,
      retryable: completeness === 'incomplete',
    })),
    completeness,
    retryable: completeness === 'incomplete',
    sources:
      completeness === 'incomplete'
        ? [
            {
              source: 'gateway',
              status: 'incomplete',
              fetched: cards.length,
              retryable: true,
              reason: 'safe-cap',
            },
          ]
        : [],
  }
}

function response(body: SessionCardListWire) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const mountedRoots: Array<() => void> = []

function renderPanel() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(<ChatPanel />))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.chatScreenProps.length = 0
  mocks.queryOptions = undefined
  mocks.queryClient.getQueryData.mockReset()
  mocks.queryClient.setQueryData.mockReset()
  mocks.queryClient.removeQueries.mockReset()
  mocks.queryClient.invalidateQueries.mockReset()
  mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
  mocks.queryState = {
    status: 'pending',
    data: undefined,
    isPending: true,
    refetch: vi.fn(),
  }
  mocks.workspaceState.chatPanelOpen = true
  mocks.workspaceState.chatPanelCardId = 'remote:parent-card'
  mocks.workspaceState.setChatPanelOpen.mockReset()
  mocks.workspaceState.setChatPanelOpen.mockImplementation((open: boolean) => {
    mocks.workspaceState.chatPanelOpen = open
  })
  mocks.workspaceState.setChatPanelCardId.mockReset()
  mocks.workspaceState.setChatPanelCardId.mockImplementation(
    (cardId: string) => {
      mocks.workspaceState.chatPanelCardId = cardId
    },
  )
  window.localStorage.clear()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('ChatPanel Card routing', () => {
  it('renders the selected authoritative Card and expands only by cardId', async () => {
    const parent = card()
    const other = card({
      cardId: 'remote:other-card',
      title: 'Other Card',
      canonicalSegmentKey: 'remote:other-tip',
      continuationSegmentKeys: ['remote:other-card', 'remote:other-tip'],
    })
    const list = wire([parent, other])
    mocks.queryState = {
      status: 'success',
      data: list,
      isPending: false,
      refetch: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue(response(list))
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    expect(screen.getByTestId('chat-screen')).toBeTruthy()
    const props = mocks.chatScreenProps.at(-1)
    expect(props).toMatchObject({
      activeFriendlyId: parent.cardId,
      activeCard: parent,
      sessionCardList: expect.objectContaining({ cards: [parent, other] }),
      compact: true,
      embedded: true,
    })
    expect(props).not.toHaveProperty('inspectedChildCardId')

    await expect(mocks.queryOptions?.queryFn()).resolves.toEqual(list)
    expect(fetchMock).toHaveBeenCalledWith('/api/session-cards')
    expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(
      /\/api\/(sessions|history)/,
    )

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand to full chat' }),
      ),
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: parent.cardId },
    })
  })

  it('switches by stable parent cardId and renders Card-native titles', () => {
    const parent = card()
    const other = card({
      cardId: 'remote:other-card',
      title: 'Other Card',
      canonicalSegmentKey: 'remote:other-tip',
      continuationSegmentKeys: ['remote:other-card', 'remote:other-tip'],
    })
    mocks.queryState = {
      status: 'success',
      data: wire([parent, other]),
      isPending: false,
      refetch: vi.fn(),
    }

    renderPanel()
    React.act(() => fireEvent.click(screen.getByText('Parent Card')))
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Open Other Card' })),
    )

    expect(mocks.workspaceState.chatPanelCardId).toBe(other.cardId)
    expect(mocks.chatScreenProps.at(-1)?.activeCard).toEqual(other)
    expect(screen.getByText('Other Card')).toBeTruthy()
  })

  it('mounts one complete and one incomplete Card but exposes only the complete Card', () => {
    const complete = card()
    const incomplete = card({
      cardId: 'remote:incomplete-card',
      title: 'Incomplete Card',
      canonicalSegmentKey: 'remote:incomplete-tip',
      continuationSegmentKeys: [
        'remote:incomplete-card',
        'remote:incomplete-tip',
      ],
    })
    const list = wire([complete, incomplete])
    list.cardResolutions[1] = {
      cardId: incomplete.cardId,
      completeness: 'incomplete',
      retryable: true,
    }
    mocks.queryState = {
      status: 'success',
      data: list,
      isPending: false,
      refetch: vi.fn(),
    }

    renderPanel()
    React.act(() => fireEvent.click(screen.getByText(complete.title)))

    expect(
      screen.getByRole('button', { name: `Open ${complete.title}` }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: `Open ${incomplete.title}` }),
    ).toBeNull()
    expect(mocks.chatScreenProps.at(-1)?.sessionCardList).toEqual(
      expect.objectContaining({
        cards: [complete],
        cardResolutions: [list.cardResolutions[0]],
      }),
    )
  })

  it('fails closed for incomplete projections', async () => {
    const list = wire([card()], 'incomplete')
    mocks.queryState = {
      status: 'success',
      data: list,
      isPending: false,
      refetch: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue(response(list))
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    expect(
      screen.getByRole('heading', { name: 'Conversation unavailable' }),
    ).toBeTruthy()
    expect(screen.queryByTestId('chat-screen')).toBeNull()
    expect(screen.getByText(/projection is incomplete/i)).toBeTruthy()
    await expect(mocks.queryOptions?.queryFn()).resolves.toEqual(list)
    expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(
      /\/api\/(sessions|history)/,
    )
  })

  it('does not interpret an unmapped persisted value as a raw session route', () => {
    mocks.workspaceState.chatPanelCardId = 'legacy-friendly-id'
    mocks.queryState = {
      status: 'success',
      data: wire([card()]),
      isPending: false,
      refetch: vi.fn(),
    }

    renderPanel()

    expect(
      screen.getByRole('heading', { name: 'Conversation unavailable' }),
    ).toBeTruthy()
    expect(screen.queryByTestId('chat-screen')).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('resolves a persisted authoritative Card ID and expands by cardId', () => {
    mocks.workspaceState.chatPanelCardId = 'remote:main-card'
    const mainCard = card({
      cardId: 'remote:main-card',
      canonicalSegmentKey: 'remote:main-tip',
      continuationSegmentKeys: ['remote:main-card', 'remote:main-tip'],
    })
    mocks.queryState = {
      status: 'success',
      data: wire([mainCard]),
      isPending: false,
      refetch: vi.fn(),
    }

    renderPanel()

    expect(mocks.workspaceState.setChatPanelCardId).not.toHaveBeenCalled()
    expect(mocks.chatScreenProps.at(-1)).toMatchObject({
      activeFriendlyId: mainCard.cardId,
      activeCard: mainCard,
      isNewChat: false,
    })
    expect(mocks.chatScreenProps.at(-1)?.onSessionResolved).toBeUndefined()
    expect(screen.queryByText('Main Chat')).toBeNull()

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand to full chat' }),
      ),
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: mainCard.cardId },
    })
    expect(mocks.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { sessionKey: 'main' } }),
    )
  })

  it('fails closed when main has no Card in the complete projection', () => {
    mocks.workspaceState.chatPanelCardId = 'main'
    mocks.queryState = {
      status: 'success',
      data: wire([card()]),
      isPending: false,
      refetch: vi.fn(),
    }

    renderPanel()

    expect(
      screen.getByRole('heading', { name: 'Conversation unavailable' }),
    ).toBeTruthy()
    expect(
      screen.getByText(/not present in the validated Session Card list/i),
    ).toBeTruthy()
    expect(screen.queryByTestId('chat-screen')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Expand to full chat' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(mocks.workspaceState.setChatPanelCardId).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'pending',
      queryState: {
        status: 'pending' as const,
        data: undefined,
        isPending: true,
        refetch: vi.fn(),
      },
      expectedState: /resolving conversation/i,
    },
    {
      name: 'failed',
      queryState: {
        status: 'error' as const,
        data: undefined,
        isPending: false,
        refetch: vi.fn(),
      },
      expectedState: /validated Session Card list could not be loaded/i,
    },
    {
      name: 'incomplete',
      queryState: {
        status: 'success' as const,
        data: wire([card({ canonicalSegmentKey: 'main' })], 'incomplete'),
        isPending: false,
        refetch: vi.fn(),
      },
      expectedState: /validated Session Card projection is incomplete/i,
    },
  ])(
    'keeps main non-interactive while Card resolution is $name',
    ({ queryState, expectedState }) => {
      mocks.workspaceState.chatPanelCardId = 'main'
      mocks.queryState = queryState

      renderPanel()

      expect(screen.getByText(expectedState)).toBeTruthy()
      expect(screen.queryByTestId('chat-screen')).toBeNull()
      expect(
        screen
          .getByRole('button', { name: 'Expand to full chat' })
          .hasAttribute('disabled'),
      ).toBe(true)
      expect(mocks.workspaceState.setChatPanelCardId).not.toHaveBeenCalled()
      expect(mocks.navigate).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      name: 'pending',
      queryState: {
        status: 'pending' as const,
        data: undefined,
        isPending: true,
        refetch: vi.fn(),
      },
      expectedState: /resolving conversation/i,
    },
    {
      name: 'failed',
      queryState: {
        status: 'error' as const,
        data: undefined,
        isPending: false,
        refetch: vi.fn(),
      },
      expectedState: /conversation unavailable/i,
    },
    {
      name: 'unmapped in a complete projection',
      queryState: {
        status: 'success' as const,
        data: wire([]),
        isPending: false,
        refetch: vi.fn(),
      },
      expectedState: /resolving conversation/i,
    },
  ])(
    'does not render an interactive raw chat while post-bootstrap Card mapping is $name',
    ({ queryState, expectedState }) => {
      mocks.workspaceState.chatPanelCardId = 'new'
      mocks.queryState = queryState

      renderPanel()

      const bootstrapProps = mocks.chatScreenProps.at(-1)
      expect(screen.getByTestId('chat-screen')).toBeTruthy()
      expect(bootstrapProps).toMatchObject({
        activeFriendlyId: 'new',
        activeCard: undefined,
        isNewChat: true,
      })

      React.act(() => {
        const onSessionResolved = bootstrapProps?.onSessionResolved as
          | ((payload: {
              fromSessionKey: string
              friendlyId: string
              sessionKey: string
              reason: 'bootstrap'
            }) => void)
          | undefined
        onSessionResolved?.({
          fromSessionKey: 'new',
          friendlyId: 'remote:created-root',
          sessionKey: 'remote:created-tip',
          reason: 'bootstrap',
        })
      })

      expect(screen.queryByTestId('chat-screen')).toBeNull()
      expect(screen.getByText(expectedState)).toBeTruthy()
      React.act(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Retry' })),
      )
      expect(queryState.refetch).toHaveBeenCalledOnce()
      expect(mocks.chatScreenProps).toHaveLength(1)
      expect(mocks.navigate).not.toHaveBeenCalled()
    },
  )

  it('keeps new as an explicit bootstrap and recovers to its authoritative Card', async () => {
    mocks.workspaceState.chatPanelCardId = 'new'
    const created = card({
      cardId: 'remote:created-card',
      canonicalSegmentKey: 'remote:created-tip',
      continuationSegmentKeys: ['remote:created-card', 'remote:created-tip'],
    })
    mocks.queryState = {
      status: 'success',
      data: wire([]),
      isPending: false,
      refetch: vi.fn(),
    }
    mocks.queryClient.invalidateQueries.mockImplementation(() => {
      mocks.queryState.data = wire([created])
      return Promise.resolve()
    })
    const fetchMock = vi.fn().mockResolvedValue(response(wire([])))
    vi.stubGlobal('fetch', fetchMock)

    renderPanel()

    const bootstrapProps = mocks.chatScreenProps.at(-1)
    expect(bootstrapProps).toMatchObject({
      activeFriendlyId: 'new',
      isNewChat: true,
      activeCard: undefined,
      sessionCardList: expect.objectContaining({ cards: [] }),
      compact: true,
      embedded: true,
    })
    await expect(mocks.queryOptions?.queryFn()).resolves.toEqual(wire([]))
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/session-cards',
    ])

    React.act(() => {
      const onSessionResolved = bootstrapProps?.onSessionResolved as
        | ((payload: {
            fromSessionKey: string
            friendlyId: string
            sessionKey: string
            reason: 'bootstrap'
          }) => void)
        | undefined
      onSessionResolved?.({
        fromSessionKey: 'new',
        friendlyId: 'remote:created-root',
        sessionKey: 'remote:created-tip',
        reason: 'bootstrap',
      })
    })

    await waitFor(() =>
      expect(mocks.workspaceState.chatPanelCardId).toBe(created.cardId),
    )
    expect(mocks.chatScreenProps.at(-1)?.activeCard).toEqual(created)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['chat', 'session-cards', 'list', false],
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
