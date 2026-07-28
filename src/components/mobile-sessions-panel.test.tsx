// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileSessionsPanel } from './mobile-sessions-panel'
import type { SessionCard } from '@/screens/chat/types'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
const capabilityMocks = vi.hoisted(() => ({ sessionForkAvailable: true }))
vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))
vi.mock('@/hooks/use-feature-available', () => ({
  useFeatureAvailable: () => capabilityMocks.sessionForkAvailable,
}))

function card(): SessionCard {
  return {
    cardId: 'card:root',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
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
        continuationSegmentKeys: ['remote:child'],
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
beforeEach(() => {
  capabilityMocks.sessionForkAvailable = true
})
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
  const renderCards = (cards: Array<SessionCard>) => {
    root.render(
      <MobileSessionsPanel
        open
        onClose={vi.fn()}
        sessionCards={cards}
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
  }
  React.act(() => {
    renderCards(options.cards ?? [card()])
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return {
    onSelectSession,
    rerenderCards: (cards: Array<SessionCard>) => {
      React.act(() => renderCards(cards))
    },
  }
}

describe('MobileSessionsPanel Card routing', () => {
  it('renders only the authoritative Card list', () => {
    renderPanel()
    expect(screen.getByText('Card title')).toBeTruthy()
    expect(screen.queryByText('Legacy title')).toBeNull()
    expect(screen.getByText('Continued · 2 segments')).toBeTruthy()
    const expandButton = screen.getByRole('button', {
      name: 'Expand child activity for Card title',
    })
    expect(expandButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Child activity')).toBeNull()
    React.act(() => fireEvent.click(expandButton))
    expect(screen.getByText('Child activity')).toBeTruthy()
  })

  it('selects the parent by cardId and child activity as inspect state', () => {
    const { onSelectSession } = renderPanel({
      inspectedChildCardId: 'card:child',
    })
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

  it('keeps a top-level orphan selectable but never exposes root-only actions', () => {
    const orphan = { ...card(), relationshipKind: 'orphan' as const }
    const { onSelectSession } = renderPanel({ cards: [orphan] })

    expect(screen.getByText('Original session unavailable')).toBeTruthy()
    const openCard = screen.getByRole('button', {
      name: 'Open card Card title',
    })
    React.act(() => fireEvent.click(openCard))
    expect(onSelectSession).toHaveBeenCalledWith('card:root')
    expect(
      screen.queryByRole('button', { name: 'Card actions for Card title' }),
    ).toBeNull()
  })

  it('closes a stale action selection when a refreshed Card becomes non-root', () => {
    const { rerenderCards } = renderPanel()
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Card actions for Card title' }),
      ),
    )
    expect(
      document.querySelector('[data-card-actions="card:root"]'),
    ).toBeTruthy()

    rerenderCards([{ ...card(), relationshipKind: 'orphan' }])
    expect(
      screen.queryByRole('button', { name: 'Card actions for Card title' }),
    ).toBeNull()

    rerenderCards([card()])
    expect(
      screen.getByRole('button', { name: 'Card actions for Card title' }),
    ).toBeTruthy()
    expect(document.querySelector('[data-card-actions="card:root"]')).toBeNull()
  })

  it('omits branching when the fork capability is unavailable while preserving ordinary actions', () => {
    capabilityMocks.sessionForkAvailable = false
    renderPanel()

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Card actions for Card title' }),
      ),
    )

    expect(
      screen.queryByRole('button', { name: 'Branch conversation' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Pin card' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive card' })).toBeTruthy()
  })

  it.each([
    ['local', 'local' as const],
    ['portable/unverified', undefined],
  ])(
    'omits branching for a %s Card even when capability is available',
    (_label, canonicalSource) => {
      renderPanel({ cards: [{ ...card(), canonicalSource }] })

      React.act(() =>
        fireEvent.click(
          screen.getByRole('button', { name: 'Card actions for Card title' }),
        ),
      )

      expect(
        screen.queryByRole('button', { name: 'Branch conversation' }),
      ).toBeNull()
      expect(screen.getByRole('button', { name: 'Pin card' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Archive card' })).toBeTruthy()
    },
  )

  it('omits branching for dashboard Cards while preserving ordinary actions', () => {
    renderPanel({ cards: [{ ...card(), canonicalTransport: 'dashboard' }] })

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Card actions for Card title' }),
      ),
    )

    expect(
      screen.queryByRole('button', { name: 'Branch conversation' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Pin card' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive card' })).toBeTruthy()
  })
})
