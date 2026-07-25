// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarSessions } from './sidebar-sessions'
import type { SessionLineage, SessionMeta } from '../../types'

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const pinnedState = vi.hoisted(() => ({
  keys: [] as Array<string>,
  toggle: vi.fn<(key: string) => void>(),
  migrate: vi.fn<(fromKey: string, toKey: string) => void>(),
}))

vi.mock('@/hooks/use-pinned-sessions', () => ({
  usePinnedSessions: () => {
    const [pinnedSessionKeys, setPinnedSessionKeys] = React.useState(() => [
      ...pinnedState.keys,
    ])
    return {
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
  },
}))

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
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return {
    container,
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
  pinnedState.keys = []
  pinnedState.toggle.mockReset()
  pinnedState.migrate.mockReset()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('SidebarSessions lineage projection', () => {
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
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Current conversation', {
      parentSessionId: 'root',
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

  it('keeps a pinned continuation as one logical row and unpins its migrated tip key', () => {
    pinnedState.keys = ['root']
    const root = session('root', 'Hidden pinned snapshot', {
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Pinned conversation', {
      parentSessionId: 'root',
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
    expect(pinnedState.toggle).toHaveBeenCalledWith('tip')
  })

  it('persists a cold hidden continuation pin under the only loaded visible tip', async () => {
    pinnedState.keys = ['root']
    const tip = session('tip', 'Pinned conversation', {
      parentSessionId: 'root',
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })

    renderSidebar([tip])

    await waitFor(() =>
      expect(pinnedState.migrate).toHaveBeenCalledWith('root', 'tip'),
    )

    const pinnedSessions = screen.getByRole('region', {
      name: 'Pinned sessions',
    })
    expect(within(pinnedSessions).getByText('Pinned conversation')).toBeTruthy()
    expect(within(pinnedSessions).getByRole('link').getAttribute('href')).toBe(
      '/chat/tip-route',
    )
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

  it('moves a newly pinned nested child into a discrete pinned row without moving its root or siblings', () => {
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

    React.act(() => fireEvent.click(within(childRow!).getByText('Pin session')))

    const pinnedSessions = screen.getByRole('region', {
      name: 'Pinned sessions',
    })
    const normalSessions = screen.getByRole('region', { name: 'Sessions' })
    expect(within(pinnedSessions).getAllByRole('link')).toHaveLength(1)
    expect(within(pinnedSessions).getByText('Pinned child')).toBeTruthy()
    expect(within(pinnedSessions).queryByText('Parent')).toBeNull()
    expect(within(pinnedSessions).queryByText('Unpinned sibling')).toBeNull()
    expect(within(normalSessions).getByText('Parent')).toBeTruthy()
    expect(within(normalSessions).getByText('Unpinned sibling')).toBeTruthy()
    expect(within(normalSessions).queryByText('Pinned child')).toBeNull()
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
      lineageRootId: 'root',
      lineageTipId: 'tip-1',
    })
    const firstTip = session('tip-1', 'First tip', {
      parentSessionId: 'root',
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
      lineageRootId: 'root',
      lineageTipId: 'tip-2',
    })
    const secondTip = session('tip-2', 'Second tip', {
      parentSessionId: 'tip-1',
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
      lineageRootId: 'root',
      lineageTipId: 'tip',
    })
    const tip = session('tip', 'Visible conversation', {
      parentSessionId: 'root',
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

  it('preserves pin, rename, and delete actions for the actual child session', () => {
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
    React.act(() => fireEvent.click(within(childRow).getByText('Pin session')))
    const pinnedChildRow = screen
      .getByRole('region', { name: 'Pinned sessions' })
      .querySelector<HTMLElement>('[data-session-key="child"]')!
    fireEvent.click(within(pinnedChildRow).getByText('Rename'))
    fireEvent.click(within(pinnedChildRow).getByText('Delete'))

    expect(pinnedState.toggle).toHaveBeenCalledWith('child')
    expect(onRename).toHaveBeenCalledWith(child)
    expect(onDelete).toHaveBeenCalledWith(child)
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
