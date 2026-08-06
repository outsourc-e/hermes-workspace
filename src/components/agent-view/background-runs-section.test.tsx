// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackgroundRunsSection } from './background-runs-section'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<{
    queryKey: ReadonlyArray<unknown>
    queryFn: () => Promise<SessionCardListWire>
  }>,
  cardWire: undefined as SessionCardListWire | undefined,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryKey: ReadonlyArray<unknown>
    queryFn: () => Promise<SessionCardListWire>
  }) => {
    mocks.queryOptions.push(options)
    return { status: 'success', data: mocks.cardWire }
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/screens/chat/chat-queries', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/screens/chat/chat-queries')>()
  return {
    ...actual,
    fetchSessionCards: vi.fn(async () => mocks.cardWire),
  }
})

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@hugeicons/core-free-icons', () => ({
  ArrowDown01Icon: {},
  ArrowRight01Icon: {},
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CollapsiblePanel: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: React.PropsWithChildren) => (
    <button type="button">{children}</button>
  ),
}))

const roots: Array<() => void> = []

function cards(): SessionCardListWire {
  return {
    completeness: 'complete',
    retryable: false,
    sources: [
      {
        source: 'gateway',
        status: 'complete',
        fetched: 1,
        retryable: false,
      },
    ],
    cardResolutions: [
      {
        cardId: 'remote:parent-card',
        completeness: 'complete',
        retryable: false,
      },
      {
        cardId: 'remote:child-card',
        parentCardId: 'remote:parent-card',
        completeness: 'complete',
        retryable: false,
      },
    ],
    cards: [
      {
        cardId: 'remote:parent-card',
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        canonicalSegmentKey: 'remote:parent-tip',
        continuationCount: 2,
        continuationSegmentKeys: ['remote:parent-card', 'remote:parent-tip'],
        relationshipKind: 'root',
        sessionKey: 'remote:parent-tip',
        title: 'Parent Card title',
        status: 'running',
        updatedAt: 1_700_000_000_000,
        messageCount: 3,
        lastMessagePreview: 'safe preview',
        childNodes: [
          {
            cardId: 'remote:child-card',
            canonicalSource: 'remote',
            sessionKey: 'remote:child-tip',
            title: 'Validated child Card title',
            status: 'running',
            updatedAt: 1_700_000_000_010,
            messageCount: 2,
            relationshipKind: 'child',
            continuationCount: 3,
            continuationSegmentKeys: [
              'remote:child-card',
              'remote:child-old',
              'remote:child-tip',
            ],
          },
        ],
      },
    ],
  } as unknown as SessionCardListWire
}

function runsResponse() {
  return {
    ok: true,
    runs: [
      {
        runId: 'mapped-run',
        sessionKey: 'remote:child-old',
        friendlyId: 'mapped-friendly',
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
        stalenessMs: 1_000,
        lastAssistantText: 'working safely',
        lastToolName: null,
        lifecycleEventCount: 1,
        lastLifecycleEvent: null,
        errorMessage: null,
      },
      {
        runId: 'unmapped-run',
        sessionKey: 'remote:unmapped-raw-segment',
        friendlyId: '',
        status: 'active',
        createdAt: 1,
        updatedAt: 2,
        stalenessMs: 1_000,
        lastAssistantText: 'must stay hidden',
        lastToolName: null,
        lifecycleEventCount: 1,
        lastLifecycleEvent: null,
        errorMessage: null,
      },
    ],
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  mocks.navigate.mockReset()
  mocks.queryOptions.length = 0
  mocks.cardWire = cards()
})

afterEach(() => {
  while (roots.length > 0) roots.pop()?.()
  vi.unstubAllGlobals()
})

describe('BackgroundRunsSection Card-only mounting', () => {
  it('renders and opens only runs resolved to a validated Card title', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input)
      if (url === '/api/runs/active') {
        return Promise.resolve(
          new Response(JSON.stringify(runsResponse()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (url === '/api/session-cards') {
        return Promise.resolve(
          new Response(JSON.stringify(cards()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (
        url.startsWith(
          '/api/session-cards/remote%3Achild-card/active-run/abandon',
        )
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = document.querySelector('#root')
    if (!container) throw new Error('missing root')
    const root = createRoot(container)
    roots.push(() => React.act(() => root.unmount()))
    await React.act(async () => {
      root.render(<BackgroundRunsSection sessionCardList={mocks.cardWire} />)
      await Promise.resolve()
    })

    expect(screen.getByText('Validated child Card title')).toBeTruthy()
    expect(document.body.textContent).not.toContain('remote:child-old')
    expect(document.body.textContent).not.toContain(
      'remote:unmapped-raw-segment',
    )
    expect(document.body.textContent).not.toContain('must stay hidden')
    expect(screen.getByTitle('1 running')).toBeTruthy()

    React.act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:parent-card' },
      search: { inspect: 'remote:child-card' },
    })

    await React.act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark dead' }))
      await Promise.resolve()
    })

    const queryKeys = new Set(
      mocks.queryOptions.map((options) => JSON.stringify(options.queryKey)),
    )
    expect(queryKeys).toEqual(new Set())
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls).not.toContain('/api/sessions')
    expect(urls.some((url) => url.startsWith('/api/history'))).toBe(false)
    expect(urls).not.toContain('/api/sessions/send')
    expect(
      urls.some((url) =>
        url.startsWith(
          '/api/session-cards/remote%3Achild-card/active-run/abandon',
        ),
      ),
    ).toBe(true)
    const abandonCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith(
        '/api/session-cards/remote%3Achild-card/active-run/abandon',
      ),
    )
    expect(abandonCall?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    expect(JSON.parse(String(abandonCall?.[1]?.body))).toEqual({
      runId: 'mapped-run',
      cardBinding: {
        kind: 'session-card-owner',
        cardId: 'remote:child-card',
        parentCardId: 'remote:parent-card',
        canonicalSource: 'remote',
        canonicalSegmentKey: 'remote:child-tip',
        canonicalTransport: 'gateway',
      },
    })
    expect(
      urls.some(
        (url) =>
          url.includes('remote%3Achild-old') || url.includes('mapped-run'),
      ),
    ).toBe(false)
  })
})
