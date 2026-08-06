// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Swarm2LiveChat } from './swarm2-live-chat'
import type { Root } from 'react-dom/client'
import type {
  SwarmChatMessage,
  SwarmSessionCardOwner,
  SwarmSessionCardTarget,
} from '@/hooks/use-swarm-chat'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'

const RAW_SEGMENT_ONE = 'local:raw-worker-segment-one'
const RAW_SEGMENT_TWO = 'local:raw-worker-segment-two'
const RAW_MESSAGE_ID = 'raw-message-id-must-not-enter-browser-state'

type SanitizedTranscript = {
  target: SwarmSessionCardTarget | null
  status: 'ready' | 'unmapped' | 'incomplete' | 'unavailable'
  messages: Array<SwarmChatMessage>
  error: string | null
}

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: (context: { signal?: AbortSignal }) => Promise<SanitizedTranscript>
  enabled?: boolean
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  invalidateQueries: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  queryData: undefined as SanitizedTranscript | undefined,
  mutationResults: [] as Array<unknown>,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))
vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const mapped = options.queryKey[0] === 'chat'
    return {
      data: mapped ? mocks.queryData : undefined,
      error: null,
      isPending: mapped && !mocks.queryData,
      isFetching: false,
      refetch: vi.fn(() => options.queryFn({ signal: undefined })),
    }
  },
  useMutation: (options: {
    mutationFn: (input: string) => Promise<unknown>
    onSuccess?: (result: unknown) => Promise<void> | void
  }) => ({
    isPending: false,
    error: null,
    mutateAsync: vi.fn(async (input: string) => {
      const result = await options.mutationFn(input)
      mocks.mutationResults.push(result)
      await options.onSuccess?.(result)
      return result
    }),
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

const rootOwner: SwarmSessionCardOwner = {
  kind: 'session-card-owner',
  cardId: 'local:worker-card',
  parentCardId: null,
}

const childOwner: SwarmSessionCardOwner = {
  kind: 'session-card-owner',
  cardId: 'local:worker-child-card',
  parentCardId: 'local:worker-card',
}

const rootTarget: SwarmSessionCardTarget = {
  cardId: rootOwner.cardId,
  parentCardId: null,
  title: 'Authoritative worker Card',
  relationship: 'root',
  route: {
    to: '/chat/$sessionKey',
    params: { sessionKey: rootOwner.cardId },
    search: {},
  },
}

function readyTranscript(
  messages: Array<SwarmChatMessage> = [
    {
      id: 'card-message-local:worker-card-0',
      role: 'assistant',
      content: 'Authoritative Card transcript',
      timestamp: 123,
    },
  ],
): SanitizedTranscript {
  return {
    target: rootTarget,
    status: 'ready',
    messages,
    error: null,
  }
}

function cardResponse({
  canonicalSegmentKey = RAW_SEGMENT_ONE,
  completeness = 'complete',
  withChild = false,
}: {
  canonicalSegmentKey?: string
  completeness?: 'complete' | 'incomplete'
  withChild?: boolean
} = {}): SessionCardListWire {
  const continuationSegmentKeys =
    canonicalSegmentKey === RAW_SEGMENT_TWO
      ? ['local:worker-card', RAW_SEGMENT_ONE, RAW_SEGMENT_TWO]
      : ['local:worker-card', canonicalSegmentKey]
  return {
    cards: [
      {
        cardId: rootOwner.cardId,
        canonicalSource: 'local',
        title: rootTarget.title,
        titleSource: 'manual',
        canonicalSegmentKey,
        continuationSegmentKeys,
        continuationCount: continuationSegmentKeys.length,
        relationshipKind: 'root',
        childNodes: withChild
          ? [
              {
                cardId: childOwner.cardId,
                sessionKey: 'local:raw-worker-child-segment',
                continuationSegmentKeys: [
                  childOwner.cardId,
                  'local:raw-worker-child-segment',
                ],
                continuationCount: 2,
                relationshipKind: 'child',
                title: 'Authoritative child Card',
                status: 'running',
                updatedAt: 20,
              },
            ]
          : [],
        updatedAt: 10,
        archived: false,
        pinned: false,
      },
    ],
    cardResolutions: [
      {
        cardId: rootOwner.cardId,
        completeness,
        retryable: completeness === 'incomplete',
      },
    ],
    completeness,
    retryable: completeness === 'incomplete',
    sources: [],
  }
}

type HistoryMessage = {
  segmentKey: string
  message: {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
  }
}

function historyResponse({
  cardId = rootOwner.cardId,
  canonicalSegmentKey = RAW_SEGMENT_ONE,
  completeness = 'complete',
  messages = [
    {
      segmentKey: canonicalSegmentKey,
      message: {
        id: RAW_MESSAGE_ID,
        role: 'assistant' as const,
        content: 'Authoritative Card transcript',
        timestamp: 123,
      },
    },
  ],
}: {
  cardId?: string
  canonicalSegmentKey?: string
  completeness?: 'complete' | 'partial'
  messages?: Array<HistoryMessage>
} = {}) {
  return {
    cardId,
    canonicalSegmentKey,
    messages,
    completeness,
    retryable: completeness === 'partial',
    missingSegments:
      completeness === 'partial'
        ? [
            {
              segmentKey: canonicalSegmentKey,
              retryable: true,
              error: 'temporarily unavailable',
            },
          ]
        : [],
  }
}

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

async function mountViewer(
  owner: SwarmSessionCardOwner = rootOwner,
  surface: '/swarm' | '/swarm2' = '/swarm2',
) {
  const container = document.createElement('div')
  container.dataset.surface = surface
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<Swarm2LiveChat workerId="builder" cardOwner={owner} />)
    await Promise.resolve()
  })
  mountedRoots.push({ root, container })
  return { root, container }
}

