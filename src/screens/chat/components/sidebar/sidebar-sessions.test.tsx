// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarSessions } from './sidebar-sessions'
import type { SessionCard, SessionLineage, SessionMeta } from '../../types'
import type * as PinnedSessions from '@/hooks/use-pinned-sessions'
import { usePinnedSessionsStore } from '@/hooks/use-pinned-sessions'

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const pinnedState = vi.hoisted(() => ({
  keys: [] as Array<string>,
  toggle: vi.fn<(key: string) => void>(),
  migrate: vi.fn<(fromKey: string, toKey: string) => void>(),
  useActual: false,
}))

vi.mock('@/hooks/use-pinned-sessions', async (importOriginal) => {
  const actual = await importOriginal<typeof PinnedSessions>()
  return {
    ...actual,
    usePinnedSessions: () => {
      const actualPinnedSessionKeys = React.useSyncExternalStore(
        actual.usePinnedSessionsStore.subscribe,
        () => actual.usePinnedSessionsStore.getState().pinnedSessionKeys,
        () => actual.usePinnedSessionsStore.getState().pinnedSessionKeys,
      )
      const actualPinnedState = actual.usePinnedSessionsStore.getState()
      const actualPinnedSessions = {
        pinnedSessionKeys: actualPinnedSessionKeys,
        togglePinnedSession: actualPinnedState.togglePinnedSession,
        migratePinnedSession: actualPinnedState.migratePinnedSession,
      }
      const [pinnedSessionKeys, setPinnedSessionKeys] = React.useState(() => [
        ...pinnedState.keys,
      ])
      const mockedPinnedSessions = {
        pinnedSessionKeys,
        togglePinnedSession: (key: string) => {
          pinnedState.toggle(key)
          setPinnedSessionKeys((current) =>
            current.includes(key)
              ? current.filter((currentKey) => currentKey !== key)
              : [...current, key],
          )
        },
        migratePinnedSession: (fromKey: string, toKey: string) => {
          pinnedState.migrate(fromKey, toKey)
          setPinnedSessionKeys((current) =>
            current.includes(fromKey)
              ? [
                  ...new Set(
                    current.map((key) => (key === fromKey ? toKey : key)),
                  ),
                ]
              : current,
          )
        },
      }
      return pinnedState.useActual ? actualPinnedSessions : mockedPinnedSessions
    },
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to: _to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode
    params?: { sessionKey?: string }
    to?: string
  }) => (
    <a href={`/chat/${params?.sessionKey ?? ''}`} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  CollapsiblePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollAreaRoot: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ScrollAreaViewport: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ScrollAreaScrollbar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ScrollAreaThumb: () => <div />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}))

