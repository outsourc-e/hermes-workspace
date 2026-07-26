// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MobileSessionsPanel } from './mobile-sessions-panel'
import type { SessionCard } from '@/screens/chat/types'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

function card(): SessionCard {
  return {
    cardId: 'card:root',
    title: 'Card title',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:tip',
    continuationSegmentKeys: ['remote:root', 'remote:tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'card:child',
        sessionKey: 'remote:child',
        relationshipKind: 'child',
        title: 'Child activity',
        status: 'running',
        updatedAt: 2,
        continuationCount: 1,
      },
    ],
    updatedAt: 3,
    archived: false,
    pinned: false,
  }
}

const mountedRoots: Array<() => void> = []
afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})
function renderPanel(
  options: {
    cards?: Array<SessionCard>
    inspectedChildCardId?: string
    onSelectSession?: (cardId: string, inspectChildCardId?: string) => void
    onRenameCard?: (cardId: string, nextTitle: string) => void
    onTogglePin?: (cardId: string) => void
    onBranchCard?: (cardId: string) => void
    onArchiveCard?: (cardId: string) => void
  } = {},
) {
  const onSelectSession = options.onSelectSession ?? vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <MobileSessionsPanel
        open
        onClose={vi.fn()}
        sessionCards={options.cards ?? [card()]}
        activeFriendlyId="card:root"
        inspectedChildCardId={options.inspectedChildCardId}
        onSelectSession={onSelectSession}
        onNewChat={vi.fn()}
        onRenameCard={options.onRenameCard ?? vi.fn()}
        onTogglePin={options.onTogglePin ?? vi.fn()}
        onBranchCard={options.onBranchCard ?? vi.fn()}
        onArchiveCard={options.onArchiveCard ?? vi.fn()}
      />,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return onSelectSession
}

describe('MobileSessionsPanel Card routing', () => {
  it('renders only the authoritative Card list', () => {
    renderPanel()
    expect(screen.getByText('Card title')).toBeTruthy()
    expect(screen.queryByText('Legacy title')).toBeNull()
    expect(screen.getByText('Continued · 2 segments')).toBeTruthy()
  })

  it('selects the parent by cardId and child activity as inspect state', () => {
    const onSelectSession = renderPanel({ inspectedChildCardId: 'card:child' })
    const parent = screen.getByRole('button', { name: 'Open card Card title' })
    const child = screen.getByRole('button', {
      name: /Inspect delegated session Child activity/i,
    })
    expect(parent.getAttribute('aria-current')).toBe('page')
    expect(child.getAttribute('data-inspected')).toBe('true')

    React.act(() => fireEvent.click(parent))
    React.act(() => fireEvent.click(child))
    expect(onSelectSession).toHaveBeenNthCalledWith(1, 'card:root')
    expect(onSelectSession).toHaveBeenNthCalledWith(
      2,
      'card:root',
      'card:child',
    )
  })

  it('does not fall back to legacy sessions when no Cards are available', () => {
    renderPanel({ cards: [] })
    expect(screen.queryByText('Legacy title')).toBeNull()
    expect(screen.getByText('No sessions yet.')).toBeTruthy()
  })

  it('offers every durable action on parent Cards while child rows remain inspection-only', () => {
    const onRenameCard = vi.fn()
    const onTogglePin = vi.fn()
    const onBranchCard = vi.fn()
    const onArchiveCard = vi.fn()
    renderPanel({
      onRenameCard,
      onTogglePin,
      onBranchCard,
      onArchiveCard,
    })

    const openActions = () => {
      React.act(() =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Card actions for Card title' }),
        ),
      )
    }

    expect(
      screen.queryByRole('button', {
        name: 'Card actions for Child activity',
      }),
    ).toBeNull()

    openActions()
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Rename' })),
    )
    const renameInput = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Rename Card title',
    })
    React.act(() =>
      fireEvent.change(renameInput, { target: { value: 'Renamed on mobile' } }),
    )
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Save rename' })),
    )
    expect(onRenameCard).toHaveBeenCalledWith('card:root', 'Renamed on mobile')

    openActions()
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Pin card' })),
    )
    expect(onTogglePin).toHaveBeenCalledWith('card:root')

    openActions()
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Branch conversation' }),
      ),
    )
    expect(onBranchCard).toHaveBeenCalledWith('card:root')

    openActions()
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Archive card' })),
    )
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' })),
    )
    expect(onArchiveCard).toHaveBeenCalledWith('card:root')
  })
})