function latestMappedQuery(): QueryOptions | undefined {
  return [...mocks.queryOptions]
    .reverse()
    .find((options) => options.queryKey[0] === 'chat')
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.invalidateQueries.mockReset()
  mocks.queryOptions.length = 0
  mocks.queryData = readyTranscript()
  mocks.mutationResults.length = 0
})

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop()!
    React.act(() => mounted.root.unmount())
    mounted.container.remove()
  }
  vi.unstubAllGlobals()
})

describe.each(['/swarm', '/swarm2'] as const)(
  'mounted %s worker transcript',
  (surface) => {
    it('renders complete Card history while query keys and query state contain Card identity only', async () => {
      const fetchMock = vi.fn<typeof fetch>((input) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(cardResponse()))
        }
        if (
          url === '/api/session-cards/local%3Aworker-card/history?limit=500'
        ) {
          return Promise.resolve(Response.json(historyResponse()))
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      await mountViewer(rootOwner, surface)
      await waitFor(() => {
        expect(screen.getByText('Authoritative Card transcript')).toBeTruthy()
        expect(latestMappedQuery()).toBeTruthy()
      })
      expect(document.body.textContent).not.toContain(RAW_MESSAGE_ID)
      expect(document.body.textContent).not.toContain(RAW_SEGMENT_ONE)
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Authoritative worker Card' }),
      )
      expect(mocks.navigate).toHaveBeenCalledWith(rootTarget.route)

      const historyQuery = latestMappedQuery()!
      expect(historyQuery.queryKey).toEqual([
        'chat',
        'session-cards',
        'history',
        rootOwner.cardId,
        '',
      ])
      const sanitizedState = await historyQuery.queryFn({ signal: undefined })
      expect(sanitizedState.status).toBe('ready')
      expect(JSON.stringify(historyQuery.queryKey)).not.toContain(
        RAW_SEGMENT_ONE,
      )
      expect(JSON.stringify(sanitizedState)).not.toContain(RAW_SEGMENT_ONE)
      expect(JSON.stringify(sanitizedState)).not.toContain(RAW_MESSAGE_ID)
      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
        expect.arrayContaining([
          '/api/session-cards',
          '/api/session-cards/local%3Aworker-card/history?limit=500',
        ]),
      )
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith('/api/swarm-chat'),
        ),
      ).toBe(false)
    })
  },
)

