// @vitest-environment jsdom

import React, { useMemo, useState } from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionTreeRow } from './session-tree-row'
import type { SessionCardTreeRow } from './session-tree-row'
import type { SessionCard } from '../../types'

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

const rootCard: SessionCard = {
  cardId: 'card:root',
  canonicalSource: 'remote',
  canonicalTransport: 'gateway',
  title: 'Root card',
  titleSource: 'manual',
  canonicalSegmentKey: 'remote:tip',
  continuationSegmentKeys: ['remote:tip'],
  continuationCount: 1,
  relationshipKind: 'root',
  childNodes: [],
  updatedAt: 1,
  archived: false,
  pinned: false,
}

function row(
  key: string,
  title: string,
  overrides: Partial<SessionCardTreeRow> = {},
): SessionCardTreeRow {
  return {
    key,
    title,
    updatedAt: 1,
    relationshipKind: 'root',
    depth: 0,
    isExpandable: false,
    isExpanded: false,
    childCount: 0,
    continuationCount: 1,
    isOrphan: false,
    ...overrides,
  }
}

function Harness({
  card = rootCard,
  sessionForkAvailable = true,
  onTogglePin = vi.fn(),
  onBranch = vi.fn(),
  onRename = vi.fn(),
  onArchive = vi.fn(),
}: {
  card?: SessionCard
  sessionForkAvailable?: boolean
  onTogglePin?: (card: SessionCard) => void
  onBranch?: (card: SessionCard) => void
  onRename?: (card: SessionCard) => void
  onArchive?: (card: SessionCard) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const root = row('card:root', 'Root card', {
    relationshipKind: card.relationshipKind,
    isExpandable: true,
    isExpanded: expanded,
    childCount: 1,
    isOrphan: card.relationshipKind === 'orphan',
  })
  const child = row('card:child', 'Child card', {
    relationshipKind: 'child',
    depth: 1,
    parentKey: 'card:root',
  })
  const childrenByParent = useMemo(() => new Map([['card:root', [child]]]), [])
  return (
    <SessionTreeRow
      row={root}
      childrenByParent={childrenByParent}
      activeCardId="card:root"
      inspectedChildCardId="card:child"
      pinnedSessionKeys={new Set()}
      cardsById={new Map([['card:root', card]])}
      pendingCardIds={new Set()}
      sessionForkAvailable={sessionForkAvailable}
      onToggleExpanded={(_key, next) => setExpanded(next)}
      onTogglePin={onTogglePin}
      onBranch={onBranch}
      onRename={onRename}
      onArchive={onArchive}
    />
  )
}

const mountedRoots: Array<() => void> = []
afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})
function render(options: React.ComponentProps<typeof Harness> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(<Harness {...options} />))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

describe('SessionTreeRow Card routing', () => {
  it('keeps disclosure keyboard semantics and renders children on demand', () => {
    render()
    const disclosure = screen.getByRole('button', {
      name: /Expand related sessions/i,
    })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Child card')).toBeNull()
    React.act(() => fireEvent.click(disclosure))
    expect(screen.getByText('Child card')).toBeTruthy()
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  })

  it('routes a child as inspection state on the parent Card route', () => {
    render()
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: /Expand related sessions/i }),
      ),
    )
    const child = screen.getByText('Child card').closest('a')
    expect(child?.getAttribute('href')).toBe(
      '/chat/card:root?inspect=card:child',
    )
    expect(child?.getAttribute('data-inspected')).toBe('true')
    expect(
      screen.getByText('Root card').closest('a')?.getAttribute('aria-current'),
    ).toBe('page')
  })

  it('offers branching and ordinary Card actions for a remote root when capability is available', () => {
    const onTogglePin = vi.fn()
    const onBranch = vi.fn()
    const onRename = vi.fn()
    const onArchive = vi.fn()
    render({ onTogglePin, onBranch, onRename, onArchive })

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: /Expand related sessions/i }),
      ),
    )
    expect(
      screen.getAllByRole('button', { name: 'Branch conversation' }),
    ).toHaveLength(1)

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
      expect(callback).toHaveBeenCalledWith(rootCard)
    }
  })

  it('keeps a top-level orphan inspectable but hides every root-only action', () => {
    render({ card: { ...rootCard, relationshipKind: 'orphan' } })

    expect(screen.getByText('Original session unavailable')).toBeTruthy()
    expect(screen.getByText('Root card').closest('a')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pin card' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Branch conversation' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  })

  it('omits branching when the fork capability is unavailable', () => {
    render({ sessionForkAvailable: false })

    expect(
      screen.queryByRole('button', { name: 'Branch conversation' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Pin card' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
  })

  it.each([
    ['local', 'local' as const],
    ['portable/unverified', undefined],
  ])(
    'omits branching for a %s root even when capability is available',
    (_label, canonicalSource) => {
      render({ card: { ...rootCard, canonicalSource } })

      expect(
        screen.queryByRole('button', { name: 'Branch conversation' }),
      ).toBeNull()
      expect(screen.getByRole('button', { name: 'Pin card' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    },
  )

  it('omits branching for a dashboard-backed remote root even when the gateway advertises fork', () => {
    render({ card: { ...rootCard, canonicalTransport: 'dashboard' } })

    expect(
      screen.queryByRole('button', { name: 'Branch conversation' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Pin card' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
  })
})
