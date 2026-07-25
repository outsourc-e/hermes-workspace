// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MobileSessionsPanel } from './mobile-sessions-panel'
import type { SessionLineage, SessionMeta } from '@/screens/chat/types'

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

function session(
  key: string,
  title: string,
  lineage?: SessionLineage,
  updatedAt = 0,
): SessionMeta {
  return {
    key,
    friendlyId: `${key}-route`,
    title,
    updatedAt,
    ...(lineage ? { lineage } : {}),
  }
}

function renderPanel(
  sessions: Array<SessionMeta>,
  options: {
    activeFriendlyId?: string
    onClose?: () => void
    onSelectSession?: (friendlyId: string) => void
  } = {},
) {
  const onClose = options.onClose ?? vi.fn()
  const onSelectSession = options.onSelectSession ?? vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <MobileSessionsPanel
        open
        onClose={onClose}
        sessions={sessions}
        activeFriendlyId={options.activeFriendlyId ?? ''}
        onSelectSession={onSelectSession}
        onNewChat={vi.fn()}
      />,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return { onClose, onSelectSession }
}

const mountedRoots: Array<() => void> = []

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('MobileSessionsPanel lineage projection', () => {
  it('renders a continuation as one selectable logical row with its segment count', () => {
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
    const onSelectSession = vi.fn()

    renderPanel([root, tip], {
      activeFriendlyId: root.friendlyId,
      onSelectSession,
    })

    expect(screen.queryByText('Hidden snapshot')).toBeNull()
    expect(screen.getAllByText('Current conversation')).toHaveLength(1)
    expect(screen.getByText('Continued · 2 segments')).toBeTruthy()
    const logicalRow = screen.getByRole('button', {
      name: /Current conversation/i,
    })
    expect(logicalRow.getAttribute('aria-current')).toBe('page')

    fireEvent.click(logicalRow)
    expect(onSelectSession).toHaveBeenCalledWith('tip-route')
  })

  it('indents branches and delegated children while keeping their routes independent', () => {
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
    const onSelectSession = vi.fn()

    renderPanel([parent, branch, child], { onSelectSession })

    const parentRow = screen.getByRole('button', { name: /Parent/i })
    const branchRow = screen.getByRole('button', { name: /Branch work/i })
    const childRow = screen.getByRole('button', { name: /Delegated work/i })

    expect(parentRow.getAttribute('data-session-depth')).toBe('0')
    expect(parentRow.style.paddingInlineStart).toBe('')
    expect(branchRow.getAttribute('data-session-depth')).toBe('1')
    expect(branchRow.style.paddingInlineStart).toBe('28px')
    expect(childRow.getAttribute('data-session-depth')).toBe('2')
    expect(childRow.style.paddingInlineStart).toBe('44px')
    expect(within(branchRow).getByText('Branch')).toBeTruthy()
    expect(within(childRow).getByText('Delegated session')).toBeTruthy()

    fireEvent.click(branchRow)
    fireEvent.click(childRow)
    expect(onSelectSession).toHaveBeenNthCalledWith(1, 'branch-route')
    expect(onSelectSession).toHaveBeenNthCalledWith(2, 'child-route')
  })

  it('keeps orphans visible and keeps local and portable sessions at root depth', () => {
    renderPanel([
      session('remote-parent', 'Remote parent'),
      session('orphan', 'Still available', {
        parentSessionId: 'missing',
        relationshipType: 'child_session',
      }),
      session('local', 'Local session', {
        source: 'local',
        parentSessionId: 'remote-parent',
      }),
      session('portable', 'Portable session', {
        source: 'portable',
        parentSessionId: 'remote-parent',
      }),
    ])

    const orphan = screen.getByRole('button', { name: /Still available/i })
    expect(orphan.getAttribute('data-session-depth')).toBe('0')
    expect(
      within(orphan).getByText('Original session unavailable'),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: /Local session/i })
        .getAttribute('data-session-depth'),
    ).toBe('0')
    expect(
      screen
        .getByRole('button', { name: /Portable session/i })
        .getAttribute('data-session-depth'),
    ).toBe('0')
  })

  it('preserves flat session selection, backdrop and Escape behavior', () => {
    const onClose = vi.fn()
    const onSelectSession = vi.fn()
    renderPanel(
      [
        session('first', 'First session', undefined, 20),
        session('second', 'Second session', undefined, 10),
      ],
      { onClose, onSelectSession },
    )

    expect(
      screen.queryByText(/Continued|Branch|Delegated session|unavailable/),
    ).toBeNull()
    expect(
      screen
        .getByRole('button', { name: /First session/i })
        .getAttribute('data-session-depth'),
    ).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /Second session/i }))
    expect(onSelectSession).toHaveBeenCalledWith('second-route')

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Close sessions panel' }),
    )
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
