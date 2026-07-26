// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatHeader } from './chat-header'
import type { SessionCard, SessionLineage, SessionMeta } from '../types'

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const navigateToSession = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to: _to,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode
    params?: { sessionKey?: string }
    to?: string
  }) => (
    <a
      href={`/chat/${params?.sessionKey ?? ''}`}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
        navigateToSession(params?.sessionKey)
      }}
    >
      {children}
    </a>
  ),
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@/components/mobile-hamburger-menu', () => ({
  openHamburgerMenu: vi.fn(),
}))

function session(
  key: string,
  title: string,
  lineage?: SessionLineage,
): SessionMeta {
  return {
    key,
    friendlyId: `${key}-route`,
    title,
    ...(lineage ? { lineage } : {}),
  }
}

function mockViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(max-width: 767px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  mockViewport(true)
  navigateToSession.mockClear()
})

const mountedRoots: Array<() => void> = []

function renderHeader(header: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(header))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('ChatHeader active lineage context', () => {
  it('shows the parent Card title and a back-to-parent control while inspecting a child', () => {
    const parent = session('parent', 'Legacy parent')
    const child = session('child', 'Legacy child')
    const card: SessionCard = {
      cardId: 'parent',
      title: 'Project planning',
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
          title: 'Research delegate',
          status: 'running',
          updatedAt: 10,
          continuationCount: 1,
        },
      ],
      updatedAt: 20,
      archived: false,
      pinned: false,
    }
    const onSelectSession = vi.fn()

    renderHeader(
      <ChatHeader
        activeTitle="Legacy child"
        sessions={[parent, child]}
        sessionCards={[card]}
        activeFriendlyId={child.friendlyId}
        onSelectSession={onSelectSession}
        onOpenSessions={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Switch session' }).textContent,
    ).toContain('Project planning')
    const back = screen.getByRole('link', {
      name: 'Back to parent conversation',
    })
    expect(back.getAttribute('href')).toBe('/chat/parent-route')
    fireEvent.click(back)
    expect(navigateToSession).toHaveBeenCalledWith(parent.friendlyId)
    expect(onSelectSession).not.toHaveBeenCalled()
  })

  it.each([
    ['branch', { parentSessionId: 'parent', sessionSource: 'fork' }],
    [
      'delegated',
      { parentSessionId: 'parent', relationshipType: 'child_session' },
    ],
  ] as const)(
    'links an active %s session to its parent without invoking transcript callbacks',
    (_kind, lineage) => {
      const parent = session('parent', 'Parent conversation')
      const active = session('active', 'Active work', lineage)
      const onSelectSession = vi.fn()
      const onRefresh = vi.fn()

      renderHeader(
        <ChatHeader
          activeTitle="Active work"
          sessions={[parent, active]}
          activeFriendlyId={active.friendlyId}
          onSelectSession={onSelectSession}
          onRefresh={onRefresh}
          onOpenSessions={vi.fn()}
        />,
      )

      const titleButton = screen.getByRole('button', { name: 'Switch session' })
      expect(titleButton.textContent).toContain('Parent conversation')
      const parentLink = screen.getByRole('link', {
        name: 'Back to parent conversation',
      })
      expect(titleButton.parentElement).toContain(parentLink)
      expect(parentLink.getAttribute('href')).toBe('/chat/parent-route')
      fireEvent.click(parentLink)
      expect(onSelectSession).not.toHaveBeenCalled()
      expect(onRefresh).not.toHaveBeenCalled()
    },
  )

  it('shows only logical segment status for a continuation', () => {
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

    renderHeader(
      <ChatHeader
        activeTitle="Current conversation"
        sessions={[root, tip]}
        activeFriendlyId={tip.friendlyId}
        onOpenSessions={vi.fn()}
      />,
    )

    expect(screen.getByText('2 segments')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /parent session/i })).toBeNull()
    expect(screen.queryByText(/Parent:/)).toBeNull()
  })

  it('closes and resets the desktop session popover when opening the parent', () => {
    mockViewport(false)
    const parent = session('parent', 'Parent conversation')
    const active = session('active', 'Active work', {
      parentSessionId: 'parent',
      sessionSource: 'fork',
    })
    const filtered = session('filtered', 'Filtered conversation')
    const onSelectSession = vi.fn()

    renderHeader(
      <ChatHeader
        activeTitle="Active work"
        sessions={[parent, active, filtered]}
        activeFriendlyId={active.friendlyId}
        onSelectSession={onSelectSession}
      />,
    )

    React.act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Parent conversation' }),
      )
    })
    const searchInput = screen.getByPlaceholderText('Search sessions...')
    React.act(() => {
      fireEvent.change(searchInput, { target: { value: 'filtered' } })
    })
    expect((searchInput as HTMLInputElement).value).toBe('filtered')

    React.act(() => {
      fireEvent.click(
        screen.getByRole('link', { name: 'Back to parent conversation' }),
      )
    })

    expect(navigateToSession).toHaveBeenCalledWith(parent.friendlyId)
    expect(onSelectSession).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Search sessions...')).toBeNull()

    React.act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Parent conversation' }),
      )
    })
    expect(
      screen.getByPlaceholderText<HTMLInputElement>('Search sessions...').value,
    ).toBe('')

    React.act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Filtered conversation' }),
      )
    })
    expect(onSelectSession).toHaveBeenCalledWith(filtered.key)
    expect(screen.queryByPlaceholderText('Search sessions...')).toBeNull()
  })
})