it('keeps the same Card key and both user/assistant rows through continuation refetch', async () => {
  let canonicalSegmentKey = RAW_SEGMENT_ONE
  let messages: Array<HistoryMessage> = [
    {
      segmentKey: RAW_SEGMENT_ONE,
      message: {
        id: 'raw-user-one',
        role: 'user',
        content: 'Keep this user request',
        timestamp: 100,
      },
    },
    {
      segmentKey: RAW_SEGMENT_ONE,
      message: {
        id: 'raw-assistant-one',
        role: 'assistant',
        content: 'Keep this assistant response',
        timestamp: 101,
      },
    },
  ]
  mocks.queryData = readyTranscript([
    {
      id: 'card-message-local:worker-card-0',
      role: 'user',
      content: 'Keep this user request',
      timestamp: 100,
    },
    {
      id: 'card-message-local:worker-card-1',
      role: 'assistant',
      content: 'Keep this assistant response',
      timestamp: 101,
    },
  ])
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(
        Response.json(cardResponse({ canonicalSegmentKey })),
      )
    }
    if (url.includes('/history')) {
      return Promise.resolve(
        Response.json(historyResponse({ canonicalSegmentKey, messages })),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer()
  await waitFor(() => expect(latestMappedQuery()).toBeTruthy())
  const firstQuery = latestMappedQuery()!
  const first = await firstQuery.queryFn({ signal: undefined })
  expect(first.messages.map((message) => message.role)).toEqual([
    'user',
    'assistant',
  ])

  canonicalSegmentKey = RAW_SEGMENT_TWO
  messages = [
    ...messages,
    {
      segmentKey: RAW_SEGMENT_TWO,
      message: {
        id: 'raw-assistant-two',
        role: 'assistant',
        content: 'Continued on the same Card',
        timestamp: 102,
      },
    },
  ]
  const continued = await firstQuery.queryFn({ signal: undefined })

  expect(firstQuery.queryKey).toEqual([
    'chat',
    'session-cards',
    'history',
    rootOwner.cardId,
    '',
  ])
  expect(continued.messages.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'assistant',
  ])
  expect(continued.messages.map((message) => message.content)).toEqual([
    'Keep this user request',
    'Keep this assistant response',
    'Continued on the same Card',
  ])
  expect(JSON.stringify(continued)).not.toContain(RAW_SEGMENT_ONE)
  expect(JSON.stringify(continued)).not.toContain(RAW_SEGMENT_TWO)
  expect(JSON.stringify(continued)).not.toContain('raw-assistant-two')

  canonicalSegmentKey = RAW_SEGMENT_TWO
  const completeCardResponse = cardResponse({ canonicalSegmentKey })
  fetchMock.mockImplementation((input) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(
        Response.json({
          ...completeCardResponse,
          cardResolutions: completeCardResponse.cardResolutions.map(
            (resolution) => ({
              ...resolution,
              completeness: 'incomplete' as const,
              retryable: true,
            }),
          ),
        }),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  const rejectedRefresh = await firstQuery.queryFn({ signal: undefined })
  expect(rejectedRefresh).toMatchObject({
    target: null,
    status: 'unmapped',
    messages: [],
  })
})

it('binds a valid send to the current local Card and refreshes only that owner history', async () => {
  const sendCardResponse = cardResponse({
    canonicalSegmentKey: 'local:builder',
  })
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(Response.json(sendCardResponse))
    }
    if (url === '/api/swarm-direct-chat' && init?.method === 'POST') {
      return Promise.resolve(
        Response.json({
          ok: true,
          cardOwner: rootOwner,
          delivered: true,
          delivery: 'tmux',
          fetchedAt: 123,
        }),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer()
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })
  await React.act(async () => {
    fireEvent.change(screen.getByPlaceholderText('Message builder…'), {
      target: { value: 'Persist under this Card' },
    })
    await Promise.resolve()
  })
  await React.act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await Promise.resolve()
  })

  await waitFor(() => expect(mocks.mutationResults).toHaveLength(1))
  const sendCall = fetchMock.mock.calls.find(
    ([input]) => String(input) === '/api/swarm-direct-chat',
  )
  expect(sendCall).toBeTruthy()
  const requestBody = JSON.parse(String(sendCall?.[1]?.body)) as Record<
    string,
    unknown
  >
  expect(requestBody).toEqual({
    workerId: 'builder',
    prompt: 'Persist under this Card',
    cardBinding: {
      ...rootOwner,
      canonicalSource: 'local',
      canonicalSegmentKey: 'local:builder',
      canonicalTransport: 'tmux',
    },
    limit: 30,
    timeoutMs: 120_000,
  })
  expect(mocks.mutationResults[0]).toEqual({
    cardOwner: rootOwner,
  })
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['chat', 'session-cards', 'list', false, 0],
  })
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['chat', 'session-cards', 'history', rootOwner.cardId, ''],
  })
  expect(JSON.stringify(mocks.mutationResults)).not.toContain('local:builder"')
})

