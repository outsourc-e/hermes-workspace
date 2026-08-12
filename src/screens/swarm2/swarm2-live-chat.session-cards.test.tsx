// @vitest-environment jsdom

import 'fake-indexeddb/auto'
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
import {
  clearCardTranscriptRecoveryMemory,
  readCardTranscriptRecovery,
} from '@/screens/chat/card-transcript-recovery'
import { resetWorkspaceChatIndexedDb } from '@/screens/chat/card-transcript-indexeddb'
import { swarmDirectChatContentDigest } from '@/lib/swarm-direct-chat-delivery'

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
  composerReset: vi.fn(),
  composerSetValue: vi.fn(),
  composerSetAttachments: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))
vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@/screens/chat/components/chat-composer', async () => {
  type ReactActual = {
    createElement: typeof React.createElement
    useState: typeof React.useState
  }
  const ReactModule = await vi.importActual<ReactActual>('react')
  const attachment = {
    id: 'swarm-attachment-1',
    name: 'evidence.txt',
    contentType: 'text/plain',
    size: 5,
    dataUrl: 'data:text/plain;base64,aGVsbG8=',
  }
  type ComposerProps = {
    disabled: boolean
    onSubmit: (
      value: string,
      attachments: Array<typeof attachment>,
      fastMode: boolean,
      helpers: {
        reset: () => void
        setValue: (value: string) => void
        setAttachments: (attachments: Array<typeof attachment>) => void
      },
    ) => void
  }
  return {
    ChatComposer: ({ disabled, onSubmit }: ComposerProps) => {
      const [value, setValue] = ReactModule.useState('Review the evidence')
      const [attachments, setAttachments] = ReactModule.useState([attachment])
      const helpers = {
        reset: () => {
          mocks.composerReset()
          setValue('')
          setAttachments([])
        },
        setValue: (nextValue: string) => {
          mocks.composerSetValue(nextValue)
          setValue(nextValue)
        },
        setAttachments: (nextAttachments: Array<typeof attachment>) => {
          mocks.composerSetAttachments(nextAttachments)
          setAttachments(nextAttachments)
        },
      }
      return ReactModule.createElement(
        'div',
        null,
        ReactModule.createElement(
          'output',
          { 'aria-label': 'Swarm composer draft' },
          value,
        ),
        ReactModule.createElement(
          'output',
          { 'aria-label': 'Swarm composer attachment count' },
          String(attachments.length),
        ),
        ReactModule.createElement(
          'button',
          {
            type: 'button',
            disabled,
            onClick: () => onSubmit(value, attachments, false, helpers),
          },
          'Send attachment',
        ),
        ReactModule.createElement(
          'button',
          {
            type: 'button',
            disabled,
            onClick: () => onSubmit('', attachments, false, helpers),
          },
          'Send attachment only',
        ),
      )
    },
  }
})
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
    mutationFn: (input: unknown) => Promise<unknown>
    onSuccess?: (result: unknown) => Promise<void> | void
  }) => ({
    isPending: false,
    error: null,
    mutateAsync: vi.fn(async (input: unknown) => {
      const result = await options.mutationFn(input)
      mocks.mutationResults.push(result)
      await options.onSuccess?.(result)
      return result
    }),
  }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    setQueryData: (
      _queryKey: ReadonlyArray<unknown>,
      updater: (
        current: SanitizedTranscript | undefined,
      ) => SanitizedTranscript,
    ) => {
      mocks.queryData = updater(mocks.queryData)
    },
  }),
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
  nativeStyle = false,
) {
  const container = document.createElement('div')
  container.dataset.surface = surface
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(
      <Swarm2LiveChat
        workerId="builder"
        cardOwner={owner}
        nativeStyle={nativeStyle}
      />,
    )
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

beforeEach(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  clearCardTranscriptRecoveryMemory()
  mocks.navigate.mockReset()
  mocks.invalidateQueries.mockReset()
  mocks.queryOptions.length = 0
  mocks.queryData = readyTranscript()
  mocks.mutationResults.length = 0
  mocks.composerReset.mockReset()
  mocks.composerSetValue.mockReset()
  mocks.composerSetAttachments.mockReset()
  const database = await resetWorkspaceChatIndexedDb()
  database.close()
})

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop()!
    React.act(() => mounted.root.unmount())
    mounted.container.remove()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-8000-000000000001',
  )
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
          userAcknowledgement: {
            version: 1,
            clientId: '00000000-0000-4000-8000-000000000001',
            observedAt: 500,
            contentDigest: swarmDirectChatContentDigest(
              'Persist under this Card',
            ),
          },
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
    clientId: '00000000-0000-4000-8000-000000000001',
    prompt: 'Persist under this Card',
    attachments: [],
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
  expect(
    (
      await readCardTranscriptRecovery({ cardId: rootOwner.cardId })
    )?.messages.at(-1),
  ).toMatchObject({
    clientId: '00000000-0000-4000-8000-000000000001',
    __swarmDeliveryAcknowledgement: {
      version: 1,
      clientId: '00000000-0000-4000-8000-000000000001',
      observedAt: 500,
      contentDigest: swarmDirectChatContentDigest('Persist under this Card'),
    },
  })
})

