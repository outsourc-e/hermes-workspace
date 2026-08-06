// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationsScreen } from './operations-screen'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: (context?: { signal?: AbortSignal }) => Promise<unknown>
}

type MutationOptions = {
  mutationFn: (input: any) => Promise<unknown>
  onSuccess?: (result: unknown) => Promise<unknown> | unknown
}

type QueryResult = {
  data?: unknown
  error: null
  isPending: boolean
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  mutationOptions: [] as Array<MutationOptions>,
  chatScreenProps: [] as Array<Record<string, any>>,
  invalidateQueries: vi.fn(),
  historyRefetch: vi.fn(),
  historyResponse: {
    messages: [],
    completeness: 'complete',
    retryable: false,
    missingSegments: [],
  } as Record<string, unknown>,
  cardResponse: undefined as SessionCardListWire | undefined,
}))

function queryResult(data?: unknown): QueryResult {
  return {
    data,
    error: null,
    isPending: false,
    refetch: vi.fn().mockResolvedValue({ data }),
  }
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = options.queryKey
    if (key[0] === 'operations' && key[1] === 'config') {
      return queryResult({
        parsed: {
          agents: {
            list: [
              {
                id: 'worker',
                name: 'Worker',
                model: 'test-model',
              },
              {
                id: 'child-worker',
                name: 'Child Worker',
                model: 'test-model',
              },
            ],
          },
          defaultModel: 'test-model',
        },
      })
    }
    if (key[0] === 'chat' && key[1] === 'session-cards') {
      if (key[2] === 'history' || key[2] === 'child-history') {
        return {
          ...queryResult(mocks.historyResponse),
          isFetching: false,
          refetch: mocks.historyRefetch,
        }
      }
      return queryResult(mocks.cardResponse)
    }
    if (key[0] === 'operations' && key[1] === 'sessions') {
      return queryResult([
        {
          key: 'raw-unmapped-session',
          title: 'Raw session must stay hidden',
          status: 'running',
          updatedAt: Date.now(),
        },
      ])
    }
    if (key[0] === 'operations' && key[1] === 'cron') return queryResult([])
    return queryResult(undefined)
  },
  useMutation: (options: MutationOptions) => {
    mocks.mutationOptions.push(options)
    return {
      isPending: false,
      mutate: vi.fn((input) => void options.mutationFn(input)),
      mutateAsync: vi.fn(async (input) => {
        const result = await options.mutationFn(input)
        await options.onSuccess?.(result)
        return result
      }),
    }
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button {...props}>{children}</button>
    ),
    section: ({ children, ...props }: React.ComponentProps<'section'>) => (
      <section {...props}>{children}</section>
    ),
  },
}))

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@/screens/chat/chat-screen', () => ({
  ChatScreen: (props: Record<string, any>) => {
    mocks.chatScreenProps.push(props)
    return <div data-testid="orchestrator-card-chat">Card chat</div>
  },
}))
vi.mock('@/components/agent-view/agent-progress', () => ({
  AgentProgress: () => null,
}))
vi.mock('@/components/agent-swarm/pixel-avatar', () => ({
  PixelAvatar: () => null,
}))
vi.mock('@/components/prompt-kit/markdown', () => ({
  Markdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('./components/operations-agent-detail', () => ({
  OperationsAgentDetail: () => null,
}))
vi.mock('./components/operations-new-agent-modal', () => ({
  OperationsNewAgentModal: () => null,
}))
vi.mock('./components/operations-settings-modal', () => ({
  OperationsSettingsModal: () => null,
}))
vi.mock('./components/full-outputs-view', () => ({
  FullOutputsView: () => null,
}))
vi.mock('./components/agent-bus-panel', () => ({ AgentBusPanel: () => null }))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    render: _render,
    size: _size,
    variant: _variant,
    ...props
  }: React.ComponentProps<'button'> & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }))
vi.mock('@/lib/cron-api', () => ({ fetchCronJobs: vi.fn() }))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const operationsOverlayKey =
  'workspace.operations-card-chat.v1:remote%3Aworker-card'
const operationsCompleteSnapshotKey =
  'workspace.operations-card-complete-history.v1:remote%3Aworker-card'

