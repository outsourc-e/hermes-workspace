// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchModal, matchSearchSessionCards } from './search-modal'
import type { SearchSessionCard } from '@/hooks/use-search-data'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  closeModal: vi.fn(),
  recordRecentSearch: vi.fn(),
  query: 'Parent',
  scope: 'chats' as const,
  searchData: {
    sessionCards: [] as Array<SearchSessionCard>,
    files: [],
    skills: [],
    activity: [],
    isLoading: false,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string
    variant?: string
  }) => <button {...props}>{children}</button>,
}))

vi.mock('@/hooks/use-search-data', () => ({
  filterResults: (items: Array<unknown>) => items,
  useSearchData: () => mocks.searchData,
}))

vi.mock('@/hooks/use-search-modal', () => ({
  SEARCH_MODAL_EVENTS: {
    OPEN_USAGE: 'search-modal:open-usage',
    TOGGLE_FILE_EXPLORER: 'search-modal:toggle-file-explorer',
  },
  emitSearchModalEvent: vi.fn(),
  useSearchModal: (
    selector: (state: {
      isOpen: boolean
      query: string
      scope: 'chats'
      recentSearches: Array<string>
      closeModal: typeof mocks.closeModal
      toggleModal: ReturnType<typeof vi.fn>
      setQuery: ReturnType<typeof vi.fn>
      clearQuery: ReturnType<typeof vi.fn>
      setScope: ReturnType<typeof vi.fn>
      recordRecentSearch: typeof mocks.recordRecentSearch
    }) => unknown,
  ) =>
    selector({
      isOpen: true,
      query: mocks.query,
      scope: mocks.scope,
      recentSearches: [],
      closeModal: mocks.closeModal,
      toggleModal: vi.fn(),
      setQuery: vi.fn(),
      clearQuery: vi.fn(),
      setScope: vi.fn(),
      recordRecentSearch: mocks.recordRecentSearch,
    }),
}))

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function searchCard(
  overrides: Partial<SearchSessionCard> = {},
): SearchSessionCard {
  return {
    cardId: 'remote:parent-card',
    title: 'Parent Card',
    updatedAt: 3,
    inspectableChildren: [
      { cardId: 'remote:child-card', title: 'Child activity' },
    ],
    ...overrides,
  }
}

const mountedRoots: Array<() => void> = []

async function renderModal() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(<SearchModal />))
  await React.act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 225))
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.closeModal.mockReset()
  mocks.recordRecentSearch.mockReset()
  mocks.query = 'Parent'
  mocks.searchData.sessionCards = [searchCard()]
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('global Search Card results', () => {
  it('matches one visible result per owning root Card without raw identities', () => {
    const results = matchSearchSessionCards(
      [
        searchCard(),
        searchCard({
          cardId: 'remote:other-card',
          title: 'Other Card',
          inspectableChildren: [],
        }),
      ],
      'Parent',
    )

    expect(results).toEqual([
      {
        cardId: 'remote:parent-card',
        title: 'Parent Card',
        updatedAt: 3,
      },
    ])
    expect(JSON.stringify(results)).not.toContain('remote:parent-tip')
    expect(JSON.stringify(results)).not.toContain('preview')
  })

  it('carries child inspection only from the owning Card projection', () => {
    expect(matchSearchSessionCards([searchCard()], 'Child activity')).toEqual([
      {
        cardId: 'remote:parent-card',
        title: 'Parent Card',
        updatedAt: 3,
        inspectedChildCardId: 'remote:child-card',
      },
    ])
    expect(
      matchSearchSessionCards([searchCard()], 'remote:child-card'),
    ).toEqual([])
    expect(
      matchSearchSessionCards(
        [
          searchCard({
            inspectableChildren: [
              { cardId: 'remote:child-a', title: 'Matching child' },
              { cardId: 'remote:child-b', title: 'Matching child' },
            ],
          }),
        ],
        'Matching child',
      ),
    ).toEqual([])
  })

  it('navigates selected root results by stable cardId', async () => {
    await renderModal()

    const result = screen.getByRole('button', { name: /ParentCard/ })
    expect(result).toBeTruthy()
    expect(screen.queryByText('remote:parent-card')).toBeNull()
    expect(screen.queryByText('remote:parent-tip')).toBeNull()
    React.act(() => fireEvent.click(result))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:parent-card' },
      search: {},
    })
  })

  it('keeps authoritative child inspection under the owning stable cardId', async () => {
    mocks.query = 'Child activity'
    await renderModal()

    expect(screen.getByText('Parent Card')).toBeTruthy()
    expect(screen.queryByText('remote:child-card')).toBeNull()
    React.act(() => fireEvent.click(screen.getByText('Parent Card')))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:parent-card' },
      search: { inspect: 'remote:child-card' },
    })
  })
})
