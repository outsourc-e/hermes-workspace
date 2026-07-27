// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { fireEvent, screen, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SidebarSessions } from './sidebar-sessions'
import type { SessionCard } from '../../types'
import type { SessionCardListWire } from '../../chat-queries'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to: _to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode
    params?: { sessionKey?: string }
    search?: { inspect?: string }
    to?: string
  }) => (
    <a
      href={`/chat/${params?.sessionKey ?? ''}${search?.inspect ? `?inspect=${search.inspect}` : ''}`}
      {...props}
    >
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
  MenuItem: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}))

function card(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'card:root',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Authoritative card title',
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
        title: 'Delegated research',
        status: 'running',
        updatedAt: 10,
        continuationCount: 1,
      },
    ],
    updatedAt: 20,
    archived: false,
    pinned: false,
    ...overrides,
  }
}

const mountedRoots: Array<() => void> = []
afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

function renderSidebar(
  options: {
    cards?: Array<SessionCard>
    activeCardId?: string
    inspectedChildCardId?: string
    onTogglePin?: (value: SessionCard) => void
    onRename?: (value: SessionCard) => void
    onArchive?: (value: SessionCard) => void
    onBranch?: (value: SessionCard) => void
    cardResolutions?: SessionCardListWire['cardResolutions']
    completeness?: SessionCardListWire['completeness']
    fetching?: boolean
    onRetry?: () => void
  } = {},
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <SidebarSessions
        sessionCards={options.cards ?? [card()]}
        sessionForkAvailable
        activeCardId={options.activeCardId ?? 'card:root'}
        inspectedChildCardId={options.inspectedChildCardId}
        onTogglePin={options.onTogglePin ?? vi.fn()}
        onRename={options.onRename ?? vi.fn()}
        onArchive={options.onArchive ?? vi.fn()}
        onBranch={options.onBranch ?? vi.fn()}
        cardResolutions={
          options.cardResolutions ??
          (options.cards ?? [card()]).map((sessionCard) => ({
            cardId: sessionCard.cardId,
            completeness: 'complete' as const,
            retryable: false,
          }))
        }
        completeness={options.completeness ?? 'complete'}
        loading={false}
        fetching={options.fetching ?? false}
        error={null}
        onRetry={options.onRetry ?? vi.fn()}
      />,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

describe('SidebarSessions Card-only surface', () => {
  it('renders entirely from Card data without a raw sessions prop', () => {
    renderSidebar()
    expect(screen.getByText('Authoritative card title')).toBeTruthy()
    expect(screen.getByText('Delegated research')).toBeTruthy()
  })

  it('does not project rows when the Card list is empty', () => {
    renderSidebar({ cards: [] })
    expect(
      screen.getByText('No sessions yet. Start a conversation →'),
    ).toBeTruthy()
  })

  it('preserves complete Cards but replaces incomplete inventory with retry UI and no row actions', () => {
    const complete = card({
      cardId: 'card:complete',
      title: 'Stable Card',
      canonicalSegmentKey: 'local:complete',
      continuationSegmentKeys: ['local:complete'],
      childNodes: [],
    })
    const incomplete = card({
      cardId: 'card:incomplete',
      title: 'Unstable Card',
      canonicalSegmentKey: 'remote:incomplete',
      continuationSegmentKeys: ['remote:incomplete'],
      childNodes: [],
    })
    const onRetry = vi.fn()

    renderSidebar({
      cards: [complete, incomplete],
      completeness: 'incomplete',
      cardResolutions: [
        {
          cardId: complete.cardId,
          completeness: 'complete',
          retryable: false,
        },
        {
          cardId: incomplete.cardId,
          completeness: 'incomplete',
          retryable: true,
        },
      ],
      onRetry,
    })

    expect(screen.getByText('Stable Card')).toBeTruthy()
    expect(screen.queryByText('Unstable Card')).toBeNull()
    expect(
      screen.getByText('Some sessions are temporarily unavailable.'),
    ).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: 'Card options' }),
    ).toHaveLength(1)
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Retry sessions' })),
    )
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('routes the parent by cardId and inspects children without replacing the parent route', () => {
    renderSidebar({ inspectedChildCardId: 'card:child' })

    const parent = screen.getByText('Authoritative card title').closest('a')
    const child = screen.getByText('Delegated research').closest('a')
    expect(parent?.getAttribute('href')).toBe('/chat/card:root')
    expect(parent?.getAttribute('aria-current')).toBe('page')
    expect(child?.getAttribute('href')).toBe(
      '/chat/card:root?inspect=card:child',
    )
    expect(child?.getAttribute('data-inspected')).toBe('true')
    expect(screen.getByText('Continued · 2 segments')).toBeTruthy()
    expect(screen.getByText(/running/i)).toBeTruthy()
  })

  it('exposes Card-keyed actions only on the parent row', () => {
    const onTogglePin = vi.fn()
    const onRename = vi.fn()
    const onArchive = vi.fn()
    const onBranch = vi.fn()
    renderSidebar({ onTogglePin, onRename, onArchive, onBranch })

    const parent = screen
      .getByText('Authoritative card title')
      .closest<HTMLElement>('[data-card-id="card:root"]')!
    const child = screen
      .getByText('Delegated research')
      .closest<HTMLElement>('[data-card-child-id="card:child"]')!
    expect(
      within(parent).getAllByRole('button', { name: 'Card options' }),
    ).toHaveLength(1)
    expect(
      within(child).queryByRole('button', { name: 'Card options' }),
    ).toBeNull()

    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Pin card' })),
    )
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Branch conversation' }),
      ),
    )
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Rename' })),
    )
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Archive' })),
    )

    for (const callback of [onTogglePin, onBranch, onRename, onArchive]) {
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ cardId: 'card:root' }),
      )
    }
  })

  it('uses the persisted Card pin field rather than browser session pin state', () => {
    renderSidebar({ cards: [card({ pinned: true })] })
    const pinned = screen.getByRole('region', { name: 'Pinned sessions' })
    expect(within(pinned).getByText('Authoritative card title')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unpin card' })).toBeTruthy()
  })
})

describe('ChatSidebar Card-only integration', () => {
  it('does not pass raw sessions into SidebarSessions', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/screens/chat/components/chat-sidebar.tsx'),
      'utf8',
    )
    const sidebarInvocation = source.match(/<SidebarSessions[\s\S]*?\/>/)?.[0]

    expect(sidebarInvocation).toBeDefined()
    expect(sidebarInvocation).not.toMatch(/\bsessions=/)
  })
})
