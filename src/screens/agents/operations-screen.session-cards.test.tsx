// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import React from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationsScreen } from './operations-screen'
import { operationsChatStorageForTests } from './hooks/use-agent-chat'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'
import {
  WORKSPACE_CHAT_STORE_NAMES,
  resetWorkspaceChatIndexedDb,
} from '@/screens/chat/card-transcript-indexeddb'

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

function rejectIndexedDbWrites({
  storeName,
  afterSuccessfulWrites = 0,
  exceptionName,
}: {
  storeName: string
  afterSuccessfulWrites?: number
  exceptionName: 'QuotaExceededError' | 'SecurityError'
}) {
  const originalPut = IDBObjectStore.prototype.put
  let matchingWrites = 0
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (this.name === storeName) {
      matchingWrites += 1
      if (matchingWrites > afterSuccessfulWrites) {
        throw new DOMException('Operations storage unavailable', exceptionName)
      }
    }
    return originalPut.call(this, value, key)
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
  const workerResolution = mocks.cardResponse?.cardResolutions.find(
    (resolution) => resolution.cardId === 'remote:worker-card',
  )
  if (
    workerResolution?.completeness === 'complete' &&
    workerResolution.retryable === false
  ) {
    await waitFor(() => {
      const input =
        screen.getByPlaceholderText<HTMLInputElement>('Message Worker...')
      expect(input.disabled).toBe(false)
    })
  }
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

beforeEach(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  const database = await resetWorkspaceChatIndexedDb()
  database.close()
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

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) => String(input) === '/api/send-stream',
        ),
      ).toBe(true)
    })
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

  it('hydrates optimistic recovery from IndexedDB v4 across partial-history remounts', async () => {
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
            `event: chunk\ndata: ${JSON.stringify({ text: assistantText, fullReplace: true })}\n\nevent: done\ndata: {"state":"final"}\n\n`,
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

    await waitFor(() => {
      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.getByText(assistantText)).toBeTruthy()
    })
    const browserKeys = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => Boolean(key))
        .filter((key) => key.startsWith('workspace.operations-card-'))
    expect(browserKeys(window.localStorage)).toEqual([])
    expect(browserKeys(window.sessionStorage)).toEqual([])

    mocks.historyResponse = {
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [],
    }
    mounted.unmount()
    await renderOperations()
    await waitFor(() => {
      expect(screen.getByText(userText)).toBeTruthy()
      expect(screen.getByText(assistantText)).toBeTruthy()
    })
  })

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'fails closed before accepted transport when IndexedDB overlay admission raises %s',
    async (exceptionName) => {
      rejectIndexedDbWrites({
        storeName: WORKSPACE_CHAT_STORE_NAMES.durableJournal,
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

      await waitFor(() => expect(input.value).toBe('must remain unsent'))
      expect(screen.queryByText('must remain unsent')).toBeNull()
      expect(
        fetchMock.mock.calls.some(
          ([request]) => String(request) === '/api/send-stream',
        ),
      ).toBe(false)
      await expect(
        operationsChatStorageForTests.readOverlay('remote:worker-card'),
      ).resolves.toEqual([])
    },
  )

  it.each(['QuotaExceededError', 'SecurityError'] as const)(
    'retains recovery until the complete IndexedDB snapshot is verified after %s',
    async (exceptionName) => {
      const userText = `acknowledged ${exceptionName} Operations user turn`
      const assistantText = `acknowledged ${exceptionName} Operations assistant reply`
      const recovery = [
        {
          id: 'optimistic-user',
          role: 'user' as const,
          content: userText,
          acknowledgementOrdinal: 1,
        },
        {
          id: 'optimistic-assistant',
          role: 'assistant' as const,
          content: assistantText,
          acknowledgementOrdinal: 1,
        },
      ]
      await expect(
        operationsChatStorageForTests.writeOverlay(
          'remote:worker-card',
          recovery,
        ),
      ).resolves.toBe(true)
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
      const storageSpy = rejectIndexedDbWrites({
        storeName: WORKSPACE_CHAT_STORE_NAMES.latestCardSnapshots,
        exceptionName,
      })

      const mounted = await renderOperations()
      await waitFor(() =>
        expect(
          screen.getByText(
            'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.',
          ),
        ).toBeTruthy(),
      )
      await expect(
        operationsChatStorageForTests.readOverlay('remote:worker-card'),
      ).resolves.toEqual(recovery)

      storageSpy.mockRestore()
      mocks.historyResponse = { ...mocks.historyResponse }
      await mounted.rerender()
      await waitFor(async () => {
        expect(
          await operationsChatStorageForTests.readOverlay('remote:worker-card'),
        ).toEqual([])
      })
      expect(
        screen.queryByText(
          'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.',
        ),
      ).toBeNull()
    },
  )

  it('hydrates v4 snapshot and recovery asynchronously without consulting legacy browser values', async () => {
    const snapshotText = 'verified v4 Operations snapshot'
    const overlayText = 'verified v4 Operations recovery'
    const legacyText = 'obsolete browser Operations value'
    const legacyKey =
      'workspace.operations-card-complete-history.v1:remote%3Aworker-card'
    const legacyRaw = JSON.stringify({
      version: 2,
      revision: 999,
      owner: { cardId: 'remote:worker-card' },
      messages: [{ id: 'legacy', role: 'assistant', content: legacyText }],
    })
    window.localStorage.setItem(legacyKey, legacyRaw)
    window.localStorage.setItem('workspace.sidebar.collapsed', 'true')
    await operationsChatStorageForTests.writeCompleteSnapshot(
      'remote:worker-card',
      [{ id: 'snapshot', role: 'assistant', content: snapshotText }],
    )
    await operationsChatStorageForTests.writeOverlay('remote:worker-card', [
      {
        id: 'overlay',
        role: 'user',
        content: overlayText,
        acknowledgementOrdinal: 1,
      },
    ])
    mocks.historyResponse = {
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [],
    }

    await renderOperations()
    await waitFor(() => {
      expect(screen.getByText(snapshotText)).toBeTruthy()
      expect(screen.getByText(overlayText)).toBeTruthy()
    })
    expect(screen.queryByText(legacyText)).toBeNull()
    expect(window.localStorage.getItem(legacyKey)).toBe(legacyRaw)
    expect(window.localStorage.getItem('workspace.sidebar.collapsed')).toBe(
      'true',
    )
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
