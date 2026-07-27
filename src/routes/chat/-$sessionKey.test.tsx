// @vitest-environment jsdom

import React from 'react'
import { waitFor } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatRoute } from './-chat-route'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'

const mocks = vi.hoisted(() => ({
  chatScreenProps: [] as Array<Record<string, unknown>>,
  navigate: vi.fn(),
  params: { sessionKey: 'remote:complete' },
  queryState: {} as {
    status: 'success'
    data: SessionCardListWire
    refetch: ReturnType<typeof vi.fn>
  },
  queryClient: {
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => mocks.navigate,
  useParams: () => mocks.params,
  useSearch: () => ({}),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => mocks.queryState,
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/components/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../screens/chat/chat-screen', () => ({
  ChatScreen: (props: Record<string, unknown>) => {
    mocks.chatScreenProps.push(props)
    return <div data-testid="chat-screen" />
  },
}))

function card(cardId: string, title: string): SessionCard {
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
    updatedAt: 1,
    archived: false,
    pinned: false,
  }
}

const mountedRoots: Array<() => void> = []

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mocks.chatScreenProps.length = 0
  mocks.navigate.mockReset()
  mocks.queryClient.invalidateQueries.mockReset()
  mocks.queryClient.removeQueries.mockReset()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('ChatRoute Session Card inventory', () => {
  it('mounts one complete and one incomplete Card but fans out only the complete Card', async () => {
    const complete = card('remote:complete', 'Complete Card')
    const incomplete = card('remote:incomplete', 'Incomplete Card')
    mocks.queryState = {
      status: 'success',
      data: {
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
      },
      refetch: vi.fn(),
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<ChatRoute />)
      await Promise.resolve()
    })
    mountedRoots.push(() => {
      React.act(() => root.unmount())
      container.remove()
    })

    await waitFor(() => expect(mocks.chatScreenProps.length).toBeGreaterThan(0))
    expect(mocks.chatScreenProps.at(-1)).toMatchObject({
      activeCard: complete,
      sessionCardList: expect.objectContaining({ cards: [complete] }),
    })
  })
})
