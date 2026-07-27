// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Swarm2LiveChat } from './swarm2-live-chat'
import type {
  SessionCardHistoryResponse,
  SessionCardListWire,
} from '@/screens/chat/chat-queries'

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: (context?: { signal?: AbortSignal }) => Promise<unknown>
  enabled?: boolean
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  invalidateQueries: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  cardResponse: undefined as SessionCardListWire | undefined,
  historyResponse: undefined as SessionCardHistoryResponse | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))
vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const isList = options.queryKey[2] === 'list'
    return {
      data: isList ? mocks.cardResponse : mocks.historyResponse,
      error: null,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    }
  },
  useMutation: (options: {
    mutationFn: (input: string) => Promise<unknown>
    onSuccess?: () => Promise<void> | void
  }) => ({
    isPending: false,
    error: null,
    mutateAsync: vi.fn(async (input: string) => {
      const result = await options.mutationFn(input)
      await options.onSuccess?.()
      return result
    }),
  }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function cardResponse(
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  return {
    cards: [
      {
        cardId: 'remote:worker-card',
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        title: 'Authoritative worker Card',
        titleSource: 'manual',
        canonicalSegmentKey: 'remote:raw-worker-segment',
        continuationSegmentKeys: [
          'remote:worker-card',
          'remote:raw-worker-segment',
        ],
        continuationCount: 2,
        relationshipKind: 'root',
        childNodes: [],
        updatedAt: 10,
        archived: false,
        pinned: false,
      },
    ],
    cardResolutions: [
      {
        cardId: 'remote:worker-card',
        completeness,
        retryable: completeness === 'incomplete',
      },
    ],
    completeness,
    retryable: completeness === 'incomplete',
    sources:
      completeness === 'complete'
        ? []
        : [
            {
              source: 'hermes',
              status: 'incomplete',
              fetched: 1,
              retryable: true,
              reason: 'safe-cap',
            },
          ],
  }
}

function completeHistory(): SessionCardHistoryResponse {
  return {
    sessionKey: 'remote:raw-worker-segment',
    cardId: 'remote:worker-card',
    canonicalSegmentKey: 'remote:raw-worker-segment',
    messages: [
      {
        id: 'raw-message-id-must-not-render',
        role: 'assistant',
        content: [{ type: 'text', text: 'Authoritative Card transcript' }],
        timestamp: 123,
      },
    ],
    completeness: 'complete',
    retryable: false,
    missingSegments: [],
  }
}

async function mountViewer(surface: '/swarm' | '/swarm2') {
  const container = document.createElement('div')
  container.dataset.surface = surface
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(
      <Swarm2LiveChat workerId="builder" activityCardId="remote:worker-card" />,
    )
    await Promise.resolve()
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.invalidateQueries.mockReset()
  mocks.queryOptions.length = 0
  mocks.cardResponse = cardResponse()
  mocks.historyResponse = completeHistory()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe.each(['/swarm', '/swarm2'] as const)(
  'mounted %s worker transcript',
  (surface) => {
    it('renders complete authoritative Card history and stable Card navigation only', async () => {
      const fetchMock = vi.fn<typeof fetch>((input) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        if (
          url === '/api/session-cards/remote%3Aworker-card/history?limit=500'
        ) {
          return Promise.resolve(
            Response.json({
              cardId: 'remote:worker-card',
              canonicalSegmentKey: 'remote:raw-worker-segment',
              messages: [],
              completeness: 'complete',
              retryable: false,
              missingSegments: [],
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      await mountViewer(surface)

      expect(screen.getByText('Authoritative Card transcript')).toBeTruthy()
      expect(document.body.textContent).not.toContain(
        'raw-message-id-must-not-render',
      )
      expect(document.body.textContent).not.toContain('raw-worker-segment')
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Authoritative worker Card' }),
      )
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/chat/$sessionKey',
        params: { sessionKey: 'remote:worker-card' },
        search: {},
      })

      const cardQuery = mocks.queryOptions.find(
        ({ queryKey }: QueryOptions) => queryKey[2] === 'list',
      )
      const historyQuery = mocks.queryOptions.find(
        ({ queryKey }: QueryOptions) => queryKey[2] === 'history',
      )
      await cardQuery?.queryFn()
      await historyQuery?.queryFn({ signal: undefined })
      const requests = fetchMock.mock.calls.map(([input]) => String(input))
      expect(requests).toContain('/api/session-cards')
      expect(requests.some((url) => url.includes('/history'))).toBe(true)
      expect(requests.some((url) => url.startsWith('/api/swarm-chat'))).toBe(
        false,
      )
    })

    it('hides incomplete and unmapped transcripts without a raw fallback', async () => {
      mocks.cardResponse = cardResponse('incomplete')
      mocks.historyResponse = undefined
      const fetchMock = vi.fn<typeof fetch>((input) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        if (url.startsWith('/api/swarm-chat')) {
          return Promise.resolve(
            Response.json({
              messages: [
                {
                  id: 'raw-id',
                  role: 'assistant',
                  content: 'Raw fallback must stay hidden',
                },
              ],
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      await mountViewer(surface)

      expect(
        screen.getByText(
          'Transcript unavailable: no complete Session Card is mapped to this worker.',
        ),
      ).toBeTruthy()
      expect(document.body.textContent).not.toContain(
        'Raw fallback must stay hidden',
      )
      const cardQuery = mocks.queryOptions.find(
        ({ queryKey }: QueryOptions) => queryKey[2] === 'list',
      )
      await cardQuery?.queryFn()
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith('/api/swarm-chat'),
        ),
      ).toBe(false)
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('/history'),
        ),
      ).toBe(false)
      expect(mocks.navigate).not.toHaveBeenCalled()
    })
  },
)

it('fails closed when resolved Card history itself is partial', async () => {
  mocks.historyResponse = {
    ...completeHistory(),
    completeness: 'partial',
    retryable: true,
    missingSegments: [
      {
        segmentKey: 'remote:missing',
        retryable: true,
        error: 'temporarily unavailable',
      },
    ],
  }

  await mountViewer('/swarm2')

  expect(
    screen.getByText(
      'Transcript unavailable: Session Card history is incomplete.',
    ),
  ).toBeTruthy()
  expect(document.body.textContent).not.toContain(
    'Authoritative Card transcript',
  )
})