it('uses parent/child Card IDs for child history and rejects a nonmatching parent', async () => {
  mocks.queryData = {
    target: {
      cardId: childOwner.cardId,
      parentCardId: rootOwner.cardId,
      title: 'Authoritative child Card',
      relationship: 'child',
      route: {
        to: '/chat/$sessionKey',
        params: { sessionKey: rootOwner.cardId },
        search: { inspect: childOwner.cardId },
      },
    },
    status: 'ready',
    messages: readyTranscript().messages,
    error: null,
  }
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(Response.json(cardResponse({ withChild: true })))
    }
    if (
      url ===
      '/api/session-cards/local%3Aworker-child-card/history?parentCardId=local%3Aworker-card&limit=500'
    ) {
      return Promise.resolve(
        Response.json(
          historyResponse({
            cardId: childOwner.cardId,
            canonicalSegmentKey: 'local:raw-worker-child-segment',
          }),
        ),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer(childOwner)
  await waitFor(() => expect(latestMappedQuery()).toBeTruthy())
  const childQuery = latestMappedQuery()!
  expect(childQuery.queryKey).toEqual([
    'chat',
    'session-cards',
    'child-history',
    rootOwner.cardId,
    childOwner.cardId,
    '',
  ])
  expect((await childQuery.queryFn({ signal: undefined })).status).toBe('ready')

  mocks.queryOptions.length = 0
  await mountViewer({
    ...childOwner,
    parentCardId: 'local:other-parent',
  })
  await waitFor(() => {
    expect(
      screen.getByText(
        'Transcript unavailable: no complete Session Card is mapped to this worker.',
      ),
    ).toBeTruthy()
  })
  expect(latestMappedQuery()).toBeUndefined()
})

it('hides incomplete mapping/history and never falls back to raw worker chat', async () => {
  let list = cardResponse({ completeness: 'incomplete' })
  let history = historyResponse()
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input)
    if (url === '/api/session-cards')
      return Promise.resolve(Response.json(list))
    if (url.includes('/history')) return Promise.resolve(Response.json(history))
    if (url.startsWith('/api/swarm-chat')) {
      return Promise.resolve(
        Response.json({
          messages: [{ content: 'Raw fallback must stay hidden' }],
        }),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer()
  await waitFor(() => {
    expect(
      screen.getByText(
        'Transcript unavailable: no complete Session Card is mapped to this worker.',
      ),
    ).toBeTruthy()
  })
  expect(latestMappedQuery()).toBeUndefined()
  expect(document.body.textContent).not.toContain(
    'Raw fallback must stay hidden',
  )
  expect(
    fetchMock.mock.calls.some(([input]) => String(input).includes('/history')),
  ).toBe(false)

  list = cardResponse()
  history = historyResponse({ completeness: 'partial' })
  mocks.queryData = {
    target: rootTarget,
    status: 'incomplete',
    messages: [],
    error: null,
  }
  mocks.queryOptions.length = 0
  await mountViewer()
  await waitFor(() => {
    expect(
      screen.getByText(
        'Transcript unavailable: Session Card history is incomplete.',
      ),
    ).toBeTruthy()
    expect(latestMappedQuery()).toBeTruthy()
  })
  const incomplete = await latestMappedQuery()!.queryFn({ signal: undefined })
  expect(incomplete.status).toBe('incomplete')
  expect(incomplete.messages).toEqual([])
  expect(document.body.textContent).not.toContain(
    'Authoritative Card transcript',
  )
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).startsWith('/api/swarm-chat'),
    ),
  ).toBe(false)
})
