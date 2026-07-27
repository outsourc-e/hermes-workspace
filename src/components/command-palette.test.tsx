// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandPalette } from './command-palette'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  response: undefined as SessionCardListWire | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.response }),
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
  }) => (open ? <div>{children}</div> : null),
  CommandDialogPopup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroupLabel: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  CommandInput: () => <input aria-label="Command search" />,
  CommandItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick: () => void
  }) => <button onClick={onClick}>{children}</button>,
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandSeparator: () => <hr />,
}))

function card(cardId: string, title: string, updatedAt: number): SessionCard {
  return {
    cardId,
    canonicalSource: 'remote',
    title,
    titleSource: 'manual',
    canonicalSegmentKey: `${cardId}:tip`,
    continuationSegmentKeys: [`${cardId}:tip`],
    continuationCount: 1,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt,
    archived: false,
    pinned: false,
  }
}

const mountedRoots: Array<() => void> = []

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mocks.navigate.mockReset()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('CommandPalette Session Card inventory', () => {
  it('mounts one complete and one incomplete Card but offers only the complete Card', () => {
    const complete = card('remote:complete', 'Complete Card', 2)
    const incomplete = card('remote:incomplete', 'Incomplete Card', 3)
    mocks.response = {
      cards: [complete, incomplete],
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
      completeness: 'complete',
      retryable: false,
      sources: [],
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => root.render(<CommandPalette pathname="/" sessions={[]} />))
    mountedRoots.push(() => {
      React.act(() => root.unmount())
      container.remove()
    })

    React.act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })

    expect(screen.getByText(complete.title)).toBeTruthy()
    expect(screen.queryByText(incomplete.title)).toBeNull()
    React.act(() => fireEvent.click(screen.getByText(complete.title)))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: complete.cardId },
    })
  })
})