it('delivers attachment-only submissions after admitting them into Card recovery', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-8000-000000000002',
  )
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
          userAcknowledgement: {
            version: 2,
            clientId: '00000000-0000-4000-8000-000000000002',
            observedAt: 500,
            contentDigest: swarmDirectChatContentDigest(
              '[User attached file: /tmp/evidence.txt]\nPlease review the attached content.',
            ),
            attachments: [
              {
                id: 'swarm-attachment-1',
                name: 'evidence.txt',
                contentType: 'text/plain',
                size: 5,
                contentDigest:
                  'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
              },
            ],
          },
          fetchedAt: 123,
        }),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer(rootOwner, '/swarm2', true)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Send attachment' }),
    ).toBeTruthy(),
  )
  await React.act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Send attachment only' }),
    )
    await Promise.resolve()
  })

  await waitFor(async () => {
    const recovery = await readCardTranscriptRecovery({
      cardId: rootOwner.cardId,
    })
    expect(recovery?.messages.at(-1)).toMatchObject({
      role: 'user',
      attachments: [
        {
          id: 'swarm-attachment-1',
          name: 'evidence.txt',
          contentType: 'text/plain',
          size: 5,
          dataUrl: 'data:text/plain;base64,aGVsbG8=',
        },
      ],
    })
  })
  expect(mocks.queryData?.messages.at(-1)).toMatchObject({
    role: 'user',
    content: '',
    pending: true,
    attachments: [{ id: 'swarm-attachment-1', name: 'evidence.txt' }],
  })
  const sendCall = fetchMock.mock.calls.find(
    ([input]) => String(input) === '/api/swarm-direct-chat',
  )
  const requestBody = JSON.parse(String(sendCall?.[1]?.body)) as {
    prompt?: string
    attachments?: Array<Record<string, unknown>>
  }
  expect(requestBody.prompt).toBe('Please review the attached content.')
  expect(requestBody.attachments).toEqual([
    {
      id: 'swarm-attachment-1',
      name: 'evidence.txt',
      contentType: 'text/plain',
      size: 5,
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
      contentDigest:
        'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    },
  ])
  await waitFor(() => {
    expect(screen.getByLabelText('Swarm composer draft').textContent).toBe('')
    expect(
      screen.getByLabelText('Swarm composer attachment count').textContent,
    ).toBe('0')
  })
})

it('fails closed before transport when Card recovery storage cannot admit the attachment', async () => {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(
        Response.json(cardResponse({ canonicalSegmentKey: 'local:builder' })),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer(rootOwner, '/swarm2', true)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Send attachment' }),
    ).toBeTruthy(),
  )
  const indexedDbWrite = vi
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(() => {
      throw new DOMException('denied', 'QuotaExceededError')
    })
  await React.act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send attachment' }))
    await vi.waitFor(() =>
      expect(mocks.composerSetValue).toHaveBeenCalledWith(
        'Review the evidence',
      ),
    )
  })

  await waitFor(() =>
    expect(
      screen.getByText('Unable to save or deliver this Session Card message'),
    ).toBeTruthy(),
  )
  expect(
    fetchMock.mock.calls.some(
      ([input]) => String(input) === '/api/swarm-direct-chat',
    ),
  ).toBe(false)
  expect(
    await readCardTranscriptRecovery({ cardId: rootOwner.cardId }),
  ).toBeNull()
  expect(screen.getByLabelText('Swarm composer draft').textContent).toBe(
    'Review the evidence',
  )
  expect(
    screen.getByLabelText('Swarm composer attachment count').textContent,
  ).toBe('1')
  indexedDbWrite.mockRestore()
})

it('preserves the mounted Swarm draft and attachments when delivery fails after durable admission', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-8000-000000000003',
  )
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(
        Response.json(cardResponse({ canonicalSegmentKey: 'local:builder' })),
      )
    }
    if (url === '/api/swarm-direct-chat' && init?.method === 'POST') {
      return Promise.resolve(
        Response.json(
          { error: 'Unable to deliver the worker message' },
          { status: 500 },
        ),
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)

  await mountViewer(rootOwner, '/swarm2', true)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Send attachment' }),
    ).toBeTruthy(),
  )
  await React.act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send attachment' }))
    await vi.waitFor(() =>
      expect(mocks.composerSetValue).toHaveBeenCalledWith(
        'Review the evidence',
      ),
    )
  })

  await waitFor(() =>
    expect(
      screen.getByText('Unable to save or deliver this Session Card message'),
    ).toBeTruthy(),
  )
  expect(screen.getByLabelText('Swarm composer draft').textContent).toBe(
    'Review the evidence',
  )
  expect(
    screen.getByLabelText('Swarm composer attachment count').textContent,
  ).toBe('1')
  await waitFor(async () =>
    expect(
      (
        await readCardTranscriptRecovery({ cardId: rootOwner.cardId })
      )?.messages.at(-1),
    ).toMatchObject({
      clientId: '00000000-0000-4000-8000-000000000003',
      status: 'sending',
      attachments: [
        {
          id: 'swarm-attachment-1',
          contentDigest:
            'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        },
      ],
    }),
  )
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
  expect(incomplete.messages.map((message) => message.content)).toContain(
    'Authoritative Card transcript',
  )
  expect(
    fetchMock.mock.calls.some(([input]) =>
      String(input).startsWith('/api/swarm-chat'),
    ),
  ).toBe(false)
})