function rejectOperationsStorageWrites({
  keyPrefix,
  afterSuccessfulWrites = 0,
  exceptionName,
  storageArea,
}: {
  keyPrefix: string
  afterSuccessfulWrites?: number
  exceptionName: 'QuotaExceededError' | 'SecurityError'
  storageArea?: Storage
}) {
  const originalSetItem = Storage.prototype.setItem
  let matchingWrites = 0
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key.startsWith(keyPrefix) && (!storageArea || this === storageArea)) {
      matchingWrites += 1
      if (matchingWrites > afterSuccessfulWrites) {
        throw new DOMException('Operations storage unavailable', exceptionName)
      }
    }
    return originalSetItem.call(this, key, value)
  })
}

function sessionCardResponse({
  rootCompleteness = 'complete',
  includeMissingResolution = false,
}: {
  rootCompleteness?: 'complete' | 'incomplete'
  includeMissingResolution?: boolean
} = {}): SessionCardListWire {
  const main: SessionCardWire = {
    cardId: 'local:main-card',
    canonicalSource: 'local',
    title: 'Main Card activity',
    titleSource: 'manual',
    canonicalSegmentKey: 'local:main',
    continuationSegmentKeys: ['local:main-card', 'local:main'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: 5,
    archived: false,
    pinned: false,
  }
  const root: SessionCardWire = {
    cardId: 'remote:worker-card',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Worker root activity',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:agent%3Amain%3Aops-worker',
    continuationSegmentKeys: [
      'remote:worker-card',
      'remote:agent%3Amain%3Aops-worker',
    ],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'remote:worker-child-card',
        sessionKey: 'remote:agent%3Amain%3Aops-child-worker',
        continuationSegmentKeys: [
          'remote:worker-child-card',
          'remote:agent%3Amain%3Aops-child-worker',
        ],
        continuationCount: 2,
        relationshipKind: 'child',
        title: 'Worker child activity',
        status: 'running',
        updatedAt: 20,
      },
    ],
    updatedAt: 10,
    archived: false,
    pinned: false,
  }
  const missingResolution: SessionCardWire = {
    ...root,
    cardId: 'local:unmapped-root',
    canonicalSource: 'local',
    canonicalTransport: undefined,
    title: 'Unmapped Card activity',
    canonicalSegmentKey: 'local:unmapped-root',
    continuationSegmentKeys: ['local:unmapped-root'],
    continuationCount: 1,
    childNodes: [],
  }
  const cards = includeMissingResolution
    ? [main, root, missingResolution]
    : [main, root]
  return {
    cards,
    cardResolutions: [
      {
        cardId: main.cardId,
        completeness: 'complete',
        retryable: false,
      },
      {
        cardId: root.cardId,
        completeness: rootCompleteness,
        retryable: rootCompleteness === 'incomplete',
      },
    ],
    completeness: rootCompleteness,
    retryable: rootCompleteness === 'incomplete',
    sources: [],
  }
}

