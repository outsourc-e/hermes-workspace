// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentStreamPanel } from './agent-stream-panel'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'

type SessionCardWithChildAliases = SessionCard & {
  childNodes: Array<
    SessionCard['childNodes'][number] & {
      continuationSegmentKeys: Array<string>
    }
  >
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<{
    queryKey: ReadonlyArray<unknown>
    queryFn: () => Promise<SessionCardListWire>
  }>,
  queryState: {} as {
    status: 'pending' | 'error' | 'success'
    data?: SessionCardListWire
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryKey: ReadonlyArray<unknown>
    queryFn: () => Promise<SessionCardListWire>
  }) => {
    mocks.queryOptions.push(options)
    return mocks.queryState
  },
}))

vi.mock('./steer-modal', () => ({
  SteerModal: () => null,
}))

vi.mock('@/lib/gateway-api', () => ({
  killAgentSession: vi.fn(),
  toggleAgentPause: vi.fn(),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: vi.fn(),
}))

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const mountedRoots: Array<() => void> = []

function parentCard(
  overrides: Partial<SessionCardWithChildAliases> = {},
): SessionCardWithChildAliases {
  return {
    cardId: 'remote:parent-card',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Parent Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:parent-tip',
    continuationSegmentKeys: ['remote:parent-card', 'remote:parent-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'remote:child-card',
        sessionKey: 'remote:child-tip',
        continuationSegmentKeys: [
          'remote:child-card',
          'remote:child-middle',
          'remote:child-tip',
        ],
        relationshipKind: 'child',
        title: 'Delegated research',
        status: 'running',
        updatedAt: Date.now(),
        continuationCount: 3,
      },
    ],
    updatedAt: Date.now(),
    archived: false,
    pinned: false,
    ...overrides,
  }
}

function wire(
  cards: Array<SessionCard>,
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  return {
    cards,
    cardResolutions: cards.map((card) => ({
      cardId: card.cardId,
      completeness,
      retryable: completeness === 'incomplete',
    })),
    completeness,
    retryable: completeness === 'incomplete',
    sources:
      completeness === 'incomplete'
        ? [
            {
              source: 'gateway',
              status: 'incomplete',
              fetched: cards.length,
              retryable: true,
              reason: 'safe-cap',
            },
          ]
        : [],
  }
}

function response(body: SessionCardListWire) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function renderPanel(sessionKey: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <AgentStreamPanel
        sessionKey={sessionKey}
        agentName="Research agent"
        agentColor="blue"
        onClose={vi.fn()}
      />,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.queryOptions.length = 0
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('AgentStreamPanel Card-only activity', () => {
  it('loads only Cards and routes child activity through parent-scoped inspection', async () => {
    const body = wire([parentCard()])
    mocks.queryState = { status: 'success', data: body }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(body))
    vi.stubGlobal('fetch', fetchMock)

    renderPanel('remote:child-tip')

    expect(screen.getByText('Delegated research')).toBeTruthy()
    expect(screen.getByText('Child Card activity')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('3 segments')).toBeTruthy()
    expect(document.body.textContent).not.toContain('remote:child-tip')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.queryOptions).toHaveLength(1)
    expect(mocks.queryOptions[0]?.queryKey).toEqual([
      'chat',
      'session-cards',
      'list',
      false,
      0,
    ])
    await expect(mocks.queryOptions[0]?.queryFn()).resolves.toEqual(body)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/session-cards',
    ])
    expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(
      /\/api\/(sessions|history)/,
    )

    React.act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Chat' }))
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:parent-card' },
      search: { inspect: 'remote:child-card' },
    })
  })

  it.each([
    {
      name: 'an incomplete projection',
      sessionKey: 'remote:parent-tip',
      body: wire([parentCard()], 'incomplete'),
    },
    {
      name: 'raw unmapped activity',
      sessionKey: 'raw:unmapped-session',
      body: wire([parentCard()]),
    },
  ])(
    'fails closed for $name without exposing or navigating raw identity',
    async ({ sessionKey, body }) => {
      mocks.queryState = { status: 'success', data: body }
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(body))
      vi.stubGlobal('fetch', fetchMock)

      renderPanel(sessionKey)

      expect(
        screen.getByRole('heading', { name: 'Card activity unavailable' }),
      ).toBeTruthy()
      expect(screen.getByText(/validated Card projection/i)).toBeTruthy()
      expect(document.body.textContent).not.toContain(sessionKey)
      const openChat = screen.getByRole('button', { name: 'Open Chat' })
      expect(openChat.hasAttribute('disabled')).toBe(true)
      React.act(() => fireEvent.click(openChat))
      expect(mocks.navigate).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(mocks.queryOptions).toHaveLength(1)
      await expect(mocks.queryOptions[0]?.queryFn()).resolves.toEqual(body)
      expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(
        /\/api\/(sessions|history)/,
      )
    },
  )
})
