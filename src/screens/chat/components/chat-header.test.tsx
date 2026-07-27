// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatHeader } from './chat-header'
import type { SessionCard } from '../types'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
const navigateToCard = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search: _search,
    to: _to,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode
    params?: { sessionKey?: string }
    search?: Record<string, unknown>
    to?: string
  }) => (
    <a
      href={`/chat/${params?.sessionKey ?? ''}`}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
        navigateToCard(params?.sessionKey)
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

function card(): SessionCard {
  return {
    cardId: 'card:root',
    title: 'Card project',
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

function mockViewport(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: mobile,
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

const mountedRoots: Array<() => void> = []
beforeEach(() => {
  navigateToCard.mockClear()
  mockViewport(true)
})
afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})
function renderHeader(
  options: {
    cards?: Array<SessionCard>
    inspected?: string
    onRenameTitle?: (nextTitle: string) => Promise<void> | void
  } = {},
) {
  const onRenameTitle = options.onRenameTitle ?? vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <ChatHeader
        activeTitle="Legacy active title"
        onRenameTitle={onRenameTitle}
        sessionCards={options.cards ?? [card()]}
        activeFriendlyId="card:root"
        inspectedChildCardId={options.inspected}
        onOpenSessions={vi.fn()}
      />,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return { onRenameTitle }
}

describe('ChatHeader Card-only routing', () => {
  it('shows the parent Card while inspecting child activity and routes back by cardId', () => {
    renderHeader({ inspected: 'card:child' })
    expect(
      screen.getByRole('button', { name: 'Switch session' }).textContent,
    ).toContain('Card project')
    expect(screen.getByText('2 segments')).toBeTruthy()
    const back = screen.getByRole('link', {
      name: 'Back to parent conversation',
    })
    expect(back.getAttribute('href')).toBe('/chat/card:root')
    React.act(() => fireEvent.click(back))
    expect(navigateToCard).toHaveBeenCalledWith('card:root')
  })

  it('keeps the parent Card title action available during child inspection', () => {
    mockViewport(false)
    renderHeader({ inspected: 'card:child' })
    expect(screen.getByTitle('Rename session')).toBeTruthy()
  })

  it('renames a root Card from the desktop title affordance', async () => {
    mockViewport(false)
    const patchMetadata = vi.fn().mockResolvedValue(undefined)
    renderHeader({ onRenameTitle: patchMetadata })

    React.act(() => fireEvent.click(screen.getByTitle('Rename session')))
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Session name',
    })
    React.act(() =>
      fireEvent.change(input, { target: { value: 'Renamed root Card' } }),
    )
    await React.act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
      await Promise.resolve()
    })

    expect(patchMetadata).toHaveBeenCalledWith('Renamed root Card')
  })

  it('does not expose or invoke the rename action for an orphan Card', () => {
    mockViewport(false)
    const patchMetadata = vi.fn()
    renderHeader({
      cards: [{ ...card(), relationshipKind: 'orphan' }],
      onRenameTitle: patchMetadata,
    })

    expect(screen.getByText('Card project')).toBeTruthy()
    expect(screen.queryByTitle('Rename session')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Session name' })).toBeNull()
    expect(patchMetadata).not.toHaveBeenCalled()
  })

  it('uses native Card links in the desktop switcher and resets transient search state', () => {
    mockViewport(false)
    renderHeader()
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Card project' })),
    )
    const search =
      screen.getByPlaceholderText<HTMLInputElement>('Search sessions...')
    React.act(() => fireEvent.change(search, { target: { value: 'project' } }))
    const cardLink = screen.getByRole('link', { name: 'Card project' })
    expect(cardLink.getAttribute('href')).toBe('/chat/card:root')
    React.act(() => fireEvent.click(cardLink))
    expect(screen.queryByPlaceholderText('Search sessions...')).toBeNull()

    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Card project' })),
    )
    expect(
      screen.getByPlaceholderText<HTMLInputElement>('Search sessions...').value,
    ).toBe('')
  })

  it('never projects the legacy session list when Cards are unavailable', () => {
    mockViewport(false)
    renderHeader({ cards: [] })
    expect(screen.getByText('Legacy active title')).toBeTruthy()
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Legacy active title' }),
      ),
    )
    expect(screen.getByText('No sessions')).toBeTruthy()
    expect(screen.queryByText('Legacy title')).toBeNull()
  })
})