async function renderOperations() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<OperationsScreen />)
    await Promise.resolve()
  })
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    React.act(() => root.unmount())
    container.remove()
  }
  mountedRoots.push(unmount)
  return {
    rerender: async () => {
      await React.act(async () => {
        root.render(<OperationsScreen />)
        await Promise.resolve()
      })
    },
    unmount,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  mocks.navigate.mockReset()
  mocks.invalidateQueries.mockReset()
  mocks.historyRefetch.mockReset()
  mocks.historyRefetch.mockResolvedValue({ data: mocks.historyResponse })
  mocks.historyResponse = {
    messages: [],
    completeness: 'complete',
    retryable: false,
    missingSegments: [],
  }
  mocks.queryOptions.length = 0
  mocks.mutationOptions.length = 0
  mocks.chatScreenProps.length = 0
  mocks.cardResponse = sessionCardResponse()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mounted Operations Session Card activity', () => {
  it('uses Card history/stream transport for source-qualified root and child chats', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/session-cards') {
        return Promise.resolve(Response.json(mocks.cardResponse))
      }
      if (url.includes('/history')) {
        const isChild = url.includes('worker-child-card')
        return Promise.resolve(
          Response.json({
            cardId: isChild ? 'remote:worker-child-card' : 'remote:worker-card',
            canonicalSegmentKey: isChild
              ? 'remote:agent%3Amain%3Aops-child-worker'
              : 'remote:agent%3Amain%3Aops-worker',
            messages: [],
            completeness: 'complete',
            retryable: false,
            missingSegments: [],
          }),
        )
      }
      if (url === '/api/send-stream' && init?.method === 'POST') {
        return Promise.resolve(new Response('event: done\ndata: {}\n\n'))
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderOperations()

    expect(screen.queryByText('Raw session must stay hidden')).toBeNull()
    expect(document.body.textContent).not.toContain('agent:main:ops-')
    expect(mocks.chatScreenProps.at(-1)).toMatchObject({
      activeFriendlyId: 'local:main-card',
      activeCard: {
        cardId: 'local:main-card',
        canonicalSegmentKey: 'local:main',
        canonicalSource: 'local',
      },
      embedded: true,
      isNewChat: false,
    })

    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Worker root activity' }),
      ),
    )
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-card' },
      search: {},
    })
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Worker child activity' }),
      ),
    )
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-card' },
      search: { inspect: 'remote:worker-child-card' },
    })

    expect(
      mocks.queryOptions.some(
        ({ queryKey }) =>
          queryKey[0] === 'operations' && queryKey[1] === 'sessions',
      ),
    ).toBe(false)
    const cardListQuery = mocks.queryOptions.find(
      ({ queryKey }) =>
        queryKey[0] === 'chat' &&
        queryKey[1] === 'session-cards' &&
        queryKey[2] === 'list',
    )
    await expect(cardListQuery?.queryFn()).resolves.toEqual(mocks.cardResponse)

    const historyQueries = mocks.queryOptions.filter(
      ({ queryKey }) =>
        queryKey[0] === 'chat' &&
        queryKey[1] === 'session-cards' &&
        (queryKey[2] === 'history' || queryKey[2] === 'child-history'),
    )
    expect(
      new Set(historyQueries.map(({ queryKey }) => JSON.stringify(queryKey))),
    ).toHaveLength(2)
    await Promise.all(
      [
        ...new Map(
          historyQueries.map((query) => [
            JSON.stringify(query.queryKey),
            query,
          ]),
        ).values(),
      ].map((query) => query.queryFn({ signal: undefined })),
    )

    const rootInput = screen.getByPlaceholderText('Message Worker...')
    await React.act(async () => {
      fireEvent.change(rootInput, { target: { value: 'hello Card' } })
      fireEvent.keyDown(rootInput, { key: 'Enter' })
      await Promise.resolve()
    })
    const childInput = screen.getAllByPlaceholderText<HTMLInputElement>(
      'Session Card chat unavailable',
    )[0]!
    expect(childInput.disabled).toBe(true)
    expect(screen.getByText('Direct child transcript · read-only')).toBeTruthy()

    const requests = fetchMock.mock.calls.map(([input]) => String(input))
    expect(requests).toContain('/api/session-cards')
    expect(requests.filter((url) => url.includes('/history'))).toHaveLength(2)
    expect(requests).toContain('/api/send-stream')
    expect(requests.join('\n')).not.toMatch(
      /\/api\/(history|session-history|session-send)(?:\?|$)/,
    )
    const sendCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/send-stream',
    )
    expect(JSON.parse(String(sendCall?.[1]?.body))).toMatchObject({
      cardId: 'remote:worker-card',
      sessionKey: 'remote:agent%3Amain%3Aops-worker',
      friendlyId: 'remote:worker-card',
      message: 'hello Card',
    })
    expect(mocks.invalidateQueries.mock.calls).toContainEqual([
      { queryKey: ['chat', 'session-cards', 'list', false, 0] },
    ])
  })

  it('sends Run now with the exact Card binding and no raw agent session alias', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/session-send' && init?.method === 'POST') {
        return Promise.resolve(
          Response.json({
            ok: true,
            cardOwner: {
              kind: 'session-card-owner',
              cardId: 'remote:worker-card',
              parentCardId: null,
            },
            queued: true,
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderOperations()
    await React.act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Worker now' }))
      await Promise.resolve()
    })

    const sendCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/session-send',
    )
    expect(sendCall).toBeTruthy()
    expect(JSON.parse(String(sendCall?.[1]?.body))).toEqual({
      message: 'Run your primary task now',
      cardBinding: {
        kind: 'session-card-owner',
        cardId: 'remote:worker-card',
        parentCardId: null,
        canonicalSource: 'remote',
        canonicalSegmentKey: 'remote:agent%3Amain%3Aops-worker',
        canonicalTransport: 'gateway',
      },
    })
    expect(String(sendCall?.[1]?.body)).not.toContain('agent:main:ops-worker')
    expect(mocks.invalidateQueries.mock.calls).toContainEqual([
      {
        queryKey: [
          'chat',
          'session-cards',
          'history',
          'remote:worker-card',
          '',
        ],
      },
    ])
  })

  it('keeps the optimistic user and returned assistant rows Card-owned across stale history and remount', async () => {
    const assistantText = 'durable Operations assistant reply'
    const userText = 'durable Operations user turn'
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/session-cards') {
        return Promise.resolve(Response.json(mocks.cardResponse))
      }
      if (url === '/api/send-stream' && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            [
              'event: started',
              'data: {"runId":"operations-run"}',
              '',
              'event: chunk',
              `data: ${JSON.stringify({ text: assistantText, fullReplace: true })}`,
              '',
              'event: done',
              'data: {"state":"final"}',
              '',
              '',
            ].join('\n'),
          ),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    const mounted = await renderOperations()
    const input =
      screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
    await React.act(async () => {
      fireEvent.change(input, { target: { value: userText } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await Promise.resolve()
    })

    expect(screen.getByText(userText)).toBeTruthy()
    expect(screen.getByText(assistantText)).toBeTruthy()

    await React.act(async () => {
      await mocks.historyRefetch()
    })
    await mounted.rerender()
    expect(screen.getByText(userText)).toBeTruthy()
    expect(screen.getByText(assistantText)).toBeTruthy()

    const storedKeys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index) ?? '',
    ).filter((key) => key.startsWith('workspace.operations-card-chat.'))
    expect(storedKeys).toEqual([
      'workspace.operations-card-chat.v1:remote%3Aworker-card',
    ])
    expect(JSON.stringify(window.localStorage)).not.toContain(
      'remote:agent%3Amain%3Aops-worker',
    )

    mounted.unmount()
    const remounted = await renderOperations()
    expect(screen.getByText(userText)).toBeTruthy()
    expect(screen.getByText(assistantText)).toBeTruthy()

    mocks.historyResponse = {
      messages: [
        {
          id: 'server-user',
          role: 'user',
          content: [{ type: 'text', text: userText }],
        },
        {
          id: 'server-assistant',
          role: 'assistant',
          content: [{ type: 'text', text: assistantText }],
        },
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }
    await remounted.rerender()
    const remountedRootCard = screen
      .getByPlaceholderText('Message Worker...')
      .closest('article')!
    expect(within(remountedRootCard).getAllByText(userText)).toHaveLength(1)
    expect(within(remountedRootCard).getAllByText(assistantText)).toHaveLength(
      1,
    )
    expect(
      JSON.parse(
        window.localStorage.getItem(
          'workspace.operations-card-chat.v1:remote%3Aworker-card',
        ) ?? '{}',
      ).messages,
    ).toEqual([])
  })

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'fails closed before accepted transport when the optimistic recovery write raises %s',
    async (exceptionName) => {
      rejectOperationsStorageWrites({
        keyPrefix: 'workspace.operations-card-chat.',
        exceptionName,
      })
      const fetchMock = vi.fn<typeof fetch>((input) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      await renderOperations()
      const input =
        screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
      await React.act(async () => {
        fireEvent.change(input, { target: { value: 'must remain unsent' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        await Promise.resolve()
      })

      expect(input.value).toBe('must remain unsent')
      expect(screen.queryByText('must remain unsent')).toBeNull()
      expect(
        fetchMock.mock.calls.some(
          ([request]) => String(request) === '/api/send-stream',
        ),
      ).toBe(false)
    },
  )

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'does not accept a session-only stream chunk after tab close and partial history when local recovery raises %s',
    async (exceptionName) => {
      const userText = `accepted ${exceptionName} user turn`
      const assistantText = `accepted ${exceptionName} assistant chunk`
      rejectOperationsStorageWrites({
        keyPrefix: 'workspace.operations-card-chat.',
        afterSuccessfulWrites: 1,
        exceptionName,
        storageArea: window.localStorage,
      })
      const fetchMock = vi.fn<typeof fetch>((input, init) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        if (url === '/api/send-stream' && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              [
                'event: chunk',
                `data: ${JSON.stringify({ text: assistantText, fullReplace: true })}`,
                '',
                'event: done',
                'data: {"state":"final"}',
                '',
                '',
              ].join('\n'),
            ),
          )
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      const mounted = await renderOperations()
      const input =
        screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
      await React.act(async () => {
        fireEvent.change(input, { target: { value: userText } })
        fireEvent.keyDown(input, { key: 'Enter' })
        await Promise.resolve()
      })

      expect(input.value).toBe('')
      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.queryByText(assistantText)).toBeNull()
      expect(
        screen.getByText(
          'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
        ),
      ).toBeTruthy()
      expect(
        JSON.parse(window.localStorage.getItem(operationsOverlayKey) ?? '{}'),
      ).toMatchObject({
        messages: [{ role: 'user', content: userText }],
      })

      mocks.historyResponse = {
        messages: [],
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: 'remote:temporarily-unavailable',
            retryable: true,
            error: 'temporary upstream failure',
          },
        ],
      }
      await mounted.rerender()

      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.queryByText(assistantText)).toBeNull()

      mounted.unmount()
      window.sessionStorage.clear()
      await renderOperations()
      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.queryByText(assistantText)).toBeNull()
    },
  )

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'does not expose a non-durable chunk when every mirror raises %s mid-stream',
    async (exceptionName) => {
      const userText = `durable ${exceptionName} checkpoint`
      const assistantText = `non-durable ${exceptionName} chunk`
      rejectOperationsStorageWrites({
        keyPrefix: 'workspace.operations-card-chat.',
        afterSuccessfulWrites: 2,
        exceptionName,
      })
      const fetchMock = vi.fn<typeof fetch>((input, init) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        if (url === '/api/send-stream' && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              `event: chunk\ndata: ${JSON.stringify({ text: assistantText, fullReplace: true })}\n\n`,
            ),
          )
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      })
      vi.stubGlobal('fetch', fetchMock)

      const mounted = await renderOperations()
      const input =
        screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
      await React.act(async () => {
        fireEvent.change(input, { target: { value: userText } })
        fireEvent.keyDown(input, { key: 'Enter' })
        await Promise.resolve()
      })

      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.queryByText(assistantText)).toBeNull()
      expect(
        fetchMock.mock.calls.some(
          ([request]) => String(request) === '/api/send-stream',
        ),
      ).toBe(true)

      mocks.historyResponse = {
        messages: [],
        completeness: 'partial',
        retryable: true,
        missingSegments: [],
      }
      mounted.unmount()
      await renderOperations()
      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.queryByText(assistantText)).toBeNull()
    },
  )

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'keeps complete history visible but warns when its snapshot is only tab-scoped after %s',
    async (exceptionName) => {
      const priorAssistantText = `prior durable ${exceptionName} assistant reply`
      const userText = `complete ${exceptionName} user turn`
      const assistantText = `complete ${exceptionName} assistant reply`
      window.localStorage.setItem(
        operationsCompleteSnapshotKey,
        JSON.stringify({
          version: 1,
          owner: { cardId: 'remote:worker-card' },
          messages: [
            {
              id: 'prior-server-assistant',
              role: 'assistant',
              content: priorAssistantText,
            },
          ],
        }),
      )
      mocks.historyResponse = {
        messages: [
          {
            id: 'server-user',
            role: 'user',
            content: [{ type: 'text', text: userText }],
          },
          {
            id: 'server-assistant',
            role: 'assistant',
            content: [{ type: 'text', text: assistantText }],
          },
        ],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      }
      const storageSpy = rejectOperationsStorageWrites({
        keyPrefix: 'workspace.operations-card-complete-history.',
        exceptionName,
        storageArea: window.localStorage,
      })

      const mounted = await renderOperations()
      const rootCard = screen
        .getByPlaceholderText('Message Worker...')
        .closest('article')!
      expect(within(rootCard).getByText(userText)).toBeTruthy()
      expect(within(rootCard).getByText(assistantText)).toBeTruthy()
      const durabilityWarning =
        'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.'
      expect(within(rootCard).getByText(durabilityWarning)).toBeTruthy()
      expect(
        window.localStorage.getItem(operationsCompleteSnapshotKey),
      ).toContain(priorAssistantText)

      storageSpy.mockRestore()
      mocks.historyResponse = { ...mocks.historyResponse }
      await mounted.rerender()
      expect(within(rootCard).queryByText(durabilityWarning)).toBeNull()

      mocks.historyResponse = {
        messages: [],
        completeness: 'partial',
        retryable: true,
        missingSegments: [
          {
            segmentKey: 'remote:temporarily-unavailable',
            retryable: true,
            error: 'temporary upstream failure',
          },
        ],
      }
      await mounted.rerender()

      expect(within(rootCard).getByText(userText)).toBeTruthy()
      expect(within(rootCard).getByText(assistantText)).toBeTruthy()

      mounted.unmount()
      await renderOperations()
      const remountedRootCard = screen
        .getByPlaceholderText('Message Worker...')
        .closest('article')!
      expect(
        within(remountedRootCard).queryByText(priorAssistantText),
      ).toBeNull()
      expect(within(remountedRootCard).getByText(userText)).toBeTruthy()
      expect(within(remountedRootCard).getByText(assistantText)).toBeTruthy()
    },
  )

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'does not promote a complete snapshot when every mirror raises %s',
    async (exceptionName) => {
      const priorText = `last durable ${exceptionName} snapshot`
      const rejectedText = `non-durable ${exceptionName} snapshot transition`
      window.localStorage.setItem(
        operationsCompleteSnapshotKey,
        JSON.stringify({
          version: 1,
          owner: { cardId: 'remote:worker-card' },
          messages: [
            { id: 'prior-durable', role: 'assistant', content: priorText },
          ],
        }),
      )
      mocks.historyResponse = {
        messages: [
          {
            id: 'new-server-message',
            role: 'assistant',
            content: [{ type: 'text', text: rejectedText }],
          },
        ],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      }
      rejectOperationsStorageWrites({
        keyPrefix: 'workspace.operations-card-complete-history.',
        exceptionName,
      })

      const mounted = await renderOperations()
      expect(screen.getAllByText(rejectedText).length).toBeGreaterThan(0)
      expect(
        screen.getAllByText(
          'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.',
        ).length,
      ).toBeGreaterThan(0)

      mocks.historyResponse = {
        messages: [],
        completeness: 'partial',
        retryable: true,
        missingSegments: [],
      }
      await mounted.rerender()
      const rootCard = screen
        .getByPlaceholderText('Message Worker...')
        .closest('article')!
      expect(within(rootCard).getByText(priorText)).toBeTruthy()
      expect(within(rootCard).queryByText(rejectedText)).toBeNull()

      mounted.unmount()
      await renderOperations()
      const remountedRootCard = screen
        .getByPlaceholderText('Message Worker...')
        .closest('article')!
      expect(within(remountedRootCard).getByText(priorText)).toBeTruthy()
      expect(within(remountedRootCard).queryByText(rejectedText)).toBeNull()
    },
  )

  it('does not evict accepted overlay rows at the former retention boundary', async () => {
    const retainedText = 'oldest unacknowledged accepted Operations turn'
    const existingMessages = Array.from({ length: 100 }, (_, index) => ({
      id: `accepted-${index}`,
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: index === 0 ? retainedText : `accepted Operations row ${index}`,
      acknowledgementOrdinal: 1,
    }))
    window.localStorage.setItem(
      operationsOverlayKey,
      JSON.stringify({
        version: 1,
        owner: { cardId: 'remote:worker-card' },
        messages: existingMessages,
      }),
    )
    const newUserText = 'accepted turn beyond the former overlay cap'
    const newAssistantText = 'accepted reply beyond the former overlay cap'
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input, init) => {
        const url = String(input)
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        if (url === '/api/send-stream' && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              `event: chunk\ndata: ${JSON.stringify({ text: newAssistantText, fullReplace: true })}\n\nevent: done\ndata: {"state":"final"}\n\n`,
            ),
          )
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    const mounted = await renderOperations()
    const input =
      screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
    await React.act(async () => {
      fireEvent.change(input, { target: { value: newUserText } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await Promise.resolve()
    })

    const stored = JSON.parse(
      window.localStorage.getItem(operationsOverlayKey) ?? '{}',
    ) as { messages?: Array<{ content?: string }> }
    expect(stored.messages).toHaveLength(102)
    expect(stored.messages?.[0]?.content).toBe(retainedText)

    mocks.historyResponse = {
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [],
    }
    mounted.unmount()
    await renderOperations()
    expect(screen.getByText(newUserText)).toBeTruthy()
    expect(screen.getByText(newAssistantText)).toBeTruthy()
  })

  it('persists complete transcripts beyond the former snapshot cap for partial-history remounts', async () => {
    const firstText = 'first accepted Operations history row'
    const lastText = 'last accepted Operations history row'
    mocks.historyResponse = {
      messages: Array.from({ length: 251 }, (_, index) => ({
        id: `server-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: [
          {
            type: 'text',
            text:
              index === 0
                ? firstText
                : index === 250
                  ? lastText
                  : `Operations history row ${index}`,
          },
        ],
      })),
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    const mounted = await renderOperations()
    const stored = JSON.parse(
      window.localStorage.getItem(operationsCompleteSnapshotKey) ?? '{}',
    ) as { messages?: Array<{ content?: string }> }
    expect(stored.messages).toHaveLength(251)
    expect(stored.messages?.[0]?.content).toBe(firstText)
    expect(stored.messages?.at(-1)?.content).toBe(lastText)

    mocks.historyResponse = {
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [],
    }
    mounted.unmount()
    await renderOperations()
    expect(screen.getAllByText(firstText).length).toBeGreaterThan(0)
    expect(screen.getAllByText(lastText).length).toBeGreaterThan(0)
    expect(
      JSON.parse(
        window.localStorage.getItem(operationsCompleteSnapshotKey) ?? '{}',
      ).messages,
    ).toHaveLength(251)
  })

  it('retains the last complete acknowledged transcript through partial refetch and remount', async () => {
    const userText = 'acknowledged Operations user turn'
    const assistantText = 'acknowledged Operations assistant reply'
    const overlayKey = 'workspace.operations-card-chat.v1:remote%3Aworker-card'
    window.localStorage.setItem(
      overlayKey,
      JSON.stringify({
        version: 1,
        owner: { cardId: 'remote:worker-card' },
        messages: [
          {
            id: 'optimistic-user',
            role: 'user',
            content: userText,
            acknowledgementOrdinal: 1,
          },
          {
            id: 'optimistic-assistant',
            role: 'assistant',
            content: assistantText,
            acknowledgementOrdinal: 1,
          },
        ],
      }),
    )
    mocks.historyResponse = {
      messages: [
        {
          id: 'server-user',
          role: 'user',
          content: [{ type: 'text', text: userText }],
        },
        {
          id: 'server-assistant',
          role: 'assistant',
          content: [{ type: 'text', text: assistantText }],
        },
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    const mounted = await renderOperations()
    const rootCard = screen
      .getByPlaceholderText('Message Worker...')
      .closest('article')!
    expect(within(rootCard).getAllByText(userText)).toHaveLength(1)
    expect(within(rootCard).getAllByText(assistantText)).toHaveLength(1)
    expect(
      JSON.parse(window.localStorage.getItem(overlayKey) ?? '{}').messages,
    ).toEqual([])

    mocks.historyResponse = {
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:unavailable-segment',
          retryable: true,
          error: 'temporary upstream failure',
        },
      ],
    }
    await mounted.rerender()

    expect(within(rootCard).getAllByText(userText)).toHaveLength(1)
    expect(within(rootCard).getAllByText(assistantText)).toHaveLength(1)
    expect(
      within(rootCard).getByText(
        'Chat history unavailable until a complete transcript is available.',
      ),
    ).toBeTruthy()

    mounted.unmount()
    await renderOperations()
    const remountedRootCard = screen
      .getByPlaceholderText('Message Worker...')
      .closest('article')!
    expect(within(remountedRootCard).getAllByText(userText)).toHaveLength(1)
    expect(within(remountedRootCard).getAllByText(assistantText)).toHaveLength(
      1,
    )
  })

  it('does not remove a matching Card overlay from a partial response', async () => {
    const overlayKey = 'workspace.operations-card-chat.v1:remote%3Aworker-card'
    const overlayText = 'still pending authoritative acknowledgement'
    window.localStorage.setItem(
      overlayKey,
      JSON.stringify({
        version: 1,
        owner: { cardId: 'remote:worker-card' },
        messages: [
          {
            id: 'optimistic-user',
            role: 'user',
            content: overlayText,
            acknowledgementOrdinal: 1,
          },
        ],
      }),
    )
    mocks.historyResponse = {
      messages: [
        {
          id: 'partial-server-user',
          role: 'user',
          content: [{ type: 'text', text: overlayText }],
        },
      ],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:unavailable-segment',
          retryable: true,
          error: 'temporary upstream failure',
        },
      ],
    }

    await renderOperations()

    const rootCard = screen
      .getByPlaceholderText('Message Worker...')
      .closest('article')!
    expect(within(rootCard).getAllByText(overlayText)).toHaveLength(1)
    expect(window.localStorage.getItem(overlayKey)).not.toBeNull()
  })

  it('fails closed before send when the current Card projection no longer matches the mounted binding', async () => {
    const rolledResponse = sessionCardResponse()
    rolledResponse.cards = rolledResponse.cards.map((card) =>
      card.cardId === 'remote:worker-card'
        ? {
            ...card,
            canonicalSegmentKey: 'remote:agent%3Amain%3Aops-worker-next',
            continuationSegmentKeys: [
              ...card.continuationSegmentKeys,
              'remote:agent%3Amain%3Aops-worker-next',
            ],
            continuationCount: card.continuationCount + 1,
          }
        : card,
    )
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input)
      if (url === '/api/session-cards') {
        return Promise.resolve(Response.json(rolledResponse))
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderOperations()
    const input =
      screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
    await React.act(async () => {
      fireEvent.change(input, { target: { value: 'do not misroute' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await Promise.resolve()
    })

    expect(input.value).toBe('do not misroute')
    expect(screen.queryByText('do not misroute')).toBeNull()
    expect(
      fetchMock.mock.calls.some(
        ([request]) => String(request) === '/api/send-stream',
      ),
    ).toBe(false)
  })

  it('hides incomplete and unresolved Card activity', async () => {
    mocks.cardResponse = sessionCardResponse({
      rootCompleteness: 'incomplete',
      includeMissingResolution: true,
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(mocks.cardResponse)),
    )

    await renderOperations()

    expect(screen.queryByText('Worker root activity')).toBeNull()
    expect(screen.queryByText('Worker child activity')).toBeNull()
    expect(screen.queryByText('Unmapped Card activity')).toBeNull()
    expect(document.body.textContent).not.toContain('agent:main:ops-')
    const unavailableInputs = screen.getAllByPlaceholderText<HTMLInputElement>(
      'Session Card chat unavailable',
    )
    expect(unavailableInputs).toHaveLength(2)
    expect(unavailableInputs.every((input) => input.disabled)).toBe(true)
    expect(
      screen.getAllByText(
        'Chat unavailable: no complete Session Card was resolved.',
      ),
    ).toHaveLength(2)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it.each([
    ['partial', 'partial', true],
    ['retryable', 'complete', true],
  ] as const)(
    'hides %s Card history message content and offers an explicit retry',
    async (_case, completeness, retryable) => {
      mocks.historyResponse = {
        messages: [
          {
            id: 'unsafe-message',
            role: 'assistant',
            content: [{ type: 'text', text: 'unsafe Operations transcript' }],
          },
        ],
        completeness,
        retryable,
        missingSegments:
          completeness === 'partial'
            ? [
                {
                  segmentKey: 'remote:missing',
                  retryable: true,
                  error: 'temporarily unavailable',
                },
              ]
            : [],
      }

      await renderOperations()

      expect(document.body.textContent).not.toContain(
        'unsafe Operations transcript',
      )
      expect(
        screen.getAllByText(
          'Chat history unavailable until a complete transcript is available.',
        ).length,
      ).toBeGreaterThan(0)
      const retry = screen.getAllByRole('button', {
        name: 'Retry Card history',
      })[0]!
      React.act(() => fireEvent.click(retry))
      expect(mocks.historyRefetch).toHaveBeenCalled()
    },
  )

  it('renders message content from complete non-retryable Card history', async () => {
    mocks.historyResponse = {
      messages: [
        {
          id: 'safe-message',
          role: 'assistant',
          content: [{ type: 'text', text: 'complete Operations transcript' }],
        },
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }

    await renderOperations()

    expect(screen.getAllByText('complete Operations transcript').length).toBe(2)
  })

  it('offers only explicit new bootstrap after authoritative main Card absence', async () => {
    mocks.cardResponse = sessionCardResponse()
    mocks.cardResponse.cards = mocks.cardResponse.cards.filter(
      (card) => card.cardId !== 'local:main-card',
    )
    mocks.cardResponse.cardResolutions =
      mocks.cardResponse.cardResolutions.filter(
        (resolution) => resolution.cardId !== 'local:main-card',
      )
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(mocks.cardResponse)),
    )

    await renderOperations()

    expect(mocks.chatScreenProps).toHaveLength(0)
    expect(document.body.textContent).not.toContain('activeFriendlyId="main"')
    await React.act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Start new conversation' }),
      )
      await Promise.resolve()
    })
    expect(mocks.chatScreenProps.at(-1)).toMatchObject({
      activeFriendlyId: 'new',
      embedded: true,
      isNewChat: true,
    })
    expect(mocks.chatScreenProps.at(-1)).not.toHaveProperty('activeCard')
  })
})