vi.mock('@/components/ui/menu', () => ({
  MenuRoot: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MenuTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  MenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MenuItem: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

function session(
  key: string,
  title: string,
  lineage?: SessionLineage,
  updatedAt = 0,
): SessionMeta {
  return {
    key,
    backendKey: key,
    friendlyId: `${key}-route`,
    title,
    updatedAt,
    ...(lineage ? { lineage } : {}),
  }
}

function renderSidebar(
  sessions: Array<SessionMeta>,
  options: {
    sessionCards?: Array<SessionCard>
    activeFriendlyId?: string
    onRename?: (session: SessionMeta) => void
    onDelete?: (session: SessionMeta) => void
    sessionForkAvailable?: boolean
    forkingSessionKey?: string | null
    onFork?: (session: SessionMeta) => void
    loading?: boolean
    fetching?: boolean
    error?: string | null
  } = {},
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let currentSessions = sessions
  let currentActiveFriendlyId = options.activeFriendlyId ?? ''
  let currentLoading = options.loading ?? false
  let currentFetching = options.fetching ?? false
  let currentError = options.error ?? null
  const renderCurrent = () => {
    React.act(() => {
      root.render(
        <SidebarSessions
          sessions={currentSessions}
          sessionCards={options.sessionCards}
          activeFriendlyId={currentActiveFriendlyId}
          onRename={options.onRename ?? vi.fn()}
          onDelete={options.onDelete ?? vi.fn()}
          sessionForkAvailable={options.sessionForkAvailable}
          forkingSessionKey={options.forkingSessionKey}
          onFork={options.onFork}
          loading={currentLoading}
          fetching={currentFetching}
          error={currentError}
          onRetry={vi.fn()}
        />,
      )
    })
  }
  renderCurrent()
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    React.act(() => root.unmount())
    container.remove()
  }
  mountedRoots.push(unmount)
  return {
    container,
    unmount,
    rerenderWithActiveSession(activeFriendlyId: string) {
      currentActiveFriendlyId = activeFriendlyId
      renderCurrent()
    },
    rerenderWithSessions(nextSessions: Array<SessionMeta>) {
      currentSessions = nextSessions
      renderCurrent()
    },
    rerenderWithRefreshState(next: {
      loading?: boolean
      fetching?: boolean
      error?: string | null
    }) {
      if (next.loading !== undefined) currentLoading = next.loading
      if (next.fetching !== undefined) currentFetching = next.fetching
      if (next.error !== undefined) currentError = next.error
      renderCurrent()
    },
  }
}

const mountedRoots: Array<() => void> = []

beforeEach(() => {
  localStorage.clear()
  usePinnedSessionsStore.setState({ pinnedSessionKeys: [] })
  pinnedState.keys = []
  pinnedState.toggle.mockReset()
  pinnedState.migrate.mockReset()
  pinnedState.useActual = false
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('SidebarSessions lineage projection', () => {
  it('renders one parent Card with nested inspectable children and no continuation or child menus', () => {
    const hidden = session('root', 'Hidden snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Legacy tip title', {
      parentSessionId: 'root',
      source: 'cli',
      startedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
      compressionSegmentCount: 2,
    })
    const child = session('delegate', 'Legacy delegate title', {
      parentSessionId: 'tip',
      relationshipType: 'child_session',
    })
    const card: SessionCard = {
      cardId: 'root',
      title: 'Project planning',
      titleSource: 'manual',
      canonicalSegmentKey: 'tip',
      continuationSegmentKeys: ['root', 'tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [
        {
          cardId: 'delegate',
          sessionKey: 'delegate',
          relationshipKind: 'child',
          title: 'Research delegate',
          status: 'running',
          updatedAt: 30,
          continuationCount: 1,
        },
      ],
      updatedAt: 40,
      archived: false,
      pinned: false,
    }

    renderSidebar([hidden, tip, child], {
      sessionCards: [card],
      activeFriendlyId: child.friendlyId,
    })

    const parentCard = screen
      .getByText('Project planning')
      .closest<HTMLElement>('[data-card-id="root"]')
    const childNode = screen
      .getByText('Research delegate')
      .closest<HTMLElement>('[data-card-child-id="delegate"]')
    expect(parentCard).toBeTruthy()
    expect(childNode).toBeTruthy()
    expect(screen.queryByText('Hidden snapshot')).toBeNull()
    expect(screen.queryByText('Legacy tip title')).toBeNull()
    expect(screen.getByText('Continued · 2 segments')).toBeTruthy()
    expect(
      within(parentCard!).getAllByRole('button', { name: 'Card options' }),
    ).toHaveLength(1)
    expect(
      within(childNode!).queryByRole('button', { name: 'Card options' }),
    ).toBeNull()
    expect(within(childNode!).getByText(/running/i)).toBeTruthy()
    expect(within(childNode!).getByRole('link').getAttribute('href')).toBe(
      '/chat/root',
    )
    expect(
      within(parentCard!)
        .getByRole('link', { name: /Project planning/i })
        .getAttribute('aria-current'),
    ).toBe('page')
  })

  it('renders a pinned Card as a whole Card without independently pinning its child', () => {
    const parent = session('parent', 'Legacy parent')
    const child = session('child', 'Legacy child', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
    })
    const card: SessionCard = {
      cardId: 'parent',
      title: 'Pinned project',
      titleSource: 'manual',
      canonicalSegmentKey: 'parent',
      continuationSegmentKeys: ['parent'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [
        {
          cardId: 'child',
          sessionKey: 'child',
          relationshipKind: 'child',
          title: 'Nested delegate',
          status: 'complete',
          updatedAt: 10,
          continuationCount: 1,
        },
      ],
      updatedAt: 20,
      archived: false,
      pinned: true,
    }

    renderSidebar([parent, child], { sessionCards: [card] })

    const pinned = screen.getByRole('region', { name: 'Pinned sessions' })
    expect(within(pinned).getByText('Pinned project')).toBeTruthy()
    const childNode = within(pinned)
      .getByText('Nested delegate')
      .closest<HTMLElement>('[data-card-child-id="child"]')
    expect(childNode).toBeTruthy()
    expect(
      within(childNode!).queryByText(/Pin session|Unpin session/),
    ).toBeNull()
    expect(screen.queryByRole('region', { name: 'Sessions' })).toBeNull()
  })

  it('shows whole-conversation branching only for supported eligible remote sessions', () => {
    const onFork = vi.fn()
    const remote = session('remote-parent', 'Remote parent')

    renderSidebar([remote], {
      sessionForkAvailable: true,
      onFork,
    })

    const action = screen.getByRole('button', {
      name: 'Branch conversation',
    })
    React.act(() => fireEvent.click(action))
    expect(onFork).toHaveBeenCalledTimes(1)
    expect(onFork).toHaveBeenCalledWith(remote)
  })

  it.each(['local', 'portable'] as const)(
    'omits branching for %s sessions without activating a mutation',
    (source) => {
      const onFork = vi.fn()
      renderSidebar([session(source, `${source} session`, { source })], {
        sessionForkAvailable: true,
        onFork,
      })

      expect(screen.queryByText('Branch conversation')).toBeNull()
      expect(onFork).not.toHaveBeenCalled()
    },
  )

  it('omits branching when support is unconfirmed', () => {
    const onFork = vi.fn()
    const unsupported = session('unsupported', 'Unsupported')

    renderSidebar([unsupported], {
      sessionForkAvailable: false,
      onFork,
    })

    expect(screen.queryByText('Branch conversation')).toBeNull()
    expect(onFork).not.toHaveBeenCalled()
  })

  it('omits branching when the authoritative backend key is absent', () => {
    const onFork = vi.fn()
    const routeOnly = {
      ...session('route-only', 'Route only'),
      backendKey: undefined,
    }

    renderSidebar([routeOnly], {
      sessionForkAvailable: true,
      onFork,
    })

    expect(screen.queryByText('Branch conversation')).toBeNull()
    expect(onFork).not.toHaveBeenCalled()
  })

  it('disables duplicate activation while the session fork is pending', () => {
    const onFork = vi.fn()
    renderSidebar([session('pending', 'Pending')], {
      sessionForkAvailable: true,
      forkingSessionKey: 'pending',
      onFork,
    })

    const action = screen.getByRole('button', {
      name: 'Branch conversation',
    })
    expect((action as HTMLButtonElement).disabled).toBe(true)
    React.act(() => fireEvent.click(action))
    expect(onFork).not.toHaveBeenCalled()
  })

  it('renders one logical continuation row with an accessible segment count', () => {
    const root = session('root', 'Hidden snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Current conversation', {
      parentSessionId: 'root',
      source: 'cli',
      startedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
      compressionSegmentCount: 2,
    })

    renderSidebar([root, tip])

    expect(screen.getAllByText('Current conversation')).toHaveLength(1)
    expect(screen.queryByText('Hidden snapshot')).toBeNull()
    expect(screen.getByText('Continued · 2 segments')).toBeTruthy()
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByRole('treeitem')).toBeNull()
  })

  it('keeps a pinned continuation under its stable Card ID', () => {
    pinnedState.keys = ['root']
    const root = session('root', 'Hidden pinned snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Pinned conversation', {
      parentSessionId: 'root',
      source: 'cli',
      startedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })

    renderSidebar([root, tip])

    const pinnedSessions = screen.getByRole('region', {
      name: 'Pinned sessions',
    })
    expect(within(pinnedSessions).getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByText('Hidden pinned snapshot')).toBeNull()
    React.act(() =>
      fireEvent.click(within(pinnedSessions).getByText('Unpin session')),
    )
    expect(pinnedState.toggle).toHaveBeenCalledWith('root')
  })

  it('keeps a cold hidden continuation pin under the stable Card ID', async () => {
    pinnedState.keys = ['root']
    const tip = session('tip', 'Pinned conversation', {
      parentSessionId: 'root',
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })

    renderSidebar([tip])

    await React.act(async () => Promise.resolve())
    expect(pinnedState.migrate).not.toHaveBeenCalled()

    const pinnedSessions = screen.getByRole('region', {
      name: 'Pinned sessions',
    })
    expect(within(pinnedSessions).getByText('Pinned conversation')).toBeTruthy()
    expect(within(pinnedSessions).getByRole('link').getAttribute('href')).toBe(
      '/chat/tip-route',
    )
  })

  it('keeps a persisted Card pin through a second cold continuation generation', async () => {
    pinnedState.useActual = true
    usePinnedSessionsStore.getState().pinSession('root')
    const root = session('root', 'Original snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip-1',
    })
    const firstTip = session('tip-1', 'First continuation', {
      parentSessionId: 'root',
      source: 'cli',
      startedAt: 100,
      endReason: 'compression',
      endedAt: 200,
      lineageRootId: 'root',
      lineageTipId: 'tip-1',
      compressionSegmentCount: 2,
    })

    const firstMount = renderSidebar([root, firstTip])
    await waitFor(() =>
      expect(usePinnedSessionsStore.getState().pinnedSessionKeys).toEqual([
        'root',
      ]),
    )
    firstMount.unmount()

    const secondTip = session('tip-2', 'Second continuation', {
      parentSessionId: 'root',
      relationshipType: 'continuation',
      source: 'cli',
      startedAt: 200,
      lineageRootId: 'root',
      lineageTipId: 'tip-2',
      compressionSegmentCount: 3,
      parentLineageRootId: 'root',
      parentLineageTipId: 'tip-1',
    })
    renderSidebar([secondTip])

    await waitFor(() =>
      expect(usePinnedSessionsStore.getState().pinnedSessionKeys).toEqual([
        'root',
      ]),
    )
    expect(
      JSON.parse(localStorage.getItem('pinned-sessions') ?? '{}'),
    ).toMatchObject({ state: { pinnedSessionKeys: ['root'] } })
    expect(
      within(screen.getByRole('region', { name: 'Pinned sessions' })).getByText(
        'Second continuation',
      ),
    ).toBeTruthy()
  })

  it('does not migrate a stale hidden pin when refresh fails', async () => {
    pinnedState.keys = ['root']
    const staleTip = session('tip', 'Cached conversation', {
      parentSessionId: 'root',
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const view = renderSidebar([staleTip], { fetching: true })

    view.rerenderWithRefreshState({
      fetching: false,
      error: 'refresh failed',
    })
    await React.act(async () => Promise.resolve())

    expect(screen.getByText('Failed to load sessions.')).toBeTruthy()
    expect(pinnedState.migrate).not.toHaveBeenCalled()
  })

  it('keeps nested children within the parent Card and gives them no pin action', () => {
    const parent = session('parent', 'Parent')
    const child = session('child', 'Pinned child', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
    })
    const sibling = session('sibling', 'Unpinned sibling', {
      parentSessionId: 'parent',
      sessionSource: 'fork',
    })

    renderSidebar([parent, child, sibling])
    const childRow = screen
      .getByText('Pinned child')
      .closest<HTMLElement>('[data-session-key="child"]')
    expect(childRow).toBeTruthy()

    const normalSessions = screen.getByRole('region', { name: 'Sessions' })
    expect(
      within(childRow!).queryByText(/Pin session|Unpin session/),
    ).toBeNull()
    expect(screen.queryByRole('region', { name: 'Pinned sessions' })).toBeNull()
    expect(within(normalSessions).getByText('Parent')).toBeTruthy()
    expect(within(normalSessions).getByText('Unpinned sibling')).toBeTruthy()
    expect(within(normalSessions).getByText('Pinned child')).toBeTruthy()
  })

  it('renders branches and delegated children beneath their parent and links each child to its own route', () => {
    const parent = session('parent', 'Parent', undefined, 30)
    const branch = session(
      'branch',
      'Branch work',
      { parentSessionId: 'parent', sessionSource: 'fork' },
      20,
    )
    const child = session(
      'child',
      'Delegated work',
      {
        parentSessionId: 'branch',
        relationshipType: 'child_session',
      },
      10,
    )

    renderSidebar([parent, branch, child], {
      activeFriendlyId: child.friendlyId,
    })

    const parentRow = screen
      .getByText('Parent')
      .closest<HTMLElement>('[data-session-key="parent"]')!
    const branchRow = screen
      .getByText('Branch work')
      .closest<HTMLElement>('[data-session-key="branch"]')!
    const childRow = screen
      .getByText('Delegated work')
      .closest<HTMLElement>('[data-session-key="child"]')!

    expect(parentRow.getAttribute('data-session-depth')).toBe('0')
    expect(branchRow.getAttribute('data-session-depth')).toBe('1')
    expect(childRow.getAttribute('data-session-depth')).toBe('2')
    expect(within(branchRow).getByText('Branch')).toBeTruthy()
    expect(within(childRow).getByText('Delegated session')).toBeTruthy()
    expect(within(childRow).getByRole('link').getAttribute('href')).toBe(
      '/chat/child-route',
    )
  })

  it('keeps an orphan visible at top level with unavailable-parent context', () => {
    renderSidebar([
      session('orphan', 'Still available', {
        parentSessionId: 'missing',
        relationshipType: 'child_session',
      }),
    ])

    const orphan = screen
      .getByText('Still available')
      .closest<HTMLElement>('[data-session-key="orphan"]')!
    expect(orphan.getAttribute('data-session-depth')).toBe('0')
    expect(
      within(orphan).getByText('Original session unavailable'),
    ).toBeTruthy()
  })

  it('reopens collapsed ancestors when their active child would otherwise be hidden', () => {
    const parent = session('parent', 'Parent')
    const child = session('child', 'Active child', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
    })
    const { rerenderWithActiveSession } = renderSidebar([parent, child])
    const disclosure = screen.getByRole('button', {
      name: /Collapse related sessions for parent-route/i,
    })

    React.act(() => fireEvent.click(disclosure))
    expect(screen.queryByText('Active child')).toBeNull()

    rerenderWithActiveSession(child.friendlyId)
    expect(screen.getByText('Active child')).toBeTruthy()
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps a logical conversation collapsed when a newer continuation tip replaces the visible row', () => {
    const root = session('root', 'Snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip-1',
    })
    const firstTip = session('tip-1', 'First tip', {
      parentSessionId: 'root',
      source: 'cli',
      startedAt: 100,
      endReason: 'compression',
      endedAt: 200,
      lineageRootId: 'root',
      lineageTipId: 'tip-1',
      compressionSegmentCount: 2,
    })
    const child = session('child', 'Related child', {
      parentSessionId: 'root',
      relationshipType: 'child_session',
    })
    const { rerenderWithSessions } = renderSidebar([root, firstTip, child])

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', {
          name: /Collapse related sessions for tip-1-route/i,
        }),
      ),
    )
    expect(screen.queryByText('Related child')).toBeNull()

    const updatedRoot = session('root', 'Snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip-2',
    })
    const secondTip = session('tip-2', 'Second tip', {
      parentSessionId: 'tip-1',
      source: 'cli',
      startedAt: 200,
      lineageRootId: 'root',
      lineageTipId: 'tip-2',
      compressionSegmentCount: 3,
    })
    rerenderWithSessions([updatedRoot, firstTip, secondTip, child])

    expect(screen.getByText('Second tip')).toBeTruthy()
    expect(screen.queryByText('Related child')).toBeNull()
    expect(
      screen
        .getByRole('button', {
          name: /Expand related sessions for tip-2-route/i,
        })
        .getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('marks the visible continuation tip active when the active route is an older compressed segment', () => {
    const root = session('root', 'Older active snapshot', {
      source: 'cli',
      endReason: 'compression',
      endedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Visible conversation', {
      parentSessionId: 'root',
      source: 'cli',
      startedAt: 100,
      lineageRootId: 'root',
      lineageTipId: 'tip',
      compressionSegmentCount: 2,
    })

    renderSidebar([root, tip], { activeFriendlyId: root.friendlyId })

    expect(
      screen
        .getByRole('link', { name: /Visible conversation/i })
        .getAttribute('aria-current'),
    ).toBe('page')
  })

  it('does not expose pin, rename, or delete actions on child inspection rows', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const parent = session('parent', 'Parent')
    const child = session('child', 'Child', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
    })

    renderSidebar([parent, child], { onRename, onDelete })

    const childRow = screen
      .getByText('Child')
      .closest<HTMLElement>('[data-session-key="child"]')!
    expect(within(childRow).queryByText(/Pin session|Unpin session/)).toBeNull()
    expect(within(childRow).queryByText('Rename')).toBeNull()
    expect(within(childRow).queryByText('Delete')).toBeNull()
    expect(pinnedState.toggle).not.toHaveBeenCalled()
    expect(onRename).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('retains the existing flat-list appearance and routes when no hierarchy exists', () => {
    const first = session('first', 'First session', undefined, 20)
    const second = session('second', 'Second session', undefined, 10)

    renderSidebar([first, second])

    expect(
      screen.queryByText(/Continued|Branch|Delegated session|unavailable/),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /related sessions/i }),
    ).toBeNull()
    expect(
      screen.getByText('First session').closest('a')?.getAttribute('href'),
    ).toBe('/chat/first-route')
    expect(
      screen.getByText('Second session').closest('a')?.getAttribute('href'),
    ).toBe('/chat/second-route')
  })

  it('does not claim ARIA tree semantics without tree keyboard navigation', () => {
    const parent = session('parent', 'Parent')
    const child = session('child', 'Child', {
      parentSessionId: 'parent',
      relationshipType: 'child_session',
    })

    renderSidebar([parent, child])

    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByRole('treeitem')).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: /Collapse related sessions/i }),
    ).toBeTruthy()
  })
})
